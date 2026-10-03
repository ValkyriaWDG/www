import 'server-only';
import { getServerEnv } from '@/lib/env';
import { configuredLogiSources, type ConfiguredLogiSource, type LogiIntegrationEnv, type LogiWarconConnection } from '../../logi-config';
import { createLogiTransport, LogiClientError, type LogiErrorCode, type LogiFetch, type LogiRequestOptions } from '../transport';
import { WARCON_CACHE_MS, warconEnvelopeResponseSchema, type WarconEnvelope, type WarconReadView } from './contracts';
import { emptyWarconLive, emptyWarconMatches, toWarconLivePublic, toWarconRecentMatchesPublic, type WarconServerPublic } from './public';
import { SYNTHETIC_WARCON_PUBLIC_ID, syntheticWarconLive, syntheticWarconMatches } from './synthetic';

/**
 * Warcon reader (`GET /api/v1/clan/warcon-data/{connectionId}`, explicit `warcon-data`
 * grant, Wardogs only). Only the `live` and `matches` views are read, only for
 * connection IDs approved in `LOGI_SOURCES_JSON` and only under an already published
 * website server. The producer never serves stale data on failure, so this reader keeps
 * the last valid envelope per connection and view with the producer cache lifetimes;
 * a failed pull makes the live view unavailable immediately. Health and capability
 * views are never read for public output.
 */

export type WarconReadOutcome = 'ok' | LogiErrorCode;

export interface WarconReader {
  live(connectionId: string, options?: LogiRequestOptions): Promise<WarconEnvelope>;
  matches(connectionId: string, options?: LogiRequestOptions): Promise<WarconEnvelope>;
}

const CONNECTION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;

export function createWarconReader(source: Pick<ConfiguredLogiSource, 'origin' | 'apiKey' | 'gameId' | 'allowLoopbackHttp' | 'environment'>, dependencies: { fetchImpl?: LogiFetch; now?: () => number; timeoutMs?: number } = {}): WarconReader {
  if (source.gameId !== 'wardogs') throw new LogiClientError('configuration');
  const transport = createLogiTransport({ origin: source.origin, apiKey: source.apiKey, gameId: 'wardogs', allowLoopbackHttp: source.allowLoopbackHttp, environment: source.environment, timeoutMs: dependencies.timeoutMs }, dependencies);
  async function read(connectionId: string, view: WarconReadView, options?: LogiRequestOptions): Promise<WarconEnvelope> {
    if (!CONNECTION_ID.test(connectionId)) throw new LogiClientError('configuration');
    const query: Record<string, string> = view === 'matches' ? { view, page: '1' } : { view };
    const parsed = warconEnvelopeResponseSchema.safeParse(await transport.get(`warcon-data/${encodeURIComponent(connectionId)}`, query, options));
    if (!parsed.success) throw new LogiClientError('invalid_response');
    const envelope = parsed.data.data;
    if (envelope.connectionId !== connectionId || envelope.result.view !== view) throw new LogiClientError('scope_mismatch');
    return envelope;
  }
  return { live: (connectionId, options) => read(connectionId, 'live', options), matches: (connectionId, options) => read(connectionId, 'matches', options) };
}

/** Longest honoured backoff after a failure. */
export const WARCON_MAX_BACKOFF_MS = 24 * 60 * 60_000;
const NOT_DEPLOYED_BACKOFF_MS = 15 * 60_000;
const MAX_ENTRIES = 80;

type WarconCacheEntry = {
  last: WarconEnvelope | null;
  lastAttemptAt: number;
  lastOutcome: WarconReadOutcome | null;
  nextAttemptAt: number;
  inflight?: Promise<void>;
};

const cache = new Map<string, WarconCacheEntry>();
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type WarconObservation = { envelope: WarconEnvelope | null; answered: boolean };

/**
 * Last valid envelope for one approved connection and view, refreshed no faster than
 * the producer's cache lifetime, with one shared in-flight request and bounded backoff
 * after failures (`Retry-After` honoured). Never throws.
 */
export async function observeWarcon(reader: WarconReader, scopeKey: string, connectionId: string, view: WarconReadView, now = new Date()): Promise<WarconObservation> {
  const key = `${scopeKey}/${connectionId}/${view}`;
  let entry = cache.get(key);
  if (!entry) {
    if (cache.size >= MAX_ENTRIES) {
      const oldest = [...cache.entries()].sort((left, right) => left[1].lastAttemptAt - right[1].lastAttemptAt)[0];
      if (oldest) cache.delete(oldest[0]);
    }
    entry = { last: null, lastAttemptAt: Number.NEGATIVE_INFINITY, lastOutcome: null, nextAttemptAt: Number.NEGATIVE_INFINITY };
    cache.set(key, entry);
  }
  const nowMs = now.getTime();
  if (!entry.inflight && nowMs >= entry.nextAttemptAt) {
    const current = entry;
    current.lastAttemptAt = nowMs;
    current.inflight = (async () => {
      try {
        current.last = await (view === 'live' ? reader.live(connectionId) : reader.matches(connectionId));
        current.lastOutcome = 'ok';
        current.nextAttemptAt = nowMs + WARCON_CACHE_MS[view];
      } catch (error) {
        const failure = error instanceof LogiClientError ? error : new LogiClientError('network');
        current.lastOutcome = failure.code;
        const wait = failure.retryAfterMs ?? (failure.code === 'not_found' ? NOT_DEPLOYED_BACKOFF_MS : WARCON_CACHE_MS[view]);
        current.nextAttemptAt = nowMs + clamp(wait, WARCON_CACHE_MS[view], WARCON_MAX_BACKOFF_MS);
      }
    })().finally(() => { current.inflight = undefined; });
  }
  await entry.inflight;
  return { envelope: entry.last, answered: entry.lastOutcome === 'ok' };
}

export type WarconReaderStatus = { lastAttemptAt: string | null; lastOutcome: WarconReadOutcome | null; cachedViews: number };

/** Latest attempt outcome across cached views, for the administration health read model. */
export function warconReaderStatus(): WarconReaderStatus {
  let latest: WarconCacheEntry | null = null;
  for (const entry of cache.values()) if (entry.lastOutcome !== null && (!latest || entry.lastAttemptAt > latest.lastAttemptAt)) latest = entry;
  return { lastAttemptAt: latest && Number.isFinite(latest.lastAttemptAt) ? new Date(latest.lastAttemptAt).toISOString() : null, lastOutcome: latest?.lastOutcome ?? null, cachedViews: cache.size };
}

export function resetWarconReaderForTests(): void { cache.clear(); }

type ReaderEnv = LogiIntegrationEnv & { LOGI_READERS_SOURCE?: 'logi' | 'synthetic-fixture' };

/** Configured Wardogs Warcon source, `null` when the key is absent; configuration errors are reported, not thrown. */
export function configuredWarconSource(env: ReaderEnv): ConfiguredLogiSource | null {
  try { return configuredLogiSources(env, 'warcon')[0] ?? null; } catch (error) {
    console.error(`Warcon reader: ${error instanceof Error ? error.message : 'invalid configuration'}`);
    return null;
  }
}

/** Projection of one approved connection under its published website server. */
export async function observeWarconServer(reader: WarconReader, scopeKey: string, connection: LogiWarconConnection, now: Date, includeRecent: boolean): Promise<WarconServerPublic> {
  const [live, recent] = await Promise.all([
    observeWarcon(reader, scopeKey, connection.connectionId, 'live', now),
    includeRecent ? observeWarcon(reader, scopeKey, connection.connectionId, 'matches', now) : Promise.resolve<WarconObservation | null>(null),
  ]);
  const liveData = live.envelope?.result.view === 'live' ? live.envelope.result.data : null;
  const matchesData = recent?.envelope?.result.view === 'matches' ? recent.envelope.result.data : null;
  return {
    publicId: connection.publicId, synthetic: false,
    live: toWarconLivePublic(connection.publicId, liveData, now, live.answered),
    recentMatches: includeRecent ? toWarconRecentMatchesPublic(connection.publicId, matchesData, recent?.envelope?.fetchedAt ?? null, now, recent?.answered ?? false) : null,
  };
}

const readers = new Map<string, WarconReader>();

/**
 * Public composition boundary: approved Warcon projections for the website server IDs
 * currently listed (`publicIds`), with the recent-match view only for `recentFor`.
 * Unconfigured sources yield `null`; nothing is read for an unapproved or unlisted server.
 */
export async function getWarconServersPublic(publicIds: readonly string[], recentFor: string | null, now = new Date()): Promise<WarconServerPublic[] | null> {
  try {
    const env = getServerEnv();
    if (env.LOGI_READERS_SOURCE === 'synthetic-fixture') {
      if (!publicIds.includes(SYNTHETIC_WARCON_PUBLIC_ID)) return [];
      const includeRecent = recentFor === SYNTHETIC_WARCON_PUBLIC_ID;
      const live = syntheticWarconLive(now).result;
      const matches = syntheticWarconMatches(now);
      return [{
        publicId: SYNTHETIC_WARCON_PUBLIC_ID, synthetic: true,
        live: live.view === 'live' ? toWarconLivePublic(SYNTHETIC_WARCON_PUBLIC_ID, live.data, now, true) : emptyWarconLive(SYNTHETIC_WARCON_PUBLIC_ID),
        recentMatches: includeRecent ? (matches.result.view === 'matches' ? toWarconRecentMatchesPublic(SYNTHETIC_WARCON_PUBLIC_ID, matches.result.data, matches.fetchedAt, now, true) : emptyWarconMatches(SYNTHETIC_WARCON_PUBLIC_ID)) : null,
      }];
    }
    const source = configuredWarconSource(env);
    if (!source) return null;
    const connections = source.warconConnections.filter((row) => publicIds.includes(row.publicId));
    if (connections.length === 0) return [];
    let reader = readers.get(source.scopeKey);
    if (!reader) {
      reader = createWarconReader(source);
      readers.clear();
      readers.set(source.scopeKey, reader);
    }
    const active = reader;
    return await Promise.all(connections.map((connection) => observeWarconServer(active, source.scopeKey, connection, now, connection.publicId === recentFor)));
  } catch {
    return null;
  }
}
