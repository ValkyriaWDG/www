import 'server-only';
import { getServerEnv } from '@/lib/env';
import type { GameRoute } from '@/modules/games/registry';
import { classifyFreshness, SERVER_FRESHNESS, type ServerSnapshot } from '../contract';
import { type CrconServerConfig, fetchPublicInfo, type FetchLike, parseCrconConfig } from './crcon';
import { SYNTHETIC_SERVERS, type SyntheticServer } from './fixtures';

/**
 * Server-only server-status boundary (contract 0.3: live telemetry from an authorized
 * CRCON/provider adapter). The default is `not_configured`. `crcon` reads the public
 * information of the servers configured in `HLL_SERVER_SOURCES_JSON`; `synthetic-fixture`
 * serves labelled synthetic data for development, tests and review screenshots. The
 * browser never receives a source URL, key or raw DTO.
 */

export type ServerOverview =
  | { state: 'not_configured' }
  /** Every source failed or timed out: never "offline" or "empty"; last known rows are shown as stale. */
  | { state: 'unavailable'; servers: ServerSnapshot[]; attemptedAt: string }
  /** `partial`: some configured servers did not answer; their rows keep the last known (stale) or unknown state. */
  | { state: 'ok'; servers: ServerSnapshot[]; synthetic: boolean; partial: boolean; attemptedAt: string };

type Observation = Omit<SyntheticServer, 'ageSeconds'> & { observedAt: Date | null };

/** One configured server: an observation, or a failed request with the configured identity. */
type ServerResult =
  | { kind: 'ok'; observation: Observation }
  | { kind: 'failed'; id: string; publicId: string; name: string; address: string | null; statsUrl: string | null };

interface ServerStatusSource {
  readonly synthetic: boolean;
  /** `null`: no servers are configured for this game. Throws when the whole source is unreachable. */
  list(game: GameRoute, now: Date, signal: AbortSignal): Promise<ServerResult[] | null>;
}

const SOURCE_TIMEOUT_MS = 4000;
/** Repeated page views within this window reuse one upstream request per server. */
const CRCON_CACHE_MS = 15_000;

/** Synthetic source: relative observation ages; `unavailable` simulates a timeout, `empty` a configured but empty set. */
function syntheticSource(scenario: 'mixed' | 'unavailable' | 'empty'): ServerStatusSource {
  return {
    synthetic: true,
    async list(game, now) {
      const rows = SYNTHETIC_SERVERS[game];
      if (!rows) return null;
      if (scenario === 'unavailable') throw new Error('synthetic source timeout');
      if (scenario === 'empty') return [];
      return rows.map(({ ageSeconds, ...row }) => ({
        kind: 'ok' as const,
        observation: { ...row, observedAt: ageSeconds === null ? null : new Date(now.getTime() - ageSeconds * 1000) },
      }));
    },
  };
}

const crconCache = new Map<string, { at: number; result: Promise<ServerResult> }>();

async function observeCrcon(server: CrconServerConfig, now: Date, signal: AbortSignal, fetchImpl: FetchLike): Promise<ServerResult> {
  const identity = { id: server.publicId, publicId: server.publicId, address: server.address, statsUrl: server.statsUrl };
  try {
    const info = await fetchPublicInfo(server, signal, fetchImpl);
    return {
      kind: 'ok',
      observation: {
        ...identity,
        name: server.name ?? info.name ?? server.publicId,
        reachability: 'online',
        map: info.map,
        mode: info.mode,
        players: info.players,
        capacity: info.capacity,
        nextMap: info.nextMap,
        timeRemainingSeconds: info.timeRemainingSeconds,
        score: info.score,
        teams: info.teams,
        observedAt: now,
      },
    };
  } catch {
    return { kind: 'failed', ...identity, name: server.name ?? server.publicId };
  }
}

/** CRCON source for HLL: one bounded request per configured server, reused for a short window. */
export function crconSource(servers: readonly CrconServerConfig[], fetchImpl: FetchLike = fetch): ServerStatusSource {
  return {
    synthetic: false,
    async list(game, now, signal) {
      if (game !== 'hll' || servers.length === 0) return null;
      return Promise.all(
        servers.map((server) => {
          const key = `${server.publicId}|${server.baseUrl}`;
          const cached = crconCache.get(key);
          if (cached && now.getTime() - cached.at >= 0 && now.getTime() - cached.at < CRCON_CACHE_MS) return cached.result;
          const result = observeCrcon(server, now, signal, fetchImpl);
          crconCache.set(key, { at: now.getTime(), result });
          return result;
        }),
      );
    },
  };
}

function configuredSource(): ServerStatusSource | null {
  const env = getServerEnv();
  if (env.SERVER_STATUS_SOURCE === 'synthetic-fixture') return syntheticSource(env.SERVER_STATUS_FIXTURE_SCENARIO);
  if (env.SERVER_STATUS_SOURCE === 'crcon') {
    const { servers, error } = parseCrconConfig(env.HLL_SERVER_SOURCES_JSON);
    if (error) console.error(`Server status: HLL_SERVER_SOURCES_JSON is ${error}; the source is disabled.`);
    return crconSource(servers);
  }
  return null;
}

/** Last successful observation per game and server, retained so a later failure can show it as stale. */
const lastKnown = new Map<string, Observation>();

function toSnapshot(game: GameRoute, row: Observation, now: Date, synthetic: boolean, answered: boolean): ServerSnapshot {
  const freshness = classifyFreshness(row.observedAt, now, SERVER_FRESHNESS);
  // Values older than the stale window are no longer presented as current facts; round
  // progress (time, score, teams) is shown only for a fresh observation.
  const expired = freshness === 'unavailable';
  const live = freshness === 'fresh';
  return {
    ref: { source: synthetic ? 'synthetic' : 'crcon', sourceInstanceId: synthetic ? 'synthetic' : 'configured', guildId: null, game, kind: 'server', externalId: row.id },
    publicId: row.publicId,
    name: row.name,
    reachability: expired || !answered ? 'unknown' : row.reachability,
    map: expired ? null : row.map,
    mode: expired ? null : row.mode,
    players: expired ? null : row.players,
    capacity: row.capacity,
    nextMap: live ? row.nextMap : null,
    timeRemainingSeconds: live ? row.timeRemainingSeconds : null,
    score: live ? row.score : null,
    teams: live ? row.teams : null,
    observedAt: row.observedAt?.toISOString() ?? null,
    freshness,
    connect: row.address ? { kind: 'address', address: row.address } : { kind: 'none' },
    statsUrl: row.statsUrl,
  };
}

function unknownSnapshot(game: GameRoute, result: Extract<ServerResult, { kind: 'failed' }>): ServerSnapshot {
  return toSnapshot(
    game,
    { ...result, reachability: 'unknown', map: null, mode: null, players: null, capacity: null, nextMap: null, timeRemainingSeconds: null, score: null, teams: null, observedAt: null },
    new Date(0),
    false,
    false,
  );
}

export async function getServerOverview(game: GameRoute, now: Date = new Date(), source: ServerStatusSource | null = configuredSource()): Promise<ServerOverview> {
  if (!source) return { state: 'not_configured' };
  const attemptedAt = now.toISOString();
  const known = (id: string) => lastKnown.get(`${game}/${id}`);
  let results: ServerResult[] | null;
  try {
    results = await source.list(game, now, AbortSignal.timeout(SOURCE_TIMEOUT_MS));
  } catch {
    const servers = [...lastKnown.entries()]
      .filter(([key]) => key.startsWith(`${game}/`))
      .map(([, row]) => toSnapshot(game, row, now, source.synthetic, false))
      .filter((server) => server.freshness !== 'unavailable');
    return { state: 'unavailable', servers, attemptedAt };
  }
  if (results === null) return { state: 'not_configured' };
  if (results.length > 0 && results.every((result) => result.kind === 'failed')) {
    const servers = results.flatMap((result) => {
      const previous = result.kind === 'failed' ? known(result.id) : undefined;
      const snapshot = previous ? toSnapshot(game, previous, now, source.synthetic, false) : null;
      return snapshot && snapshot.freshness !== 'unavailable' ? [snapshot] : [];
    });
    return { state: 'unavailable', servers, attemptedAt };
  }
  const servers = results.map((result) => {
    if (result.kind === 'ok') {
      lastKnown.set(`${game}/${result.observation.id}`, result.observation);
      return toSnapshot(game, result.observation, now, source.synthetic, true);
    }
    const previous = known(result.id);
    return previous ? toSnapshot(game, previous, now, source.synthetic, false) : unknownSnapshot(game, result);
  });
  return { state: 'ok', servers, synthetic: source.synthetic, partial: results.some((result) => result.kind === 'failed'), attemptedAt };
}

/** Whether the configured source is synthetic (for the visible "synthetic data" label). */
export function isSyntheticServerSource(): boolean {
  return configuredSource()?.synthetic ?? false;
}

/** Test helper: forget cached upstream responses and last known observations. */
export function resetServerStatusForTests(): void {
  crconCache.clear();
  lastKnown.clear();
}
