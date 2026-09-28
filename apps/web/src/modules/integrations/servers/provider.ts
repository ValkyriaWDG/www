import 'server-only';
import { getServerEnv } from '@/lib/env';
import type { GameRoute } from '@/modules/games/registry';
import { classifyFreshness, SERVER_FRESHNESS, type ServerSnapshot } from '../contract';
import { SYNTHETIC_SERVERS, type SyntheticServer } from './fixtures';

/**
 * Server-only server-status boundary (contract 0.2: live telemetry from an authorized
 * CRCON/provider adapter). No real source is configured yet: the default is
 * `not_configured`. `synthetic-fixture` serves labelled synthetic data for development,
 * tests and review screenshots. The browser never receives a source URL, key or raw DTO.
 */

export type ServerOverview =
  | { state: 'not_configured' }
  /** The source failed or timed out: never "offline" or "empty"; last known rows are shown as stale. */
  | { state: 'unavailable'; servers: ServerSnapshot[]; attemptedAt: string }
  | { state: 'ok'; servers: ServerSnapshot[]; synthetic: boolean; attemptedAt: string };

type Observation = Omit<SyntheticServer, 'ageSeconds'> & { observedAt: Date | null };

interface ServerStatusSource {
  readonly synthetic: boolean;
  list(game: GameRoute, now: Date, signal: AbortSignal): Promise<Observation[] | null>;
}

const SOURCE_TIMEOUT_MS = 4000;

/** Synthetic source: relative observation ages; `unavailable` simulates a timeout, `empty` a configured but empty set. */
function syntheticSource(scenario: 'mixed' | 'unavailable' | 'empty'): ServerStatusSource {
  return {
    synthetic: true,
    async list(game, now) {
      const rows = SYNTHETIC_SERVERS[game];
      if (!rows) return null;
      if (scenario === 'unavailable') throw new Error('synthetic source timeout');
      if (scenario === 'empty') return [];
      return rows.map(({ ageSeconds, ...row }) => ({ ...row, observedAt: ageSeconds === null ? null : new Date(now.getTime() - ageSeconds * 1000) }));
    },
  };
}

function configuredSource(): ServerStatusSource | null {
  const env = getServerEnv();
  if (env.SERVER_STATUS_SOURCE === 'synthetic-fixture') return syntheticSource(env.SERVER_STATUS_FIXTURE_SCENARIO);
  return null;
}

/** Last successful observations per game, retained so a later failure can show them as stale. */
const lastKnown = new Map<GameRoute, Observation[]>();

function toSnapshot(game: GameRoute, row: Observation, now: Date, synthetic: boolean): ServerSnapshot {
  const freshness = classifyFreshness(row.observedAt, now, SERVER_FRESHNESS);
  // Values older than the stale window are no longer presented as current facts.
  const expired = freshness === 'unavailable';
  return {
    ref: { source: synthetic ? 'synthetic' : 'crcon', sourceInstanceId: synthetic ? 'synthetic' : 'configured', guildId: null, game, kind: 'server', externalId: row.id },
    publicId: row.publicId,
    name: row.name,
    reachability: expired ? 'unknown' : row.reachability,
    map: expired ? null : row.map,
    mode: expired ? null : row.mode,
    players: expired ? null : row.players,
    capacity: row.capacity,
    observedAt: row.observedAt?.toISOString() ?? null,
    freshness,
    connect: row.address ? { kind: 'address', address: row.address } : { kind: 'none' },
  };
}

export async function getServerOverview(game: GameRoute, now: Date = new Date()): Promise<ServerOverview> {
  const source = configuredSource();
  if (!source) return { state: 'not_configured' };
  const attemptedAt = now.toISOString();
  try {
    const rows = await source.list(game, now, AbortSignal.timeout(SOURCE_TIMEOUT_MS));
    if (rows === null) return { state: 'not_configured' };
    lastKnown.set(game, rows);
    return { state: 'ok', servers: rows.map((row) => toSnapshot(game, row, now, source.synthetic)), synthetic: source.synthetic, attemptedAt };
  } catch {
    const previous = lastKnown.get(game) ?? [];
    const servers = previous.map((row) => toSnapshot(game, row, now, source.synthetic)).filter((server) => server.freshness !== 'unavailable');
    return { state: 'unavailable', servers, attemptedAt };
  }
}

/** Whether the configured source is synthetic (for the visible "synthetic data" label). */
export function isSyntheticServerSource(): boolean {
  return configuredSource()?.synthetic ?? false;
}
