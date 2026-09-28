import 'server-only';
import { contentDocument, contentRevision, contentTranslation, publicationSchedule, taxonomyTerm, type DocumentKind, type Executor, type Locale, type PageKey, type ScheduleState } from '@valkyria/db';
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { Actor } from '@/modules/access/types';
import { authorize, documentScopeCondition } from './guard';
import { ACTIVE_SCHEDULE_STATES, MAX_SCHEDULE_ATTEMPTS, OVERDUE_GRACE_MS, TRANSIENT_FAILURE_CODES } from './store';

/**
 * Small private read helpers for the editorial administration (taxonomy options, row
 * versions for list actions, the overview's actionable items). Every helper requires
 * `content.read_private`; they return explicit DTOs, never raw rows.
 */

export type TaxonomyOption = { key: string; labelCs: string; labelEn: string };
export type TaxonomyOptions = { categories: TaxonomyOption[]; tags: TaxonomyOption[] };

/** Shared category/tag keys with both localized labels (for selectors and list labels). */
export async function listTaxonomyOptions(db: Executor, actor: Actor): Promise<TaxonomyOptions> {
  await authorize(db, actor, 'content.read_private', 'read', { action: 'content.read_private', entityType: 'taxonomy_term' });
  const rows = await db
    .select({ kind: taxonomyTerm.kind, key: taxonomyTerm.key, labelCs: taxonomyTerm.labelCs, labelEn: taxonomyTerm.labelEn })
    .from(taxonomyTerm)
    .orderBy(asc(taxonomyTerm.kind), asc(taxonomyTerm.key));
  const option = (row: (typeof rows)[number]): TaxonomyOption => ({ key: row.key, labelCs: row.labelCs, labelEn: row.labelEn });
  return { categories: rows.filter((row) => row.kind === 'category').map(option), tags: rows.filter((row) => row.kind === 'tag').map(option) };
}

export type RowVersions = { documents: Record<string, number>; translations: Record<string, number> };

/** Optimistic-concurrency versions of listed documents and their translations (list row actions). */
export async function listRowVersions(db: Executor, actor: Actor, documentIds: readonly string[]): Promise<RowVersions> {
  await authorize(db, actor, 'content.read_private', 'read', { action: 'content.read_private', entityType: 'content_document' });
  const result: RowVersions = { documents: {}, translations: {} };
  const ids = [...new Set(documentIds)];
  const scope = documentScopeCondition(actor, 'content.read_private');
  if (ids.length === 0 || scope === 'none') return result;
  const documents = await db
    .select({ id: contentDocument.id, version: contentDocument.version })
    .from(contentDocument)
    .where(and(inArray(contentDocument.id, ids), scope));
  for (const row of documents) result.documents[row.id] = row.version;
  const visible = documents.map((row) => row.id);
  if (visible.length === 0) return result;
  const translations = await db
    .select({ id: contentTranslation.id, version: contentTranslation.version })
    .from(contentTranslation)
    .where(inArray(contentTranslation.documentId, visible));
  for (const row of translations) result.translations[row.id] = row.version;
  return result;
}

export type OwnDraftItem = {
  documentId: string;
  translationId: string;
  kind: DocumentKind;
  pageKey: PageKey | null;
  locale: Locale;
  title: string;
  /** The translation is live and the draft holds unpublished changes. */
  published: boolean;
  updatedAt: Date;
};

/**
 * Unpublished drafts (new translations or unpublished changes of live ones) whose
 * current draft revision the actor saved, or that belong to a document the actor created.
 */
export async function listOwnDrafts(db: Executor, actor: Actor, limit = 8): Promise<OwnDraftItem[]> {
  await authorize(db, actor, 'content.read_private', 'read', { action: 'content.read_private', entityType: 'content_translation' });
  if (actor.kind !== 'principal') return [];
  const scope = documentScopeCondition(actor, 'content.read_private');
  if (scope === 'none') return [];
  const rows = await db
    .select({
      documentId: contentDocument.id,
      translationId: contentTranslation.id,
      kind: contentDocument.kind,
      pageKey: contentDocument.pageKey,
      locale: contentTranslation.locale,
      title: contentRevision.title,
      publishedRevisionId: contentTranslation.publishedRevisionId,
      updatedAt: contentTranslation.updatedAt,
    })
    .from(contentTranslation)
    .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
    .innerJoin(contentRevision, and(eq(contentRevision.id, contentTranslation.draftRevisionId), eq(contentRevision.translationId, contentTranslation.id)))
    .where(
      and(
        isNull(contentDocument.archivedAt),
        or(isNull(contentTranslation.publishedRevisionId), ne(contentTranslation.draftRevisionId, contentTranslation.publishedRevisionId)),
        or(eq(contentRevision.createdBy, actor.userId), eq(contentDocument.createdBy, actor.userId)),
        scope,
      ),
    )
    .orderBy(desc(contentTranslation.updatedAt), desc(contentTranslation.id))
    .limit(Math.min(Math.max(limit, 1), 50));
  return rows.map((row) => ({
    documentId: row.documentId,
    translationId: row.translationId,
    kind: row.kind,
    pageKey: row.pageKey,
    locale: row.locale,
    title: row.title,
    published: row.publishedRevisionId !== null,
    updatedAt: row.updatedAt,
  }));
}

export type ScheduleOverviewItem = {
  scheduleId: string;
  documentId: string;
  translationId: string;
  kind: DocumentKind;
  locale: Locale;
  /** Title of the scheduled immutable revision. */
  title: string;
  dueAt: Date;
  timeZone: string;
  state: ScheduleState;
  overdue: boolean;
  needsReapproval: boolean;
  /** The translation is already live (a scheduled update). */
  live: boolean;
};

/** Active schedules; blocked/failed/overdue ones first, then by due time. */
export async function listScheduleOverview(db: Executor, actor: Actor, options: { limit?: number; now?: Date } = {}): Promise<ScheduleOverviewItem[]> {
  await authorize(db, actor, 'content.read_private', 'read', { action: 'content.read_private', entityType: 'publication_schedule' });
  const now = options.now ?? new Date();
  const scope = documentScopeCondition(actor, 'content.read_private');
  if (scope === 'none') return [];
  const overdueBefore = new Date(now.getTime() - OVERDUE_GRACE_MS);
  const attention = sql<number>`case when ${publicationSchedule.state} in ('blocked', 'failed') then 0 when ${publicationSchedule.dueAt} < ${overdueBefore} then 1 else 2 end`;
  const rows = await db
    .select({
      scheduleId: publicationSchedule.id,
      documentId: contentTranslation.documentId,
      translationId: contentTranslation.id,
      kind: contentDocument.kind,
      locale: publicationSchedule.locale,
      title: contentRevision.title,
      dueAt: publicationSchedule.dueAt,
      timeZone: publicationSchedule.timeZone,
      state: publicationSchedule.state,
      lastError: publicationSchedule.lastError,
      attempts: publicationSchedule.attempts,
      publishedRevisionId: contentTranslation.publishedRevisionId,
    })
    .from(publicationSchedule)
    .innerJoin(contentTranslation, eq(contentTranslation.id, publicationSchedule.translationId))
    .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
    .innerJoin(contentRevision, and(eq(contentRevision.id, publicationSchedule.revisionId), eq(contentRevision.translationId, publicationSchedule.translationId)))
    .where(and(inArray(publicationSchedule.state, ACTIVE_SCHEDULE_STATES), scope))
    .orderBy(asc(attention), asc(publicationSchedule.dueAt), asc(publicationSchedule.id))
    .limit(Math.min(Math.max(options.limit ?? 10, 1), 50));
  return rows.map((row) => ({
    scheduleId: row.scheduleId,
    documentId: row.documentId,
    translationId: row.translationId,
    kind: row.kind,
    locale: row.locale,
    title: row.title,
    dueAt: row.dueAt,
    timeZone: row.timeZone,
    state: row.state,
    // Same rules as the editor's schedule DTO (store.scheduleToDTO).
    overdue: row.state !== 'blocked' && row.dueAt.getTime() < overdueBefore.getTime(),
    needsReapproval:
      row.state === 'blocked' ||
      (row.state === 'failed' && (!(TRANSIENT_FAILURE_CODES as readonly string[]).includes(row.lastError ?? '') || row.attempts >= MAX_SCHEDULE_ATTEMPTS)),
    live: row.publishedRevisionId !== null,
  }));
}
