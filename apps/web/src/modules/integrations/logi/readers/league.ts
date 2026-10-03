import 'server-only';
import { getServerEnv } from '@/lib/env';
import { configuredLogiSources, type ConfiguredLogiSource, type LogiIntegrationEnv } from '../../logi-config';
import { createLogiTransport, LogiClientError, type LogiErrorCode, type LogiFetch, type LogiRequestOptions } from '../transport';
import { leagueReadEnvelopeSchema, type LeagueErrorCode, type LeagueRead } from './contracts';
import { canonicalLeagueMatchUrl } from './league-url';
import { emptyLeaguePreview, toLeaguePreviewPublic, type LeaguePreviewPublic } from './public';
import { syntheticLeagueRead } from './synthetic';

/**
 * Wardogs League match preview reader (`GET /api/v1/clan/league-matches`, explicit
 * `league-matches` grant, Wardogs only). The match URL is editorial data validated by
 * the producer's URL policy; this reader never proxies an arbitrary URL. Reads are on
 * demand with an in-process last-known cache per canonical URL: observation time,
 * stale/unavailable states, `Retry-After`/`nextRefreshAt` backoff, in-flight dedupe and
 * a quiet unavailable preview instead of an exception. The preview never carries a result.
 */

export type LeagueReadOutcome = 'ok' | LogiErrorCode;

export interface LeagueReader {
  /** Validated producer read for one canonical League URL; throws `LogiClientError`. */
  read(url: string, options?: LogiRequestOptions): Promise<LeagueRead>;
}

export function createLeagueReader(source: Pick<ConfiguredLogiSource, 'origin' | 'apiKey' | 'gameId' | 'allowLoopbackHttp' | 'environment'>, dependencies: { fetchImpl?: LogiFetch; now?: () => number; timeoutMs?: number } = {}): LeagueReader {
  if (source.gameId !== 'wardogs') throw new LogiClientError('configuration');
  const transport = createLogiTransport({ origin: source.origin, apiKey: source.apiKey, gameId: 'wardogs', allowLoopbackHttp: source.allowLoopbackHttp, environment: source.environment, timeoutMs: dependencies.timeoutMs }, dependencies);
  return {
    async read(url, options) {
      const canonical = canonicalLeagueMatchUrl(url);
      if (!canonical) throw new LogiClientError('configuration');
      const parsed = leagueReadEnvelopeSchema.safeParse(await transport.get('league-matches', { url: canonical.url }, options));
      if (!parsed.success) throw new LogiClientError('invalid_response');
      const read = parsed.data.data;
      if (read.snapshot && (read.snapshot.id !== canonical.id || read.snapshot.sourceUrl !== canonical.url)) throw new LogiClientError('scope_mismatch');
      return read;
    },
  };
}

/** Never re-poll a League preview faster than this, whatever the producer's refresh time says. */
export const LEAGUE_MIN_REFRESH_MS = 60_000;
/** Longest honoured backoff (the producer bounds its own cooldowns to 24 hours as well). */
export const LEAGUE_MAX_BACKOFF_MS = 24 * 60 * 60_000;
/** A 404 means the route is not deployed; do not hammer the producer for it. */
const NOT_DEPLOYED_BACKOFF_MS = 15 * 60_000;
const DEFAULT_FAILURE_BACKOFF_MS = 60_000;
const MAX_ENTRIES = 200;

type LeagueCacheEntry = {
  /** Last read that carried a snapshot (the last-known preview). */
  last: LeagueRead | null;
  lastAttemptAt: number;
  lastOutcome: LeagueReadOutcome | null;
  /** Error the producer itself reported in its last successful answer (it could not refresh). */
  lastProducerError: LeagueErrorCode | null;
  /** The latest read answered with a snapshot, without stale/error flags. */
  answered: boolean;
  nextAttemptAt: number;
  inflight?: Promise<void>;
};

const cache = new Map<string, LeagueCacheEntry>();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function backoffAfterSuccess(read: LeagueRead, nowMs: number): number {
  const producerNext = Date.parse(read.nextRefreshAt);
  const wait = Number.isFinite(producerNext) ? producerNext - nowMs : LEAGUE_MIN_REFRESH_MS;
  return nowMs + clamp(wait, LEAGUE_MIN_REFRESH_MS, LEAGUE_MAX_BACKOFF_MS);
}

function backoffAfterFailure(error: LogiClientError, nowMs: number): number {
  const wait = error.retryAfterMs ?? (error.code === 'not_found' ? NOT_DEPLOYED_BACKOFF_MS : DEFAULT_FAILURE_BACKOFF_MS);
  return nowMs + clamp(wait, LEAGUE_MIN_REFRESH_MS, LEAGUE_MAX_BACKOFF_MS);
}

/**
 * Last-known preview for one canonical URL, refreshed at most once per backoff window
 * with one shared in-flight request. Only the first read of a URL is awaited; once a
 * snapshot exists, a due refresh runs in the background and the last-known preview is
 * returned at once, so a page never waits on the producer. Never throws: a failed pull
 * keeps the previous snapshot as stale, and a missing snapshot is an unavailable preview.
 */
export async function observeLeaguePreview(reader: LeagueReader, scopeKey: string, url: string, now = new Date()): Promise<LeaguePreviewPublic> {
  const canonical = canonicalLeagueMatchUrl(url);
  if (!canonical) return emptyLeaguePreview(typeof url === 'string' ? url.slice(0, 125) : '');
  const key = `${scopeKey}/${canonical.url}`;
  let entry = cache.get(key);
  if (!entry) {
    if (cache.size >= MAX_ENTRIES) {
      const oldest = [...cache.entries()].sort((left, right) => left[1].lastAttemptAt - right[1].lastAttemptAt)[0];
      if (oldest) cache.delete(oldest[0]);
    }
    entry = { last: null, lastAttemptAt: Number.NEGATIVE_INFINITY, lastOutcome: null, lastProducerError: null, answered: false, nextAttemptAt: Number.NEGATIVE_INFINITY };
    cache.set(key, entry);
  }
  const nowMs = now.getTime();
  if (!entry.inflight && nowMs >= entry.nextAttemptAt) {
    const current = entry;
    current.lastAttemptAt = nowMs;
    current.inflight = (async () => {
      try {
        const read = await reader.read(canonical.url);
        current.lastOutcome = 'ok';
        current.lastProducerError = read.error;
        if (read.snapshot) current.last = read;
        current.answered = read.snapshot !== null && !read.stale && read.error === null;
        current.nextAttemptAt = backoffAfterSuccess(read, nowMs);
      } catch (error) {
        const failure = error instanceof LogiClientError ? error : new LogiClientError('network');
        current.lastOutcome = failure.code;
        current.answered = false;
        current.nextAttemptAt = backoffAfterFailure(failure, nowMs);
      }
    })().finally(() => { current.inflight = undefined; });
  }
  if (entry.last === null) await entry.inflight;
  return toLeaguePreviewPublic(canonical.url, entry.last, now, entry.answered);
}

export type LeagueReaderStatus = { lastAttemptAt: string | null; lastOutcome: LeagueReadOutcome | null; lastProducerError: LeagueErrorCode | null; cachedPreviews: number };

/** Latest attempt outcome across cached previews, for the administration health read model. */
export function leagueReaderStatus(): LeagueReaderStatus {
  let latest: LeagueCacheEntry | null = null;
  for (const entry of cache.values()) if (entry.lastOutcome !== null && (!latest || entry.lastAttemptAt > latest.lastAttemptAt)) latest = entry;
  return { lastAttemptAt: latest && Number.isFinite(latest.lastAttemptAt) ? new Date(latest.lastAttemptAt).toISOString() : null, lastOutcome: latest?.lastOutcome ?? null, lastProducerError: latest?.lastProducerError ?? null, cachedPreviews: cache.size };
}

export function resetLeagueReaderForTests(): void { cache.clear(); reported.clear(); }
/** Test helper: wait for background refreshes started by `observeLeaguePreview`. */
export async function settleLeagueReaderForTests(): Promise<void> { await Promise.all([...cache.values()].map((entry) => entry.inflight)); }

const reported = new Set<string>();

/** Configured Wardogs League source, `null` when the key is absent; configuration errors are reported, not thrown. */
export function configuredLeagueSource(env: LogiIntegrationEnv): ConfiguredLogiSource | null {
  try { return configuredLogiSources(env, 'league')[0] ?? null; } catch (error) {
    // Reported once per process and message, not on every render.
    const message = `League reader: ${error instanceof Error ? error.message : 'invalid configuration'}`;
    if (!reported.has(message)) { reported.add(message); console.warn(message); }
    return null;
  }
}

const readers = new Map<string, LeagueReader>();

/**
 * Public match-page entry point. Returns an unavailable preview when the reader is not
 * configured or the URL is rejected; synthetic mode serves labelled fixture data.
 */
export async function getLeagueMatchPreview(url: string, now = new Date()): Promise<LeaguePreviewPublic> {
  const canonical = canonicalLeagueMatchUrl(url);
  if (!canonical) return emptyLeaguePreview('');
  try {
    const env = getServerEnv();
    if (env.LOGI_READERS_SOURCE === 'synthetic-fixture') return toLeaguePreviewPublic(canonical.url, syntheticLeagueRead(canonical, now), now, true, true);
    const source = configuredLeagueSource(env);
    if (!source) return emptyLeaguePreview(canonical.url);
    let reader = readers.get(source.scopeKey);
    if (!reader) {
      reader = createLeagueReader(source);
      readers.clear();
      readers.set(source.scopeKey, reader);
    }
    return await observeLeaguePreview(reader, source.scopeKey, canonical.url, now);
  } catch {
    return emptyLeaguePreview(canonical.url);
  }
}
