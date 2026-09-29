import 'server-only';
import { createHash } from 'node:crypto';
import { getServerEnv } from '@/lib/env';
import type { GameRoute } from '@/modules/games/registry';
import { classifyFreshness, SERVER_FRESHNESS } from '../contract';
import { parseCrconConfig, type CrconServerConfig, type FetchLike } from './crcon';
import { SYNTHETIC_SERVERS } from './fixtures';
import { fetchLivePlayers, LIVE_PLAYERS_MIN_REFRESH_SECONDS, type LivePlayersObservation, type LivePlayersSnapshot } from './live-players';

type CacheEntry = { attemptedAt: number; refreshSeconds: number; failed: boolean; last: LivePlayersObservation | null; inflight?: Promise<void> };
const cache = new Map<string, CacheEntry>();
const keyFor = (server: CrconServerConfig) => createHash('sha256').update(JSON.stringify([server.publicId, server.baseUrl, server.statsApiKey ?? null])).digest('hex');
const empty = (publicId: string, state: LivePlayersSnapshot['state'] = 'unavailable'): LivePlayersSnapshot => ({ state, publicId, observedAt: null, freshness: 'unavailable', refreshAfterSeconds: LIVE_PLAYERS_MIN_REFRESH_SECONDS, players: [], synthetic: false });

/** One shared in-flight request and minimum 30-second TTL per configured source, including failures. */
export async function observeLivePlayers(server: CrconServerConfig, now = new Date(), fetchImpl: FetchLike = fetch): Promise<LivePlayersSnapshot> {
  const key = keyFor(server);
  let entry = cache.get(key);
  if (!entry) {
    // Config is capped at 12 servers; also bound storage across configuration rotations.
    if (cache.size >= 24) cache.delete(cache.keys().next().value!);
    entry = { attemptedAt: Number.NEGATIVE_INFINITY, refreshSeconds: LIVE_PLAYERS_MIN_REFRESH_SECONDS, failed: false, last: null };
    cache.set(key, entry);
  }
  const age = now.getTime() - entry.attemptedAt;
  if (!entry.inflight && (age < 0 || age >= entry.refreshSeconds * 1000)) {
    entry.attemptedAt = now.getTime();
    const current = entry;
    current.inflight = (async () => {
      try {
        const observed = await fetchLivePlayers(server, AbortSignal.timeout(4000), fetchImpl);
        if (classifyFreshness(new Date(observed.observedAt), now, SERVER_FRESHNESS) === 'unavailable') throw new Error('Unusable snapshot timestamp');
        current.last = observed;
        current.refreshSeconds = observed.refreshAfterSeconds;
        current.failed = false;
      } catch {
        current.failed = true;
        current.refreshSeconds = LIVE_PLAYERS_MIN_REFRESH_SECONDS;
      }
    })().finally(() => { current.inflight = undefined; });
  }
  await entry.inflight;
  if (!entry.last) return empty(server.publicId);
  const observedFreshness = classifyFreshness(new Date(entry.last.observedAt), now, SERVER_FRESHNESS);
  const freshness = entry.failed && observedFreshness === 'fresh' ? 'stale' : observedFreshness;
  return { state: freshness === 'unavailable' ? 'unavailable' : 'ok', publicId: server.publicId, observedAt: entry.last.observedAt, freshness, refreshAfterSeconds: entry.refreshSeconds, players: freshness === 'unavailable' ? [] : entry.last.players, synthetic: false };
}

export async function getServerLivePlayers(game: GameRoute, publicId: string, now = new Date()): Promise<LivePlayersSnapshot> {
  const env = getServerEnv();
  if (game !== 'hll') return empty(publicId, 'not_configured');
  if (env.SERVER_STATUS_SOURCE === 'synthetic-fixture') {
    const server = SYNTHETIC_SERVERS.hll?.find((row) => row.publicId === publicId);
    if (!server || env.SERVER_STATUS_FIXTURE_SCENARIO === 'empty') return empty(publicId, 'not_configured');
    if (server.ageSeconds === null || env.SERVER_STATUS_FIXTURE_SCENARIO === 'unavailable') return { ...empty(publicId), synthetic: true };
    const observedAt = new Date(now.getTime() - server.ageSeconds * 1000);
    return { ...empty(publicId), state: 'ok', observedAt: observedAt.toISOString(), freshness: classifyFreshness(observedAt, now, SERVER_FRESHNESS), synthetic: true, players: [{ name: `[SYN] ${publicId === 'synthetic-alpha' ? 'Alpha' : 'Bravo'} Player`, side: 'allies', kills: 12, deaths: 4, combat: 100, offense: 50, defense: null, support: 20 }] };
  }
  if (env.SERVER_STATUS_SOURCE !== 'crcon') return empty(publicId, 'not_configured');
  const { servers } = parseCrconConfig(env.HLL_SERVER_SOURCES_JSON);
  const source = servers.find((server) => server.publicId === publicId);
  if (!source) return empty(publicId, 'not_configured');
  return observeLivePlayers(source, now);
}

export function resetLivePlayersForTests(): void { cache.clear(); }
