import 'server-only';
import { asset, contentTranslation, slugRedirect, type Executor, type Locale } from '@valkyria/db';
import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { DomainError } from '@/lib/result';
import type { Actor } from '@/modules/access/types';
import { recordAudit } from '@/modules/audit/audit';
import { isUniqueViolation } from './db-errors';
import { authorize } from './guard';
import { parseInput, translationVersionSchema, type TranslationVersionInput } from './inputs';
import { isRichTextEmpty, parseRichTextDocument } from './rich-text/schema';
import { isValidSlug } from './slug';
import {
  assertNotArchived,
  assertVersion,
  coverAssetIds,
  inTransaction,
  isSlugAvailable,
  lockTranslation,
  readDocument,
  readRevision,
  type DocumentRow,
  type RevisionRow,
  type TranslationRow,
} from './store';
import type { PublishResult } from './types';

export type PublicationDeps = { now?: () => Date };

/**
 * Checks that a revision can go live: required fields, valid rich text, cover alt rules
 * and every referenced media asset present (locked FOR SHARE so a concurrent asset
 * deletion serializes with the publication).
 */
export async function assertPublishable(tx: Executor, document: DocumentRow, revision: RevisionRow): Promise<void> {
  const fieldErrors: Record<string, string> = {};
  if (revision.title.trim() === '') fieldErrors.title = 'required';
  if (!isValidSlug(revision.slug)) fieldErrors.slug = 'invalid';
  if (document.kind === 'news' && revision.excerpt.trim() === '') fieldErrors.excerpt = 'required';
  const parsed = parseRichTextDocument(revision.body);
  if (!parsed.ok) fieldErrors.body = 'invalid';
  else if (isRichTextEmpty(parsed.doc)) fieldErrors.body = 'required';
  const cover = revision.cover;
  if (cover) {
    if (cover.decorative && cover.alt.trim() !== '') fieldErrors['cover.alt'] = 'must_be_empty_when_decorative';
    if (!cover.decorative && cover.alt.trim() === '') fieldErrors['cover.alt'] = 'required';
  }
  const ids = [...new Set([...(parsed.ok ? parsed.assetIds : []), ...coverAssetIds(cover)])];
  if (ids.length > 0) {
    const rows = await tx
      .select({ id: asset.id, scope: asset.scope, state: asset.state, deletedAt: asset.deletedAt })
      .from(asset)
      .where(inArray(asset.id, ids))
      .for('share');
    const usable = new Set(rows.filter((row) => row.scope === 'editorial' && row.state === 'ready' && !row.deletedAt).map((row) => row.id));
    if (cover && !usable.has(cover.assetId)) fieldErrors['cover.assetId'] = 'missing_asset';
    const missingBody = (parsed.ok ? parsed.assetIds : []).filter((id) => !usable.has(id));
    if (missingBody.length > 0) fieldErrors['body.images'] = `missing_asset:${missingBody.slice(0, 5).join(',')}`;
  }
  if (Object.keys(fieldErrors).length > 0) throw new DomainError('validation', 'The revision is not ready for publication.', fieldErrors);
}

/**
 * Moves the live pointer of one translation to `revision` (same translation, enforced by
 * FK). Slug rules: the new live slug must not be reserved by another translation (draft,
 * live or redirect source); a changed live slug leaves a same-locale redirect from the
 * previous one; a redirect whose source is the new live slug is removed (no loops).
 * Never touches the other locale.
 */
export async function applyPublication(
  tx: Executor,
  params: { translation: TranslationRow; revision: RevisionRow; now: Date },
): Promise<{ slug: string; previousSlug: string | null; version: number; noop: boolean }> {
  const { translation, revision, now } = params;
  if (revision.translationId !== translation.id) throw new DomainError('invalid_state', 'Revision belongs to another translation.');
  const slug = revision.slug;
  const previousSlug = translation.liveSlug;
  if (translation.publishedRevisionId === revision.id && previousSlug === slug) {
    return { slug, previousSlug, version: translation.version, noop: true };
  }
  const available = await isSlugAvailable(tx, {
    namespace: translation.namespace,
    locale: translation.locale,
    slug,
    translationId: translation.id,
  });
  if (!available) throw new DomainError('slug_taken', 'Slug already used in this locale.', { slug: 'slug_taken' });

  if (previousSlug && previousSlug !== slug) {
    await tx
      .insert(slugRedirect)
      .values({ namespace: translation.namespace, locale: translation.locale, sourceSlug: previousSlug, translationId: translation.id, createdAt: now })
      .onConflictDoNothing();
  }
  await tx
    .delete(slugRedirect)
    .where(
      and(
        eq(slugRedirect.namespace, translation.namespace),
        eq(slugRedirect.locale, translation.locale),
        eq(slugRedirect.sourceSlug, slug),
        eq(slugRedirect.translationId, translation.id),
      ),
    );
  const [updated] = await tx
    .update(contentTranslation)
    .set({
      publishedRevisionId: revision.id,
      liveSlug: slug,
      publishedAt: now,
      firstPublishedAt: translation.firstPublishedAt ?? now,
      version: translation.version + 1,
      updatedAt: now,
    })
    .where(eq(contentTranslation.id, translation.id))
    .returning({ version: contentTranslation.version });
  return { slug, previousSlug, version: updated!.version, noop: false };
}

/**
 * Locale-prefixed public paths whose output depends on this translation's publication:
 * its list/detail (old and new slug), the other locale's counterpart (hreflang/switch
 * availability), home teasers and the sitemap. Callers inside Next.js may pass them to
 * `revalidatePath`; public pages currently render dynamically from PostgreSQL.
 */
export async function affectedPublicPaths(
  tx: Executor,
  params: { documentId: string; kind: DocumentRow['kind']; pageKey: DocumentRow['pageKey']; locale: Locale; slugs: (string | null)[] },
): Promise<string[]> {
  const paths = new Set<string>(['/sitemap.xml', `/${params.locale}`]);
  const counterparts = await tx
    .select({ locale: contentTranslation.locale, liveSlug: contentTranslation.liveSlug })
    .from(contentTranslation)
    .where(
      and(
        eq(contentTranslation.documentId, params.documentId),
        ne(contentTranslation.locale, params.locale),
        isNotNull(contentTranslation.liveSlug),
      ),
    );
  if (params.kind === 'page' && params.pageKey) {
    paths.add(`/${params.locale}/${params.pageKey}`);
    for (const other of counterparts) paths.add(`/${other.locale}/${params.pageKey}`);
  } else {
    paths.add(`/${params.locale}/news`);
    for (const slug of params.slugs) if (slug) paths.add(`/${params.locale}/news/${slug}`);
    for (const other of counterparts) {
      paths.add(`/${other.locale}/news/${other.liveSlug}`);
    }
  }
  return [...paths];
}

function mapLiveSlugRace<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((error: unknown) => {
    if (isUniqueViolation(error, 'content_translation_live_slug_uq')) {
      throw new DomainError('slug_taken', 'Slug already used in this locale.', { slug: 'slug_taken' });
    }
    throw error;
  });
}

/** Publishes the CURRENT draft revision of exactly this translation. */
export async function publishTranslation(
  db: Executor,
  actor: Actor,
  rawInput: TranslationVersionInput,
  deps: PublicationDeps = {},
): Promise<PublishResult> {
  await authorize(db, actor, 'content.publish', 'write', { action: 'content.publish', entityType: 'content_translation' });
  const input = parseInput(translationVersionSchema, rawInput);
  const now = deps.now?.() ?? new Date();
  return mapLiveSlugRace(
    inTransaction(db, async (tx) => {
      const translation = await lockTranslation(tx, input.translationId);
      assertVersion(translation.version, input.expectedVersion);
      const document = await readDocument(tx, translation.documentId, 'share');
      assertNotArchived(document);
      if (!translation.draftRevisionId) throw new DomainError('invalid_state', 'Nothing to publish.');
      const revision = await readRevision(tx, translation.id, translation.draftRevisionId);
      await assertPublishable(tx, document, revision);
      const result = await applyPublication(tx, { translation, revision, now });
      await recordAudit(tx, {
        actor,
        action: 'content.publish',
        outcome: 'success',
        capability: 'content.publish',
        entityType: 'content_document',
        entityId: document.id,
        translationId: translation.id,
        locale: translation.locale,
        summary: { revisionId: revision.id, slug: result.slug, previousSlug: result.previousSlug, mode: 'manual' },
      });
      return {
        documentId: document.id,
        translationId: translation.id,
        locale: translation.locale,
        version: result.version,
        revisionId: revision.id,
        slug: result.slug,
        previousSlug: result.previousSlug,
        publishedAt: result.noop ? translation.publishedAt : now,
        affectedPaths: await affectedPublicPaths(tx, {
          documentId: document.id,
          kind: document.kind,
          pageKey: document.pageKey,
          locale: translation.locale,
          slugs: [result.slug, result.previousSlug],
        }),
      };
    }),
  );
}

/** Removes the live pointer/slug of exactly this translation; revisions and the other locale stay. */
export async function unpublishTranslation(
  db: Executor,
  actor: Actor,
  rawInput: TranslationVersionInput,
  deps: PublicationDeps = {},
): Promise<PublishResult> {
  await authorize(db, actor, 'content.publish', 'write', { action: 'content.unpublish', entityType: 'content_translation' });
  const input = parseInput(translationVersionSchema, rawInput);
  const now = deps.now?.() ?? new Date();
  return inTransaction(db, async (tx) => {
    const translation = await lockTranslation(tx, input.translationId);
    assertVersion(translation.version, input.expectedVersion);
    if (!translation.publishedRevisionId) throw new DomainError('invalid_state', 'The translation is not published.');
    const document = await readDocument(tx, translation.documentId, 'share');
    const [updated] = await tx
      .update(contentTranslation)
      .set({ publishedRevisionId: null, liveSlug: null, publishedAt: null, version: translation.version + 1, updatedAt: now })
      .where(eq(contentTranslation.id, translation.id))
      .returning({ version: contentTranslation.version });
    await recordAudit(tx, {
      actor,
      action: 'content.unpublish',
      outcome: 'success',
      capability: 'content.publish',
      entityType: 'content_document',
      entityId: document.id,
      translationId: translation.id,
      locale: translation.locale,
      summary: { revisionId: translation.publishedRevisionId, slug: translation.liveSlug },
    });
    return {
      documentId: document.id,
      translationId: translation.id,
      locale: translation.locale,
      version: updated!.version,
      revisionId: null,
      slug: null,
      previousSlug: translation.liveSlug,
      publishedAt: null,
      affectedPaths: await affectedPublicPaths(tx, {
        documentId: document.id,
        kind: document.kind,
        pageKey: document.pageKey,
        locale: translation.locale,
        slugs: [translation.liveSlug],
      }),
    };
  });
}
