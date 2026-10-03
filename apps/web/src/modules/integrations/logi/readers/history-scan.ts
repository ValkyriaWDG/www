import { LogiClientError, type LogiErrorCode } from '../transport';
import { compareHistoryRevisions, type HistoryFilters, type HistoryPage, type HistoryRecord } from './history-contracts';

/*
 * Complete-scan helper of the retained game history, ported from the producer's
 * `src/application/game-data/history-report.ts` (`buildHistoryReport`, PR #158 at
 * `72946e3`): one revision across every page, no record newer than its page, no
 * repeated cursor, finished only at `nextCursor === null`, a page budget and
 * cancellation. The website adds a time budget and bounded restarts after
 * 410 `reset_required`. A failed or partial scan never yields records. Pure module.
 */

/** Filters of one website scan; the approved source ID is always present. */
export type HistoryReadFilters = HistoryFilters & { sourceId: string };

export interface HistoryReader {
  /** One validated, scope-checked page; throws `LogiClientError`. */
  readPage(input: { filters: HistoryReadFilters; cursor: string | null; signal?: AbortSignal }): Promise<HistoryPage>;
}

export type HistoryScanFailure = LogiErrorCode | 'revision_mismatch' | 'repeated_cursor' | 'budget_exceeded' | 'aborted';

/** A category only; no page, cursor or body is kept. `retryAfterMs` carries the producer's `Retry-After`. */
export class HistoryScanError extends Error {
  constructor(readonly reason: HistoryScanFailure, readonly retryAfterMs: number | null = null) {
    super(`History scan failed: ${reason}`);
    this.name = 'HistoryScanError';
  }
}

export type HistoryScanResult = {
  /** Workspace history revision every page carried. */
  revision: string;
  lastCollectedAt: string | null;
  /** Every scanned record in page order; a corrected game can appear twice (the aggregation keeps the highest revision). */
  records: HistoryRecord[];
  /** Pages of the completing attempt. */
  pages: number;
  /** Restarts after 410 before the scan completed. */
  resets: number;
};

export type HistoryScanOptions = {
  /** Pages per attempt at most; exceeding it is `budget_exceeded`, never a partial result. */
  maxPages?: number;
  /** Wall-clock budget of the whole scan including restarts; exceeding it is `timeout`. */
  timeBudgetMs?: number;
  /** Restarts after 410 at most (then `reset_required`). */
  maxResets?: number;
  signal?: AbortSignal;
};

export const HISTORY_SCAN_DEFAULT_MAX_PAGES = 250;
export const HISTORY_SCAN_MAX_PAGES = 1000;
export const HISTORY_SCAN_DEFAULT_TIME_BUDGET_MS = 60_000;
export const HISTORY_SCAN_MAX_TIME_BUDGET_MS = 10 * 60_000;
export const HISTORY_SCAN_DEFAULT_MAX_RESETS = 2;

async function scanOnce(reader: HistoryReader, filters: HistoryReadFilters, signal: AbortSignal, maxPages: number, resets: number): Promise<HistoryScanResult> {
  const records: HistoryRecord[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let revision: string | undefined;
  let lastCollectedAt: string | null = null;
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    if (signal.aborted) throw new HistoryScanError('aborted');
    const page: HistoryPage = await reader.readPage({ filters, cursor, signal });
    if (signal.aborted) throw new HistoryScanError('aborted');
    revision ??= page.revision;
    if (revision !== page.revision) throw new HistoryScanError('revision_mismatch');
    if (page.items.some((record) => compareHistoryRevisions(record.revision, page.revision) > 0)) throw new HistoryScanError('invalid_response');
    lastCollectedAt = page.lastCollectedAt;
    records.push(...page.items);
    cursor = page.nextCursor;
    if (cursor === null) return { revision, lastCollectedAt, records, pages: pageNumber + 1, resets };
    if (seen.has(cursor)) throw new HistoryScanError('repeated_cursor');
    seen.add(cursor);
  }
  throw new HistoryScanError('budget_exceeded');
}

/**
 * Reads every page of one filtered scan and returns the records only when the scan
 * completed at one revision. A 410 discards the partial work and restarts from the
 * first page, at most `maxResets` times. The caller's signal (`aborted`), the time
 * budget (`timeout`), the page budget (`budget_exceeded`), a revision change
 * (`revision_mismatch`), a cursor loop (`repeated_cursor`) and every transport
 * category are distinct `HistoryScanError` reasons.
 */
export async function scanHistory(reader: HistoryReader, filters: HistoryReadFilters, options: HistoryScanOptions = {}): Promise<HistoryScanResult> {
  const maxPages = options.maxPages ?? HISTORY_SCAN_DEFAULT_MAX_PAGES;
  const timeBudgetMs = options.timeBudgetMs ?? HISTORY_SCAN_DEFAULT_TIME_BUDGET_MS;
  const maxResets = options.maxResets ?? HISTORY_SCAN_DEFAULT_MAX_RESETS;
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > HISTORY_SCAN_MAX_PAGES) throw new HistoryScanError('configuration');
  if (!Number.isSafeInteger(timeBudgetMs) || timeBudgetMs < 1 || timeBudgetMs > HISTORY_SCAN_MAX_TIME_BUDGET_MS) throw new HistoryScanError('configuration');
  if (!Number.isSafeInteger(maxResets) || maxResets < 0 || maxResets > 10) throw new HistoryScanError('configuration');
  const controller = new AbortController();
  let budgetExpired = false;
  const timer = setTimeout(() => { budgetExpired = true; controller.abort(); }, timeBudgetMs);
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const classify = (error: unknown): HistoryScanError => {
    if (options.signal?.aborted) return new HistoryScanError('aborted');
    if (budgetExpired) return new HistoryScanError('timeout');
    if (error instanceof HistoryScanError) return error;
    if (error instanceof LogiClientError) return new HistoryScanError(error.code, error.retryAfterMs);
    return new HistoryScanError('network');
  };
  try {
    for (let resets = 0; ; resets += 1) {
      try {
        return await scanOnce(reader, filters, controller.signal, maxPages, resets);
      } catch (error) {
        const failure = classify(error);
        // Facts changed during pagination: discard the partial scan and start again.
        if (failure.reason === 'reset_required' && resets < maxResets) continue;
        throw failure;
      }
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
    controller.abort();
  }
}

/** Scan function the snapshot store calls; the reader binding stays with the caller. */
export type HistoryScanner = (filters: HistoryReadFilters, options: HistoryScanOptions) => Promise<HistoryScanResult>;
