import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogiClientError } from '../transport';
import { HistoryScanError, type HistoryScanner, type HistoryScanResult } from './history-scan';
import {
  HISTORY_FIRST_WAIT_MS, HISTORY_MAX_AGE_MS, HISTORY_MAX_PAGES, HISTORY_MIN_REFRESH_MS, HISTORY_TIME_BUDGET_MS, HISTORY_WINDOW_DAYS, historyMapsFor, historyReportFor, historyStoreStatus, observeHistory,
  resetHistoryStoreForTests, settleHistoryStoreForTests,
} from './history-store';
import { SYNTHETIC_HISTORY_SOURCE_ID, syntheticHistoryPages } from './synthetic';

const start = new Date('2026-10-03T12:00:00.000Z');
const at = (offsetMs: number) => new Date(start.getTime() + offsetMs);
const SOURCE = SYNTHETIC_HISTORY_SOURCE_ID;
const pages = syntheticHistoryPages(start);
const complete = (revision = '7', records = pages.flatMap((page) => page.items)): HistoryScanResult => ({ revision, lastCollectedAt: pages[0]!.lastCollectedAt, records, pages: 3, resets: 0 });
const failing = (reason: ConstructorParameters<typeof HistoryScanError>[0], retryAfterMs: number | null = null) => Promise.reject(new HistoryScanError(reason, retryAfterMs));

afterEach(() => { resetHistoryStoreForTests(); });

describe('history snapshot store', () => {
  it('awaits the first scan, publishes a deduplicated snapshot and memoizes reports per revision, filters and floor', async () => {
    const scan = vi.fn<HistoryScanner>().mockResolvedValue(complete());
    const first = await observeHistory(scan, 'scope-a', SOURCE, start);
    expect(first).toMatchObject({ state: 'fresh', failure: null, snapshot: { revision: '7', refreshedAt: start.toISOString(), lastCollectedAt: '2026-10-03T11:55:00.000Z', coverage: { kind: 'all' }, pages: 3 } });
    expect(first.snapshot?.records).toHaveLength(23);
    expect(scan).toHaveBeenCalledWith({ sourceId: SOURCE }, { maxPages: HISTORY_MAX_PAGES, timeBudgetMs: HISTORY_TIME_BUDGET_MS });
    expect(HISTORY_MAX_PAGES).toBe(250);
    expect(HISTORY_TIME_BUDGET_MS).toBe(60_000);
    const snapshot = first.snapshot!;
    const report = historyReportFor('scope-a', SOURCE, snapshot, {}, 60);
    expect(report.games).toBe(23);
    expect(historyReportFor('scope-a', SOURCE, snapshot, {}, 60)).toBe(report);
    expect(historyReportFor('scope-a', SOURCE, snapshot, {}, 0)).not.toBe(report);
    expect(historyReportFor('scope-a', SOURCE, snapshot, { map: 'Synthetic Ridge' }, 60)).toMatchObject({ games: 7 });
    const maps = historyMapsFor('scope-a', SOURCE, snapshot, {});
    expect(historyMapsFor('scope-a', SOURCE, snapshot, {})).toBe(maps);
    expect(maps.map((map) => map.name)).toEqual(['Synthetic Harbour', 'Synthetic Training Ground', 'Synthetic Ridge']);
    // Within the minimum refresh interval the producer is not asked again.
    await observeHistory(scan, 'scope-a', SOURCE, at(HISTORY_MIN_REFRESH_MS - 1000));
    expect(scan).toHaveBeenCalledOnce();
    // A new revision is a new memo key; the previous memo no longer applies.
    scan.mockResolvedValueOnce(complete('8'));
    await observeHistory(scan, 'scope-a', SOURCE, at(HISTORY_MIN_REFRESH_MS));
    await settleHistoryStoreForTests();
    const second = await observeHistory(scan, 'scope-a', SOURCE, at(HISTORY_MIN_REFRESH_MS + 1000));
    expect(second.snapshot?.revision).toBe('8');
    expect(historyReportFor('scope-a', SOURCE, second.snapshot!, {}, 60)).not.toBe(report);
    expect(historyStoreStatus(at(HISTORY_MIN_REFRESH_MS + 1000))).toMatchObject({ lastOutcome: 'ok', state: 'fresh', games: 23, revision: '8', refreshedAt: at(HISTORY_MIN_REFRESH_MS).toISOString(), coverage: { kind: 'all' }, sources: 1 });
  });

  it('replaces the snapshot atomically: readers see the previous complete snapshot until the refresh completes', async () => {
    let release: (result: HistoryScanResult) => void = () => undefined;
    const scan = vi.fn<HistoryScanner>().mockResolvedValueOnce(complete()).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const first = await observeHistory(scan, 'scope-b', SOURCE, start);
    const later = at(HISTORY_MIN_REFRESH_MS);
    const during = await Promise.race([observeHistory(scan, 'scope-b', SOURCE, later), new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 200))]);
    expect(during).not.toBe('blocked');
    expect((during as Awaited<ReturnType<typeof observeHistory>>).snapshot).toBe(first.snapshot);
    expect((during as Awaited<ReturnType<typeof observeHistory>>).state).toBe('fresh');
    expect(scan).toHaveBeenCalledTimes(2);
    release(complete('9', pages[0]!.items.slice(0, 5)));
    await settleHistoryStoreForTests();
    const after = await observeHistory(scan, 'scope-b', SOURCE, at(HISTORY_MIN_REFRESH_MS + 1000));
    expect(after.snapshot).not.toBe(first.snapshot);
    expect(after.snapshot).toMatchObject({ revision: '9', refreshedAt: later.toISOString() });
    expect(after.snapshot?.records).toHaveLength(5);
  });

  it('keeps the previous snapshot as stale after a transient failure with the League backoff rules', async () => {
    const scan = vi.fn<HistoryScanner>().mockResolvedValueOnce(complete()).mockImplementationOnce(() => failing('upstream'));
    const first = await observeHistory(scan, 'scope-c', SOURCE, start);
    await observeHistory(scan, 'scope-c', SOURCE, at(HISTORY_MIN_REFRESH_MS));
    await settleHistoryStoreForTests();
    const stale = await observeHistory(scan, 'scope-c', SOURCE, at(HISTORY_MIN_REFRESH_MS + 1000));
    expect(stale).toMatchObject({ state: 'stale', failure: 'upstream' });
    expect(stale.snapshot).toBe(first.snapshot);
    expect(stale.snapshot?.refreshedAt).toBe(start.toISOString());
    expect(scan).toHaveBeenCalledTimes(2);
    // Default failure backoff is 60 s.
    await observeHistory(scan, 'scope-c', SOURCE, at(HISTORY_MIN_REFRESH_MS + 59_000));
    expect(scan).toHaveBeenCalledTimes(2);
    scan.mockImplementationOnce(() => failing('rate_limited', 300_000));
    await observeHistory(scan, 'scope-c', SOURCE, at(HISTORY_MIN_REFRESH_MS + 60_000));
    await settleHistoryStoreForTests();
    expect(scan).toHaveBeenCalledTimes(3);
    await observeHistory(scan, 'scope-c', SOURCE, at(HISTORY_MIN_REFRESH_MS + 60_000 + 299_000));
    expect(scan).toHaveBeenCalledTimes(3);
    scan.mockResolvedValueOnce(complete('8'));
    await observeHistory(scan, 'scope-c', SOURCE, at(HISTORY_MIN_REFRESH_MS + 60_000 + 300_000));
    await settleHistoryStoreForTests();
    expect(scan).toHaveBeenCalledTimes(4);
    const recovered = await observeHistory(scan, 'scope-c', SOURCE, at(HISTORY_MIN_REFRESH_MS + 60_000 + 301_000));
    expect(recovered).toMatchObject({ state: 'fresh', failure: null, snapshot: { revision: '8' } });
    // A 404 backs off for 15 minutes; a plain LogiClientError is classified too.
    scan.mockImplementationOnce(() => Promise.reject(new LogiClientError('not_found')));
    const notFoundAt = at(2 * HISTORY_MIN_REFRESH_MS + 60_000 + 301_000);
    await observeHistory(scan, 'scope-c', SOURCE, notFoundAt);
    await settleHistoryStoreForTests();
    expect(await observeHistory(scan, 'scope-c', SOURCE, new Date(notFoundAt.getTime() + 14 * 60_000))).toMatchObject({ state: 'unsupported', snapshot: null, failure: 'not_found' });
    expect(scan).toHaveBeenCalledTimes(5);
    await observeHistory(scan, 'scope-c', SOURCE, new Date(notFoundAt.getTime() + 15 * 60_000));
    expect(scan).toHaveBeenCalledTimes(6);
    await settleHistoryStoreForTests();
  });

  it('drops the snapshot when the producer denies the key and recovers after a later success', async () => {
    const scan = vi.fn<HistoryScanner>().mockResolvedValueOnce(complete()).mockImplementationOnce(() => failing('forbidden'));
    await observeHistory(scan, 'scope-d', SOURCE, start);
    await observeHistory(scan, 'scope-d', SOURCE, at(HISTORY_MIN_REFRESH_MS));
    await settleHistoryStoreForTests();
    const denied = await observeHistory(scan, 'scope-d', SOURCE, at(HISTORY_MIN_REFRESH_MS + 1000));
    expect(denied).toEqual({ state: 'denied', snapshot: null, failure: 'forbidden' });
    expect(historyStoreStatus(at(HISTORY_MIN_REFRESH_MS + 1000))).toMatchObject({ state: 'denied', lastOutcome: 'forbidden', games: null, revision: null });
    scan.mockImplementationOnce(() => failing('unauthorized'));
    await observeHistory(scan, 'scope-d', SOURCE, at(HISTORY_MIN_REFRESH_MS + 60_000));
    await settleHistoryStoreForTests();
    expect((await observeHistory(scan, 'scope-d', SOURCE, at(HISTORY_MIN_REFRESH_MS + 61_000))).state).toBe('denied');
    scan.mockResolvedValueOnce(complete('8'));
    // Without a snapshot the next due request is awaited again.
    const recovered = await observeHistory(scan, 'scope-d', SOURCE, at(HISTORY_MIN_REFRESH_MS + 120_000));
    expect(recovered).toMatchObject({ state: 'fresh', failure: null, snapshot: { revision: '8' } });
  });

  it('falls back to the 180-day window when the full archive exceeds the page budget and fails when the window does too', async () => {
    const windowFrom = new Date(start.getTime() - HISTORY_WINDOW_DAYS * 24 * 60 * 60_000).toISOString();
    const scan = vi.fn<HistoryScanner>().mockImplementation(async (filters) => (filters.from === undefined ? failing('budget_exceeded') : complete()));
    const first = await observeHistory(scan, 'scope-e', SOURCE, start);
    expect(first).toMatchObject({ state: 'fresh', snapshot: { coverage: { kind: 'window', from: windowFrom } } });
    expect(scan.mock.calls.map(([filters]) => filters)).toEqual([{ sourceId: SOURCE }, { sourceId: SOURCE, from: windowFrom }]);
    // Later refreshes scan the window directly.
    await observeHistory(scan, 'scope-e', SOURCE, at(HISTORY_MIN_REFRESH_MS));
    await settleHistoryStoreForTests();
    expect(scan).toHaveBeenCalledTimes(3);
    expect(scan.mock.calls[2]![0]).toEqual({ sourceId: SOURCE, from: new Date(start.getTime() + HISTORY_MIN_REFRESH_MS - HISTORY_WINDOW_DAYS * 24 * 60 * 60_000).toISOString() });
    expect(historyStoreStatus(at(HISTORY_MIN_REFRESH_MS + 1000))).toMatchObject({ state: 'fresh', coverage: { kind: 'window' } });
    const exhausted = vi.fn<HistoryScanner>().mockImplementation(() => failing('budget_exceeded'));
    const exhaustedAt = at(2 * HISTORY_MIN_REFRESH_MS);
    expect(await observeHistory(exhausted, 'scope-f', SOURCE, exhaustedAt)).toEqual({ state: 'unavailable', snapshot: null, failure: 'budget_exceeded' });
    expect(exhausted).toHaveBeenCalledTimes(2);
    expect(historyStoreStatus(exhaustedAt)).toMatchObject({ state: 'unavailable', lastOutcome: 'budget_exceeded', lastAttemptAt: exhaustedAt.toISOString() });
  });

  it('answers "preparing" when the first scan outlasts the first wait, then serves the snapshot once complete', async () => {
    let release: (result: HistoryScanResult) => void = () => undefined;
    const scan = vi.fn<HistoryScanner>().mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    expect(HISTORY_FIRST_WAIT_MS).toBe(2000);
    const preparing = await observeHistory(scan, 'scope-g', SOURCE, start, { firstWaitMs: 20 });
    expect(preparing).toEqual({ state: 'preparing', snapshot: null, failure: null });
    expect(historyStoreStatus(start)).toMatchObject({ state: 'preparing', lastOutcome: null, lastAttemptAt: start.toISOString() });
    // A second visitor shares the in-flight scan instead of starting another one.
    expect((await observeHistory(scan, 'scope-g', SOURCE, at(1000), { firstWaitMs: 20 })).state).toBe('preparing');
    expect(scan).toHaveBeenCalledOnce();
    release(complete());
    await settleHistoryStoreForTests();
    expect((await observeHistory(scan, 'scope-g', SOURCE, at(2000))).state).toBe('fresh');
    expect(scan).toHaveBeenCalledOnce();
  });

  it('reports a snapshot past the maximum age as stale even without a failure', async () => {
    const scan = vi.fn<HistoryScanner>().mockResolvedValueOnce(complete()).mockImplementationOnce(() => new Promise(() => undefined));
    await observeHistory(scan, 'scope-h', SOURCE, start);
    expect((await observeHistory(scan, 'scope-h', SOURCE, at(HISTORY_MAX_AGE_MS - 1000))).state).toBe('fresh');
    expect((await observeHistory(scan, 'scope-h', SOURCE, at(HISTORY_MAX_AGE_MS))).state).toBe('stale');
    expect(HISTORY_MAX_AGE_MS).toBe(30 * 60_000);
    expect(HISTORY_MIN_REFRESH_MS).toBe(10 * 60_000);
  });

  it('keeps separate entries per scope and source and reports the latest attempt', async () => {
    const scan = vi.fn<HistoryScanner>().mockResolvedValue(complete());
    await observeHistory(scan, 'scope-i', SOURCE, start);
    await observeHistory(scan, 'scope-i', 'ab'.repeat(32), at(1000));
    expect(scan).toHaveBeenCalledTimes(2);
    expect(historyStoreStatus(at(2000))).toMatchObject({ sources: 2, lastAttemptAt: at(1000).toISOString() });
  });
});
