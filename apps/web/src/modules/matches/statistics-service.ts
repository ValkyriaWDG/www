import 'server-only';
import { legacyMatchScoreboard, match, matchStatistics, STATISTICS_SIDES, type Executor } from '@valkyria/db';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getServerEnv } from '@/lib/env';
import { DomainError } from '@/lib/result';
import { actorUserId } from '@/modules/access/policy';
import type { Actor } from '@/modules/access/types';
import { recordAudit } from '@/modules/audit/audit';
import { type CrconServerConfig, CrconRequestError, crconGameUrl, fetchScoreboard, type FetchLike, parseCrconConfig, parseCrconGameUrl } from '@/modules/integrations/servers/crcon';
import { authorize, authorizeGames, parseInput } from '@/modules/prose/domain';
import { orderPlayers, parseCrconScoreboard, summarizeTeams } from './statistics';
import type { MatchStatisticsView } from './types';

/**
 * Match statistics import (HLL). Editors with `matches.edit` in the match's game link a
 * finished CRCON game (configured server + CRCON game ID) or upload its scoreboard JSON.
 * The server fetches/parses the data itself; nothing client-computed is trusted. One
 * snapshot per match; a new import replaces it. Editors explicitly choose player visibility.
 */

/** Upload content after the client removed per-kill encounters (server actions accept about 1 MB). */
export const MAX_SCOREBOARD_UPLOAD_CHARS = 900_000;
const SCOREBOARD_TIMEOUT_MS = 20_000;

const matchId = z.uuid();
const side = z.enum(STATISTICS_SIDES);
const publicId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(64);

const importSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('crcon-url'),
    matchId,
    serverPublicId: publicId,
    gameUrl: z.string().min(1).max(2048),
    valkyriaSide: side,
    publishPlayers: z.boolean(),
  }),
  z.object({
    source: z.literal('crcon'),
    matchId,
    serverPublicId: publicId,
    gameId: z.number().int().positive().max(2_147_483_647),
    valkyriaSide: side,
    publishPlayers: z.boolean(),
  }),
  z.object({
    source: z.literal('upload'),
    matchId,
    fileName: z.string().trim().max(120).default(''),
    content: z.string().max(MAX_SCOREBOARD_UPLOAD_CHARS, 'too_big'),
    valkyriaSide: side,
    publishPlayers: z.boolean(),
  }),
]);
export type ImportStatisticsInput = z.input<typeof importSchema>;

const settingsSchema = z.object({ matchId, valkyriaSide: side.nullable(), publishPlayers: z.boolean() });
export type StatisticsSettingsInput = z.input<typeof settingsSchema>;
const removeSchema = z.object({ matchId });

export type StatisticsDeps = { servers?: readonly CrconServerConfig[]; fetchImpl?: FetchLike };

/** Configured CRCON servers that can provide scoreboards (names only leave the server). */
export function statisticsSources(): { publicId: string; name: string }[] {
  return parseCrconConfig(getServerEnv().HLL_SERVER_SOURCES_JSON).servers.map((server) => ({ publicId: server.publicId, name: server.name ?? server.publicId }));
}

function entityId(input: unknown): string | null {
  const raw = typeof input === 'object' && input !== null ? (input as { matchId?: unknown }).matchId : undefined;
  return typeof raw === 'string' && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;
}

/**
 * Reads the match's game and checks `matches.edit` there and that it is an HLL match.
 * With `lock` (a mutation transaction) the match row is locked first — lock order match →
 * match_statistics, as match updates and deletes — so the game cannot change until the
 * mutation commits; the early unlocked check cannot authorize after awaited work such as
 * a CRCON fetch. A denial is audited on `db`, outside the rolled-back transaction.
 */
async function editableHllMatch(db: Executor, actor: Actor, id: string, action: string, lock?: Executor) {
  const query = (lock ?? db).select({ id: match.id, game: match.game }).from(match).where(eq(match.id, id));
  const [row] = lock ? await query.for('update') : await query.limit(1);
  if (!row) throw new DomainError('not_found');
  await authorizeGames(db, actor, 'matches.edit', [row.game], { action, entityType: 'match', entityId: id });
  if (row.game !== 'hell-let-loose') throw new DomainError('invalid_state', 'Statistics import is available for Hell Let Loose matches.', { source: 'hll_only' });
  return row;
}

type ScoreboardSource = {
  body: unknown;
  label: string;
  field: string;
  serverPublicId: string | null;
  gameUrl: string | null;
  expected: { gameId: number; serverNumber: number | null } | null;
};

async function scoreboardBody(input: z.output<typeof importSchema>, deps: StatisticsDeps): Promise<ScoreboardSource> {
  if (input.source === 'upload') {
    try {
      return { body: JSON.parse(input.content), label: input.fileName, field: 'file', serverPublicId: null, gameUrl: null, expected: null };
    } catch {
      throw new DomainError('validation', 'Not a JSON scoreboard.', { file: 'invalid_scoreboard' });
    }
  }
  const servers = deps.servers ?? parseCrconConfig(getServerEnv().HLL_SERVER_SOURCES_JSON).servers;
  const server = servers.find((candidate) => candidate.publicId === input.serverPublicId);
  if (!server) throw new DomainError('validation', 'Unknown statistics source.', { serverPublicId: 'unknown_server' });
  const linked = input.source === 'crcon-url' ? parseCrconGameUrl(input.gameUrl, server) : null;
  if (input.source === 'crcon-url' && !linked) throw new DomainError('validation', 'Use a game URL from the configured public statistics site.', { gameUrl: 'game_url_invalid' });
  const gameId = input.source === 'crcon' ? input.gameId : linked!.gameId;
  const field = input.source === 'crcon' ? 'gameId' : 'gameUrl';
  try {
    return {
      body: await fetchScoreboard(server, gameId, AbortSignal.timeout(SCOREBOARD_TIMEOUT_MS), deps.fetchImpl),
      label: server.name ?? server.publicId,
      field,
      serverPublicId: server.publicId,
      gameUrl: crconGameUrl(server, gameId),
      expected: { gameId, serverNumber: server.serverNumber ?? null },
    };
  } catch (error) {
    if (error instanceof CrconRequestError && error.category === 'invalid') throw new DomainError('validation', 'Not a scoreboard.', { [field]: 'invalid_scoreboard' });
    throw new DomainError('unavailable', 'The statistics source did not answer.');
  }
}

/** Imports (or replaces) the statistics of one HLL match. Requires `matches.edit` in HLL. */
export async function importMatchStatistics(db: Executor, actor: Actor, input: ImportStatisticsInput, deps: StatisticsDeps = {}): Promise<MatchStatisticsView> {
  await authorize(db, actor, 'matches.edit', { intent: 'write', action: 'match.statistics.import', entityType: 'match', entityId: entityId(input) });
  const data = parseInput(importSchema, input);
  // Fail fast before the (possibly slow) fetch; the transaction rechecks under the lock.
  await editableHllMatch(db, actor, data.matchId, 'match.statistics.import');
  const { body, label, field, serverPublicId, gameUrl, expected } = await scoreboardBody(data, deps);
  const parsed = parseCrconScoreboard(body);
  if (!parsed || parsed.players.length === 0) throw new DomainError('validation', 'The scoreboard has no player statistics.', { [field]: 'invalid_scoreboard' });
  if (expected) {
    if (parsed.externalGameId !== String(expected.gameId) || (expected.serverNumber !== null && parsed.serverNumber !== expected.serverNumber)) {
      throw new DomainError('validation', 'The scoreboard does not belong to the requested game and server.', { [field]: 'scoreboard_source_mismatch' });
    }
    if (!parsed.startedAt || !parsed.endedAt || parsed.endedAt < parsed.startedAt || parsed.endedAt.getTime() > Date.now() || !parsed.result) {
      throw new DomainError('validation', 'Only a finished game with a known result can be linked.', { [field]: 'scoreboard_unfinished' });
    }
  }
  const teams = summarizeTeams(parsed);
  const now = new Date();
  const values = {
    source: data.source === 'upload' ? 'upload' as const : 'crcon' as const,
    sourceLabel: label.slice(0, 120),
    externalGameId: parsed.externalGameId,
    sourceServerPublicId: serverPublicId,
    sourceGameUrl: gameUrl,
    mapName: parsed.mapName,
    mode: parsed.mode,
    gameStartedAt: parsed.startedAt,
    gameEndedAt: parsed.endedAt,
    resultAllied: parsed.result?.allied ?? null,
    resultAxis: parsed.result?.axis ?? null,
    valkyriaSide: data.valkyriaSide,
    teams,
    players: parsed.players,
    publishPlayers: data.publishPlayers,
    importedBy: actorUserId(actor),
    observedAt: now,
    updatedAt: now,
  };
  await db.transaction(async (tx) => {
    await editableHllMatch(db, actor, data.matchId, 'match.statistics.import', tx);
    await tx.insert(matchStatistics).values({ matchId: data.matchId, ...values }).onConflictDoUpdate({ target: matchStatistics.matchId, set: values });
    await tx.delete(legacyMatchScoreboard).where(eq(legacyMatchScoreboard.matchId, data.matchId));
    await tx.update(match).set({ updatedAt: now }).where(eq(match.id, data.matchId));
    await recordAudit(tx, {
      actor,
      action: 'match.statistics.import',
      outcome: 'success',
      entityType: 'match',
      entityId: data.matchId,
      summary: {
        source: values.source,
        sourceServerPublicId: serverPublicId,
        externalGameId: values.externalGameId,
        players: parsed.players.length,
        valkyriaSide: data.valkyriaSide,
        publishPlayers: data.publishPlayers,
      },
    });
  });
  return (await loadMatchStatistics(db, data.matchId, { includePlayers: true }))!;
}

/** Changes which side Valkyria played and whether player rows are public. */
export async function updateMatchStatisticsSettings(db: Executor, actor: Actor, input: StatisticsSettingsInput): Promise<MatchStatisticsView> {
  await authorize(db, actor, 'matches.edit', { intent: 'write', action: 'match.statistics.update', entityType: 'match', entityId: entityId(input) });
  const data = parseInput(settingsSchema, input);
  await editableHllMatch(db, actor, data.matchId, 'match.statistics.update');
  const now = new Date();
  await db.transaction(async (tx) => {
    await editableHllMatch(db, actor, data.matchId, 'match.statistics.update', tx);
    const updated = await tx
      .update(matchStatistics)
      .set({ valkyriaSide: data.valkyriaSide, publishPlayers: data.publishPlayers, updatedAt: now })
      .where(eq(matchStatistics.matchId, data.matchId))
      .returning({ matchId: matchStatistics.matchId });
    if (updated.length === 0) throw new DomainError('not_found');
    await tx.update(match).set({ updatedAt: now }).where(eq(match.id, data.matchId));
    await recordAudit(tx, {
      actor,
      action: 'match.statistics.update',
      outcome: 'success',
      entityType: 'match',
      entityId: data.matchId,
      summary: { valkyriaSide: data.valkyriaSide, publishPlayers: data.publishPlayers },
    });
  });
  return (await loadMatchStatistics(db, data.matchId, { includePlayers: true }))!;
}

/** Removes the imported statistics of a match. */
export async function removeMatchStatistics(db: Executor, actor: Actor, input: { matchId: string }): Promise<{ matchId: string }> {
  await authorize(db, actor, 'matches.edit', { intent: 'write', action: 'match.statistics.remove', entityType: 'match', entityId: entityId(input) });
  const data = parseInput(removeSchema, input);
  await editableHllMatch(db, actor, data.matchId, 'match.statistics.remove');
  await db.transaction(async (tx) => {
    await editableHllMatch(db, actor, data.matchId, 'match.statistics.remove', tx);
    const removed = await tx.delete(matchStatistics).where(eq(matchStatistics.matchId, data.matchId)).returning({ matchId: matchStatistics.matchId });
    if (removed.length === 0) throw new DomainError('not_found');
    await tx.delete(legacyMatchScoreboard).where(eq(legacyMatchScoreboard.matchId, data.matchId));
    await tx.update(match).set({ updatedAt: new Date() }).where(eq(match.id, data.matchId));
    await recordAudit(tx, { actor, action: 'match.statistics.remove', outcome: 'success', entityType: 'match', entityId: data.matchId, summary: {} });
  });
  return { matchId: data.matchId };
}

/** Statistics projection; player rows only when requested (admin) or published. No authorization: callers decide. */
export async function loadMatchStatistics(db: Executor, id: string, options: { includePlayers: boolean }): Promise<MatchStatisticsView | null> {
  const [row] = await db.select().from(matchStatistics).where(eq(matchStatistics.matchId, id)).limit(1);
  if (!row) return null;
  const showPlayers = options.includePlayers || row.publishPlayers;
  const additional = await db.select().from(legacyMatchScoreboard).where(eq(legacyMatchScoreboard.matchId, id)).orderBy(asc(legacyMatchScoreboard.ordinal));
  return {
    source: row.source,
    sourceLabel: row.sourceLabel,
    externalGameId: row.externalGameId,
    sourceServerPublicId: row.sourceServerPublicId,
    sourceGameUrl: row.sourceGameUrl,
    mapName: row.mapName,
    mode: row.mode,
    gameStartedAt: row.gameStartedAt?.toISOString() ?? null,
    gameEndedAt: row.gameEndedAt?.toISOString() ?? null,
    result: row.resultAllied !== null && row.resultAxis !== null ? { allied: row.resultAllied, axis: row.resultAxis } : null,
    valkyriaSide: row.valkyriaSide,
    teams: row.teams,
    players: showPlayers ? orderPlayers(row.players) : null,
    playerCount: row.players.length,
    publishPlayers: row.publishPlayers,
    observedAt: row.observedAt.toISOString(),
    rounds: additional.map(({ ordinal, snapshot }) => ({
      ordinal,
      statistics: {
        source: 'upload',
        sourceLabel: 'Legacy CRCON export',
        sourceServerPublicId: null,
        externalGameId: snapshot.externalGameId,
        sourceGameUrl: snapshot.sourceGameUrl,
        mapName: snapshot.mapName,
        mode: snapshot.mode,
        gameStartedAt: snapshot.gameStartedAt,
        gameEndedAt: snapshot.gameEndedAt,
        result: snapshot.result,
        // Side swaps belong to the individual round; primary settings do not relabel them.
        valkyriaSide: snapshot.valkyriaSide,
        teams: snapshot.teams,
        players: showPlayers ? orderPlayers(snapshot.players) : null,
        playerCount: snapshot.players.length,
        publishPlayers: row.publishPlayers,
        observedAt: snapshot.observedAt,
      },
    })),
  };
}
