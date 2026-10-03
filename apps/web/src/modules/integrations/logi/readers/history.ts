import 'server-only';
import { createHash } from 'node:crypto';
import { getServerEnv } from '@/lib/env';
import { configuredLogiSources, type ConfiguredLogiSource, type LogiIntegrationEnv } from '../../logi-config';
import { createLogiTransport, LOGI_MAX_BODY_BYTES, LogiClientError, type LogiFetch } from '../transport';
import { compareHistoryRevisions, HISTORY_CURSOR_MAX_LENGTH, historyFiltersSchema, historyPageEnvelopeSchema, type HistoryPage } from './history-contracts';
import {
  DEFAULT_HISTORY_PUBLIC_FILTERS, emptyHistoryGamesPublic, emptyHistoryReportPublic, parseHistoryPublicFilters, toHistoryFilters, toHistoryGamesPublic, toHistoryReportPublic,
  type HistoryCoveragePublic, type HistoryGamesPublic, type HistoryPlayerKey, type HistoryPublicContext, type HistoryPublicFilters, type HistoryReportPublic,
} from './history-public';
import { filterHistoryRecords } from './history-report';
import { scanHistory, type HistoryReader, type HistoryScanner } from './history-scan';
import { historyMapsFor, historyReportFor, observeHistory, type HistoryObservation } from './history-store';
import { SYNTHETIC_HISTORY_CURSORS, SYNTHETIC_HISTORY_SOURCE_ID, SYNTHETIC_WARCON_PUBLIC_ID, syntheticHistoryPages } from './synthetic';

export { HistoryScanError, scanHistory, type HistoryReader, type HistoryReadFilters, type HistoryScanFailure, type HistoryScanOptions, type HistoryScanResult } from './history-scan';

/**
 * Retained Warcon game history reader (`GET /api/v1/clan/server-game-history`, explicit
 * `server-game-history` grant with `wardogs` access on its own key, Wardogs only; the
 * `warcon-data`, League and legacy keys do not inherit it). Pages are read for approved
 * `historySources` only, with the canonical query (`sourceId`, `map`, `from`, `until`,
 * `cursor`; the transport adds `game`); `limit`, `page`, `sort`, `minMinutes`, `gameId`
 * and `id` are never sent. Every page is validated against the closed schema and every
 * item is checked for the source's guild, the requested source ID and a revision not
 * newer than its page. The snapshot store (`history-store.ts`) scans the collection
 * completely and the public entry points below project it with the local filters.
 */

/** Pages of up to 20 games with player facts can be large; allow more time than a single-object read. */
const HISTORY_TIMEOUT_MS = 10_000;

export function createHistoryReader(source: Pick<ConfiguredLogiSource, 'origin' | 'apiKey' | 'gameId' | 'guildId' | 'allowLoopbackHttp' | 'environment' | 'historySources'>, dependencies: { fetchImpl?: LogiFetch; now?: () => number; timeoutMs?: number } = {}): HistoryReader {
  if (source.gameId !== 'wardogs') throw new LogiClientError('configuration');
  const transport = createLogiTransport({ origin: source.origin, apiKey: source.apiKey, gameId: 'wardogs', allowLoopbackHttp: source.allowLoopbackHttp, environment: source.environment, timeoutMs: dependencies.timeoutMs ?? HISTORY_TIMEOUT_MS, maxBodyBytes: LOGI_MAX_BODY_BYTES }, dependencies);
  const guildId = source.guildId;
  const approved = new Set(source.historySources.map((row) => row.sourceId));
  return {
    async readPage({ filters, cursor, signal }) {
      const parsed = historyFiltersSchema.safeParse(filters);
      if (!parsed.success || parsed.data.sourceId === undefined || !approved.has(parsed.data.sourceId)) throw new LogiClientError('configuration');
      if (cursor !== null && (cursor.length === 0 || cursor.length > HISTORY_CURSOR_MAX_LENGTH)) throw new LogiClientError('configuration');
      const query: Record<string, string> = { sourceId: parsed.data.sourceId };
      if (parsed.data.map !== undefined) query.map = parsed.data.map;
      if (parsed.data.from !== undefined) query.from = parsed.data.from;
      if (parsed.data.until !== undefined) query.until = parsed.data.until;
      if (cursor !== null) query.cursor = cursor;
      const envelope = historyPageEnvelopeSchema.safeParse(await transport.get('server-game-history', query, { signal }));
      if (!envelope.success) throw new LogiClientError('invalid_response');
      const page = envelope.data.data;
      for (const record of page.items) {
        if (record.guildId !== guildId || record.sourceId !== parsed.data.sourceId) throw new LogiClientError('scope_mismatch');
        if (compareHistoryRevisions(record.revision, page.revision) > 0) throw new LogiClientError('invalid_response');
      }
      return page;
    },
  };
}

/** Serves the labelled synthetic pages like a producer (cursor chain, local filters, unknown source empty). */
export function createSyntheticHistoryReader(now: Date): HistoryReader {
  const pages = syntheticHistoryPages(now);
  const cursors: (string | null)[] = [null, ...SYNTHETIC_HISTORY_CURSORS];
  return {
    async readPage({ filters, cursor }) {
      const parsed = historyFiltersSchema.safeParse(filters);
      if (!parsed.success) throw new LogiClientError('configuration');
      const index = cursors.indexOf(cursor);
      if (index < 0) throw new LogiClientError('upstream');
      const page = pages[index]!;
      const items = parsed.data.sourceId === SYNTHETIC_HISTORY_SOURCE_ID ? filterHistoryRecords(page.items, parsed.data) : [];
      const answer: HistoryPage = { ...page, items };
      return answer;
    },
  };
}

const reported = new Set<string>();

/** Configured Wardogs history source, `null` when the key is absent; configuration errors are reported once, not thrown. */
export function configuredHistorySource(env: LogiIntegrationEnv): ConfiguredLogiSource | null {
  try { return configuredLogiSources(env, 'history')[0] ?? null; } catch (error) {
    const message = `History reader: ${error instanceof Error ? error.message : 'invalid configuration'}`;
    if (!reported.has(message)) { reported.add(message); console.warn(message); }
    return null;
  }
}

/** Opaque per-source player keys: SHA-256 of the provider identity with a salt derived from the scope and source, 16 hex characters. */
export function createHistoryPlayerKey(scopeKey: string, sourceId: string): HistoryPlayerKey {
  const salt = createHash('sha256').update(JSON.stringify(['history-player-key-v1', scopeKey, sourceId])).digest('hex');
  return (platform, platformId) => createHash('sha256').update(`${salt}:${platform}:${platformId}`).digest('hex').slice(0, 16);
}

type ResolvedHistorySource = { scopeKey: string; sourceId: string; publishPlayers: boolean; synthetic: boolean; scan: HistoryScanner; playerKey: HistoryPlayerKey };

const readers = new Map<string, HistoryReader>();
const SYNTHETIC_SCOPE_KEY = 'synthetic-history';

/** The approved history source behind a website public server ID, or `null` (unconfigured or unapproved: render nothing). */
function resolveHistorySource(publicId: string, now: Date): ResolvedHistorySource | null {
  const env = getServerEnv();
  if (env.LOGI_READERS_SOURCE === 'synthetic-fixture') {
    if (publicId !== SYNTHETIC_WARCON_PUBLIC_ID) return null;
    const reader = createSyntheticHistoryReader(now);
    return { scopeKey: SYNTHETIC_SCOPE_KEY, sourceId: SYNTHETIC_HISTORY_SOURCE_ID, publishPlayers: true, synthetic: true, scan: (filters, options) => scanHistory(reader, filters, options), playerKey: createHistoryPlayerKey(SYNTHETIC_SCOPE_KEY, SYNTHETIC_HISTORY_SOURCE_ID) };
  }
  const source = configuredHistorySource(env);
  if (!source) return null;
  const approved = source.historySources.find((row) => row.publicId === publicId);
  if (!approved) return null;
  let reader = readers.get(source.scopeKey);
  if (!reader) {
    reader = createHistoryReader(source);
    readers.clear();
    readers.set(source.scopeKey, reader);
  }
  const active = reader;
  return { scopeKey: source.scopeKey, sourceId: approved.sourceId, publishPlayers: approved.publishPlayers, synthetic: false, scan: (filters, options) => scanHistory(active, filters, options), playerKey: createHistoryPlayerKey(source.scopeKey, approved.sourceId) };
}

function coverageOf(observation: HistoryObservation): HistoryCoveragePublic {
  const coverage = observation.snapshot?.coverage;
  return coverage?.kind === 'window' ? { kind: 'window', from: coverage.from } : { kind: 'all', from: null };
}

function contextOf(publicId: string, resolved: ResolvedHistorySource, observation: HistoryObservation): HistoryPublicContext {
  return {
    publicId, state: observation.state, synthetic: resolved.synthetic, coverage: coverageOf(observation),
    refreshedAt: observation.snapshot?.refreshedAt ?? null, lastCollectedAt: observation.snapshot?.lastCollectedAt ?? null,
    publishPlayers: resolved.publishPlayers, playerKey: resolved.playerKey,
  };
}

/**
 * Public report entry point. `null` when the reader is unconfigured or the public ID
 * has no approved history source (the page renders nothing). Otherwise the report of
 * the current snapshot under the given filters, or an empty DTO in the `preparing`,
 * `unavailable`, `denied` and `unsupported` states. Synthetic mode serves the labelled
 * dataset for the synthetic Wardogs server with players published.
 */
export async function getHistoryReport(publicId: string, filters: HistoryPublicFilters = DEFAULT_HISTORY_PUBLIC_FILTERS, now = new Date()): Promise<HistoryReportPublic | null> {
  const normalized = parseHistoryPublicFilters(filters);
  let resolved: ResolvedHistorySource | null;
  try { resolved = resolveHistorySource(publicId, now); } catch { return null; }
  if (!resolved) return null;
  try {
    const observation = await observeHistory(resolved.scan, resolved.scopeKey, resolved.sourceId, now);
    if (!observation.snapshot) return emptyHistoryReportPublic(publicId, observation.state, normalized, resolved.synthetic);
    const upstream = toHistoryFilters(normalized);
    const report = historyReportFor(resolved.scopeKey, resolved.sourceId, observation.snapshot, upstream, normalized.minMinutes);
    const maps = historyMapsFor(resolved.scopeKey, resolved.sourceId, observation.snapshot, { from: upstream.from, until: upstream.until });
    return toHistoryReportPublic(contextOf(publicId, resolved, observation), normalized, report, maps);
  } catch {
    return emptyHistoryReportPublic(publicId, 'unavailable', normalized, resolved.synthetic);
  }
}

/** Public games entry point: one page of the filtered games, newest first; `null` as for the report. */
export async function getHistoryGames(publicId: string, filters: HistoryPublicFilters = DEFAULT_HISTORY_PUBLIC_FILTERS, page = 1, now = new Date()): Promise<HistoryGamesPublic | null> {
  const normalized = parseHistoryPublicFilters(filters);
  let resolved: ResolvedHistorySource | null;
  try { resolved = resolveHistorySource(publicId, now); } catch { return null; }
  if (!resolved) return null;
  try {
    const observation = await observeHistory(resolved.scan, resolved.scopeKey, resolved.sourceId, now);
    if (!observation.snapshot) return emptyHistoryGamesPublic(publicId, observation.state, normalized, page, resolved.synthetic);
    const records = filterHistoryRecords(observation.snapshot.records, toHistoryFilters(normalized));
    return toHistoryGamesPublic(contextOf(publicId, resolved, observation), normalized, records, page);
  } catch {
    return emptyHistoryGamesPublic(publicId, 'unavailable', normalized, page, resolved.synthetic);
  }
}

/** Website public server IDs with an approved history source, for navigation; empty when unconfigured. */
export function listHistoryPublicIds(): string[] {
  try {
    const env = getServerEnv();
    if (env.LOGI_READERS_SOURCE === 'synthetic-fixture') return [SYNTHETIC_WARCON_PUBLIC_ID];
    const source = configuredHistorySource(env);
    return source ? source.historySources.map((row) => row.publicId) : [];
  } catch {
    return [];
  }
}

export function resetHistoryReaderForTests(): void { readers.clear(); reported.clear(); }
