import 'server-only';
import { LogiClientError } from '../transport';
import type { HistoryRecord } from './history-contracts';
import { aggregateHistory, filterHistoryRecords, latestHistoryRecords, listHistoryMaps, type HistoryMapCount, type HistoryReport } from './history-report';
import { HistoryScanError, type HistoryScanFailure, type HistoryScanner, type HistoryScanResult } from './history-scan';

/*
 * In-process snapshot store of the retained game history, one entry per approved
 * source (`scopeKey/sourceId`), like the other readers' last-known caches. This first
 * version keeps complete cached reads: a refresh scans every page of the source at one
 * revision and replaces the snapshot atomically only when the scan completed; readers
 * never see a partial list. It does not maintain projections and does not consume the
 * `server-game-history` change feed. Reports are computed per request from the
 * snapshot with the local filters and memoized per revision, filters and floor.
 *
 * Refresh policy: at most every `HISTORY_MIN_REFRESH_MS` after a success, failure
 * backoff like the League reader (`Retry-After`, 404 → 15 min, else 60 s); a snapshot
 * older than `HISTORY_MAX_AGE_MS` or whose last refresh failed is reported stale. The
 * first request of a source starts the scan and waits at most `HISTORY_FIRST_WAIT_MS`,
 * otherwise it answers "preparing"; once a snapshot exists, refreshes run in the
 * background. A denied key (401/403) drops the snapshot and reports "denied"; a 404
 * drops it and reports "unsupported". When the whole archive exceeds the page budget,
 * the scan is repeated for the last `HISTORY_WINDOW_DAYS` days and the snapshot carries
 * `coverage: window`; exceeding it again is a `budget_exceeded` failure.
 */

export const HISTORY_MIN_REFRESH_MS = 10 * 60_000;
export const HISTORY_MAX_AGE_MS = 30 * 60_000;
export const HISTORY_FIRST_WAIT_MS = 2000;
/** 250 pages × 20 scanned games. */
export const HISTORY_MAX_PAGES = 250;
export const HISTORY_TIME_BUDGET_MS = 60_000;
export const HISTORY_WINDOW_DAYS = 180;
export const HISTORY_MAX_BACKOFF_MS = 24 * 60 * 60_000;
const MIN_FAILURE_BACKOFF_MS = 60_000;
const DEFAULT_FAILURE_BACKOFF_MS = 60_000;
const NOT_DEPLOYED_BACKOFF_MS = 15 * 60_000;
const MAX_ENTRIES = 40;
const MAX_MEMOIZED_REPORTS = 64;

export type HistoryCoverage = { kind: 'all' } | { kind: 'window'; from: string };

export type HistorySnapshot = {
  revision: string;
  /** Workspace-wide last successful import reported by the producer. */
  lastCollectedAt: string | null;
  /** Website time at which the completed scan was started. */
  refreshedAt: string;
  /** Latest revision per record ID, ordered by end time then ID. */
  records: readonly HistoryRecord[];
  coverage: HistoryCoverage;
  pages: number;
};

/** `unavailable`: no snapshot and the last scan failed for a transient reason. */
export type HistoryStoreState = 'fresh' | 'stale' | 'preparing' | 'unavailable' | 'denied' | 'unsupported';

export type HistoryObservation = { state: HistoryStoreState; snapshot: HistorySnapshot | null; failure: HistoryScanFailure | null };

type HistoryStoreEntry = {
  snapshot: HistorySnapshot | null;
  availability: 'unknown' | 'available' | 'denied' | 'unsupported';
  /** Once the full archive exceeded the budget, later refreshes scan the window directly. */
  coverageHint: 'all' | 'window';
  lastAttemptAt: number;
  lastOutcome: 'ok' | HistoryScanFailure | null;
  nextAttemptAt: number;
  inflight?: Promise<void>;
  reports: Map<string, HistoryReport>;
  maps: Map<string, HistoryMapCount[]>;
};

const store = new Map<string, HistoryStoreEntry>();
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const iso = (ms: number) => new Date(ms).toISOString();

function entryFor(key: string): HistoryStoreEntry {
  let entry = store.get(key);
  if (!entry) {
    if (store.size >= MAX_ENTRIES) {
      const oldest = [...store.entries()].sort((left, right) => left[1].lastAttemptAt - right[1].lastAttemptAt)[0];
      if (oldest) store.delete(oldest[0]);
    }
    entry = { snapshot: null, availability: 'unknown', coverageHint: 'all', lastAttemptAt: Number.NEGATIVE_INFINITY, lastOutcome: null, nextAttemptAt: Number.NEGATIVE_INFINITY, reports: new Map(), maps: new Map() };
    store.set(key, entry);
  }
  return entry;
}

function toFailure(error: unknown): HistoryScanError {
  if (error instanceof HistoryScanError) return error;
  if (error instanceof LogiClientError) return new HistoryScanError(error.code, error.retryAfterMs);
  return new HistoryScanError('network');
}

function stateOf(entry: HistoryStoreEntry, nowMs: number): HistoryStoreState {
  if (entry.snapshot) {
    const failed = entry.lastOutcome !== null && entry.lastOutcome !== 'ok';
    return failed || nowMs - Date.parse(entry.snapshot.refreshedAt) >= HISTORY_MAX_AGE_MS ? 'stale' : 'fresh';
  }
  if (entry.availability === 'denied') return 'denied';
  if (entry.availability === 'unsupported') return 'unsupported';
  return entry.inflight || entry.lastOutcome === null ? 'preparing' : 'unavailable';
}

async function refresh(entry: HistoryStoreEntry, scan: HistoryScanner, sourceId: string, nowMs: number): Promise<void> {
  const options = { maxPages: HISTORY_MAX_PAGES, timeBudgetMs: HISTORY_TIME_BUDGET_MS };
  const windowFrom = iso(nowMs - HISTORY_WINDOW_DAYS * 24 * 60 * 60_000);
  const scanWindow = async (): Promise<[HistoryScanResult, HistoryCoverage]> => [await scan({ sourceId, from: windowFrom }, options), { kind: 'window', from: windowFrom }];
  try {
    let result: HistoryScanResult;
    let coverage: HistoryCoverage;
    if (entry.coverageHint === 'window') {
      [result, coverage] = await scanWindow();
    } else {
      try {
        result = await scan({ sourceId }, options);
        coverage = { kind: 'all' };
      } catch (error) {
        if (toFailure(error).reason !== 'budget_exceeded') throw error;
        entry.coverageHint = 'window';
        [result, coverage] = await scanWindow();
      }
    }
    const records = latestHistoryRecords(result.records);
    // Atomic replacement: the previous snapshot stays visible until this assignment.
    entry.snapshot = { revision: result.revision, lastCollectedAt: result.lastCollectedAt, refreshedAt: iso(nowMs), records, coverage, pages: result.pages };
    entry.reports = new Map();
    entry.maps = new Map();
    entry.availability = 'available';
    entry.lastOutcome = 'ok';
    entry.nextAttemptAt = nowMs + HISTORY_MIN_REFRESH_MS;
  } catch (error) {
    const failure = toFailure(error);
    entry.lastOutcome = failure.reason;
    if (failure.reason === 'unauthorized' || failure.reason === 'forbidden') {
      entry.snapshot = null;
      entry.reports = new Map();
      entry.maps = new Map();
      entry.availability = 'denied';
    } else if (failure.reason === 'not_found') {
      entry.snapshot = null;
      entry.reports = new Map();
      entry.maps = new Map();
      entry.availability = 'unsupported';
    }
    const wait = failure.retryAfterMs ?? (failure.reason === 'not_found' ? NOT_DEPLOYED_BACKOFF_MS : DEFAULT_FAILURE_BACKOFF_MS);
    entry.nextAttemptAt = nowMs + clamp(wait, MIN_FAILURE_BACKOFF_MS, HISTORY_MAX_BACKOFF_MS);
  }
}

/**
 * Observes one approved source: starts a due refresh (awaited up to `firstWaitMs` only
 * while no snapshot exists), then answers with the current snapshot and state. Never
 * throws; a failed refresh keeps the previous snapshot as stale.
 */
export async function observeHistory(scan: HistoryScanner, scopeKey: string, sourceId: string, now = new Date(), options: { firstWaitMs?: number } = {}): Promise<HistoryObservation> {
  const entry = entryFor(`${scopeKey}/${sourceId}`);
  const nowMs = now.getTime();
  if (!entry.inflight && nowMs >= entry.nextAttemptAt) {
    entry.lastAttemptAt = nowMs;
    entry.inflight = refresh(entry, scan, sourceId, nowMs).finally(() => { entry.inflight = undefined; });
  }
  if (entry.snapshot === null && entry.inflight) {
    const firstWaitMs = options.firstWaitMs ?? HISTORY_FIRST_WAIT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([entry.inflight, new Promise<void>((resolve) => { timer = setTimeout(resolve, firstWaitMs); })]);
    clearTimeout(timer);
  }
  const failure = entry.lastOutcome !== null && entry.lastOutcome !== 'ok' ? entry.lastOutcome : null;
  return { state: stateOf(entry, nowMs), snapshot: entry.snapshot, failure };
}

export type HistoryReportFilters = { from?: string; until?: string; map?: string };

/** Report of one snapshot under local filters, memoized per revision, coverage, filters and floor (bounded). */
export function historyReportFor(scopeKey: string, sourceId: string, snapshot: HistorySnapshot, filters: HistoryReportFilters, minMinutes: number): HistoryReport {
  const entry = entryFor(`${scopeKey}/${sourceId}`);
  const key = JSON.stringify([snapshot.revision, snapshot.coverage, filters.from ?? null, filters.until ?? null, filters.map ?? null, minMinutes]);
  const cached = entry.reports.get(key);
  if (cached) return cached;
  const report = aggregateHistory(filterHistoryRecords(snapshot.records, filters), minMinutes);
  if (entry.reports.size >= MAX_MEMOIZED_REPORTS) entry.reports.delete(entry.reports.keys().next().value as string);
  entry.reports.set(key, report);
  return report;
}

/** Maps of the games in the period (map filter ignored), memoized like the reports. */
export function historyMapsFor(scopeKey: string, sourceId: string, snapshot: HistorySnapshot, filters: Pick<HistoryReportFilters, 'from' | 'until'>): HistoryMapCount[] {
  const entry = entryFor(`${scopeKey}/${sourceId}`);
  const key = JSON.stringify([snapshot.revision, snapshot.coverage, filters.from ?? null, filters.until ?? null]);
  const cached = entry.maps.get(key);
  if (cached) return cached;
  const maps = listHistoryMaps(filterHistoryRecords(snapshot.records, { from: filters.from, until: filters.until }));
  if (entry.maps.size >= MAX_MEMOIZED_REPORTS) entry.maps.delete(entry.maps.keys().next().value as string);
  entry.maps.set(key, maps);
  return maps;
}

export type HistoryStoreStatus = {
  lastAttemptAt: string | null;
  lastOutcome: 'ok' | HistoryScanFailure | null;
  /** State of the most recently attempted source at `now`, null before any attempt. */
  state: HistoryStoreState | null;
  games: number | null;
  revision: string | null;
  lastCollectedAt: string | null;
  refreshedAt: string | null;
  coverage: HistoryCoverage | null;
  sources: number;
};

/** Latest attempt across sources for the administration health read model; no ID, cursor or record leaves the store. */
export function historyStoreStatus(now = new Date()): HistoryStoreStatus {
  let latest: HistoryStoreEntry | null = null;
  for (const entry of store.values()) if (Number.isFinite(entry.lastAttemptAt) && (!latest || entry.lastAttemptAt > latest.lastAttemptAt)) latest = entry;
  const snapshot = latest?.snapshot ?? null;
  return {
    lastAttemptAt: latest ? iso(latest.lastAttemptAt) : null,
    lastOutcome: latest?.lastOutcome ?? null,
    state: latest ? stateOf(latest, now.getTime()) : null,
    games: snapshot ? snapshot.records.length : null,
    revision: snapshot?.revision ?? null,
    lastCollectedAt: snapshot?.lastCollectedAt ?? null,
    refreshedAt: snapshot?.refreshedAt ?? null,
    coverage: snapshot?.coverage ?? null,
    sources: store.size,
  };
}

export function resetHistoryStoreForTests(): void { store.clear(); }
/** Test helper: wait for refreshes started by `observeHistory`. */
export async function settleHistoryStoreForTests(): Promise<void> { await Promise.all([...store.values()].map((entry) => entry.inflight)); }
