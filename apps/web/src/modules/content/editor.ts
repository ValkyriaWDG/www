import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  contentDocument,
  contentRevision,
  contentTranslation,
  manualArticle,
  publicationSchedule,
  type CoverSnapshot,
  type DocumentKind,
  type Executor,
  type Locale,
  type ScheduleState,
} from '@valkyria/db';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { DomainError } from '@/lib/result';
import { capabilityScope } from '@/modules/access/policy';
import type { Actor } from '@/modules/access/types';
import { recordAudit } from '@/modules/audit/audit';
import { isUniqueViolation } from './db-errors';
import { actorUserIdOrNull, authorize, authorizeGameScope } from './guard';
import {
  addTranslationSchema,
  createDocumentSchema,
  documentVersionSchema,
  duplicateDocumentSchema,
  editorStateSchema,
  listDocumentsSchema,
  listRevisionsSchema,
  parseInput,
  restoreRevisionSchema,
  saveDraftSchema,
  type AddTranslationInput,
  type CreateDocumentInput,
  type DocumentVersionInput,
  type EditorStateInput,
  type ListDocumentsInput,
  type ListRevisionsInput,
  type RestoreRevisionInput,
  type SaveDraftInput,
} from './inputs';
import { emptyDocument, parseRichTextDocument } from './rich-text/schema';
import { SLUG_MAX_LENGTH, slugify } from './slug';
import {
  ACTIVE_SCHEDULE_STATES,
  OVERDUE_GRACE_MS,
  assertDraftAssets,
  assertNotArchived,
  assertSlugAvailable,
  assertTaxonomyKeys,
  assertVersion,
  computeAdminState,
  coverAssetIds,
  fieldsOf,
  findAvailableSlug,
  inTransaction,
  insertRevision,
  jsonEqual,
  lockTranslation,
  pruneAutosaves,
  readDocument,
  readRevision,
  readTranslation,
  requireValidBody,
  revisionToDTO,
  scheduleToDTO,
  snapshotTaxonomy,
  type DocumentRow,
  type RevisionRow,
  type TranslationRow,
} from './store';
import type {
  AdminDocumentRow,
  AdminTranslationRow,
  DocumentEditorState,
  Paginated,
  RevisionFields,
  RevisionSummary,
  TranslationAdminState,
  TranslationEditorState,
  TranslationMutationResult,
} from './types';

/**
 * Editorial use cases for news/pages. Each translation is edited independently with
 * optimistic concurrency (`expectedVersion`); shared document fields (category, tags,
 * game) use the document version. Draft saves never touch published pointers.
 */

export type ContentDeps = { now?: () => Date };

const DRAFT_SLUG_UNIQUE = 'content_translation_draft_slug_uq';

function mapSlugRace<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((error: unknown) => {
    if (isUniqueViolation(error, DRAFT_SLUG_UNIQUE)) {
      throw new DomainError('slug_taken', 'Slug already used in this locale.', { slug: 'slug_taken' });
    }
    throw error;
  });
}

function emptyFields(slug: string, title = ''): RevisionFields {
  return { title, slug, excerpt: '', body: emptyDocument(), cover: null, authorLabel: '', seoTitle: '', seoDescription: '' };
}

/** Image asset IDs referenced by a stored body (falls back to the stored list if unparsable). */
function bodyAssetIds(body: unknown, fallback: readonly string[]): string[] {
  const parsed = parseRichTextDocument(body);
  return parsed.ok ? parsed.assetIds : [...fallback];
}

function normalizeCover(cover: { assetId: string; alt: string; caption: string; decorative: boolean } | null | undefined): CoverSnapshot | null {
  if (!cover) return null;
  return { assetId: cover.assetId, alt: cover.decorative ? '' : cover.alt, caption: cover.caption, decorative: cover.decorative };
}

export type CreateDocumentResult = TranslationMutationResult & { documentVersion: number; slug: string };

/** Creates a news entity with the chosen locale's translation and its first draft revision. */
export async function createDocument(
  db: Executor,
  actor: Actor,
  rawInput: CreateDocumentInput,
  deps: ContentDeps = {},
): Promise<CreateDocumentResult> {
  await authorize(db, actor, 'content.edit', 'write', { action: 'content.create', entityType: 'content_document' });
  const input = parseInput(createDocumentSchema, rawInput);
  if (input.kind === 'manual' && !input.game) throw new DomainError('validation', 'A manual article needs a game.', { game: 'required' });
  await authorizeGameScope(db, actor, 'content.edit', [input.game ?? null], { action: 'content.create', entityType: 'content_document' });
  const now = deps.now?.() ?? new Date();
  const body = input.fields?.body !== undefined ? requireValidBody(input.fields.body) : { doc: emptyDocument(), assetIds: [] };
  const cover = normalizeCover(input.fields?.cover);

  return mapSlugRace(
    inTransaction(db, async (tx) => {
      await assertTaxonomyKeys(tx, input.categoryKey, input.tagKeys, { kind: input.kind, game: input.game ?? null });
      const [document] = await tx
        .insert(contentDocument)
        .values({
          kind: input.kind,
          game: input.game ?? null,
          categoryKey: input.categoryKey ?? null,
          tagKeys: [...new Set(input.tagKeys ?? [])],
          createdBy: actorUserIdOrNull(actor),
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (input.kind === 'manual') await tx.insert(manualArticle).values({ documentId: document!.id, createdAt: now, updatedAt: now });
      const translationId = randomUUID();
      const namespace: DocumentKind = input.kind;
      let slug: string;
      if (input.slug) {
        await assertSlugAvailable(tx, { namespace, locale: input.locale, slug: input.slug, translationId });
        slug = input.slug;
      } else {
        const base = slugify(input.title) || `post-${translationId.slice(0, 8)}`;
        slug = await findAvailableSlug(tx, { namespace, locale: input.locale, base, translationId });
      }
      await assertDraftAssets(tx, [...body.assetIds, ...coverAssetIds(cover)]);
      const [translation] = await tx
        .insert(contentTranslation)
        .values({ id: translationId, documentId: document!.id, locale: input.locale, namespace, draftSlug: slug, createdAt: now, updatedAt: now })
        .returning();
      const fields: RevisionFields = {
        ...emptyFields(slug, input.title),
        excerpt: input.fields?.excerpt ?? '',
        body: body.doc,
        cover,
        authorLabel: input.fields?.authorLabel ?? '',
        seoTitle: input.fields?.seoTitle ?? '',
        seoDescription: input.fields?.seoDescription ?? '',
      };
      const revision = await insertRevision(tx, {
        translation: translation!,
        kind: 'save',
        fields,
        taxonomy: await snapshotTaxonomy(tx, input.locale, document!),
        assetIds: body.assetIds,
        actor,
      });
      await tx.update(contentTranslation).set({ draftRevisionId: revision.id }).where(eq(contentTranslation.id, translationId));
      await recordAudit(tx, {
        actor,
        action: 'content.create',
        outcome: 'success',
        capability: 'content.edit',
        entityType: 'content_document',
        entityId: document!.id,
        translationId,
        locale: input.locale,
        summary: { kind: input.kind, slug, revisionId: revision.id },
      });
      return {
        documentId: document!.id,
        translationId,
        locale: input.locale,
        version: translation!.version,
        revisionId: revision.id,
        documentVersion: document!.version,
        slug,
      };
    }),
  );
}

/**
 * Adds the other locale's translation with an empty draft. Never copies, translates or
 * publishes the existing translation's text.
 */
export async function addTranslation(
  db: Executor,
  actor: Actor,
  rawInput: AddTranslationInput,
  deps: ContentDeps = {},
): Promise<TranslationMutationResult & { slug: string }> {
  await authorize(db, actor, 'content.edit', 'write', { action: 'content.translation.create', entityType: 'content_document' });
  const input = parseInput(addTranslationSchema, rawInput);
  const now = deps.now?.() ?? new Date();
  try {
    return await mapSlugRace(
      inTransaction(db, async (tx) => {
        const document = await readDocument(tx, input.documentId, 'share');
        await authorizeGameScope(db, actor, 'content.edit', [document.game], { action: 'content.translation.create', entityType: 'content_document', entityId: document.id });
        assertNotArchived(document);
        const [existing] = await tx
          .select({ id: contentTranslation.id })
          .from(contentTranslation)
          .where(and(eq(contentTranslation.documentId, document.id), eq(contentTranslation.locale, input.locale)));
        if (existing) throw new DomainError('conflict', 'This translation already exists.');
        const translationId = randomUUID();
        const namespace = document.kind;
        let slug: string;
        if (input.slug) {
          await assertSlugAvailable(tx, { namespace, locale: input.locale, slug: input.slug, translationId });
          slug = input.slug;
        } else {
          const base = (input.title && slugify(input.title)) || `draft-${translationId.slice(0, 8)}`;
          slug = await findAvailableSlug(tx, { namespace, locale: input.locale, base, translationId });
        }
        const [translation] = await tx
          .insert(contentTranslation)
          .values({ id: translationId, documentId: document.id, locale: input.locale, namespace, draftSlug: slug, createdAt: now, updatedAt: now })
          .returning();
        const revision = await insertRevision(tx, {
          translation: translation!,
          kind: 'save',
          fields: emptyFields(slug, input.title ?? ''),
          taxonomy: await snapshotTaxonomy(tx, input.locale, document),
          assetIds: [],
          actor,
        });
        await tx.update(contentTranslation).set({ draftRevisionId: revision.id }).where(eq(contentTranslation.id, translationId));
        await tx.update(contentDocument).set({ updatedAt: now }).where(eq(contentDocument.id, document.id));
        await recordAudit(tx, {
          actor,
          action: 'content.translation.create',
          outcome: 'success',
          capability: 'content.edit',
          entityType: 'content_document',
          entityId: document.id,
          translationId,
          locale: input.locale,
          summary: { slug },
        });
        return { documentId: document.id, translationId, locale: input.locale, version: translation!.version, revisionId: revision.id, slug };
      }),
    );
  } catch (error) {
    if (isUniqueViolation(error, 'content_translation_document_locale_uq')) {
      throw new DomainError('conflict', 'This translation already exists.');
    }
    throw error;
  }
}

export type SaveDraftResult = TranslationMutationResult & {
  documentVersion: number;
  slug: string;
  savedAt: Date;
  /** False when an autosave carried no change (no new revision was written). */
  changed: boolean;
};

/**
 * Saves a new immutable draft revision of exactly one translation and moves its draft
 * pointer. Published pointers are never touched. Missing fields keep their current value.
 */
export async function saveDraft(db: Executor, actor: Actor, rawInput: SaveDraftInput, deps: ContentDeps = {}): Promise<SaveDraftResult> {
  await authorize(db, actor, 'content.edit', 'write', { action: 'content.save', entityType: 'content_translation' });
  const input = parseInput(saveDraftSchema, rawInput);
  const now = deps.now?.() ?? new Date();
  const parsedBody = input.fields.body !== undefined ? requireValidBody(input.fields.body) : null;

  return mapSlugRace(
    inTransaction(db, async (tx) => {
      const translation = await lockTranslation(tx, input.translationId);
      assertVersion(translation.version, input.expectedVersion);
      let document = await readDocument(tx, translation.documentId, input.shared ? 'update' : 'share');
      // Moving a document to another game needs the capability in both games.
      const targetGames = input.shared?.game !== undefined && input.shared.game !== document.game ? [document.game, input.shared.game] : [document.game];
      await authorizeGameScope(db, actor, 'content.edit', targetGames, { action: 'content.save', entityType: 'content_document', entityId: document.id });
      assertNotArchived(document);
      const current = translation.draftRevisionId ? await readRevision(tx, translation.id, translation.draftRevisionId) : null;
      const base = current ? fieldsOf(current) : emptyFields(translation.draftSlug);
      const f = input.fields;
      const fields: RevisionFields = {
        title: f.title ?? base.title,
        slug: f.slug ?? base.slug,
        excerpt: f.excerpt ?? base.excerpt,
        body: parsedBody ? parsedBody.doc : base.body,
        cover: f.cover !== undefined ? normalizeCover(f.cover) : base.cover,
        authorLabel: f.authorLabel ?? base.authorLabel,
        seoTitle: f.seoTitle ?? base.seoTitle,
        seoDescription: f.seoDescription ?? base.seoDescription,
      };
      if (fields.slug !== translation.draftSlug) {
        await assertSlugAvailable(tx, { namespace: translation.namespace, locale: translation.locale, slug: fields.slug, translationId: translation.id });
      }

      if (input.shared) {
        assertVersion(document.version, input.shared.expectedDocumentVersion);
        const next = {
          categoryKey: input.shared.categoryKey !== undefined ? input.shared.categoryKey : document.categoryKey,
          tagKeys: input.shared.tagKeys !== undefined ? [...new Set(input.shared.tagKeys)] : document.tagKeys,
          game: input.shared.game !== undefined ? input.shared.game : document.game,
        };
        await assertTaxonomyKeys(tx, next.categoryKey, next.tagKeys, { kind: document.kind, game: next.game }, { categoryKey: document.categoryKey, tagKeys: document.tagKeys });
        if (document.kind === 'manual' && next.game === null) throw new DomainError('validation', 'A manual article needs a game.', { game: 'required' });
        const [updated] = await tx
          .update(contentDocument)
          .set({ ...next, version: document.version + 1, updatedAt: now })
          .where(eq(contentDocument.id, document.id))
          .returning();
        document = updated!;
      }

      const bodyAssets = parsedBody ? parsedBody.assetIds : bodyAssetIds(base.body, current?.assetIds ?? []);
      await assertDraftAssets(tx, [...bodyAssets, ...coverAssetIds(fields.cover)]);
      const taxonomy = await snapshotTaxonomy(tx, translation.locale, document);

      if (input.kind === 'autosave' && current && !input.shared && jsonEqual(fieldsOf(current), fields) && jsonEqual(current.taxonomy, taxonomy)) {
        return {
          documentId: document.id,
          translationId: translation.id,
          locale: translation.locale,
          version: translation.version,
          revisionId: current.id,
          documentVersion: document.version,
          slug: fields.slug,
          savedAt: current.createdAt,
          changed: false,
        };
      }

      const revision = await insertRevision(tx, { translation, kind: input.kind, fields, taxonomy, assetIds: bodyAssets, actor });
      const [updated] = await tx
        .update(contentTranslation)
        .set({ draftRevisionId: revision.id, draftSlug: fields.slug, version: translation.version + 1, updatedAt: now })
        .where(and(eq(contentTranslation.id, translation.id), eq(contentTranslation.version, input.expectedVersion)))
        .returning({ version: contentTranslation.version });
      if (!updated) throw new DomainError('conflict', 'The record was changed by someone else.');
      await pruneAutosaves(tx, translation.id);
      return {
        documentId: document.id,
        translationId: translation.id,
        locale: translation.locale,
        version: updated.version,
        revisionId: revision.id,
        documentVersion: document.version,
        slug: fields.slug,
        savedAt: revision.createdAt,
        changed: true,
      };
    }),
  );
}

/** Creates a NEW draft revision (kind `restore`) from a revision of the same translation; live is unchanged. */
export async function restoreRevision(
  db: Executor,
  actor: Actor,
  rawInput: RestoreRevisionInput,
  deps: ContentDeps = {},
): Promise<TranslationMutationResult> {
  await authorize(db, actor, 'content.edit', 'write', { action: 'content.revision.restore', entityType: 'content_translation' });
  const input = parseInput(restoreRevisionSchema, rawInput);
  const now = deps.now?.() ?? new Date();
  return mapSlugRace(
    inTransaction(db, async (tx) => {
      const translation = await lockTranslation(tx, input.translationId);
      assertVersion(translation.version, input.expectedVersion);
      const document = await readDocument(tx, translation.documentId, 'share');
      await authorizeGameScope(db, actor, 'content.edit', [document.game], { action: 'content.revision.restore', entityType: 'content_document', entityId: document.id });
      assertNotArchived(document);
      const source = await readRevision(tx, translation.id, input.revisionId);
      const fields = fieldsOf(source);
      if (fields.slug !== translation.draftSlug) {
        await assertSlugAvailable(tx, { namespace: translation.namespace, locale: translation.locale, slug: fields.slug, translationId: translation.id });
      }
      // Translation-local fields are restored; shared taxonomy reflects the document's current keys.
      const revision = await insertRevision(tx, {
        translation,
        kind: 'restore',
        fields,
        taxonomy: await snapshotTaxonomy(tx, translation.locale, document),
        assetIds: source.assetIds,
        actor,
        restoredFromRevisionId: source.id,
      });
      const [updated] = await tx
        .update(contentTranslation)
        .set({ draftRevisionId: revision.id, draftSlug: fields.slug, version: translation.version + 1, updatedAt: now })
        .where(eq(contentTranslation.id, translation.id))
        .returning({ version: contentTranslation.version });
      await pruneAutosaves(tx, translation.id);
      await recordAudit(tx, {
        actor,
        action: 'content.revision.restore',
        outcome: 'success',
        capability: 'content.edit',
        entityType: 'content_document',
        entityId: document.id,
        translationId: translation.id,
        locale: translation.locale,
        summary: { restoredFromRevisionId: source.id, revisionId: revision.id },
      });
      return { documentId: document.id, translationId: translation.id, locale: translation.locale, version: updated!.version, revisionId: revision.id };
    }),
  );
}

/* ---------------------------------- reads ----------------------------------- */

function sharedState(document: DocumentRow) {
  return {
    id: document.id,
    kind: document.kind,
    pageKey: document.pageKey,
    game: document.game,
    categoryKey: document.categoryKey,
    tagKeys: document.tagKeys,
    version: document.version,
    archivedAt: document.archivedAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

/** Editor view of one document: shared fields plus every translation's draft/live/schedule state. */
export async function getEditorState(db: Executor, actor: Actor, rawInput: EditorStateInput, deps: ContentDeps = {}): Promise<DocumentEditorState> {
  await authorize(db, actor, 'content.read_private', 'read', { action: 'content.read_private', entityType: 'content_document' });
  const input = parseInput(editorStateSchema, rawInput);
  const now = deps.now?.() ?? new Date();
  const documentId = 'documentId' in input ? input.documentId : (await readTranslation(db, input.translationId)).documentId;
  const document = await readDocument(db, documentId);
  await authorizeGameScope(db, actor, 'content.read_private', [document.game], { action: 'content.read_private', entityType: 'content_document', entityId: document.id });
  const translations = await db.select().from(contentTranslation).where(eq(contentTranslation.documentId, document.id));
  const revisionIds = translations.flatMap((t) => [t.draftRevisionId, t.publishedRevisionId]).filter((id): id is string => Boolean(id));
  const revisions = revisionIds.length > 0 ? await db.select().from(contentRevision).where(inArray(contentRevision.id, revisionIds)) : [];
  const byId = new Map(revisions.map((row) => [row.id, row]));
  const schedules =
    translations.length > 0
      ? await db
          .select()
          .from(publicationSchedule)
          .where(and(inArray(publicationSchedule.translationId, translations.map((t) => t.id)), inArray(publicationSchedule.state, ACTIVE_SCHEDULE_STATES)))
      : [];

  const result: DocumentEditorState = { document: sharedState(document), translations: {} };
  for (const translation of translations) {
    const draft = translation.draftRevisionId ? byId.get(translation.draftRevisionId) : undefined;
    const published = translation.publishedRevisionId ? byId.get(translation.publishedRevisionId) : undefined;
    const schedule = schedules.find((row) => row.translationId === translation.id);
    const state: TranslationEditorState = {
      id: translation.id,
      locale: translation.locale,
      version: translation.version,
      draftSlug: translation.draftSlug,
      liveSlug: translation.liveSlug,
      draft: draft ? revisionToDTO(draft) : null,
      published:
        published && translation.publishedAt
          ? {
              revisionId: published.id,
              title: published.title,
              slug: translation.liveSlug ?? published.slug,
              publishedAt: translation.publishedAt,
              firstPublishedAt: translation.firstPublishedAt,
            }
          : null,
      hasUnpublishedChanges: Boolean(translation.publishedRevisionId) && translation.draftRevisionId !== translation.publishedRevisionId,
      schedule: schedule ? scheduleToDTO(schedule, now) : null,
      state: computeAdminState({
        archived: Boolean(document.archivedAt),
        published: Boolean(translation.publishedRevisionId),
        draftDiffers: translation.draftRevisionId !== translation.publishedRevisionId,
        scheduled: Boolean(schedule),
      }),
      updatedAt: translation.updatedAt,
    };
    result.translations[translation.locale] = state;
  }
  return result;
}

/** Bounded revision history of one translation (newest first). */
export async function listRevisions(db: Executor, actor: Actor, rawInput: ListRevisionsInput): Promise<RevisionSummary[]> {
  await authorize(db, actor, 'content.read_private', 'read', { action: 'content.read_private', entityType: 'content_translation' });
  const input = parseInput(listRevisionsSchema, rawInput);
  const translation = await readTranslation(db, input.translationId);
  const owner = await readDocument(db, translation.documentId);
  await authorizeGameScope(db, actor, 'content.read_private', [owner.game], { action: 'content.read_private', entityType: 'content_document', entityId: owner.id });
  const rows = await db
    .select({
      id: contentRevision.id,
      kind: contentRevision.kind,
      title: contentRevision.title,
      slug: contentRevision.slug,
      createdByLabel: contentRevision.createdByLabel,
      createdAt: contentRevision.createdAt,
      restoredFromRevisionId: contentRevision.restoredFromRevisionId,
    })
    .from(contentRevision)
    .where(eq(contentRevision.translationId, translation.id))
    .orderBy(desc(contentRevision.createdAt), desc(contentRevision.id))
    .limit(input.limit);
  const scheduled = await db
    .select({ revisionId: publicationSchedule.revisionId })
    .from(publicationSchedule)
    .where(and(eq(publicationSchedule.translationId, translation.id), inArray(publicationSchedule.state, ACTIVE_SCHEDULE_STATES)));
  const scheduledIds = new Set(scheduled.map((row) => row.revisionId));
  return rows.map((row) => ({
    ...row,
    isDraft: row.id === translation.draftRevisionId,
    isPublished: row.id === translation.publishedRevisionId,
    isScheduled: scheduledIds.has(row.id),
  }));
}

type AdminRowSql = {
  translation_id: string;
  document_id: string;
  locale: Locale;
  title: string | null;
  author_label: string | null;
  draft_slug: string;
  live_slug: string | null;
  state: TranslationAdminState;
  schedule_id: string | null;
  schedule_due_at: Date | string | null;
  schedule_state: string | null;
  updated_at: Date | string;
};

const toDate = (value: Date | string) => (value instanceof Date ? value : new Date(value));

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Searchable, paginated admin list with separate per-locale publication/schedule
 * states. `state`/`locale` filter on the translation state of that locale (or any).
 */
export async function listDocumentsForAdmin(
  db: Executor,
  actor: Actor,
  rawInput: ListDocumentsInput = {},
  deps: ContentDeps = {},
): Promise<Paginated<AdminDocumentRow>> {
  await authorize(db, actor, 'content.read_private', 'read', { action: 'content.read_private', entityType: 'content_document' });
  const input = parseInput(listDocumentsSchema, rawInput);
  const now = deps.now?.() ?? new Date();
  const q = input.q ? `%${escapeLike(input.q)}%` : null;
  // Private lists contain only documents within the actor's game scope (community
  // documents only for platform-wide grants); a UI filter never widens this.
  const scope = capabilityScope(actor, 'content.read_private');
  if (scope === null || (scope !== 'all' && scope.size === 0)) return { items: [], total: 0, page: input.page, pageSize: input.pageSize, pageCount: 0 };
  const scopeSql = scope === 'all' ? sql`true` : sql`d.game in (${sql.join([...scope].map((game) => sql`${game}`), sql`, `)})`;
  const gameFilterSql =
    input.game === undefined ? sql`true` : input.game === 'community' ? sql`d.game is null` : sql`d.game = ${input.game}`;

  const stateSql = sql`
    with tstate as (
      select t.id as translation_id, t.document_id, t.locale, r.title, r.author_label, t.draft_slug, t.live_slug,
        case
          when d.archived_at is not null then 'archived'
          when s.id is not null and t.published_revision_id is not null then 'published_update_scheduled'
          when s.id is not null then 'scheduled'
          when t.published_revision_id is null then 'draft'
          when t.draft_revision_id is distinct from t.published_revision_id then 'published_with_changes'
          else 'published'
        end as state,
        s.id as schedule_id, s.due_at as schedule_due_at, s.state as schedule_state,
        t.updated_at
      from content_translation t
      join content_document d on d.id = t.document_id
      left join content_revision r on r.id = t.draft_revision_id and r.translation_id = t.id
      left join publication_schedule s on s.translation_id = t.id and s.state in ('pending', 'claimed', 'blocked', 'failed')
    ),
    docs as (
      select d.id, greatest(d.updated_at, max(ts.updated_at)) as modified_at
      from content_document d
      left join tstate ts on ts.document_id = d.id
      where (${input.kind ?? null}::text is null or d.kind = ${input.kind ?? null})
        and ${scopeSql}
        and ${gameFilterSql}
        and (${q}::text is null or exists (
          select 1 from tstate x where x.document_id = d.id and (x.title ilike ${q} escape '\\' or x.draft_slug ilike ${q} escape '\\' or x.live_slug ilike ${q} escape '\\')
        ))
        and (${input.state ?? null}::text is null or exists (
          select 1 from tstate x where x.document_id = d.id and x.state = ${input.state ?? null}
            and (${input.locale ?? null}::text is null or x.locale = ${input.locale ?? null})
        ))
        and (${input.state ?? null}::text is not null or ${input.locale ?? null}::text is null or exists (
          select 1 from tstate x where x.document_id = d.id and x.locale = ${input.locale ?? null}
        ))
      group by d.id
    )
  `;
  const totalResult = await db.execute<{ total: number }>(sql`${stateSql} select count(*)::int as total from docs`);
  const total = Number(totalResult.rows[0]?.total ?? 0);
  const offset = (input.page - 1) * input.pageSize;
  const pageResult = await db.execute<{ id: string; modified_at: Date | string }>(
    sql`${stateSql} select id, modified_at from docs order by modified_at desc, id limit ${input.pageSize} offset ${offset}`,
  );
  const ids = pageResult.rows.map((row) => row.id);
  if (ids.length === 0) return { items: [], total, page: input.page, pageSize: input.pageSize, pageCount: Math.ceil(total / input.pageSize) };

  const documents = await db.select().from(contentDocument).where(inArray(contentDocument.id, ids));
  const rows = await db.execute<AdminRowSql>(
    sql`${stateSql} select * from tstate where document_id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`,
  );
  const items = pageResult.rows.map((pageRow) => {
    const document = documents.find((doc) => doc.id === pageRow.id)!;
    const translations: Partial<Record<Locale, AdminTranslationRow>> = {};
    for (const row of rows.rows.filter((candidate) => candidate.document_id === document.id)) {
      const dueAt = row.schedule_due_at ? toDate(row.schedule_due_at) : null;
      translations[row.locale] = {
        translationId: row.translation_id,
        locale: row.locale,
        title: row.title ?? '',
        draftSlug: row.draft_slug,
        liveSlug: row.live_slug,
        authorLabel: row.author_label ?? '',
        state: row.state,
        schedule:
          row.schedule_id && dueAt
            ? {
                id: row.schedule_id,
                dueAt,
                state: row.schedule_state as ScheduleState,
                overdue: row.schedule_state !== 'blocked' && dueAt.getTime() + OVERDUE_GRACE_MS < now.getTime(),
              }
            : null,
        updatedAt: toDate(row.updated_at),
      };
    }
    return {
      documentId: document.id,
      kind: document.kind,
      pageKey: document.pageKey,
      categoryKey: document.categoryKey,
      game: document.game,
      archived: Boolean(document.archivedAt),
      updatedAt: toDate(pageRow.modified_at),
      translations,
    } satisfies AdminDocumentRow;
  });
  return { items, total, page: input.page, pageSize: input.pageSize, pageCount: Math.ceil(total / input.pageSize) };
}

/* ------------------------------ document actions ----------------------------- */

/** Copies a news document's shared fields and each translation's current draft into a new, unpublished document. */
export async function duplicateDocument(
  db: Executor,
  actor: Actor,
  rawInput: { documentId: string },
  deps: ContentDeps = {},
): Promise<{ documentId: string; translations: Partial<Record<Locale, string>> }> {
  await authorize(db, actor, 'content.edit', 'write', { action: 'content.duplicate', entityType: 'content_document' });
  const input = parseInput(duplicateDocumentSchema, rawInput);
  const now = deps.now?.() ?? new Date();
  return mapSlugRace(
    inTransaction(db, async (tx) => {
      const source = await readDocument(tx, input.documentId, 'share');
      await authorizeGameScope(db, actor, 'content.edit', [source.game], { action: 'content.duplicate', entityType: 'content_document', entityId: source.id });
      if (source.kind !== 'news') throw new DomainError('invalid_state', 'Core pages cannot be duplicated.');
      const [document] = await tx
        .insert(contentDocument)
        .values({
          kind: 'news',
          game: source.game,
          categoryKey: source.categoryKey,
          tagKeys: source.tagKeys,
          createdBy: actorUserIdOrNull(actor),
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const translations = await tx.select().from(contentTranslation).where(eq(contentTranslation.documentId, source.id));
      const created: Partial<Record<Locale, string>> = {};
      for (const translation of translations) {
        const draft: RevisionRow | null = translation.draftRevisionId ? await readRevision(tx, translation.id, translation.draftRevisionId) : null;
        const fields = draft ? fieldsOf(draft) : emptyFields(translation.draftSlug);
        const translationId = randomUUID();
        const slug = await findAvailableSlug(tx, {
          namespace: 'news',
          locale: translation.locale,
          base: `${fields.slug.slice(0, SLUG_MAX_LENGTH - 5).replace(/-+$/, '')}-copy`,
          translationId,
        });
        const [copy] = await tx
          .insert(contentTranslation)
          .values({ id: translationId, documentId: document!.id, locale: translation.locale, namespace: 'news', draftSlug: slug, createdAt: now, updatedAt: now })
          .returning();
        const revision = await insertRevision(tx, {
          translation: copy!,
          kind: 'save',
          fields: { ...fields, slug },
          taxonomy: await snapshotTaxonomy(tx, translation.locale, document!),
          assetIds: draft?.assetIds ?? [],
          actor,
        });
        await tx.update(contentTranslation).set({ draftRevisionId: revision.id }).where(eq(contentTranslation.id, translationId));
        created[translation.locale] = translationId;
      }
      await recordAudit(tx, {
        actor,
        action: 'content.duplicate',
        outcome: 'success',
        capability: 'content.edit',
        entityType: 'content_document',
        entityId: document!.id,
        summary: { sourceDocumentId: source.id, locales: Object.keys(created) },
      });
      return { documentId: document!.id, translations: created };
    }),
  );
}

async function lockDocumentTree(tx: Executor, documentId: string) {
  // Lock order shared with the publisher: schedules → translations → document.
  const translationIds = (
    await tx.select({ id: contentTranslation.id }).from(contentTranslation).where(eq(contentTranslation.documentId, documentId))
  ).map((row) => row.id);
  const schedules =
    translationIds.length > 0
      ? await tx
          .select()
          .from(publicationSchedule)
          .where(and(inArray(publicationSchedule.translationId, translationIds), inArray(publicationSchedule.state, ACTIVE_SCHEDULE_STATES)))
          .for('update')
      : [];
  const translations: TranslationRow[] =
    translationIds.length > 0
      ? await tx.select().from(contentTranslation).where(inArray(contentTranslation.id, translationIds)).for('update')
      : [];
  const document = await readDocument(tx, documentId, 'update');
  return { schedules, translations, document };
}

/**
 * Archives a news document: it disappears from every public listing/detail/sitemap and
 * its media stop being delivered through it. Active schedules are cancelled.
 */
export async function archiveDocument(
  db: Executor,
  actor: Actor,
  rawInput: DocumentVersionInput,
  deps: ContentDeps = {},
): Promise<{ documentId: string; version: number; cancelledSchedules: number }> {
  await authorize(db, actor, 'content.publish', 'write', { action: 'content.archive', entityType: 'content_document' });
  const input = parseInput(documentVersionSchema, rawInput);
  const now = deps.now?.() ?? new Date();
  return inTransaction(db, async (tx) => {
    const { schedules, document } = await lockDocumentTree(tx, input.documentId);
    await authorizeGameScope(db, actor, 'content.publish', [document.game], { action: 'content.archive', entityType: 'content_document', entityId: document.id });
    assertVersion(document.version, input.expectedDocumentVersion);
    if (document.kind === 'page') throw new DomainError('invalid_state', 'Core pages cannot be archived.');
    assertNotArchived(document);
    if (schedules.length > 0) {
      await tx
        .update(publicationSchedule)
        .set({ state: 'cancelled', cancelledAt: now, cancelledBy: actorUserIdOrNull(actor), lastError: 'document_archived', claimExpiresAt: null, updatedAt: now })
        .where(inArray(publicationSchedule.id, schedules.map((row) => row.id)));
    }
    const [updated] = await tx
      .update(contentDocument)
      .set({ archivedAt: now, version: document.version + 1, updatedAt: now })
      .where(eq(contentDocument.id, document.id))
      .returning();
    await recordAudit(tx, {
      actor,
      action: 'content.archive',
      outcome: 'success',
      capability: 'content.publish',
      entityType: 'content_document',
      entityId: document.id,
      summary: { cancelledScheduleIds: schedules.map((row) => row.id) },
    });
    return { documentId: document.id, version: updated!.version, cancelledSchedules: schedules.length };
  });
}

/** Restores an archived document; published translations become public again. */
export async function unarchiveDocument(
  db: Executor,
  actor: Actor,
  rawInput: DocumentVersionInput,
  deps: ContentDeps = {},
): Promise<{ documentId: string; version: number }> {
  await authorize(db, actor, 'content.publish', 'write', { action: 'content.unarchive', entityType: 'content_document' });
  const input = parseInput(documentVersionSchema, rawInput);
  const now = deps.now?.() ?? new Date();
  return inTransaction(db, async (tx) => {
    const document = await readDocument(tx, input.documentId, 'update');
    await authorizeGameScope(db, actor, 'content.publish', [document.game], { action: 'content.unarchive', entityType: 'content_document', entityId: document.id });
    assertVersion(document.version, input.expectedDocumentVersion);
    if (!document.archivedAt) throw new DomainError('invalid_state', 'The document is not archived.');
    const [updated] = await tx
      .update(contentDocument)
      .set({ archivedAt: null, version: document.version + 1, updatedAt: now })
      .where(eq(contentDocument.id, document.id))
      .returning();
    await recordAudit(tx, {
      actor,
      action: 'content.unarchive',
      outcome: 'success',
      capability: 'content.publish',
      entityType: 'content_document',
      entityId: document.id,
    });
    return { documentId: document.id, version: updated!.version };
  });
}

/**
 * Permanently deletes a news document with its translations, revisions, redirects and
 * schedules. Allowed only when no translation is publicly live (archived or unpublished).
 */
export async function deleteDocument(db: Executor, actor: Actor, rawInput: DocumentVersionInput): Promise<{ documentId: string }> {
  await authorize(db, actor, 'content.publish', 'write', { action: 'content.delete', entityType: 'content_document' });
  const input = parseInput(documentVersionSchema, rawInput);
  return inTransaction(db, async (tx) => {
    const { translations, document } = await lockDocumentTree(tx, input.documentId);
    await authorizeGameScope(db, actor, 'content.publish', [document.game], { action: 'content.delete', entityType: 'content_document', entityId: document.id });
    assertVersion(document.version, input.expectedDocumentVersion);
    if (document.kind === 'page') throw new DomainError('invalid_state', 'Core pages cannot be deleted.');
    if (!document.archivedAt && translations.some((row) => row.publishedRevisionId)) {
      throw new DomainError('invalid_state', 'Unpublish or archive the document before deleting it.');
    }
    if (translations.length > 0) {
      await tx.delete(publicationSchedule).where(inArray(publicationSchedule.translationId, translations.map((row) => row.id)));
    }
    await tx.delete(contentDocument).where(eq(contentDocument.id, document.id));
    await recordAudit(tx, {
      actor,
      action: 'content.delete',
      outcome: 'success',
      capability: 'content.publish',
      entityType: 'content_document',
      entityId: document.id,
      summary: { locales: translations.map((row) => row.locale) },
    });
    return { documentId: document.id };
  });
}
