import {
  asset,
  contentDocument,
  contentRevision,
  contentTranslation,
  publicationSchedule,
  slugRedirect,
  manualCategory,
  taxonomyTerm,
  type CoverSnapshot,
  type Database,
  type DocumentKind,
  type Executor,
  type Locale,
  type RevisionKind,
  type ScheduleState,
  type TaxonomySnapshot,
  type Game,
} from '@valkyria/db';
import { and, desc, eq, inArray, ne, notInArray, or, sql } from 'drizzle-orm';
import { DomainError } from '@/lib/result';
import type { Actor } from '@/modules/access/types';
import { actorDisplayLabel, actorUserIdOrNull } from './guard';
import { RICH_TEXT_SCHEMA_VERSION, parseRichTextDocument, type RichTextDocument } from './rich-text/schema';
import { SLUG_MAX_LENGTH, isValidSlug, withSlugSuffix } from './slug';
import type { RevisionDTO, RevisionFields, ScheduleDTO, TranslationAdminState } from './types';

/** Internal persistence helpers shared by the content use cases and the publisher. */

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type TranslationRow = typeof contentTranslation.$inferSelect;
export type DocumentRow = typeof contentDocument.$inferSelect;
export type RevisionRow = typeof contentRevision.$inferSelect;
export type ScheduleRow = typeof publicationSchedule.$inferSelect;

export const ACTIVE_SCHEDULE_STATES: ScheduleState[] = ['pending', 'claimed', 'blocked', 'failed'];
/** Autosave revisions kept per translation (pointer/schedule/restore targets are always kept). */
export const AUTOSAVE_HISTORY_LIMIT = 20;
/** A due schedule is overdue once it has not run within this grace period. */
export const OVERDUE_GRACE_MS = 2 * 60_000;
/** Failure codes that the runner retries automatically (with backoff). */
export const TRANSIENT_FAILURE_CODES = ['database_error', 'lease_expired'] as const;
export const MAX_SCHEDULE_ATTEMPTS = 5;

/** Runs `fn` in a transaction (a savepoint when `db` is already a transaction). */
export function inTransaction<T>(db: Executor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (db as Database).transaction(fn);
}

export async function lockTranslation(tx: Executor, translationId: string): Promise<TranslationRow> {
  const [row] = await tx.select().from(contentTranslation).where(eq(contentTranslation.id, translationId)).for('update');
  if (!row) throw new DomainError('not_found', 'Translation not found.');
  return row;
}

export async function readTranslation(tx: Executor, translationId: string): Promise<TranslationRow> {
  const [row] = await tx.select().from(contentTranslation).where(eq(contentTranslation.id, translationId));
  if (!row) throw new DomainError('not_found', 'Translation not found.');
  return row;
}

export async function readDocument(tx: Executor, documentId: string, lock: 'share' | 'update' | null = null): Promise<DocumentRow> {
  const query = tx.select().from(contentDocument).where(eq(contentDocument.id, documentId));
  const [row] = lock ? await query.for(lock) : await query;
  if (!row) throw new DomainError('not_found', 'Document not found.');
  return row;
}

/** Reads a revision that must belong to `translationId` (never another translation's). */
export async function readRevision(tx: Executor, translationId: string, revisionId: string): Promise<RevisionRow> {
  const [row] = await tx
    .select()
    .from(contentRevision)
    .where(and(eq(contentRevision.id, revisionId), eq(contentRevision.translationId, translationId)));
  if (!row) throw new DomainError('not_found', 'Revision not found for this translation.');
  return row;
}

export function assertVersion(current: number, expected: number): void {
  if (current !== expected) throw new DomainError('conflict', 'The record was changed by someone else.');
}

export function assertNotArchived(document: DocumentRow): void {
  if (document.archivedAt) throw new DomainError('invalid_state', 'The document is archived.');
}

export async function activeSchedule(tx: Executor, translationId: string, lock = false): Promise<ScheduleRow | null> {
  const query = tx
    .select()
    .from(publicationSchedule)
    .where(and(eq(publicationSchedule.translationId, translationId), inArray(publicationSchedule.state, ACTIVE_SCHEDULE_STATES)));
  const [row] = lock ? await query.for('update') : await query;
  return row ?? null;
}

/* --------------------------------- taxonomy --------------------------------- */

/**
 * Validates shared taxonomy keys. News categories are shared taxonomy terms; a Field
 * Manual article's category must be a manual category of the article's own game. An
 * archived term stays valid only where it is already assigned (`previous`); assigning
 * it anew is rejected. The share locks serialize against a concurrent term deletion.
 */
export async function assertTaxonomyKeys(
  tx: Executor,
  categoryKey: string | null | undefined,
  tagKeys: readonly string[] | undefined,
  scope: { kind: DocumentKind; game: Game | null } = { kind: 'news', game: null },
  previous: { categoryKey: string | null; tagKeys: readonly string[] } = { categoryKey: null, tagKeys: [] },
) {
  const fieldErrors: Record<string, string> = {};
  if (categoryKey && scope.kind === 'manual') {
    const [row] = scope.game
      ? await tx
          .select({ key: manualCategory.key, archivedAt: manualCategory.archivedAt })
          .from(manualCategory)
          .where(and(eq(manualCategory.game, scope.game), eq(manualCategory.key, categoryKey)))
          .for('share')
      : [];
    if (!row) fieldErrors.categoryKey = 'unknown_category';
    else if (row.archivedAt && previous.categoryKey !== categoryKey) fieldErrors.categoryKey = 'archived_category';
  } else if (categoryKey) {
    const [row] = await tx
      .select({ key: taxonomyTerm.key, archivedAt: taxonomyTerm.archivedAt })
      .from(taxonomyTerm)
      .where(and(eq(taxonomyTerm.kind, 'category'), eq(taxonomyTerm.key, categoryKey)))
      .for('share');
    if (!row) fieldErrors.categoryKey = 'unknown_category';
    else if (row.archivedAt && previous.categoryKey !== categoryKey) fieldErrors.categoryKey = 'archived_category';
  }
  if (tagKeys && tagKeys.length > 0) {
    const rows = await tx
      .select({ key: taxonomyTerm.key, archivedAt: taxonomyTerm.archivedAt })
      .from(taxonomyTerm)
      .where(and(eq(taxonomyTerm.kind, 'tag'), inArray(taxonomyTerm.key, [...tagKeys])))
      .for('share');
    const known = new Map(rows.map((row) => [row.key, row.archivedAt]));
    if (tagKeys.some((key) => !known.has(key))) fieldErrors.tagKeys = 'unknown_tag';
    else if (tagKeys.some((key) => known.get(key) && !previous.tagKeys.includes(key))) fieldErrors.tagKeys = 'archived_tag';
  }
  if (Object.keys(fieldErrors).length > 0) throw new DomainError('validation', 'Unknown taxonomy key.', fieldErrors);
}

/** Effective localized labels of the document's shared taxonomy keys, snapshotted into a revision. */
export async function snapshotTaxonomy(
  tx: Executor,
  locale: Locale,
  shared: Pick<DocumentRow, 'categoryKey' | 'tagKeys' | 'game'> & { kind?: DocumentKind },
): Promise<TaxonomySnapshot> {
  const tagKeys = [...new Set(shared.tagKeys ?? [])];
  const conditions = [];
  let manualLabel: string | null = null;
  if (shared.categoryKey && shared.kind === 'manual' && shared.game) {
    const [row] = await tx
      .select({ labelCs: manualCategory.labelCs, labelEn: manualCategory.labelEn })
      .from(manualCategory)
      .where(and(eq(manualCategory.game, shared.game), eq(manualCategory.key, shared.categoryKey)));
    manualLabel = row ? (locale === 'cs' ? row.labelCs : row.labelEn) : null;
  } else if (shared.categoryKey) conditions.push(and(eq(taxonomyTerm.kind, 'category'), eq(taxonomyTerm.key, shared.categoryKey)));
  if (tagKeys.length > 0) conditions.push(and(eq(taxonomyTerm.kind, 'tag'), inArray(taxonomyTerm.key, tagKeys)));
  const rows = conditions.length > 0 ? await tx.select().from(taxonomyTerm).where(or(...conditions)) : [];
  const label = (kind: 'category' | 'tag', key: string) => {
    const row = rows.find((candidate) => candidate.kind === kind && candidate.key === key);
    return row ? (locale === 'cs' ? row.labelCs : row.labelEn) : key;
  };
  return {
    category: shared.categoryKey ? { key: shared.categoryKey, label: manualLabel ?? label('category', shared.categoryKey) } : null,
    tags: tagKeys.map((key) => ({ key, label: label('tag', key) })),
    game: shared.game ?? null,
  };
}

/* ----------------------------------- slugs ---------------------------------- */

/**
 * A slug is reserved per (namespace, locale) by other translations' draft slugs, live
 * slugs and redirect sources. The same spelling in the other locale is allowed.
 */
export async function isSlugAvailable(
  tx: Executor,
  params: { namespace: DocumentKind; locale: Locale; slug: string; translationId: string },
): Promise<boolean> {
  const { namespace, locale, slug, translationId } = params;
  const [translationConflict] = await tx
    .select({ id: contentTranslation.id })
    .from(contentTranslation)
    .where(
      and(
        eq(contentTranslation.namespace, namespace),
        eq(contentTranslation.locale, locale),
        ne(contentTranslation.id, translationId),
        or(eq(contentTranslation.draftSlug, slug), eq(contentTranslation.liveSlug, slug)),
      ),
    )
    .limit(1);
  if (translationConflict) return false;
  const [redirectConflict] = await tx
    .select({ id: slugRedirect.id })
    .from(slugRedirect)
    .where(
      and(
        eq(slugRedirect.namespace, namespace),
        eq(slugRedirect.locale, locale),
        eq(slugRedirect.sourceSlug, slug),
        ne(slugRedirect.translationId, translationId),
      ),
    )
    .limit(1);
  return !redirectConflict;
}

export async function assertSlugAvailable(
  tx: Executor,
  params: { namespace: DocumentKind; locale: Locale; slug: string; translationId: string },
): Promise<void> {
  if (!isValidSlug(params.slug)) throw new DomainError('validation', 'Invalid slug.', { slug: 'invalid' });
  if (!(await isSlugAvailable(tx, params))) {
    throw new DomainError('slug_taken', 'Slug already used in this locale.', { slug: 'slug_taken' });
  }
}

/** First available `base`, `base-2`, `base-3`… in the namespace/locale. */
export async function findAvailableSlug(
  tx: Executor,
  params: { namespace: DocumentKind; locale: Locale; base: string; translationId: string },
): Promise<string> {
  const base = params.base.slice(0, SLUG_MAX_LENGTH);
  for (let n = 1; n <= 50; n += 1) {
    const candidate = n === 1 ? base : withSlugSuffix(base, n);
    if (isValidSlug(candidate) && (await isSlugAvailable(tx, { ...params, slug: candidate }))) return candidate;
  }
  return withSlugSuffix(base, Number.parseInt(params.translationId.slice(0, 6), 16));
}

/* ----------------------------------- assets --------------------------------- */

/** Drafts may only reference existing editorial library assets (soft-deleted ones are tolerated). */
export async function assertDraftAssets(tx: Executor, assetIds: readonly string[]): Promise<void> {
  if (assetIds.length === 0) return;
  const rows = await tx
    .select({ id: asset.id, scope: asset.scope })
    .from(asset)
    .where(inArray(asset.id, [...assetIds]));
  const known = new Map(rows.map((row) => [row.id, row.scope]));
  const bad = assetIds.filter((id) => known.get(id) !== 'editorial');
  if (bad.length > 0) {
    throw new DomainError('validation', 'Unknown media asset.', { assets: `unknown_asset:${bad.slice(0, 5).join(',')}` });
  }
}

export function coverAssetIds(cover: CoverSnapshot | null | undefined): string[] {
  return cover ? [cover.assetId] : [];
}

/* --------------------------------- revisions -------------------------------- */

export function fieldsOf(row: RevisionRow): RevisionFields {
  return {
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    body: row.body as RichTextDocument,
    cover: row.cover ?? null,
    authorLabel: row.authorLabel,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
  };
}

export function revisionToDTO(row: RevisionRow): RevisionDTO {
  return {
    ...fieldsOf(row),
    id: row.id,
    translationId: row.translationId,
    locale: row.locale,
    kind: row.kind,
    schemaVersion: row.schemaVersion,
    taxonomy: row.taxonomy,
    restoredFromRevisionId: row.restoredFromRevisionId,
    createdByLabel: row.createdByLabel,
    createdAt: row.createdAt,
  };
}

/** Parses a stored or submitted body; throws a validation error with the issues. */
export function requireValidBody(body: unknown): { doc: RichTextDocument; assetIds: string[] } {
  const parsed = parseRichTextDocument(body);
  if (!parsed.ok) throw new DomainError('validation', 'Invalid rich text.', { body: parsed.issues.slice(0, 10).join('; ') });
  return { doc: parsed.doc, assetIds: parsed.assetIds };
}

export async function insertRevision(
  tx: Executor,
  params: {
    translation: Pick<TranslationRow, 'id' | 'locale'>;
    kind: RevisionKind;
    fields: RevisionFields;
    taxonomy: TaxonomySnapshot;
    assetIds: readonly string[];
    actor: Actor;
    restoredFromRevisionId?: string | null;
  },
): Promise<RevisionRow> {
  const { fields } = params;
  const assetIds = [...new Set([...params.assetIds, ...coverAssetIds(fields.cover)])];
  const [row] = await tx
    .insert(contentRevision)
    .values({
      translationId: params.translation.id,
      locale: params.translation.locale,
      kind: params.kind,
      restoredFromRevisionId: params.restoredFromRevisionId ?? null,
      schemaVersion: RICH_TEXT_SCHEMA_VERSION,
      title: fields.title,
      slug: fields.slug,
      excerpt: fields.excerpt,
      body: fields.body,
      cover: fields.cover,
      taxonomy: params.taxonomy,
      authorLabel: fields.authorLabel,
      seoTitle: fields.seoTitle,
      seoDescription: fields.seoDescription,
      assetIds,
      createdBy: actorUserIdOrNull(params.actor),
      createdByLabel: actorDisplayLabel(params.actor),
    })
    .returning();
  return row!;
}

/**
 * Keeps the newest AUTOSAVE_HISTORY_LIMIT autosaves of a translation. Revisions that are
 * draft/published pointers, schedule targets or restore sources are never pruned.
 */
export async function pruneAutosaves(tx: Executor, translationId: string): Promise<number> {
  const keep = tx
    .select({ id: contentRevision.id })
    .from(contentRevision)
    .where(and(eq(contentRevision.translationId, translationId), eq(contentRevision.kind, 'autosave')))
    .orderBy(desc(contentRevision.createdAt), desc(contentRevision.id))
    .limit(AUTOSAVE_HISTORY_LIMIT);
  const deleted = await tx
    .delete(contentRevision)
    .where(
      and(
        eq(contentRevision.translationId, translationId),
        eq(contentRevision.kind, 'autosave'),
        notInArray(contentRevision.id, keep),
        sql`not exists (select 1 from content_translation t where t.id = ${translationId} and (t.draft_revision_id = ${contentRevision.id} or t.published_revision_id = ${contentRevision.id}))`,
        sql`not exists (select 1 from publication_schedule s where s.revision_id = ${contentRevision.id})`,
        sql`not exists (select 1 from content_revision r2 where r2.restored_from_revision_id = ${contentRevision.id})`,
      ),
    )
    .returning({ id: contentRevision.id });
  return deleted.length;
}

/* --------------------------------- schedules -------------------------------- */

export function scheduleToDTO(row: ScheduleRow, now: Date): ScheduleDTO {
  const due = row.dueAt.getTime() + OVERDUE_GRACE_MS < now.getTime();
  const permanentFailure =
    row.state === 'failed' &&
    (!(TRANSIENT_FAILURE_CODES as readonly string[]).includes(row.lastError ?? '') || row.attempts >= MAX_SCHEDULE_ATTEMPTS);
  return {
    id: row.id,
    translationId: row.translationId,
    locale: row.locale,
    revisionId: row.revisionId,
    dueAt: row.dueAt,
    timeZone: row.timeZone,
    state: row.state,
    issuerKind: row.issuerKind,
    issuerLabel: row.issuerLabel,
    attempts: row.attempts,
    lastError: row.lastError,
    previousScheduleId: row.previousScheduleId,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    overdue: due && (row.state === 'pending' || row.state === 'claimed' || row.state === 'failed'),
    needsReapproval: row.state === 'blocked' || permanentFailure,
  };
}

export function computeAdminState(params: {
  archived: boolean;
  published: boolean;
  draftDiffers: boolean;
  scheduled: boolean;
}): TranslationAdminState {
  if (params.archived) return 'archived';
  if (params.scheduled) return params.published ? 'published_update_scheduled' : 'scheduled';
  if (!params.published) return 'draft';
  return params.draftDiffers ? 'published_with_changes' : 'published';
}

/** Order-insensitive structural equality for JSON-like values. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => jsonEqual(item, b[i]));
  const aKeys = Object.keys(a as object).filter((key) => (a as Record<string, unknown>)[key] !== undefined);
  const bKeys = Object.keys(b as object).filter((key) => (b as Record<string, unknown>)[key] !== undefined);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => jsonEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
