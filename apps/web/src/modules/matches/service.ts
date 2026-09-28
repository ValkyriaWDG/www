import 'server-only';
import { match, matchResult, matchRound, type AssetScope, type Executor, type Game, type MatchStatus } from '@valkyria/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DomainError } from '@/lib/result';
import type { Capability } from '@/modules/access/capabilities';
import { actorUserId } from '@/modules/access/policy';
import type { Actor } from '@/modules/access/types';
import { roundIssuesForGame } from '@/modules/games/hll-catalog';
import { recordAudit } from '@/modules/audit/audit';
import { assertUsableAssets } from '@/modules/prose/assets';
import { assertVersion, authorize, authorizeGames, isUniqueViolation, parseInput } from '@/modules/prose/domain';
import { firstFreeSlug, slugify } from '@/modules/prose/slug';
import {
  createMatchSchema,
  MATCH_SLUG_MAX,
  matchTargetSchema,
  postponeMatchSchema,
  recordResultSchema,
  rescheduleMatchSchema,
  startsAtInputSchema,
  updateMatchSchema,
  type CreateMatchInput,
  type MatchTargetInput,
  type NormalizedRound,
  type PostponeMatchInput,
  type RecordResultInput,
  type RescheduleMatchInput,
  type StartsAtInput,
  type UpdateMatchInput,
} from './schemas';
import { DEFAULT_MATCH_TIME_ZONE, ZonedTimeError, zonedDate, zonedLocalToInstant } from './time';
import type { MatchMutationResult } from './types';

/** Opponent logos and covers may use match-scoped or editorial media. */
export const MATCH_ASSET_SCOPES: readonly AssetScope[] = ['match', 'editorial'];

/** A result or live state may be recorded at most this long before the scheduled start. */
export const RESULT_EARLY_WINDOW_MS = 60 * 60 * 1000;

const EARLIEST_START = Date.UTC(2000, 0, 1);
const LATEST_START = Date.UTC(2100, 0, 1);

type MatchRow = typeof match.$inferSelect;

/** Resolves a start input to its UTC instant plus the zone it was expressed in (if any). */
export function resolveStartsAt(input: StartsAtInput, field = 'startsAt'): { instant: Date; zone: string | null } {
  const value = parseInput(startsAtInputSchema, input);
  let instant: Date;
  let zone: string | null = null;
  try {
    if (value instanceof Date) instant = new Date(value.getTime());
    else if (typeof value === 'string') instant = new Date(value);
    else {
      instant = zonedLocalToInstant(value.localDateTime, value.timeZone, value.disambiguation ?? 'earlier');
      zone = value.timeZone;
    }
  } catch (error) {
    if (error instanceof ZonedTimeError) throw new DomainError('validation', 'Invalid start time.', { [field]: error.code });
    throw error;
  }
  if (Number.isNaN(instant.getTime()) || instant.getTime() < EARLIEST_START || instant.getTime() >= LATEST_START) {
    throw new DomainError('validation', 'Invalid start time.', { [field]: 'out_of_range' });
  }
  return { instant, zone };
}

/** Authorization happens before input parsing so unauthorized callers learn nothing about validation. */
async function guard(db: Executor, actor: Actor, capability: Capability, action: string, input: unknown) {
  const raw = typeof input === 'object' && input !== null ? (input as { id?: unknown }).id : undefined;
  const entityId = typeof raw === 'string' && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
  await authorize(db, actor, capability, { intent: 'write', action, entityType: 'match', entityId });
}

async function lockMatch(db: Executor, id: string, expectedVersion: number): Promise<MatchRow> {
  const [row] = await db.select().from(match).where(eq(match.id, id)).for('update');
  assertVersion(row, expectedVersion);
  return row as MatchRow;
}

async function slugTaken(db: Executor, candidates: string[]): Promise<Set<string>> {
  const rows = await db.select({ slug: match.slug }).from(match).where(inArray(match.slug, candidates));
  return new Set(rows.map((row) => row.slug));
}

async function generateSlug(db: Executor, startsAt: Date, timeZone: string, opponentName: string): Promise<string> {
  const date = zonedDate(startsAt, timeZone);
  const opponent = slugify(opponentName, MATCH_SLUG_MAX - date.length - 4) || 'zapas';
  return firstFreeSlug(`${date}-${opponent}`, MATCH_SLUG_MAX, (candidates) => slugTaken(db, candidates));
}

function slugConflict(error: unknown): never {
  if (isUniqueViolation(error, 'match_slug_unique')) throw new DomainError('slug_taken', 'Slug already in use.', { slug: 'slug_taken' });
  throw error;
}

function mutationResult(row: Pick<MatchRow, 'id' | 'slug' | 'version' | 'status' | 'publication'>): MatchMutationResult {
  return { id: row.id, slug: row.slug, version: row.version, status: row.status, publication: row.publication };
}

const returningFields = { id: match.id, slug: match.slug, version: match.version, status: match.status, publication: match.publication };

async function replaceRounds(db: Executor, matchId: string, rounds: NormalizedRound[]) {
  await db.delete(matchRound).where(eq(matchRound.matchId, matchId));
  if (rounds.length > 0) await db.insert(matchRound).values(rounds.map((round) => ({ ...round, matchId })));
}

/** Game-specific round rules (HLL: Allies/Axis side, 0–5 sector scores). */
function assertRoundsForGame(game: Game, rounds: NormalizedRound[]) {
  const issues = roundIssuesForGame(game, rounds);
  if (Object.keys(issues).length > 0) throw new DomainError('validation', 'Rounds do not match the game rules.', issues);
}

function roundsHaveScores(rounds: NormalizedRound[]) {
  return rounds.some((round) => round.scoreValkyria !== null || round.scoreOpponent !== null || (round.outcome !== null && round.outcome !== 'unknown'));
}

/** Creates a draft, scheduled fixture. Requires `matches.edit`. */
export async function createMatch(db: Executor, actor: Actor, input: CreateMatchInput): Promise<MatchMutationResult> {
  await guard(db, actor, 'matches.edit', 'match.create', null);
  const data = parseInput(createMatchSchema, input);
  await authorizeGames(db, actor, 'matches.edit', [data.game], { action: 'match.create', entityType: 'match' });
  const start = resolveStartsAt(data.startsAt);
  const timeZone = data.timeZone ?? start.zone ?? DEFAULT_MATCH_TIME_ZONE;
  await assertUsableAssets(
    db,
    [
      { field: 'opponentLogoAssetId', id: data.opponentLogoAssetId },
      { field: 'coverAssetId', id: data.coverAssetId },
    ],
    MATCH_ASSET_SCOPES,
  );
  try {
    return await db.transaction(async (tx) => {
      let slug = data.slug;
      if (slug) {
        if ((await slugTaken(tx, [slug])).size > 0) throw new DomainError('slug_taken', 'Slug already in use.', { slug: 'slug_taken' });
      } else slug = await generateSlug(tx, start.instant, timeZone, data.opponentName);
      const [row] = await tx
        .insert(match)
        .values({
          slug,
          game: data.game,
          opponentName: data.opponentName,
          opponentShortCode: data.opponentShortCode ?? null,
          opponentLogoAssetId: data.opponentLogoAssetId ?? null,
          competitionType: data.competitionType,
          competitionName: data.competitionName ?? null,
          season: data.season ?? null,
          format: data.format ?? null,
          bestOf: data.bestOf ?? null,
          teamSize: data.teamSize ?? null,
          startsAt: start.instant,
          timeZone,
          status: 'scheduled',
          publication: 'draft',
          eventUrl: data.eventUrl ?? null,
          vodLinks: data.vodLinks ?? [],
          coverAssetId: data.coverAssetId ?? null,
          internalNotes: data.internalNotes ?? '',
          createdBy: actorUserId(actor),
        })
        .returning(returningFields);
      await recordAudit(tx, {
        actor,
        action: 'match.create',
        outcome: 'success',
        capability: 'matches.edit',
        entityType: 'match',
        entityId: row!.id,
        summary: { slug, game: data.game, startsAt: start.instant.toISOString() },
      });
      return mutationResult(row!);
    });
  } catch (error) {
    return slugConflict(error);
  }
}

/** Updates shared match facts (not start time, status or result). Requires `matches.edit`. */
export async function updateMatch(db: Executor, actor: Actor, input: UpdateMatchInput): Promise<MatchMutationResult> {
  await guard(db, actor, 'matches.edit', 'match.update', input);
  const data = parseInput(updateMatchSchema, input);
  await assertUsableAssets(
    db,
    [
      { field: 'opponentLogoAssetId', id: data.opponentLogoAssetId },
      { field: 'coverAssetId', id: data.coverAssetId },
    ],
    MATCH_ASSET_SCOPES,
  );
  try {
    return await db.transaction(async (tx) => {
      const current = await lockMatch(tx, data.id, data.expectedVersion);
      // Moving a match to another game needs the capability in both games.
      const games = data.game !== undefined && data.game !== current.game ? [current.game, data.game] : [current.game];
      await authorizeGames(db, actor, 'matches.edit', games, { action: 'match.update', entityType: 'match', entityId: current.id });
      if (data.rounds) assertRoundsForGame(data.game ?? current.game, data.rounds);
      if (data.rounds && current.status !== 'completed' && roundsHaveScores(data.rounds)) {
        throw new DomainError('validation', 'Round scores require a completed match.', { rounds: 'scores_require_completed' });
      }
      if (data.slug && data.slug !== current.slug && (await slugTaken(tx, [data.slug])).size > 0) {
        throw new DomainError('slug_taken', 'Slug already in use.', { slug: 'slug_taken' });
      }
      const patch: Partial<typeof match.$inferInsert> = {};
      const fields = [
        'game',
        'opponentName',
        'opponentShortCode',
        'opponentLogoAssetId',
        'competitionType',
        'competitionName',
        'season',
        'format',
        'bestOf',
        'teamSize',
        'eventUrl',
        'vodLinks',
        'coverAssetId',
        'internalNotes',
        'slug',
        'timeZone',
      ] as const;
      const changed: string[] = [];
      for (const field of fields) {
        const value = data[field];
        if (value === undefined) continue;
        (patch as Record<string, unknown>)[field] = value;
        changed.push(field);
      }
      if (data.rounds) changed.push('rounds');
      const [row] = await tx
        .update(match)
        .set({ ...patch, version: sql`${match.version} + 1`, updatedAt: new Date() })
        .where(eq(match.id, current.id))
        .returning(returningFields);
      if (data.rounds) await replaceRounds(tx, current.id, data.rounds);
      await recordAudit(tx, {
        actor,
        action: 'match.update',
        outcome: 'success',
        capability: 'matches.edit',
        entityType: 'match',
        entityId: current.id,
        summary: { fields: changed },
      });
      return mutationResult(row!);
    });
  } catch (error) {
    return slugConflict(error);
  }
}

type Transition = {
  capability: Capability;
  action: string;
  apply: (row: MatchRow, now: Date) => { patch: Partial<typeof match.$inferInsert>; summary: Record<string, unknown> };
};

async function transition(db: Executor, target: { id: string; expectedVersion: number }, actor: Actor, spec: Transition) {
  return db.transaction(async (tx) => {
    const current = await lockMatch(tx, target.id, target.expectedVersion);
    await authorizeGames(db, actor, spec.capability, [current.game], { action: spec.action, entityType: 'match', entityId: current.id });
    const now = new Date();
    const { patch, summary } = spec.apply(current, now);
    const [row] = await tx
      .update(match)
      .set({ ...patch, version: sql`${match.version} + 1`, updatedAt: now })
      .where(eq(match.id, current.id))
      .returning(returningFields);
    await recordAudit(tx, {
      actor,
      action: spec.action,
      outcome: 'success',
      capability: spec.capability,
      entityType: 'match',
      entityId: current.id,
      summary: { from: { status: current.status, publication: current.publication }, ...summary },
    });
    return mutationResult(row!);
  });
}

function requireStatus(row: MatchRow, allowed: readonly MatchStatus[]) {
  if (!allowed.includes(row.status)) throw new DomainError('invalid_state', `Not allowed from status ${row.status}.`);
}

function requireNotFarFuture(row: { startsAt: Date }, now: Date) {
  if (row.startsAt.getTime() > now.getTime() + RESULT_EARLY_WINDOW_MS) {
    throw new DomainError('invalid_state', 'The match has not started yet.', { startsAt: 'not_started' });
  }
}

/** Makes a match (and its public result/recaps) visible. Requires `matches.publish`. */
export async function publishMatch(db: Executor, actor: Actor, input: MatchTargetInput): Promise<MatchMutationResult> {
  await guard(db, actor, 'matches.publish', 'match.publish', input);
  const target = parseInput(matchTargetSchema, input);
  return transition(db, target, actor, {
    capability: 'matches.publish',
    action: 'match.publish',
    apply: (row, now) => {
      if (row.publication === 'published') throw new DomainError('invalid_state', 'Already published.');
      return { patch: { publication: 'published', publishedAt: now }, summary: { slug: row.slug } };
    },
  });
}

/** Hides a match from every public list, detail and recap. Requires `matches.publish`. */
export async function unpublishMatch(db: Executor, actor: Actor, input: MatchTargetInput): Promise<MatchMutationResult> {
  await guard(db, actor, 'matches.publish', 'match.unpublish', input);
  const target = parseInput(matchTargetSchema, input);
  return transition(db, target, actor, {
    capability: 'matches.publish',
    action: 'match.unpublish',
    apply: (row) => {
      if (row.publication !== 'published') throw new DomainError('invalid_state', 'Not published.');
      return { patch: { publication: 'draft', publishedAt: null }, summary: { slug: row.slug } };
    },
  });
}

/**
 * Postpones a fixture. The first original start is kept in `originalStartsAt`; a new start
 * may be given now or later (`null` keeps the date open).
 */
export async function postponeMatch(db: Executor, actor: Actor, input: PostponeMatchInput): Promise<MatchMutationResult> {
  await guard(db, actor, 'matches.edit', 'match.postpone', input);
  const data = parseInput(postponeMatchSchema, input);
  const next = data.newStartsAt ? resolveStartsAt(data.newStartsAt, 'newStartsAt') : null;
  return transition(db, data, actor, {
    capability: 'matches.edit',
    action: 'match.postpone',
    apply: (row) => {
      requireStatus(row, ['scheduled', 'live', 'postponed']);
      return {
        patch: {
          status: 'postponed',
          originalStartsAt: row.originalStartsAt ?? row.startsAt,
          ...(next ? { startsAt: next.instant } : {}),
        },
        summary: { previousStartsAt: row.startsAt.toISOString(), newStartsAt: next?.instant.toISOString() ?? null },
      };
    },
  });
}

/** Sets a new start for a scheduled/postponed fixture; a postponed fixture becomes scheduled again. */
export async function rescheduleMatch(db: Executor, actor: Actor, input: RescheduleMatchInput): Promise<MatchMutationResult> {
  await guard(db, actor, 'matches.edit', 'match.reschedule', input);
  const data = parseInput(rescheduleMatchSchema, input);
  const next = resolveStartsAt(data.startsAt);
  return transition(db, data, actor, {
    capability: 'matches.edit',
    action: 'match.reschedule',
    apply: (row) => {
      requireStatus(row, ['scheduled', 'postponed']);
      return {
        patch: {
          status: 'scheduled',
          startsAt: next.instant,
          ...(data.timeZone ? { timeZone: data.timeZone } : next.zone ? { timeZone: next.zone } : {}),
        },
        summary: { previousStartsAt: row.startsAt.toISOString(), newStartsAt: next.instant.toISOString() },
      };
    },
  });
}

/** Cancels an unplayed fixture. Completed matches cannot be cancelled. */
export async function cancelMatch(db: Executor, actor: Actor, input: MatchTargetInput): Promise<MatchMutationResult> {
  await guard(db, actor, 'matches.edit', 'match.cancel', input);
  const target = parseInput(matchTargetSchema, input);
  return transition(db, target, actor, {
    capability: 'matches.edit',
    action: 'match.cancel',
    apply: (row) => {
      requireStatus(row, ['scheduled', 'live', 'postponed']);
      return { patch: { status: 'cancelled' }, summary: { slug: row.slug } };
    },
  });
}

/** Marks a fixture as being played (not more than one hour before its start). */
export async function markLive(db: Executor, actor: Actor, input: MatchTargetInput): Promise<MatchMutationResult> {
  await guard(db, actor, 'matches.edit', 'match.live', input);
  const target = parseInput(matchTargetSchema, input);
  return transition(db, target, actor, {
    capability: 'matches.edit',
    action: 'match.live',
    apply: (row, now) => {
      requireStatus(row, ['scheduled', 'postponed']);
      requireNotFarFuture(row, now);
      return { patch: { status: 'live' }, summary: { slug: row.slug } };
    },
  });
}

/**
 * Records or changes the structured result. Unknown scores stay `null` (never 0:0);
 * scores are both known or both unknown; the outcome must agree with known scores; a
 * verified result needs known scores or an explicit outcome. Cancelled matches and
 * matches starting more than one hour in the future are rejected. Recording a result on
 * an unfinished match completes it.
 */
export async function recordResult(db: Executor, actor: Actor, input: RecordResultInput): Promise<MatchMutationResult> {
  await guard(db, actor, 'matches.edit', 'match.result', input);
  const data = parseInput(recordResultSchema, input);
  return db.transaction(async (tx) => {
    const current = await lockMatch(tx, data.id, data.expectedVersion);
    await authorizeGames(db, actor, 'matches.edit', [current.game], { action: 'match.result', entityType: 'match', entityId: current.id });
    if (current.status === 'cancelled') throw new DomainError('invalid_state', 'A cancelled match has no result.', { status: 'cancelled' });
    if (data.rounds) assertRoundsForGame(current.game, data.rounds);
    const now = new Date();
    requireNotFarFuture(current, now);
    const [previous] = await tx.select().from(matchResult).where(eq(matchResult.matchId, current.id)).limit(1);
    const values = {
      scoreValkyria: data.scoreValkyria,
      scoreOpponent: data.scoreOpponent,
      outcome: data.outcome,
      verification: data.verification,
      source: data.source,
      recordedBy: actorUserId(actor),
    };
    if (previous) await tx.update(matchResult).set({ ...values, updatedAt: now }).where(eq(matchResult.matchId, current.id));
    else await tx.insert(matchResult).values({ matchId: current.id, ...values });
    if (data.rounds) await replaceRounds(tx, current.id, data.rounds);
    const [row] = await tx
      .update(match)
      .set({ status: 'completed', version: sql`${match.version} + 1`, updatedAt: now })
      .where(eq(match.id, current.id))
      .returning(returningFields);
    const action = previous ? 'match.result.change' : 'match.result.record';
    await recordAudit(tx, {
      actor,
      action,
      outcome: 'success',
      capability: 'matches.edit',
      entityType: 'match',
      entityId: current.id,
      summary: {
        fromStatus: current.status,
        previous: previous
          ? {
              scoreValkyria: previous.scoreValkyria,
              scoreOpponent: previous.scoreOpponent,
              outcome: previous.outcome,
              verification: previous.verification,
            }
          : null,
        next: { scoreValkyria: data.scoreValkyria, scoreOpponent: data.scoreOpponent, outcome: data.outcome, verification: data.verification },
        rounds: data.rounds ? data.rounds.length : 'unchanged',
      },
    });
    return mutationResult(row!);
  });
}

/** Deletes a draft match with its result, rounds and recaps. Published matches must be unpublished first. */
export async function deleteMatch(db: Executor, actor: Actor, input: MatchTargetInput): Promise<{ id: string }> {
  await guard(db, actor, 'matches.edit', 'match.delete', input);
  const target = parseInput(matchTargetSchema, input);
  return db.transaction(async (tx) => {
    const current = await lockMatch(tx, target.id, target.expectedVersion);
    await authorizeGames(db, actor, 'matches.edit', [current.game], { action: 'match.delete', entityType: 'match', entityId: current.id });
    if (current.publication === 'published') throw new DomainError('invalid_state', 'Unpublish the match before deleting it.');
    await tx.delete(match).where(and(eq(match.id, current.id), eq(match.version, current.version)));
    await recordAudit(tx, {
      actor,
      action: 'match.delete',
      outcome: 'success',
      capability: 'matches.edit',
      entityType: 'match',
      entityId: current.id,
      summary: { slug: current.slug, status: current.status },
    });
    return { id: current.id };
  });
}
