import 'server-only';
import { classifyFreshness, SERVER_FRESHNESS, type ServerSnapshot } from '../../contract';
import type { ConfiguredLogiSource } from '../../logi-config';
import type { LivePlayersSnapshot } from '../../servers/live-players';
import type { LogiPublicServer } from '../mapping';
import { createLogiTransport, LogiClientError, type LogiFetch } from '../transport';
import { hllLiveResponseSchema, type HllLiveEnvelope } from './hll-live-contracts';

export type HllLiveStatusPublic = Pick<ServerSnapshot, 'map' | 'mode' | 'players' | 'capacity' | 'score' | 'nextMap' | 'timeRemainingSeconds' | 'observedAt' | 'freshness'>;
export type HllLivePublic = { status: HllLiveStatusPublic | null; players: LivePlayersSnapshot };
type Entry = { last: HllLiveEnvelope | null; failed: boolean; nextAt: number; inflight?: Promise<void> };
const cache = new Map<string, Entry>();

function age(at: string | null, declared: ServerSnapshot['freshness'], now: Date, failed: boolean): ServerSnapshot['freshness'] {
  const computed = classifyFreshness(at ? new Date(at) : null, now, SERVER_FRESHNESS);
  if (declared === 'unavailable' || computed === 'unavailable' || now.getTime() - Date.parse(at!) < -5_000) return 'unavailable';
  // The producer declares a status/player read current for at most sixty seconds.
  return failed || declared === 'stale' || computed === 'stale' || now.getTime() - Date.parse(at!) > 60_000 ? 'stale' : 'fresh';
}

/** Separate status/player clocks; no platform IDs, provider URLs or raw records leave this mapper. */
export function projectHllLive(last: HllLiveEnvelope | null, server: LogiPublicServer, now: Date, failed = false): HllLivePublic {
  const data = last?.data;
  const statusFreshness = age(data?.statusAt ?? null, data?.statusFreshness ?? 'unavailable', now, failed);
  const playerFreshness = age(data?.playersAt ?? null, data?.playersFreshness ?? 'unavailable', now, failed);
  const status = data?.status && statusFreshness !== 'unavailable' ? {
    map: data.status.map, mode: data.status.mode, players: data.status.playerCount, capacity: data.status.maxPlayers,
    score: statusFreshness === 'fresh' && new Set(data.status.scores.map((row) => row.team)).size === 2
      ? { allied: data.status.scores.find((row) => row.team === 'allies')!.score, axis: data.status.scores.find((row) => row.team === 'axis')!.score } : null,
    nextMap: statusFreshness === 'fresh' ? data.status.nextMap?.name ?? null : null,
    timeRemainingSeconds: statusFreshness === 'fresh' ? data.status.timeRemainingSeconds : null,
    observedAt: data.statusAt, freshness: statusFreshness,
  } : null;
  const publish = server.publishLivePlayers === true;
  const players: LivePlayersSnapshot = {
    publicId: server.publicId, state: !publish ? 'not_configured' : playerFreshness === 'unavailable' ? 'unavailable' : 'ok',
    observedAt: publish ? data?.playersAt ?? null : null, freshness: publish ? playerFreshness : 'unavailable',
    refreshAfterSeconds: Math.min(300, Math.max(30, data?.refreshAfterSeconds ?? 30)), synthetic: false,
    players: !publish || playerFreshness === 'unavailable' ? [] : (data?.players ?? []).flatMap((row) => {
      const name = row.name.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64);
      return name ? [{ name, side: row.team ?? 'unknown' as const, kills: row.kills, deaths: row.deaths, combat: row.combat, offense: row.offense, defense: row.defense, support: row.support }] : [];
    }).sort((a, b) => (b.kills ?? -1) - (a.kills ?? -1) || a.name.localeCompare(b.name, 'en')),
  };
  return { status, players };
}

/** The existing data key additionally needs the producer's explicit `hll-live` grant. */
export async function readLogiHllLive(source: ConfiguredLogiSource, server: LogiPublicServer, now = new Date(), fetchImpl?: LogiFetch): Promise<HllLivePublic> {
  const approved = source.publicServers.find((row) => row.published && row.connectionId === server.connectionId && row.publicId === server.publicId);
  if (source.gameId !== 'hell_let_loose' || !approved) return projectHllLive(null, server, now);
  const key = `${source.scopeKey}/${server.connectionId}`;
  let entry = cache.get(key);
  if (!entry) {
    if (cache.size >= 40) cache.delete(cache.keys().next().value!);
    entry = { last: null, failed: false, nextAt: 0 };
    cache.set(key, entry);
  }
  if (!entry.inflight && now.getTime() >= entry.nextAt) {
    const current = entry;
    current.inflight = (async () => {
      try {
        const wire = await createLogiTransport(source, { fetchImpl }).getHllLive(server.connectionId);
        const parsed = hllLiveResponseSchema.safeParse(wire);
        if (!parsed.success) throw new LogiClientError('invalid_response');
        if (parsed.data.data.connectionId !== server.connectionId) throw new LogiClientError('scope_mismatch');
        current.last = parsed.data.data;
        current.failed = false;
        current.nextAt = now.getTime() + Math.min(300, Math.max(15, parsed.data.data.data.refreshAfterSeconds)) * 1000;
      } catch (error) {
        current.failed = true;
        if (error instanceof LogiClientError && ['unauthorized', 'forbidden', 'scope_mismatch'].includes(error.code)) current.last = null;
        current.nextAt = now.getTime() + Math.min(300_000, Math.max(30_000, error instanceof LogiClientError ? error.retryAfterMs ?? 0 : 0));
      }
    })().finally(() => { current.inflight = undefined; });
  }
  await entry.inflight;
  return projectHllLive(entry.last, approved, now, entry.failed);
}

export function resetLogiHllLiveForTests(): void { cache.clear(); }
