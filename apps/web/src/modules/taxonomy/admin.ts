import 'server-only';
import { manualCategory, taxonomyTerm, type Executor, type Game } from '@valkyria/db';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DomainError } from '@/lib/result';
import { canForGame, capabilityScope } from '@/modules/access/policy';
import type { Actor } from '@/modules/access/types';
import { recordAudit } from '@/modules/audit/audit';
import { isUniqueViolation } from '@/modules/content/db-errors';
import { authorize, authorizeGameScope } from '@/modules/content/guard';
import { gameSchema, parseInput } from '@/modules/content/inputs';
import { manualGames, sameTaxonomyScope, TAXONOMY_KEY_PATTERN, TAXONOMY_LIMITS, taxonomyScopeGame, type TaxonomyScope } from './scope';

/**
 * Private taxonomy administration: localized labels, descriptions and order of Field
 * Manual categories (per game) and shared news categories/tags. Keys are immutable and
 * document associations are never rewritten here. Manual categories need `content.edit`
 * in their game; news taxonomy needs a platform-wide grant. Every mutation is audited
 * with scope/key/flags only. Nothing here writes to Logi.
 */

export type TaxonomyTermDTO = {
  id: string;
  scope: TaxonomyScope;
  key: string;
  labelCs: string;
  labelEn: string;
  descriptionCs: string;
  descriptionEn: string;
  sortOrder: number;
  /** Documents currently associated with the key (manual articles of the game, news posts or tagged documents). */
  referenceCount: number;
  archived: boolean;
  archivedAt: string | null;
  /** Optimistic concurrency token for `saveTaxonomyTerm` (`expectedUpdatedAt`). */
  updatedAt: string;
};

export type TaxonomyAdminOverview = {
  /** One entry per game in the actor's private-read scope that exposes a Field Manual. */
  manual: { game: Game; categories: TaxonomyTermDTO[] }[];
  /** Shared news taxonomy; `null` when the actor has no platform-wide private-read grant. */
  news: { categories: TaxonomyTermDTO[]; tags: TaxonomyTermDTO[] } | null;
};

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const label = z
  .string({ error: 'required' })
  .transform((value) => value.replace(CONTROL, '').replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'required').max(TAXONOMY_LIMITS.label, 'too_long'));

const description = z
  .string({ error: 'invalid' })
  .default('')
  .transform((value) => value.replace(CONTROL, '').replace(/[ \t]+/g, ' ').trim())
  .pipe(z.string().max(TAXONOMY_LIMITS.description, 'too_long'));

export const taxonomyScopeSchema = z.discriminatedUnion('scope', [
  // Only games with a public Field Manual have manual categories (a Wardogs-only editor cannot create hidden rows).
  z.object({ scope: z.literal('manual-category'), game: gameSchema.refine((game) => manualGames().includes(game), 'invalid') }),
  z.object({ scope: z.literal('news-category') }),
  z.object({ scope: z.literal('news-tag') }),
]);

const termRefSchema = z.object({ scope: taxonomyScopeSchema, id: z.uuid({ error: 'invalid' }) });
export type TaxonomyTermRefInput = z.input<typeof termRefSchema>;

export const saveTaxonomyTermSchema = z.object({
  scope: taxonomyScopeSchema,
  /** `null` creates a term; otherwise the term is updated with optimistic concurrency. */
  id: z.uuid({ error: 'invalid' }).nullable(),
  key: z
    .string({ error: 'required' })
    .trim()
    .max(TAXONOMY_LIMITS.key, 'too_long')
    .regex(TAXONOMY_KEY_PATTERN, 'invalid_key')
    .optional(),
  labelCs: label,
  labelEn: label,
  descriptionCs: description,
  descriptionEn: description,
  sortOrder: z.number({ error: 'invalid_number' }).int('invalid_number').min(0, 'out_of_range').max(TAXONOMY_LIMITS.sortOrderMax, 'out_of_range'),
  /** ISO `updatedAt` of the row the editor loaded (required for updates). */
  expectedUpdatedAt: z.iso.datetime({ offset: true, error: 'invalid' }).optional(),
});
export type SaveTaxonomyTermInput = z.input<typeof saveTaxonomyTermSchema>;

type ManualRow = typeof manualCategory.$inferSelect;
type TermRow = typeof taxonomyTerm.$inferSelect;

function entityType(scope: TaxonomyScope): 'manual_category' | 'taxonomy_term' {
  return scope.scope === 'manual-category' ? 'manual_category' : 'taxonomy_term';
}

function termKind(scope: TaxonomyScope): 'category' | 'tag' {
  return scope.scope === 'news-tag' ? 'tag' : 'category';
}

function manualDto(row: ManualRow, referenceCount: number): TaxonomyTermDTO {
  return {
    id: row.id,
    scope: { scope: 'manual-category', game: row.game },
    key: row.key,
    labelCs: row.labelCs,
    labelEn: row.labelEn,
    descriptionCs: row.descriptionCs,
    descriptionEn: row.descriptionEn,
    sortOrder: row.sortOrder,
    referenceCount,
    archived: row.archivedAt !== null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function termDto(row: TermRow, referenceCount: number): TaxonomyTermDTO {
  return {
    id: row.id,
    scope: { scope: row.kind === 'tag' ? 'news-tag' : 'news-category' },
    key: row.key,
    labelCs: row.labelCs,
    labelEn: row.labelEn,
    descriptionCs: row.descriptionCs,
    descriptionEn: row.descriptionEn,
    sortOrder: row.sortOrder,
    referenceCount,
    archived: row.archivedAt !== null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/* ------------------------------- references ------------------------------- */

/*
 * A key is referenced by a document's current shared fields (drafts included) and by the
 * published revision of any of its translations: an article moved to another category in
 * a draft stays public under its old key until that translation is republished. Both
 * sides count, per distinct document.
 */

async function countsByKey(db: Executor, query: ReturnType<typeof sql>): Promise<Map<string, number>> {
  const rows = await db.execute<{ key: string; count: number }>(sql`select refs.key as key, count(distinct refs.document_id)::int as count from (${query}) as refs where refs.key is not null group by refs.key`);
  return new Map(rows.rows.map((row) => [row.key, Number(row.count)]));
}

/** Manual articles of `game` per category key. */
function manualReferenceCounts(db: Executor, game: Game): Promise<Map<string, number>> {
  return countsByKey(db, sql`
    select d.id as document_id, d.category_key as key from content_document d where d.kind = 'manual' and d.game = ${game}
    union all
    select d.id, r.taxonomy->'category'->>'key' from content_document d
      join content_translation t on t.document_id = d.id
      join content_revision r on r.id = t.published_revision_id
     where d.kind = 'manual' and d.game = ${game}`);
}

/** Non-manual documents (news posts) per shared category key. */
function newsCategoryReferenceCounts(db: Executor): Promise<Map<string, number>> {
  return countsByKey(db, sql`
    select d.id as document_id, d.category_key as key from content_document d where d.kind <> 'manual'
    union all
    select d.id, r.taxonomy->'category'->>'key' from content_document d
      join content_translation t on t.document_id = d.id
      join content_revision r on r.id = t.published_revision_id
     where d.kind <> 'manual'`);
}

/** Documents of any kind per tag key. */
function tagReferenceCounts(db: Executor): Promise<Map<string, number>> {
  return countsByKey(db, sql`
    select d.id as document_id, tag.key as key from content_document d, unnest(d.tag_keys) as tag(key)
    union all
    select d.id, tag->>'key' from content_document d
      join content_translation t on t.document_id = d.id
      join content_revision r on r.id = t.published_revision_id,
      jsonb_array_elements(coalesce(r.taxonomy->'tags', '[]'::jsonb)) as tag`);
}

async function referenceCountFor(db: Executor, scope: TaxonomyScope, key: string): Promise<number> {
  const counts = scope.scope === 'manual-category'
    ? await manualReferenceCounts(db, scope.game)
    : scope.scope === 'news-category' ? await newsCategoryReferenceCounts(db) : await tagReferenceCounts(db);
  return counts.get(key) ?? 0;
}

/* --------------------------------- reads ---------------------------------- */

/** Everything the actor may manage, with reference counts (`content.read_private` scope). */
export async function listTaxonomyForAdmin(db: Executor, actor: Actor): Promise<TaxonomyAdminOverview> {
  await authorize(db, actor, 'content.read_private', 'read', { action: 'content.read_private', entityType: 'taxonomy_term' });
  const scope = capabilityScope(actor, 'content.read_private');
  const games = scope === null ? [] : manualGames().filter((game) => scope === 'all' || scope.has(game));
  const manual: TaxonomyAdminOverview['manual'] = [];
  for (const game of games) {
    const [rows, counts] = await Promise.all([
      db.select().from(manualCategory).where(eq(manualCategory.game, game)).orderBy(asc(manualCategory.sortOrder), asc(manualCategory.key)),
      manualReferenceCounts(db, game),
    ]);
    manual.push({ game, categories: rows.map((row) => manualDto(row, counts.get(row.key) ?? 0)) });
  }
  let news: TaxonomyAdminOverview['news'] = null;
  if (canForGame(actor, 'content.read_private', null)) {
    const [rows, categoryCounts, tagCounts] = await Promise.all([
      db.select().from(taxonomyTerm).orderBy(asc(taxonomyTerm.kind), asc(taxonomyTerm.sortOrder), asc(taxonomyTerm.key)),
      newsCategoryReferenceCounts(db),
      tagReferenceCounts(db),
    ]);
    news = {
      categories: rows.filter((row) => row.kind === 'category').map((row) => termDto(row, categoryCounts.get(row.key) ?? 0)),
      tags: rows.filter((row) => row.kind === 'tag').map((row) => termDto(row, tagCounts.get(row.key) ?? 0)),
    };
  }
  return { manual, news };
}

/** One term of a scope for the edit page; `null` when it does not exist in that scope. */
export async function getTaxonomyTermForAdmin(db: Executor, actor: Actor, rawInput: TaxonomyTermRefInput): Promise<TaxonomyTermDTO | null> {
  const input = parseInput(termRefSchema, rawInput);
  await authorize(db, actor, 'content.read_private', 'read', { action: 'content.read_private', entityType: entityType(input.scope) });
  await authorizeGameScope(db, actor, 'content.read_private', [taxonomyScopeGame(input.scope)], { action: 'content.read_private', entityType: entityType(input.scope), entityId: input.id });
  const row = await readTerm(db, input.scope, input.id, null);
  if (!row) return null;
  return toDto(row, input.scope, await referenceCountFor(db, input.scope, row.row.key));
}

type AnyRow = { kind: 'manual'; row: ManualRow } | { kind: 'term'; row: TermRow };

async function readTerm(db: Executor, scope: TaxonomyScope, id: string, lock: 'update' | null): Promise<AnyRow | null> {
  if (scope.scope === 'manual-category') {
    const query = db.select().from(manualCategory).where(and(eq(manualCategory.id, id), eq(manualCategory.game, scope.game)));
    const [row] = lock ? await query.for('update') : await query;
    return row ? { kind: 'manual', row } : null;
  }
  const query = db.select().from(taxonomyTerm).where(and(eq(taxonomyTerm.id, id), eq(taxonomyTerm.kind, termKind(scope))));
  const [row] = lock ? await query.for('update') : await query;
  return row ? { kind: 'term', row } : null;
}

function toDto(row: AnyRow, scope: TaxonomyScope, referenceCount: number): TaxonomyTermDTO {
  const dto = row.kind === 'manual' ? manualDto(row.row, referenceCount) : termDto(row.row, referenceCount);
  if (!sameTaxonomyScope(dto.scope, scope)) throw new DomainError('not_found');
  return dto;
}

/* -------------------------------- mutations ------------------------------- */

async function lockedTerm(tx: Executor, scope: TaxonomyScope, id: string): Promise<AnyRow> {
  const row = await readTerm(tx, scope, id, 'update');
  if (!row) throw new DomainError('not_found');
  return row;
}

/**
 * Creates (`id: null`, `key` required) or updates one term's labels, descriptions and
 * order. The key never changes; a stale `expectedUpdatedAt` is a `conflict`; a key already
 * used in the scope is a validation error (`key: duplicate_key`).
 */
export async function saveTaxonomyTerm(db: Executor, actor: Actor, rawInput: SaveTaxonomyTermInput, now = new Date()): Promise<TaxonomyTermDTO> {
  const creating = rawInput?.id === null || rawInput?.id === undefined;
  const action = creating ? 'taxonomy.create' : 'taxonomy.update';
  const type = rawInput?.scope?.scope === 'manual-category' ? 'manual_category' : 'taxonomy_term';
  await authorize(db, actor, 'content.edit', 'write', { action, entityType: type });
  const input = parseInput(saveTaxonomyTermSchema, rawInput);
  if (input.id === null && !input.key) throw new DomainError('validation', 'A key is required.', { key: 'required' });
  if (input.id !== null && !input.expectedUpdatedAt) throw new DomainError('validation', 'The loaded version is required.', { expectedUpdatedAt: 'required' });
  const scope = input.scope;
  await authorizeGameScope(db, actor, 'content.edit', [taxonomyScopeGame(scope)], { action, entityType: entityType(scope), entityId: input.id });

  const values = {
    labelCs: input.labelCs,
    labelEn: input.labelEn,
    descriptionCs: input.descriptionCs,
    descriptionEn: input.descriptionEn,
    sortOrder: input.sortOrder,
    updatedAt: now,
  };
  const summary = (key: string, archived: boolean) => ({ scope: scope.scope, ...(scope.scope === 'manual-category' ? { game: scope.game } : {}), key, sortOrder: input.sortOrder, archived });

  try {
    return await db.transaction(async (tx) => {
      if (input.id === null) {
        const key = input.key!;
        let row: AnyRow;
        if (scope.scope === 'manual-category') {
          const [inserted] = await tx.insert(manualCategory).values({ game: scope.game, key, ...values, createdAt: now }).returning();
          row = { kind: 'manual', row: inserted! };
        } else {
          const [inserted] = await tx.insert(taxonomyTerm).values({ kind: termKind(scope), key, ...values, createdAt: now }).returning();
          row = { kind: 'term', row: inserted! };
        }
        await recordAudit(tx, { actor, action, outcome: 'success', capability: 'content.edit', entityType: entityType(scope), entityId: row.row.id, summary: summary(key, false) });
        return toDto(row, scope, 0);
      }

      const current = await lockedTerm(tx, scope, input.id);
      if (current.row.updatedAt.getTime() !== Date.parse(input.expectedUpdatedAt!)) throw new DomainError('conflict', 'The term changed meanwhile.', { _: 'conflict' });
      let row: AnyRow;
      if (current.kind === 'manual') {
        const [updated] = await tx.update(manualCategory).set(values).where(eq(manualCategory.id, current.row.id)).returning();
        row = { kind: 'manual', row: updated! };
      } else {
        const [updated] = await tx.update(taxonomyTerm).set(values).where(eq(taxonomyTerm.id, current.row.id)).returning();
        row = { kind: 'term', row: updated! };
      }
      await recordAudit(tx, {
        actor,
        action,
        outcome: 'success',
        capability: 'content.edit',
        entityType: entityType(scope),
        entityId: row.row.id,
        summary: { ...summary(row.row.key, row.row.archivedAt !== null), previousSortOrder: current.row.sortOrder },
      });
      return toDto(row, scope, await referenceCountFor(tx, scope, row.row.key));
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DomainError('validation', 'Duplicate key.', { key: 'duplicate_key' });
    throw error;
  }
}

async function setArchived(db: Executor, actor: Actor, rawInput: TaxonomyTermRefInput, archived: boolean, now: Date): Promise<TaxonomyTermDTO> {
  const action = archived ? 'taxonomy.archive' : 'taxonomy.restore';
  const type = rawInput?.scope?.scope === 'manual-category' ? 'manual_category' : 'taxonomy_term';
  await authorize(db, actor, 'content.edit', 'write', { action, entityType: type });
  const input = parseInput(termRefSchema, rawInput);
  await authorizeGameScope(db, actor, 'content.edit', [taxonomyScopeGame(input.scope)], { action, entityType: entityType(input.scope), entityId: input.id });
  return db.transaction(async (tx) => {
    const current = await lockedTerm(tx, input.scope, input.id);
    if ((current.row.archivedAt !== null) === archived) throw new DomainError('invalid_state', archived ? 'Already archived.' : 'Not archived.');
    const values = { archivedAt: archived ? now : null, updatedAt: now };
    let row: AnyRow;
    if (current.kind === 'manual') {
      const [updated] = await tx.update(manualCategory).set(values).where(eq(manualCategory.id, current.row.id)).returning();
      row = { kind: 'manual', row: updated! };
    } else {
      const [updated] = await tx.update(taxonomyTerm).set(values).where(eq(taxonomyTerm.id, current.row.id)).returning();
      row = { kind: 'term', row: updated! };
    }
    const referenceCount = await referenceCountFor(tx, input.scope, row.row.key);
    await recordAudit(tx, {
      actor,
      action,
      outcome: 'success',
      capability: 'content.edit',
      entityType: entityType(input.scope),
      entityId: row.row.id,
      summary: { scope: input.scope.scope, ...(input.scope.scope === 'manual-category' ? { game: input.scope.game } : {}), key: row.row.key, archived, referenceCount },
    });
    return toDto(row, input.scope, referenceCount);
  });
}

/** Hides the term from pickers; documents that already use the key keep it. */
export function archiveTaxonomyTerm(db: Executor, actor: Actor, input: TaxonomyTermRefInput, now = new Date()): Promise<TaxonomyTermDTO> {
  return setArchived(db, actor, input, true, now);
}

export function restoreTaxonomyTerm(db: Executor, actor: Actor, input: TaxonomyTermRefInput, now = new Date()): Promise<TaxonomyTermDTO> {
  return setArchived(db, actor, input, false, now);
}

/**
 * Deletes an unreferenced term. A term still associated with any document is refused
 * (`conflict`, `_: referenced`); content is never cascade-deleted or silently reassigned.
 * The row lock serializes the check against concurrent draft saves, which hold a share
 * lock on the keys they assign.
 */
export async function deleteTaxonomyTerm(db: Executor, actor: Actor, rawInput: TaxonomyTermRefInput): Promise<{ id: string; key: string }> {
  const type = rawInput?.scope?.scope === 'manual-category' ? 'manual_category' : 'taxonomy_term';
  await authorize(db, actor, 'content.edit', 'write', { action: 'taxonomy.delete', entityType: type });
  const input = parseInput(termRefSchema, rawInput);
  await authorizeGameScope(db, actor, 'content.edit', [taxonomyScopeGame(input.scope)], { action: 'taxonomy.delete', entityType: entityType(input.scope), entityId: input.id });
  return db.transaction(async (tx) => {
    const current = await lockedTerm(tx, input.scope, input.id);
    const referenceCount = await referenceCountFor(tx, input.scope, current.row.key);
    if (referenceCount > 0) throw new DomainError('conflict', 'The term is still referenced.', { _: 'referenced' });
    if (current.kind === 'manual') await tx.delete(manualCategory).where(eq(manualCategory.id, current.row.id));
    else await tx.delete(taxonomyTerm).where(eq(taxonomyTerm.id, current.row.id));
    await recordAudit(tx, {
      actor,
      action: 'taxonomy.delete',
      outcome: 'success',
      capability: 'content.edit',
      entityType: entityType(input.scope),
      entityId: current.row.id,
      summary: { scope: input.scope.scope, ...(input.scope.scope === 'manual-category' ? { game: input.scope.game } : {}), key: current.row.key, archived: current.row.archivedAt !== null },
    });
    return { id: current.row.id, key: current.row.key };
  });
}
