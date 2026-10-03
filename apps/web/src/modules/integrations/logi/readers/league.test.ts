import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetServerEnvForTests } from '@/lib/env';
import leagueFixture from '../fixtures/league-v0.12-stale-http.json';
import { LogiClientError, type LogiFetch } from '../transport';
import { leagueReadSchema } from './contracts';
import { createLeagueReader, getLeagueMatchPreview, leagueReaderStatus, LEAGUE_MIN_REFRESH_MS, observeLeaguePreview, resetLeagueReaderForTests } from './league';

const source = { origin: 'https://logi.example', apiKey: 'synthetic-league-key-not-a-credential', gameId: 'wardogs' as const, allowLoopbackHttp: false, environment: 'test' as const };
const url = 'https://wardogsleague.net/matches/cmuqt8ep605e1lf018w2nlywu';
const json = (body: unknown, init?: ResponseInit) => Response.json(body, init);
const freshRead = (fetchedAt: Date) => ({ ...leagueFixture.stale, stale: false, error: null, ageSeconds: 10, snapshot: { ...leagueFixture.stale.snapshot, fetchedAt: fetchedAt.toISOString() }, nextRefreshAt: new Date(fetchedAt.getTime() + 5 * 60_000).toISOString() });

afterEach(() => {
  resetLeagueReaderForTests();
  vi.unstubAllEnvs();
  resetServerEnvForTests();
});

describe('League reader transport', () => {
  it('sends the canonical URL, Wardogs scope, bearer key and no-store without following the trailing slash', async () => {
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValue(json({ data: leagueFixture.stale }));
    const read = await createLeagueReader(source, { fetchImpl }).read(`${url}/`);
    expect(leagueReadSchema.parse(read).snapshot?.id).toBe('cmuqt8ep605e1lf018w2nlywu');
    const [target, init] = fetchImpl.mock.calls[0]!;
    expect(target).toBe(`https://logi.example/api/v1/clan/league-matches?url=${encodeURIComponent(url)}&game=wardogs`);
    expect(init).toMatchObject({ method: 'GET', redirect: 'manual', cache: 'no-store', credentials: 'omit' });
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${source.apiKey}`);
  });

  it('refuses an HLL source, an unaccepted URL and a snapshot of another match before or after the request', async () => {
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValue(json({ data: { ...leagueFixture.stale, snapshot: { ...leagueFixture.stale.snapshot, id: 'other', sourceUrl: 'https://wardogsleague.net/matches/other' } } }));
    expect(() => createLeagueReader({ ...source, gameId: 'hell_let_loose' as never }, { fetchImpl })).toThrow(LogiClientError);
    const reader = createLeagueReader(source, { fetchImpl });
    await expect(reader.read('https://wardogsleague.net/matches/abc?x=1')).rejects.toMatchObject({ code: 'configuration' });
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(reader.read(url)).rejects.toMatchObject({ code: 'scope_mismatch' });
  });

  it.each([
    [401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'], [503, 'upstream'], [500, 'upstream'],
  ])('maps HTTP %s to %s without keeping the body', async (status, code) => {
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'private-detail', message: 'secret' } }), { status, headers: { 'content-type': 'application/json' } }));
    const error = await createLeagueReader(source, { fetchImpl }).read(url).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(LogiClientError);
    expect(error).toMatchObject({ code, message: `Logi request failed: ${code}` });
    expect(JSON.stringify(error)).not.toContain('secret');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('propagates 429 Retry-After, rejects redirects, malformed JSON, schema violations and times out', async () => {
    const limited = vi.fn<LogiFetch>().mockResolvedValue(new Response(JSON.stringify({ data: leagueFixture.cooldown }), { status: 429, headers: { 'retry-after': '120', 'content-type': 'application/json' } }));
    await expect(createLeagueReader(source, { fetchImpl: limited }).read(url)).rejects.toMatchObject({ code: 'rate_limited', retryAfterMs: 120_000 });
    const redirect = vi.fn<LogiFetch>().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://other.example/' } }));
    await expect(createLeagueReader(source, { fetchImpl: redirect }).read(url)).rejects.toMatchObject({ code: 'redirect' });
    const malformed = vi.fn<LogiFetch>().mockResolvedValue(new Response('{not json', { headers: { 'content-type': 'application/json' } }));
    await expect(createLeagueReader(source, { fetchImpl: malformed }).read(url)).rejects.toMatchObject({ code: 'invalid_response' });
    const violating = vi.fn<LogiFetch>().mockResolvedValue(json({ data: { ...leagueFixture.stale, snapshot: { ...leagueFixture.stale.snapshot, results: { winner: 'VLK' } } } }));
    await expect(createLeagueReader(source, { fetchImpl: violating }).read(url)).rejects.toMatchObject({ code: 'invalid_response' });
    const hanging = vi.fn<LogiFetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    await expect(createLeagueReader(source, { fetchImpl: hanging, timeoutMs: 20 }).read(url)).rejects.toMatchObject({ code: 'timeout' });
    const failing = vi.fn<LogiFetch>().mockRejectedValue(new TypeError('fetch failed: https://logi.example/?key=secret'));
    const error = await createLeagueReader(source, { fetchImpl: failing }).read(url).catch((failure: unknown) => failure);
    expect(error).toMatchObject({ code: 'network' });
    expect(String(error)).not.toContain('secret');
  });
});

describe('League last-known cache', () => {
  const start = new Date('2026-10-03T12:00:00.000Z');

  it('serves a fresh preview, keeps it as stale after a failed pull and drops it after the public maximum age', async () => {
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValueOnce(json({ data: freshRead(new Date(start.getTime() - 30_000)) }));
    const reader = createLeagueReader(source, { fetchImpl });
    const first = await observeLeaguePreview(reader, 'scope-a', `${url}/`, start);
    expect(first).toMatchObject({ state: 'fresh', title: 'VLK · ROG · BAMC', sourceUrl: url });
    expect(leagueReaderStatus()).toMatchObject({ lastOutcome: 'ok', cachedPreviews: 1 });
    // Within the producer refresh window no request is repeated.
    expect((await observeLeaguePreview(reader, 'scope-a', url, new Date(start.getTime() + 30_000))).state).toBe('fresh');
    expect(fetchImpl).toHaveBeenCalledOnce();
    fetchImpl.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const failed = await observeLeaguePreview(reader, 'scope-a', url, new Date(start.getTime() + 6 * 60_000));
    expect(failed).toMatchObject({ state: 'stale', title: 'VLK · ROG · BAMC', observedAt: first.observedAt });
    expect(leagueReaderStatus().lastOutcome).toBe('upstream');
    fetchImpl.mockResolvedValue(new Response(null, { status: 503 }));
    expect((await observeLeaguePreview(reader, 'scope-a', url, new Date(start.getTime() + 20 * 60_000))).state).toBe('unavailable');
  });

  it('honours Retry-After and nextRefreshAt, never polls faster than the minimum and shares one in-flight request', async () => {
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValue(new Response(JSON.stringify({ data: leagueFixture.cooldown }), { status: 429, headers: { 'retry-after': '300', 'content-type': 'application/json' } }));
    const reader = createLeagueReader(source, { fetchImpl });
    const [a, b] = await Promise.all([observeLeaguePreview(reader, 'scope-b', url, start), observeLeaguePreview(reader, 'scope-b', url, start)]);
    expect(a.state).toBe('unavailable');
    expect(b.state).toBe('unavailable');
    expect(fetchImpl).toHaveBeenCalledOnce();
    await observeLeaguePreview(reader, 'scope-b', url, new Date(start.getTime() + 4 * 60_000));
    expect(fetchImpl).toHaveBeenCalledOnce();
    fetchImpl.mockResolvedValueOnce(json({ data: { ...freshRead(new Date(start.getTime() + 5 * 60_000)), nextRefreshAt: new Date(start.getTime() + 5 * 60_000 + 10_000).toISOString() } }));
    expect((await observeLeaguePreview(reader, 'scope-b', url, new Date(start.getTime() + 5 * 60_000 + 1000))).state).toBe('fresh');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // The producer's refresh time (10 s ahead) is below the website minimum, which still applies.
    await observeLeaguePreview(reader, 'scope-b', url, new Date(start.getTime() + 5 * 60_000 + 30_000));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await observeLeaguePreview(reader, 'scope-b', url, new Date(start.getTime() + 5 * 60_000 + 1000 + LEAGUE_MIN_REFRESH_MS));
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('treats a producer read with stale/error flags as last-known data and a 404 as not deployed', async () => {
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValueOnce(json({ data: { ...leagueFixture.stale, snapshot: { ...leagueFixture.stale.snapshot, fetchedAt: new Date(start.getTime() - 60_000).toISOString() } } }));
    const reader = createLeagueReader(source, { fetchImpl });
    expect((await observeLeaguePreview(reader, 'scope-c', url, start)).state).toBe('stale');
    fetchImpl.mockResolvedValue(new Response(null, { status: 404 }));
    await observeLeaguePreview(reader, 'scope-c', 'https://wardogsleague.net/matches/another', new Date(start.getTime() + 1000));
    expect(leagueReaderStatus()).toMatchObject({ lastOutcome: 'not_found', cachedPreviews: 2 });
  });

  it('returns an unavailable preview for a rejected URL without any request', async () => {
    const fetchImpl = vi.fn<LogiFetch>();
    expect((await observeLeaguePreview(createLeagueReader(source, { fetchImpl }), 'scope-d', 'https://evil.example/matches/x', start)).state).toBe('unavailable');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('getLeagueMatchPreview', () => {
  it('is unavailable without a league key and labelled synthetic in fixture mode', async () => {
    vi.stubEnv('LOGI_SOURCES_JSON', JSON.stringify([{ sourceInstanceId: 'local', origin: 'https://logi.example', guildId: '100000000000000001', gameId: 'wardogs' }]));
    resetServerEnvForTests();
    expect(await getLeagueMatchPreview(url)).toMatchObject({ state: 'unavailable', sourceUrl: url });
    vi.stubEnv('LOGI_READERS_SOURCE', 'synthetic-fixture');
    resetServerEnvForTests();
    const synthetic = await getLeagueMatchPreview(`${url}/`);
    expect(synthetic).toMatchObject({ state: 'fresh', synthetic: true, sourceUrl: url });
    expect(synthetic.title).toContain('[SYNTHETIC]');
    expect((await getLeagueMatchPreview('https://evil.example/matches/x')).state).toBe('unavailable');
  });
});
