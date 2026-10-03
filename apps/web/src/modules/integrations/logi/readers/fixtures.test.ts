import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetServerEnvForTests } from '@/lib/env';
import { LogiClientError, type LogiFetch } from '../transport';
import { LEAGUE_CACHE_MS, type LeagueFixture } from './contracts';
import {
  createLeagueFixturesReader, getLeagueFixtures, LEAGUE_FIXTURES_MAX_PAGES, LEAGUE_FIXTURES_MIN_REFRESH_MS, leagueFixturesReaderStatus,
  observeLeagueFixtures, resetLeagueFixturesReaderForTests, settleLeagueFixturesReaderForTests,
} from './fixtures';
import { SYNTHETIC_LEAGUE_FIXTURE_IDS, syntheticLeagueFixtures } from './synthetic';

const start = new Date('2026-10-03T12:00:00.000Z');
const source = { origin: 'https://logi.example', apiKey: 'synthetic-league-key-not-a-credential', gameId: 'wardogs' as const, guildId: '100000000000000001', allowLoopbackHttp: false, environment: 'test' as const };
const json = (body: unknown, init?: ResponseInit) => Response.json(body, init);
const page = (items: LeagueFixture[], nextCursor: string | null = null) => json({ data: { items, nextCursor } });
/** Three synthetic fixtures observed shortly before `start` (alpha and bravo fresh, charlie stale). */
const fixtures = () => syntheticLeagueFixtures(start);
const fresh = (at: Date) => syntheticLeagueFixtures(at).slice(0, 2);

afterEach(() => {
  resetLeagueFixturesReaderForTests();
  vi.unstubAllEnvs();
  resetServerEnvForTests();
});

describe('League fixtures reader transport', () => {
  it('requests the collection with the page limit, Wardogs scope, bearer key and no-store, and follows the cursor', async () => {
    const [alpha, bravo, charlie] = fixtures();
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValueOnce(page([alpha!], 'cursor-1')).mockResolvedValueOnce(page([bravo!, charlie!]));
    const list = await createLeagueFixturesReader(source, { fetchImpl }).list();
    expect(list.truncated).toBe(false);
    expect(list.items.map((item) => item.id)).toEqual([SYNTHETIC_LEAGUE_FIXTURE_IDS.alpha, SYNTHETIC_LEAGUE_FIXTURE_IDS.bravo, SYNTHETIC_LEAGUE_FIXTURE_IDS.charlie]);
    const [first, second] = fetchImpl.mock.calls;
    expect(first![0]).toBe('https://logi.example/api/v1/clan/league-fixtures?limit=100&game=wardogs');
    expect(second![0]).toBe('https://logi.example/api/v1/clan/league-fixtures?limit=100&cursor=cursor-1&game=wardogs');
    expect(first![1]).toMatchObject({ method: 'GET', redirect: 'manual', cache: 'no-store', credentials: 'omit' });
    expect(new Headers(first![1].headers).get('authorization')).toBe(`Bearer ${source.apiKey}`);
  });

  it('stops after the page bound, reports truncation and keeps the first occurrence of a repeated fixture', async () => {
    const [alpha, bravo, charlie] = fixtures();
    const pages = [alpha!, bravo!, charlie!, { ...alpha!, revision: '9' }];
    const fetchImpl = vi.fn<LogiFetch>().mockImplementation(async (input) => {
      const cursor = new URL(input).searchParams.get('cursor');
      const index = cursor ? Number(cursor.replace('cursor-', '')) : 0;
      return page([pages[index % pages.length]!], `cursor-${index + 1}`);
    });
    const list = await createLeagueFixturesReader(source, { fetchImpl }).list();
    expect(fetchImpl).toHaveBeenCalledTimes(LEAGUE_FIXTURES_MAX_PAGES);
    expect(list).toMatchObject({ truncated: true });
    expect(list.items.map((item) => item.id)).toEqual([SYNTHETIC_LEAGUE_FIXTURE_IDS.alpha, SYNTHETIC_LEAGUE_FIXTURE_IDS.bravo, SYNTHETIC_LEAGUE_FIXTURE_IDS.charlie]);
    const repeated = vi.fn<LogiFetch>().mockResolvedValueOnce(page([alpha!], 'next')).mockResolvedValueOnce(page([{ ...alpha!, revision: '9' }, bravo!]));
    const deduped = await createLeagueFixturesReader(source, { fetchImpl: repeated }).list();
    expect(deduped.items.map((item) => [item.id, item.revision])).toEqual([[SYNTHETIC_LEAGUE_FIXTURE_IDS.alpha, '1'], [SYNTHETIC_LEAGUE_FIXTURE_IDS.bravo, '3']]);
  });

  it('refuses an HLL source and answers of another guild, game, match or URL', async () => {
    const [alpha] = fixtures();
    expect(() => createLeagueFixturesReader({ ...source, gameId: 'hell_let_loose' as never }, { fetchImpl: vi.fn<LogiFetch>() })).toThrow(LogiClientError);
    const read = (item: unknown) => createLeagueFixturesReader(source, { fetchImpl: vi.fn<LogiFetch>().mockResolvedValue(page([item as LeagueFixture])) }).list();
    await expect(read({ ...alpha!, guildId: '100000000000000002' })).rejects.toMatchObject({ code: 'scope_mismatch' });
    await expect(read({ ...alpha!, snapshot: { ...alpha!.snapshot, id: 'other' } })).rejects.toMatchObject({ code: 'scope_mismatch' });
    await expect(read({ ...alpha!, snapshot: { ...alpha!.snapshot, sourceUrl: 'https://wardogsleague.net/matches/other' } })).rejects.toMatchObject({ code: 'scope_mismatch' });
    await expect(read({ ...alpha!, snapshot: { ...alpha!.snapshot, sourceUrl: `https://wardogsleague.net/matches/${alpha!.id}/` } })).rejects.toMatchObject({ code: 'scope_mismatch' });
    await expect(read({ ...alpha!, snapshot: { ...alpha!.snapshot, sourceUrl: `https://evil.example/matches/${alpha!.id}` } })).rejects.toMatchObject({ code: 'scope_mismatch' });
    // A foreign game or an unknown field is a contract violation before any scope check.
    await expect(read({ ...alpha!, gameId: 'hell_let_loose' })).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(read({ ...alpha!, discordNote: 'private' })).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(createLeagueFixturesReader(source, { fetchImpl: vi.fn<LogiFetch>().mockResolvedValue(json({ data: { items: [] } })) }).list()).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it.each([
    [401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'], [503, 'upstream'],
  ])('maps HTTP %s to %s without keeping the body', async (status, code) => {
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'insufficient_scope', message: 'secret' } }), { status, headers: { 'content-type': 'application/json' } }));
    const error = await createLeagueFixturesReader(source, { fetchImpl }).list().catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(LogiClientError);
    expect(error).toMatchObject({ code, message: `Logi request failed: ${code}` });
    expect(JSON.stringify(error)).not.toContain('secret');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe('League fixtures last-known cache', () => {
  it('serves a fresh list, refreshes a due list in the background and keeps it as stale after a failed pull', async () => {
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValueOnce(page(fixtures()));
    const reader = createLeagueFixturesReader(source, { fetchImpl });
    const first = await observeLeagueFixtures(reader, 'scope-a', start);
    expect(first).toMatchObject({ state: 'fresh', synthetic: false, truncated: false });
    expect(first.items.map((item) => [item.id, item.state])).toEqual([[SYNTHETIC_LEAGUE_FIXTURE_IDS.alpha, 'fresh'], [SYNTHETIC_LEAGUE_FIXTURE_IDS.bravo, 'fresh'], [SYNTHETIC_LEAGUE_FIXTURE_IDS.charlie, 'stale']]);
    expect(leagueFixturesReaderStatus()).toMatchObject({ lastOutcome: 'ok', items: 3, truncated: false, lastAttemptAt: start.toISOString() });
    // Within the website minimum no request is repeated.
    await observeLeagueFixtures(reader, 'scope-a', new Date(start.getTime() + 30_000));
    expect(fetchImpl).toHaveBeenCalledOnce();
    fetchImpl.mockResolvedValueOnce(new Response(null, { status: 503 }));
    // The stale charlie snapshot makes the refresh due at the minimum; the page gets the last-known list at once.
    const during = await observeLeagueFixtures(reader, 'scope-a', new Date(start.getTime() + LEAGUE_FIXTURES_MIN_REFRESH_MS));
    expect(during).toMatchObject({ state: 'fresh', observedAt: first.observedAt });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await settleLeagueFixturesReaderForTests();
    const failed = await observeLeagueFixtures(reader, 'scope-a', new Date(start.getTime() + LEAGUE_FIXTURES_MIN_REFRESH_MS + 1000));
    expect(failed.state).toBe('stale');
    expect(failed.items.map((item) => item.state)).toEqual(['stale', 'stale', 'stale']);
    expect(leagueFixturesReaderStatus()).toMatchObject({ lastOutcome: 'upstream', items: 3 });
  });

  it('polls a fresh list when its oldest snapshot reaches the producer lifetime, never faster than the minimum', async () => {
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValue(page(fresh(start)));
    const reader = createLeagueFixturesReader(source, { fetchImpl });
    expect((await observeLeagueFixtures(reader, 'scope-b', start)).items).toHaveLength(2);
    // The bravo snapshot is 90 s old: the producer refresh is due in 3.5 minutes.
    await observeLeagueFixtures(reader, 'scope-b', new Date(start.getTime() + 3 * 60_000));
    expect(fetchImpl).toHaveBeenCalledOnce();
    await observeLeagueFixtures(reader, 'scope-b', new Date(start.getTime() + LEAGUE_CACHE_MS - 90_000 + 1000));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await settleLeagueFixturesReaderForTests();
    // An empty list is re-polled at the minimum.
    const empty = vi.fn<LogiFetch>().mockResolvedValue(page([]));
    const emptyReader = createLeagueFixturesReader(source, { fetchImpl: empty });
    expect(await observeLeagueFixtures(emptyReader, 'scope-c', start)).toMatchObject({ state: 'fresh', items: [], observedAt: null });
    await observeLeagueFixtures(emptyReader, 'scope-c', new Date(start.getTime() + LEAGUE_FIXTURES_MIN_REFRESH_MS - 1000));
    expect(empty).toHaveBeenCalledOnce();
    await observeLeagueFixtures(emptyReader, 'scope-c', new Date(start.getTime() + LEAGUE_FIXTURES_MIN_REFRESH_MS));
    expect(empty).toHaveBeenCalledTimes(2);
    await settleLeagueFixturesReaderForTests();
  });

  it('honours Retry-After, shares one in-flight request and records 404 and 403 outcomes', async () => {
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'rate_limited' } }), { status: 429, headers: { 'retry-after': '300', 'content-type': 'application/json' } }));
    const reader = createLeagueFixturesReader(source, { fetchImpl });
    const [a, b] = await Promise.all([observeLeagueFixtures(reader, 'scope-d', start), observeLeagueFixtures(reader, 'scope-d', start)]);
    expect(a.state).toBe('unavailable');
    expect(b.state).toBe('unavailable');
    expect(fetchImpl).toHaveBeenCalledOnce();
    await observeLeagueFixtures(reader, 'scope-d', new Date(start.getTime() + 4 * 60_000));
    expect(fetchImpl).toHaveBeenCalledOnce();
    fetchImpl.mockResolvedValueOnce(page(fresh(new Date(start.getTime() + 5 * 60_000))));
    expect((await observeLeagueFixtures(reader, 'scope-d', new Date(start.getTime() + 5 * 60_000 + 1000))).state).toBe('fresh');
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    // The status reports the latest attempt across sources; later attempts of other scopes follow.
    const notDeployed = createLeagueFixturesReader(source, { fetchImpl: vi.fn<LogiFetch>().mockResolvedValue(new Response(null, { status: 404 })) });
    expect((await observeLeagueFixtures(notDeployed, 'scope-e', new Date(start.getTime() + 10 * 60_000))).state).toBe('unavailable');
    expect(leagueFixturesReaderStatus()).toMatchObject({ lastOutcome: 'not_found', items: null });
    const forbidden = vi.fn<LogiFetch>().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'insufficient_scope' } }), { status: 403, headers: { 'content-type': 'application/json' } }));
    const noGrant = createLeagueFixturesReader(source, { fetchImpl: forbidden });
    const refusedAt = new Date(start.getTime() + 11 * 60_000);
    expect((await observeLeagueFixtures(noGrant, 'scope-f', refusedAt)).state).toBe('unavailable');
    expect(leagueFixturesReaderStatus()).toMatchObject({ lastOutcome: 'forbidden', items: null, lastAttemptAt: refusedAt.toISOString() });
    // The missing grant is backed off like any failure, not retried on every render.
    await observeLeagueFixtures(noGrant, 'scope-f', new Date(refusedAt.getTime() + 30_000));
    expect(forbidden).toHaveBeenCalledOnce();
  });

  it('never blocks a page on the producer once a list exists', async () => {
    let release: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValueOnce(page(fresh(start))).mockReturnValueOnce(pending);
    const reader = createLeagueFixturesReader(source, { fetchImpl });
    const first = await observeLeagueFixtures(reader, 'scope-g', start);
    const later = new Date(start.getTime() + 6 * 60_000);
    const second = await Promise.race([observeLeagueFixtures(reader, 'scope-g', later), new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 200))]);
    expect(second).toMatchObject({ observedAt: first.observedAt, state: 'fresh' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    release(page(fresh(later)));
    await settleLeagueFixturesReaderForTests();
    expect((await observeLeagueFixtures(reader, 'scope-g', new Date(later.getTime() + 1000))).observedAt).toBe(new Date(later.getTime() - 60_000).toISOString());
  });
});

describe('getLeagueFixtures', () => {
  it('renders nothing without a League key and serves labelled synthetic fixtures in fixture mode', async () => {
    vi.stubEnv('LOGI_SOURCES_JSON', JSON.stringify([{ sourceInstanceId: 'local', origin: 'https://logi.example', guildId: '100000000000000001', gameId: 'wardogs' }]));
    resetServerEnvForTests();
    expect(await getLeagueFixtures(start)).toBeNull();
    vi.stubEnv('LOGI_READERS_SOURCE', 'synthetic-fixture');
    resetServerEnvForTests();
    const synthetic = await getLeagueFixtures(start);
    expect(synthetic).toMatchObject({ state: 'fresh', synthetic: true, truncated: false });
    expect(synthetic?.items.map((item) => item.id)).toEqual([SYNTHETIC_LEAGUE_FIXTURE_IDS.alpha, SYNTHETIC_LEAGUE_FIXTURE_IDS.bravo, SYNTHETIC_LEAGUE_FIXTURE_IDS.charlie]);
    expect(synthetic?.items.every((item) => item.title.startsWith('[SYNTHETIC]'))).toBe(true);
  });
});
