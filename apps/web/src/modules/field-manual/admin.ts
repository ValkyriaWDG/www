import 'server-only';
import { contentDocument, manualArticle, manualCategory, type Executor, type Game } from '@valkyria/db';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DomainError } from '@/lib/result';
import { capabilityScope } from '@/modules/access/policy';
import type { Actor } from '@/modules/access/types';
import { recordAudit } from '@/modules/audit/audit';
import type { TaxonomyOption, TaxonomyOptionsFilter } from '@/modules/content/admin-queries';
import { authorize, authorizeGameScope } from '@/modules/content/guard';
import { parseInput } from '@/modules/content/inputs';
import { sortTaxonomyOptions } from '@/modules/taxonomy/scope';
import type { ManualMeta } from './public';

/**
 * Private Field Manual administration helpers. Articles themselves use the shared
 * content editor/publication workflow; this module adds the manual-specific category
 * options and the shared provenance metadata, both within the actor's game scope.
 */

/**
 * Manual categories of one game for the editor/list selectors (empty outside the actor's
 * scope). Archived categories are left out unless the document already uses them
 * (`include`) or a list needs every label (`includeArchived`).
 */
export async function listManualCategoryOptions(db: Executor, actor: Actor, game: Game, filter: TaxonomyOptionsFilter = {}): Promise<{ categories: TaxonomyOption[]; tags: TaxonomyOption[] }> {
  await authorize(db, actor, 'content.read_private', 'read', { action: 'content.read_private', entityType: 'manual_category' });
  const scope = capabilityScope(actor, 'content.read_private');
  if (scope === null || (scope !== 'all' && !scope.has(game))) return { categories: [], tags: [] };
  const include = new Set((filter.include ?? []).filter((key): key is string => typeof key === 'string'));
  const rows = await db.select().from(manualCategory).where(eq(manualCategory.game, game)).orderBy(asc(manualCategory.sortOrder), asc(manualCategory.key));
  const visible = rows.filter((row) => row.archivedAt === null || filter.includeArchived || include.has(row.key));
  return { categories: sortTaxonomyOptions(visible).map((row) => ({ key: row.key, labelCs: row.labelCs, labelEn: row.labelEn, archived: row.archivedAt !== null })), tags: [] };
}

export async function getManualMetaForAdmin(db: Executor, actor: Actor, documentId: string): Promise<(ManualMeta & { sortOrder: number }) | null> {
  await authorize(db, actor, 'content.read_private', 'read', { action: 'content.read_private', entityType: 'manual_article' });
  const [row] = await db
    .select({ meta: manualArticle, game: contentDocument.game })
    .from(manualArticle)
    .innerJoin(contentDocument, eq(contentDocument.id, manualArticle.documentId))
    .where(eq(manualArticle.documentId, documentId))
    .limit(1);
  if (!row) return null;
  await authorizeGameScope(db, actor, 'content.read_private', [row.game], { action: 'content.read_private', entityType: 'manual_article', entityId: documentId });
  return {
    sortOrder: row.meta.sortOrder,
    sourceUrl: row.meta.sourceUrl,
    sourcePublishedOn: row.meta.sourcePublishedOn,
    sourceLanguage: row.meta.sourceLanguage,
    credits: row.meta.credits,
    reviewedAt: row.meta.reviewedAt,
  };
}

export const manualMetaSchema = z.object({
  documentId: z.uuid(),
  sortOrder: z.number().int().min(0).max(10_000),
  sourceUrl: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value === '' ? null : value))
    .pipe(z.url({ protocol: /^https$/ }).nullable()),
  sourcePublishedOn: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .pipe(z.iso.date().nullable()),
  sourceLanguage: z.enum(['cs', 'sk', 'en']).nullable(),
  credits: z.string().trim().max(500),
  /** Marks the mechanics as reviewed now (editorial check of dated game information). */
  markReviewed: z.boolean().default(false),
});
export type ManualMetaInput = z.input<typeof manualMetaSchema>;

/** Saves the shared manual metadata (order, provenance, credits, review) of one article. */
export async function saveManualMeta(db: Executor, actor: Actor, rawInput: ManualMetaInput, now = new Date()): Promise<{ documentId: string }> {
  await authorize(db, actor, 'content.edit', 'write', { action: 'manual.meta.update', entityType: 'manual_article' });
  const input = parseInput(manualMetaSchema, rawInput);
  return db.transaction(async (tx) => {
    const [document] = await tx.select({ id: contentDocument.id, kind: contentDocument.kind, game: contentDocument.game }).from(contentDocument).where(eq(contentDocument.id, input.documentId)).for('update');
    if (!document || document.kind !== 'manual') throw new DomainError('not_found');
    await authorizeGameScope(db, actor, 'content.edit', [document.game], { action: 'manual.meta.update', entityType: 'manual_article', entityId: document.id });
    const values = {
      sortOrder: input.sortOrder,
      sourceUrl: input.sourceUrl,
      sourcePublishedOn: input.sourcePublishedOn,
      sourceLanguage: input.sourceLanguage,
      credits: input.credits,
      ...(input.markReviewed ? { reviewedAt: now } : {}),
      updatedAt: now,
    };
    await tx
      .insert(manualArticle)
      .values({ documentId: document.id, ...values, createdAt: now })
      .onConflictDoUpdate({ target: manualArticle.documentId, set: { ...values, updatedAt: sql`excluded.updated_at` } });
    await recordAudit(tx, {
      actor,
      action: 'manual.meta.update',
      outcome: 'success',
      capability: 'content.edit',
      entityType: 'manual_article',
      entityId: document.id,
      summary: { sortOrder: input.sortOrder, hasSource: input.sourceUrl !== null, reviewed: input.markReviewed },
    });
    return { documentId: document.id };
  });
}
