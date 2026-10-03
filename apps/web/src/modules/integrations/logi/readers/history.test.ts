import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetServerEnvForTests } from '@/lib/env';
import { LogiClientError, type LogiFetch } from '../transport';
import type { HistoryPage } from './history-contracts';
import { createHistoryPlayerKey, createHistoryReader, createSyntheticHistoryReader, getHistoryGames, getHistoryReport, HistoryScanError, listHistoryPublicIds, resetHistoryReaderForTests, scanHistory } from './history';
import { DEFAULT_HISTORY_PUBLIC_FILTERS } from './history-public';
import { resetHistoryStoreForTests, settleHistoryStoreForTests } from './history-store';
import { SYNTHETIC_HISTORY_CURSORS, SYNTHETIC_HISTORY_GUILD_ID, SYNTHETIC_HISTORY_SOURCE_ID, SYNTHETIC_WARCON_PUBLIC_ID, syntheticHistoryPages } from './synthetic';

const now = new Date('2026-10-03T12:00:00.000Z');
const OTHER_SOURCE = 'fedcba9876543210'.repeat(4);
const source = {
  origin: 'https://logi.example', apiKey: 'synthetic-history-key-not-a-credential', gameId: 'wardogs' as const, guildId: SYNTHETIC_HISTORY_GUILD_ID, allowLoopbackHttp: false, environment: 'test' as const,
  historySources: [{ sourceId: SYNTHETIC_HISTORY_SOURCE_ID, publicId: 'community-one', publishPlayers: true }],
};
const filters = { sourceId: SYNTHETIC_HISTORY_SOURCE_ID };
const json = (body: unknown, init?: ResponseInit) => Response.json(body, init);
const pages = syntheticHistoryPages(now);
const cursorChain: (string | null)[] = [null, ...SYNTHETIC_HISTORY_CURSORS];
/** Serves the synthetic cursor chain; `override` replaces a page by index. */
const pagesFetch = (override: Partial<Record<number, HistoryPage | Response>> = {}) => vi.fn<LogiFetch>().mockImplementation(async (input) => {
  const index = cursorChain.indexOf(new URL(input).searchParams.get('cursor'));
  if (index < 0) return new Response(JSON.stringify({ error: { code: 'invalid_cursor' } }), { status: 400, headers: { 'content-type': 'application/json' } });
  const page = override[index] ?? pages[index]!;
  return page instanceof Response ? page : json({ data: page });
});
const status = (code: number, headers: Record<string, string> = {}) => new Response(JSON.stringify({ error: { code: 'secret-detail' } }), { status: code, headers: { 'content-type': 'application/json', ...headers } });

afterEach(() => {
  resetHistoryStoreForTests();
  resetHistoryReaderForTests();
  vi.unstubAllEnvs();
  resetServerEnvForTests();
});

describe('history reader transport', () => {
  it('sends only the canonical query with the Wardogs scope, bearer key and no-store, and never limit/page/sort/minMinutes/gameId/id', async () => {
    const fetchImpl = pagesFetch();
    const reader = createHistoryReader(source, { fetchImpl });
    const first = await reader.readPage({ filters: { ...filters, map: 'Synthetic Ridge', from: '2026-08-01T00:00:00Z', until: '2026-10-01T00:00:00.000Z' }, cursor: null });
    expect(first.items).toHaveLength(20);
    await reader.readPage({ filters, cursor: SYNTHETIC_HISTORY_CURSORS[0] });
    const [a, b] = fetchImpl.mock.calls;
    const firstUrl = new URL(a![0]);
    expect(firstUrl.origin + firstUrl.pathname).toBe('https://logi.example/api/v1/clan/server-game-history');
    expect([...firstUrl.searchParams.entries()]).toEqual([['sourceId', SYNTHETIC_HISTORY_SOURCE_ID], ['map', 'Synthetic Ridge'], ['from', '2026-08-01T00:00:00.000Z'], ['until', '2026-10-01T00:00:00.000Z'], ['game', 'wardogs']]);
    expect([...new URL(b![0]).searchParams.keys()]).toEqual(['sourceId', 'cursor', 'game']);
    for (const url of fetchImpl.mock.calls.map(([target]) => new URL(target))) {
      for (const forbidden of ['limit', 'page', 'sort', 'minMinutes', 'gameId', 'id']) expect(url.searchParams.has(forbidden), forbidden).toBe(false);
    }
    expect(a![1]).toMatchObject({ method: 'GET', redirect: 'manual', cache: 'no-store', credentials: 'omit' });
    expect(new Headers(a![1].headers).get('authorization')).toBe(`Bearer ${source.apiKey}`);
  });

  it('refuses an HLL source, an unapproved source ID, invalid filters and an unsafe cursor before any request', async () => {
    const fetchImpl = pagesFetch();
    expect(() => createHistoryReader({ ...source, gameId: 'hell_let_loose' as never }, { fetchImpl })).toThrow(LogiClientError);
    const reader = createHistoryReader(source, { fetchImpl });
    await expect(reader.readPage({ filters: { sourceId: OTHER_SOURCE }, cursor: null })).rejects.toMatchObject({ code: 'configuration' });
    await expect(reader.readPage({ filters: { ...filters, from: '2026-10-01T00:00:00Z', until: '2026-09-01T00:00:00Z' }, cursor: null })).rejects.toMatchObject({ code: 'configuration' });
    await expect(reader.readPage({ filters: { ...filters, limit: '50' } as never, cursor: null })).rejects.toMatchObject({ code: 'configuration' });
    await expect(reader.readPage({ filters, cursor: '' })).rejects.toMatchObject({ code: 'configuration' });
    await expect(reader.readPage({ filters, cursor: 'c'.repeat(8193) })).rejects.toMatchObject({ code: 'configuration' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects answers of another guild or source, a foreign game, an unknown key and a record newer than its page', async () => {
    const page = pages[2]!;
    const read = (value: unknown) => createHistoryReader(source, { fetchImpl: vi.fn<LogiFetch>().mockResolvedValue(json({ data: value })) }).readPage({ filters, cursor: null });
    await expect(read({ ...page, items: [{ ...page.items[0]!, guildId: '100000000000000002' }] })).rejects.toMatchObject({ code: 'scope_mismatch' });
    await expect(read({ ...page, items: [{ ...page.items[0]!, sourceId: OTHER_SOURCE }] })).rejects.toMatchObject({ code: 'scope_mismatch' });
    await expect(read({ ...page, items: [{ ...page.items[0]!, gameId: 'hell_let_loose' }] })).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(read({ ...page, items: [{ ...page.items[0]!, adminNote: 'private' }] })).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(read({ ...page, items: [{ ...page.items[0]!, revision: '8' }] })).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(read({ items: page.items, revision: '7', nextCursor: null })).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(createHistoryReader(source, { fetchImpl: vi.fn<LogiFetch>().mockResolvedValue(json({ data: page.items[0] })) }).readPage({ filters, cursor: null })).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it.each([
    [401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'], [410, 'reset_required'], [503, 'upstream'],
  ])('maps HTTP %s to %s without keeping the body', async (code, expected) => {
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValue(status(code));
    const error = await createHistoryReader(source, { fetchImpl }).readPage({ filters, cursor: null }).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(LogiClientError);
    expect(error).toMatchObject({ code: expected });
    expect(JSON.stringify(error)).not.toContain('secret-detail');
  });

  it('propagates 429 Retry-After and times out a hanging producer', async () => {
    const limited = vi.fn<LogiFetch>().mockResolvedValue(status(429, { 'retry-after': '120' }));
    await expect(createHistoryReader(source, { fetchImpl: limited }).readPage({ filters, cursor: null })).rejects.toMatchObject({ code: 'rate_limited', retryAfterMs: 120_000 });
    const hanging = vi.fn<LogiFetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    await expect(createHistoryReader(source, { fetchImpl: hanging, timeoutMs: 20 }).readPage({ filters, cursor: null })).rejects.toMatchObject({ code: 'timeout' });
  });
});

describe('scanHistory', () => {
  it('reads every page including an empty continuation and returns the records only at the end of the chain', async () => {
    const fetchImpl = pagesFetch();
    const result = await scanHistory(createHistoryReader(source, { fetchImpl }), filters);
    expect(result).toMatchObject({ revision: '7', lastCollectedAt: '2026-10-03T11:55:00.000Z', pages: 3, resets: 0 });
    expect(result.records).toHaveLength(24);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls.map(([target]) => new URL(target).searchParams.get('cursor'))).toEqual(cursorChain);
  });

  it('restarts after a 410 at most twice and then fails with reset_required', async () => {
    let calls = 0;
    const once = pagesFetch();
    const flaky = vi.fn<LogiFetch>().mockImplementation(async (input, init) => (calls++ === 1 ? status(410) : once(input, init)));
    const result = await scanHistory(createHistoryReader(source, { fetchImpl: flaky }), filters);
    expect(result).toMatchObject({ pages: 3, resets: 1 });
    expect(result.records).toHaveLength(24);
    expect(flaky.mock.calls.map(([target]) => new URL(target).searchParams.get('cursor'))).toEqual([null, SYNTHETIC_HISTORY_CURSORS[0], null, ...SYNTHETIC_HISTORY_CURSORS]);
    const always = vi.fn<LogiFetch>().mockResolvedValue(status(410));
    const error = await scanHistory(createHistoryReader(source, { fetchImpl: always }), filters).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(HistoryScanError);
    expect(error).toMatchObject({ reason: 'reset_required' });
    expect(always).toHaveBeenCalledTimes(3);
  });

  it('fails closed on a cursor loop, a revision change and an exhausted page budget', async () => {
    const loop = pagesFetch({ 1: { ...pages[1]!, nextCursor: SYNTHETIC_HISTORY_CURSORS[0] } });
    await expect(scanHistory(createHistoryReader(source, { fetchImpl: loop }), filters)).rejects.toMatchObject({ reason: 'repeated_cursor' });
    const drift = pagesFetch({ 2: { ...pages[2]!, revision: '8', items: pages[2]!.items.map((item) => ({ ...item, revision: '1' })) } });
    await expect(scanHistory(createHistoryReader(source, { fetchImpl: drift }), filters)).rejects.toMatchObject({ reason: 'revision_mismatch' });
    await expect(scanHistory(createHistoryReader(source, { fetchImpl: pagesFetch() }), filters, { maxPages: 2 })).rejects.toMatchObject({ reason: 'budget_exceeded' });
    await expect(scanHistory(createHistoryReader(source, { fetchImpl: pagesFetch() }), filters, { maxPages: 0 })).rejects.toMatchObject({ reason: 'configuration' });
    await expect(scanHistory(createHistoryReader(source, { fetchImpl: pagesFetch() }), filters, { maxPages: 1001 })).rejects.toMatchObject({ reason: 'configuration' });
  });

  it('distinguishes an abort by the caller from the time budget', async () => {
    const controller = new AbortController();
    let calls = 0;
    const once = pagesFetch();
    const aborting = vi.fn<LogiFetch>().mockImplementation(async (input, init) => {
      if (calls++ === 1) {
        controller.abort();
        return new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
      }
      return once(input, init);
    });
    await expect(scanHistory(createHistoryReader(source, { fetchImpl: aborting }), filters, { signal: controller.signal })).rejects.toMatchObject({ reason: 'aborted' });
    const already = new AbortController();
    already.abort();
    const untouched = pagesFetch();
    await expect(scanHistory(createHistoryReader(source, { fetchImpl: untouched }), filters, { signal: already.signal })).rejects.toMatchObject({ reason: 'aborted' });
    expect(untouched).not.toHaveBeenCalled();
    const hanging = vi.fn<LogiFetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    await expect(scanHistory(createHistoryReader(source, { fetchImpl: hanging }), filters, { timeBudgetMs: 30 })).rejects.toMatchObject({ reason: 'timeout' });
  });

  it.each([
    [401, 'unauthorized', null], [403, 'forbidden', null], [404, 'not_found', null], [429, 'rate_limited', 45_000], [503, 'upstream', null],
  ])('carries the transport category of HTTP %s as %s with Retry-After', async (code, reason, retryAfterMs) => {
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValue(status(code, code === 429 ? { 'retry-after': '45' } : {}));
    await expect(scanHistory(createHistoryReader(source, { fetchImpl }), filters)).rejects.toMatchObject({ reason, retryAfterMs });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe('synthetic history reader', () => {
  it('serves the cursor chain with local filters and nothing for another source', async () => {
    const reader = createSyntheticHistoryReader(now);
    const result = await scanHistory(reader, filters);
    expect(result.records).toHaveLength(24);
    const ridge = await scanHistory(reader, { ...filters, map: 'Synthetic Ridge' });
    expect(ridge.records.every((record) => record.session.map === 'Synthetic Ridge')).toBe(true);
    expect(ridge.records.length).toBe(7 + 1);
    expect((await scanHistory(reader, { sourceId: OTHER_SOURCE })).records).toEqual([]);
    await expect(reader.readPage({ filters, cursor: 'unknown-cursor' })).rejects.toMatchObject({ code: 'upstream' });
  });
});

describe('opaque player keys', () => {
  it('are 16 hex characters, stable per source and not reversible to the platform ID', () => {
    const key = createHistoryPlayerKey('scope-a', SYNTHETIC_HISTORY_SOURCE_ID);
    const value = key('steam', 'synthetic-steam-01');
    expect(value).toMatch(/^[0-9a-f]{16}$/);
    expect(key('steam', 'synthetic-steam-01')).toBe(value);
    expect(key('xbox', 'synthetic-steam-01')).not.toBe(value);
    expect(createHistoryPlayerKey('scope-a', OTHER_SOURCE)('steam', 'synthetic-steam-01')).not.toBe(value);
    expect(createHistoryPlayerKey('scope-b', SYNTHETIC_HISTORY_SOURCE_ID)('steam', 'synthetic-steam-01')).not.toBe(value);
    expect(value).not.toContain('synthetic');
  });
});

describe('public entry points', () => {
  const wardogs = { sourceInstanceId: 'local', origin: 'https://logi.example', guildId: SYNTHETIC_HISTORY_GUILD_ID, gameId: 'wardogs', publicServers: [{ connectionId: 'conn-a', publicId: 'community-one', name: 'Approved', published: true, address: null, statsUrl: null }] };

  it('render nothing without the history key or an approved source and serve the synthetic dataset in fixture mode', async () => {
    vi.stubEnv('LOGI_SOURCES_JSON', JSON.stringify([{ ...wardogs, historySources: [{ sourceId: SYNTHETIC_HISTORY_SOURCE_ID, publicId: 'community-one' }] }]));
    resetServerEnvForTests();
    expect(await getHistoryReport('community-one', DEFAULT_HISTORY_PUBLIC_FILTERS, now)).toBeNull();
    expect(listHistoryPublicIds()).toEqual([]);
    vi.stubEnv('LOGI_HISTORY_API_KEY_WDG', 'synthetic-history-key-not-a-credential');
    resetServerEnvForTests();
    expect(listHistoryPublicIds()).toEqual(['community-one']);
    expect(await getHistoryReport('community-two', DEFAULT_HISTORY_PUBLIC_FILTERS, now)).toBeNull();
    expect(await getHistoryGames('community-two', DEFAULT_HISTORY_PUBLIC_FILTERS, 1, now)).toBeNull();

    vi.stubEnv('LOGI_READERS_SOURCE', 'synthetic-fixture');
    resetServerEnvForTests();
    expect(listHistoryPublicIds()).toEqual([SYNTHETIC_WARCON_PUBLIC_ID]);
    expect(await getHistoryReport('community-one', DEFAULT_HISTORY_PUBLIC_FILTERS, now)).toBeNull();
    const report = await getHistoryReport(SYNTHETIC_WARCON_PUBLIC_ID, DEFAULT_HISTORY_PUBLIC_FILTERS, now);
    expect(report).toMatchObject({ publicId: SYNTHETIC_WARCON_PUBLIC_ID, state: 'fresh', synthetic: true, coverage: { kind: 'all', from: null }, refreshedAt: now.toISOString(), lastCollectedAt: '2026-10-03T11:55:00.000Z', games: 23, outcomes: { decided: 19, draw: 2, noResult: 1, unknown: 1 }, feedGames: 22, playersPublished: true, filters: { from: null, until: null, map: null, minMinutes: 60 } });
    expect(report?.players).toHaveLength(24);
    expect(report?.maps.map((map) => map.name)).toEqual(['Synthetic Harbour', 'Synthetic Training Ground', 'Synthetic Ridge']);
    expect(report?.factions.map((faction) => [faction.name, faction.wins])).toEqual([['Bravo', 8], ['Alpha', 6], ['Charlie', 5]]);
    expect(report?.players?.every((player) => player.name?.startsWith('[SYNTHETIC]'))).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/synthetic-steam|synthetic-xbox|synthetic-unknown|0123456789abcdef|sourceDigest|externalId|guildId|revision/);
    const filtered = await getHistoryReport(SYNTHETIC_WARCON_PUBLIC_ID, { from: null, until: null, map: 'Synthetic Ridge', minMinutes: 0 }, now);
    expect(filtered).toMatchObject({ games: 7, filters: { map: 'Synthetic Ridge', minMinutes: 0 } });
    expect(filtered?.maps).toHaveLength(3);
    const games = await getHistoryGames(SYNTHETIC_WARCON_PUBLIC_ID, DEFAULT_HISTORY_PUBLIC_FILTERS, 2, now);
    expect(games).toMatchObject({ state: 'fresh', synthetic: true, page: 2, pageSize: 20, total: 23, playersPublished: true });
    expect(games?.games).toHaveLength(3);
    expect(games?.games.every((game) => game.players !== null)).toBe(true);
    const first = await getHistoryGames(SYNTHETIC_WARCON_PUBLIC_ID, DEFAULT_HISTORY_PUBLIC_FILTERS, 1, now);
    expect(first?.games[0]?.id).toBe('synthetic-game-01');
    expect(first?.games.find((game) => game.id === 'synthetic-game-03')).toMatchObject({ winner: 'Bravo', outcome: 'decided' });
    await settleHistoryStoreForTests();
  });
});
