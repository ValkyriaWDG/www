import 'server-only';
import { match, tournament, type Executor } from '@valkyria/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DomainError } from '@/lib/result';
import type { Capability } from '@/modules/access/capabilities';
import { actorUserId } from '@/modules/access/policy';
import type { Actor } from '@/modules/access/types';
import { recordAudit } from '@/modules/audit/audit';
import { assertVersion, authorize, authorizeGames, isUniqueViolation, parseInput } from '@/modules/prose/domain';
import { firstFreeSlug, slugify } from '@/modules/prose/slug';
import {
  createTournamentSchema,
  TOURNAMENT_SLUG_MAX,
  tournamentTargetSchema,
  updateTournamentSchema,
  type CreateTournamentInput,
  type TournamentTargetInput,
  type UpdateTournamentInput,
} from './schemas';
import type { TournamentMutationResult } from './types';

/*
 * Tournament administration. Tournaments belong to the match domain: `matches.edit`
 * creates, edits and deletes drafts, `matches.publish` controls the public gate, both
 * within the actor's game scope. Every mutation locks the row, checks its version and
 * appends an audit event in the same transaction.
 */

type TournamentRow = typeof tournament.$inferSelect;

/** Authorization happens before input parsing so unauthorized callers learn nothing about validation. */
async function guard(db: Executor, actor: Actor, capability: Capability, action: string, input: unknown) {
  const raw = typeof input === 'object' && input !== null ? (input as { id?: unknown }).id : undefined;
  const entityId = typeof raw === 'string' && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
  await authorize(db, actor, capability, { intent: 'write', action, entityType: 'tournament', entityId });
}

async function lockTournament(db: Executor, id: string, expectedVersion: number): Promise<TournamentRow> {
  const [row] = await db.select().from(tournament).where(eq(tournament.id, id)).for('update');
  assertVersion(row, expectedVersion);
  return row as TournamentRow;
}

async function slugTaken(db: Executor, candidates: string[]): Promise<Set<string>> {
  const rows = await db.select({ slug: tournament.slug }).from(tournament).where(inArray(tournament.slug, candidates));
  return new Set(rows.map((row) => row.slug));
}

function slugConflict(error: unknown): never {
  if (isUniqueViolation(error, 'tournament_slug_unique')) throw new DomainError('slug_taken', 'Slug already in use.', { slug: 'slug_taken' });
  throw error;
}

const returningFields = { id: tournament.id, slug: tournament.slug, version: tournament.version, publication: tournament.publication };

/** Creates a draft tournament. Requires `matches.edit` for its game. */
export async function createTournament(db: Executor, actor: Actor, input: CreateTournamentInput): Promise<TournamentMutationResult> {
  await guard(db, actor, 'matches.edit', 'tournament.create', null);
  const data = parseInput(createTournamentSchema, input);
  await authorizeGames(db, actor, 'matches.edit', [data.game], { action: 'tournament.create', entityType: 'tournament' });
  try {
    return await db.transaction(async (tx) => {
      let slug = data.slug;
      if (slug) {
        if ((await slugTaken(tx, [slug])).size > 0) throw new DomainError('slug_taken', 'Slug already in use.', { slug: 'slug_taken' });
      } else {
        const base = slugify([data.name, data.season].filter(Boolean).join(' '), TOURNAMENT_SLUG_MAX - 4) || 'turnaj';
        slug = await firstFreeSlug(base, TOURNAMENT_SLUG_MAX, (candidates) => slugTaken(tx, candidates));
      }
      const [row] = await tx
        .insert(tournament)
        .values({
          slug,
          game: data.game,
          name: data.name,
          season: data.season ?? null,
          organizer: data.organizer ?? null,
          startsOn: data.startsOn ?? null,
          endsOn: data.endsOn ?? null,
          links: data.links ?? [],
          publication: 'draft',
          internalNotes: data.internalNotes ?? '',
          createdBy: actorUserId(actor),
        })
        .returning(returningFields);
      await recordAudit(tx, {
        actor,
        action: 'tournament.create',
        outcome: 'success',
        capability: 'matches.edit',
        entityType: 'tournament',
        entityId: row!.id,
        summary: { slug, game: data.game },
      });
      return row!;
    });
  } catch (error) {
    return slugConflict(error);
  }
}

/**
 * Updates shared facts. Moving a tournament to another game needs the capability in both
 * games and is refused while matches of the old game are linked to it.
 */
export async function updateTournament(db: Executor, actor: Actor, input: UpdateTournamentInput): Promise<TournamentMutationResult> {
  await guard(db, actor, 'matches.edit', 'tournament.update', input);
  const data = parseInput(updateTournamentSchema, input);
  try {
    return await db.transaction(async (tx) => {
      const current = await lockTournament(tx, data.id, data.expectedVersion);
      const games = data.game !== undefined && data.game !== current.game ? [current.game, data.game] : [current.game];
      await authorizeGames(db, actor, 'matches.edit', games, { action: 'tournament.update', entityType: 'tournament', entityId: current.id });
      if (data.game !== undefined && data.game !== current.game) {
        const [linked] = await tx.select({ id: match.id }).from(match).where(eq(match.tournamentId, current.id)).limit(1);
        if (linked) throw new DomainError('invalid_state', 'Linked matches belong to the current game.', { game: 'has_matches' });
      }
      const startsOn = data.startsOn !== undefined ? data.startsOn : current.startsOn;
      const endsOn = data.endsOn !== undefined ? data.endsOn : current.endsOn;
      if (startsOn && endsOn && endsOn < startsOn) throw new DomainError('validation', 'End precedes start.', { endsOn: 'ends_before_start' });
      if (data.slug && data.slug !== current.slug && (await slugTaken(tx, [data.slug])).size > 0) {
        throw new DomainError('slug_taken', 'Slug already in use.', { slug: 'slug_taken' });
      }
      const patch: Partial<typeof tournament.$inferInsert> = {};
      const fields = ['game', 'name', 'season', 'organizer', 'startsOn', 'endsOn', 'links', 'internalNotes', 'slug'] as const;
      const changed: string[] = [];
      for (const field of fields) {
        const value = data[field];
        if (value === undefined) continue;
        (patch as Record<string, unknown>)[field] = value;
        changed.push(field);
      }
      const [row] = await tx
        .update(tournament)
        .set({ ...patch, version: sql`${tournament.version} + 1`, updatedAt: new Date() })
        .where(eq(tournament.id, current.id))
        .returning(returningFields);
      await recordAudit(tx, {
        actor,
        action: 'tournament.update',
        outcome: 'success',
        capability: 'matches.edit',
        entityType: 'tournament',
        entityId: current.id,
        summary: { fields: changed },
      });
      return row!;
    });
  } catch (error) {
    return slugConflict(error);
  }
}

async function setPublication(db: Executor, actor: Actor, input: TournamentTargetInput, publish: boolean): Promise<TournamentMutationResult> {
  const action = publish ? 'tournament.publish' : 'tournament.unpublish';
  await guard(db, actor, 'matches.publish', action, input);
  const target = parseInput(tournamentTargetSchema, input);
  return db.transaction(async (tx) => {
    const current = await lockTournament(tx, target.id, target.expectedVersion);
    await authorizeGames(db, actor, 'matches.publish', [current.game], { action, entityType: 'tournament', entityId: current.id });
    if (publish === (current.publication === 'published')) throw new DomainError('invalid_state', publish ? 'Already published.' : 'Not published.');
    const [row] = await tx
      .update(tournament)
      .set({
        publication: publish ? 'published' : 'draft',
        publishedAt: publish ? new Date() : null,
        version: sql`${tournament.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(tournament.id, current.id))
      .returning(returningFields);
    await recordAudit(tx, {
      actor,
      action,
      outcome: 'success',
      capability: 'matches.publish',
      entityType: 'tournament',
      entityId: current.id,
      summary: { slug: current.slug },
    });
    return row!;
  });
}

/** Makes a tournament and its published description visible. Requires `matches.publish`. */
export function publishTournament(db: Executor, actor: Actor, input: TournamentTargetInput) {
  return setPublication(db, actor, input, true);
}

/** Hides a tournament; linked matches stay public without the tournament link. */
export function unpublishTournament(db: Executor, actor: Actor, input: TournamentTargetInput) {
  return setPublication(db, actor, input, false);
}

/** Deletes an unpublished tournament with its prose; linked matches are unlinked. */
export async function deleteTournament(db: Executor, actor: Actor, input: TournamentTargetInput): Promise<{ id: string }> {
  await guard(db, actor, 'matches.edit', 'tournament.delete', input);
  const target = parseInput(tournamentTargetSchema, input);
  return db.transaction(async (tx) => {
    const current = await lockTournament(tx, target.id, target.expectedVersion);
    await authorizeGames(db, actor, 'matches.edit', [current.game], { action: 'tournament.delete', entityType: 'tournament', entityId: current.id });
    if (current.publication === 'published') throw new DomainError('invalid_state', 'Unpublish the tournament before deleting it.');
    await tx.delete(tournament).where(and(eq(tournament.id, current.id), eq(tournament.version, current.version)));
    await recordAudit(tx, {
      actor,
      action: 'tournament.delete',
      outcome: 'success',
      capability: 'matches.edit',
      entityType: 'tournament',
      entityId: current.id,
      summary: { slug: current.slug },
    });
    return { id: current.id };
  });
}

/**
 * Validates a match's tournament link inside the match transaction: the tournament must
 * exist and belong to the match's game. A shared row lock keeps its game stable until the
 * match mutation commits.
 */
export async function assertTournamentForMatch(tx: Executor, tournamentId: string | null, game: TournamentRow['game']): Promise<void> {
  if (!tournamentId) return;
  const [row] = await tx.select({ game: tournament.game }).from(tournament).where(eq(tournament.id, tournamentId)).for('share');
  if (!row) throw new DomainError('validation', 'Unknown tournament.', { tournamentId: 'tournament_missing' });
  if (row.game !== game) throw new DomainError('validation', 'The tournament belongs to another game.', { tournamentId: 'game_mismatch' });
}
