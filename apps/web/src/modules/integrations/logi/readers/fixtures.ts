import 'server-only';
import { getServerEnv } from '@/lib/env';
import type { ConfiguredLogiSource } from '../../logi-config';
import { createLogiTransport, LogiClientError, type LogiErrorCode, type LogiFetch, type LogiRequestOptions } from '../transport';
import { LEAGUE_CACHE_MS, LEAGUE_FIXTURES_PAGE_LIMIT, leagueFixturesEnvelopeSchema, type LeagueFixture } from './contracts';
import { configuredLeagueSource } from './league';
import { canonicalLeagueMatchUrl } from './league-url';
import { toLeagueFixturesPublic, type LeagueFixturesPublic } from './public';
import { syntheticLeagueFixtures } from './synthetic';

/**
 * Tracked Wardogs League fixtures reader (`GET /api/v1/clan/league-fixtures`, explicit
 * `league-fixtures` grant on the League key, Wardogs only). The producer lists the
 * fixtures it tracks for the guild (durable discovery, administrator pins, Discord
 * links) with the same public snapshot as the preview; this reader pages that
 * collection on demand within a fixed page bound, validates every page against the
 * closed schema, checks the guild/game/URL scope of every item and keeps one in-process
 * last-known list per configured source with `Retry-After`/404/failure backoff, in-flight
 * dedupe and background refresh once a list exists. The change-feed resource of the same
 * name (`/changes?resources=league-fixtures`, `/sync-records/league-fixtures/<id>`) is
 * not consumed: the collection client's resource list stays unchanged.
 */

export type LeagueFixturesOutcome = 'ok' | LogiErrorCode;

/** Pages read per refresh at most; a remaining cursor is reported as `truncated`, never followed further. */
export const LEAGUE_FIXTURES_MAX_PAGES = 3;

export type LeagueFixturesList = { items: LeagueFixture[]; truncated: boolean };

export interface LeagueFixturesReader {
  /** Validated, scope-checked tracked fixtures of the configured source; throws `LogiClientError`. */
  list(options?: LogiRequestOptions): Promise<LeagueFixturesList>;
}

export function createLeagueFixturesReader(source: Pick<ConfiguredLogiSource, 'origin' | 'apiKey' | 'gameId' | 'guildId' | 'allowLoopbackHttp' | 'environment'>, dependencies: { fetchImpl?: LogiFetch; now?: () => number; timeoutMs?: number } = {}): LeagueFixturesReader {
  if (source.gameId !== 'wardogs') throw new LogiClientError('configuration');
  const transport = createLogiTransport({ origin: source.origin, apiKey: source.apiKey, gameId: 'wardogs', allowLoopbackHttp: source.allowLoopbackHttp, environment: source.environment, timeoutMs: dependencies.timeoutMs }, dependencies);
  const guildId = source.guildId;
  return {
    async list(options) {
      const items: LeagueFixture[] = [];
      const seen = new Set<string>();
      let cursor: string | null = null;
      let truncated = false;
      for (let page = 0; page < LEAGUE_FIXTURES_MAX_PAGES; page += 1) {
        const query: Record<string, string> = cursor === null ? { limit: String(LEAGUE_FIXTURES_PAGE_LIMIT) } : { limit: String(LEAGUE_FIXTURES_PAGE_LIMIT), cursor };
        const parsed = leagueFixturesEnvelopeSchema.safeParse(await transport.get('league-fixtures', query, options));
        if (!parsed.success) throw new LogiClientError('invalid_response');
        for (const item of parsed.data.data.items) {
          const canonical = canonicalLeagueMatchUrl(item.snapshot.sourceUrl);
          if (item.gameId !== 'wardogs' || item.guildId !== guildId || item.snapshot.id !== item.id || !canonical || canonical.id !== item.id || canonical.url !== item.snapshot.sourceUrl) {
            throw new LogiClientError('scope_mismatch');
          }
          // A fixture repeated across pages keeps its first occurrence.
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          items.push(item);
        }
        cursor = parsed.data.data.nextCursor;
        if (cursor === null) break;
        if (page === LEAGUE_FIXTURES_MAX_PAGES - 1) truncated = true;
      }
      return { items, truncated };
    },
  };
}

/** Never re-poll the collection faster than this. */
export const LEAGUE_FIXTURES_MIN_REFRESH_MS = 60_000;
/** Longest honoured backoff (the producer bounds its own cooldowns to 24 hours as well). */
export const LEAGUE_FIXTURES_MAX_BACKOFF_MS = 24 * 60 * 60_000;
/** A 404 means the route is not deployed; do not hammer the producer for it. */
const NOT_DEPLOYED_BACKOFF_MS = 15 * 60_000;
const DEFAULT_FAILURE_BACKOFF_MS = 60_000;
/** One list per configured source; a changed key or source gets a new scope key. */
const MAX_ENTRIES = 8;

type LeagueFixturesCacheEntry = {
  /** Last answered list (the last-known fixtures). */
  last: LeagueFixture[] | null;
  truncated: boolean;
  lastAttemptAt: number;
  lastOutcome: LeagueFixturesOutcome | null;
  /** The latest pull answered successfully. */
  answered: boolean;
  nextAttemptAt: number;
  inflight?: Promise<void>;
};

const cache = new Map<string, LeagueFixturesCacheEntry>();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The collection carries no `nextRefreshAt`; the earliest producer refresh is due when
 * the oldest listed snapshot reaches the producer cache lifetime (an already stale
 * snapshot or an empty list is re-polled at the website minimum). Bounded by the
 * website minimum and maximum either way.
 */
function backoffAfterSuccess(items: readonly LeagueFixture[], nowMs: number): number {
  let wait = items.length === 0 ? LEAGUE_FIXTURES_MIN_REFRESH_MS : Number.POSITIVE_INFINITY;
  for (const item of items) {
    const due = Date.parse(item.snapshot.fetchedAt) + LEAGUE_CACHE_MS - nowMs;
    wait = Math.min(wait, Number.isFinite(due) ? due : LEAGUE_FIXTURES_MIN_REFRESH_MS);
  }
  return nowMs + clamp(wait, LEAGUE_FIXTURES_MIN_REFRESH_MS, LEAGUE_FIXTURES_MAX_BACKOFF_MS);
}

function backoffAfterFailure(error: LogiClientError, nowMs: number): number {
  const wait = error.retryAfterMs ?? (error.code === 'not_found' ? NOT_DEPLOYED_BACKOFF_MS : DEFAULT_FAILURE_BACKOFF_MS);
  return nowMs + clamp(wait, LEAGUE_FIXTURES_MIN_REFRESH_MS, LEAGUE_FIXTURES_MAX_BACKOFF_MS);
}

/**
 * Last-known tracked fixtures of one source, refreshed at most once per backoff window
 * with one shared in-flight request. Only the first read of a source is awaited; once a
 * list exists, a due refresh runs in the background and the last-known list is returned
 * at once, so the matches page never waits on the producer. Never throws: a failed pull
 * keeps the previous list as stale, and no list at all is an unavailable collection.
 */
export async function observeLeagueFixtures(reader: LeagueFixturesReader, scopeKey: string, now = new Date()): Promise<LeagueFixturesPublic> {
  let entry = cache.get(scopeKey);
  if (!entry) {
    if (cache.size >= MAX_ENTRIES) {
      const oldest = [...cache.entries()].sort((left, right) => left[1].lastAttemptAt - right[1].lastAttemptAt)[0];
      if (oldest) cache.delete(oldest[0]);
    }
    entry = { last: null, truncated: false, lastAttemptAt: Number.NEGATIVE_INFINITY, lastOutcome: null, answered: false, nextAttemptAt: Number.NEGATIVE_INFINITY };
    cache.set(scopeKey, entry);
  }
  const nowMs = now.getTime();
  if (!entry.inflight && nowMs >= entry.nextAttemptAt) {
    const current = entry;
    current.lastAttemptAt = nowMs;
    current.inflight = (async () => {
      try {
        const list = await reader.list();
        current.lastOutcome = 'ok';
        current.last = list.items;
        current.truncated = list.truncated;
        current.answered = true;
        current.nextAttemptAt = backoffAfterSuccess(list.items, nowMs);
      } catch (error) {
        const failure = error instanceof LogiClientError ? error : new LogiClientError('network');
        current.lastOutcome = failure.code;
        current.answered = false;
        current.nextAttemptAt = backoffAfterFailure(failure, nowMs);
      }
    })().finally(() => { current.inflight = undefined; });
  }
  if (entry.last === null) await entry.inflight;
  return toLeagueFixturesPublic(entry.last, now, entry.answered, false, entry.truncated);
}

export type LeagueFixturesReaderStatus = { lastAttemptAt: string | null; lastOutcome: LeagueFixturesOutcome | null; /** Fixtures in the last answered list, null before any answer. */ items: number | null; truncated: boolean };

/** Latest attempt outcome across cached lists, for the administration health read model. */
export function leagueFixturesReaderStatus(): LeagueFixturesReaderStatus {
  let latest: LeagueFixturesCacheEntry | null = null;
  for (const entry of cache.values()) if (entry.lastOutcome !== null && (!latest || entry.lastAttemptAt > latest.lastAttemptAt)) latest = entry;
  return {
    lastAttemptAt: latest && Number.isFinite(latest.lastAttemptAt) ? new Date(latest.lastAttemptAt).toISOString() : null,
    lastOutcome: latest?.lastOutcome ?? null,
    items: latest?.last ? latest.last.length : null,
    truncated: latest?.truncated ?? false,
  };
}

export function resetLeagueFixturesReaderForTests(): void { cache.clear(); readers.clear(); }
/** Test helper: wait for background refreshes started by `observeLeagueFixtures`. */
export async function settleLeagueFixturesReaderForTests(): Promise<void> { await Promise.all([...cache.values()].map((entry) => entry.inflight)); }

const readers = new Map<string, LeagueFixturesReader>();

/**
 * Wardogs matches page entry point. `null` means the reader is not configured (no League
 * key or Wardogs source): the page renders nothing. Otherwise the observed public list,
 * unavailable until the producer has answered once; synthetic mode serves labelled
 * fixture data.
 */
export async function getLeagueFixtures(now = new Date()): Promise<LeagueFixturesPublic | null> {
  try {
    const env = getServerEnv();
    if (env.LOGI_READERS_SOURCE === 'synthetic-fixture') return toLeagueFixturesPublic(syntheticLeagueFixtures(now), now, true, true, false);
    const source = configuredLeagueSource(env);
    if (!source) return null;
    let reader = readers.get(source.scopeKey);
    if (!reader) {
      reader = createLeagueFixturesReader(source);
      readers.clear();
      readers.set(source.scopeKey, reader);
    }
    return await observeLeagueFixtures(reader, source.scopeKey, now);
  } catch {
    return null;
  }
}
