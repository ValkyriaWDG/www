import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetServerEnvForTests } from '@/lib/env';
import warconFixture from '../fixtures/warcon-v0.11.json';
import { LogiClientError, type LogiFetch } from '../transport';
import { toWarconLivePublic, toWarconRecentMatchesPublic } from './public';
import { SYNTHETIC_WARCON_PUBLIC_ID } from './synthetic';
import { createWarconReader, getWarconServersPublic, observeWarcon, observeWarconServer, resetWarconReaderForTests, warconReaderStatus } from './warcon';

const source = { origin: 'https://logi.example', apiKey: 'synthetic-warcon-key-not-a-credential', gameId: 'wardogs' as const, allowLoopbackHttp: false, environment: 'test' as const };
const connectionId = 'synthetic-warcon-connection';
const json = (body: unknown, init?: ResponseInit) => Response.json(body, init);
const liveAt = (at: Date) => ({ data: { ...warconFixture.live.data, fetchedAt: at.toISOString(), cacheUntil: new Date(at.getTime() + 10_000).toISOString(), result: { view: 'live', data: { ...warconFixture.live.data.result.data, observedAt: at.toISOString(), statusAt: at.toISOString(), playersAt: at.toISOString() } } } });
const matchesAt = (at: Date) => ({ data: { ...warconFixture.matches.data, fetchedAt: at.toISOString(), cacheUntil: new Date(at.getTime() + 60_000).toISOString() } });

afterEach(() => {
  resetWarconReaderForTests();
  vi.unstubAllEnvs();
  resetServerEnvForTests();
});

describe('Warcon reader transport', () => {
  it('reads only the live and first matches page of one approved connection with the Wardogs scope', async () => {
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValueOnce(json(warconFixture.live)).mockResolvedValueOnce(json(warconFixture.matches));
    const reader = createWarconReader(source, { fetchImpl });
    expect((await reader.live(connectionId)).result.view).toBe('live');
    expect((await reader.matches(connectionId)).result.view).toBe('matches');
    expect(fetchImpl.mock.calls.map(([target]) => target)).toEqual([
      `https://logi.example/api/v1/clan/warcon-data/${connectionId}?view=live&game=wardogs`,
      `https://logi.example/api/v1/clan/warcon-data/${connectionId}?view=matches&page=1&game=wardogs`,
    ]);
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init).toMatchObject({ redirect: 'manual', cache: 'no-store', credentials: 'omit' });
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${source.apiKey}`);
  });

  it('refuses an HLL source, an unsafe connection ID and a foreign connection or view in the answer', async () => {
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValue(json({ data: { ...warconFixture.live.data, connectionId: 'other-connection' } }));
    expect(() => createWarconReader({ ...source, gameId: 'hell_let_loose' as never }, { fetchImpl })).toThrow(LogiClientError);
    const reader = createWarconReader(source, { fetchImpl });
    await expect(reader.live('../admin')).rejects.toMatchObject({ code: 'configuration' });
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(reader.live(connectionId)).rejects.toMatchObject({ code: 'scope_mismatch' });
    fetchImpl.mockResolvedValue(json(warconFixture.matches));
    await expect(reader.live(connectionId)).rejects.toMatchObject({ code: 'scope_mismatch' });
  });

  it.each([[401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'], [503, 'upstream']])('maps HTTP %s to %s without keeping the body', async (status, code) => {
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'provider_unauthorized', message: 'token xyz' } }), { status, headers: { 'content-type': 'application/json' } }));
    const error = await createWarconReader(source, { fetchImpl }).live(connectionId).catch((failure: unknown) => failure);
    expect(error).toMatchObject({ code, message: `Logi request failed: ${code}` });
    expect(JSON.stringify(error)).not.toContain('xyz');
  });

  it('propagates 429 Retry-After and rejects redirects, malformed JSON, other views, extra fields and timeouts', async () => {
    const limited = vi.fn<LogiFetch>().mockResolvedValue(new Response(null, { status: 429, headers: { 'retry-after': '45' } }));
    await expect(createWarconReader(source, { fetchImpl: limited }).live(connectionId)).rejects.toMatchObject({ code: 'rate_limited', retryAfterMs: 45_000 });
    const redirect = vi.fn<LogiFetch>().mockResolvedValue(new Response(null, { status: 301, headers: { location: 'https://other.example/' } }));
    await expect(createWarconReader(source, { fetchImpl: redirect }).live(connectionId)).rejects.toMatchObject({ code: 'redirect' });
    const malformed = vi.fn<LogiFetch>().mockResolvedValue(new Response('<html>', { headers: { 'content-type': 'application/json' } }));
    await expect(createWarconReader(source, { fetchImpl: malformed }).live(connectionId)).rejects.toMatchObject({ code: 'invalid_response' });
    const health = vi.fn<LogiFetch>().mockResolvedValue(json({ data: { ...warconFixture.live.data, result: { view: 'health', data: { ok: true, token: 'never' } } } }));
    await expect(createWarconReader(source, { fetchImpl: health }).live(connectionId)).rejects.toMatchObject({ code: 'invalid_response' });
    const extra = vi.fn<LogiFetch>().mockResolvedValue(json({ data: { ...warconFixture.live.data, adminUrl: 'https://panel.example' } }));
    await expect(createWarconReader(source, { fetchImpl: extra }).live(connectionId)).rejects.toMatchObject({ code: 'invalid_response' });
    const hanging = vi.fn<LogiFetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    await expect(createWarconReader(source, { fetchImpl: hanging, timeoutMs: 20 }).live(connectionId)).rejects.toMatchObject({ code: 'timeout' });
  });
});

describe('Warcon last-known cache', () => {
  const start = new Date('2026-10-03T12:00:00.000Z');

  it('reuses the live view for 10 s and the matches view for 60 s with one shared in-flight request', async () => {
    const fetchImpl = vi.fn<LogiFetch>().mockImplementation(async (target) => json(target.includes('view=live') ? liveAt(start) : matchesAt(start)));
    const reader = createWarconReader(source, { fetchImpl });
    const [a, b] = await Promise.all([observeWarcon(reader, 'scope', connectionId, 'live', start), observeWarcon(reader, 'scope', connectionId, 'live', start)]);
    expect(a.answered && b.answered).toBe(true);
    await observeWarcon(reader, 'scope', connectionId, 'live', new Date(start.getTime() + 9_000));
    expect(fetchImpl).toHaveBeenCalledOnce();
    await observeWarcon(reader, 'scope', connectionId, 'live', new Date(start.getTime() + 10_000));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await observeWarcon(reader, 'scope', connectionId, 'matches', start);
    await observeWarcon(reader, 'scope', connectionId, 'matches', new Date(start.getTime() + 59_000));
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await observeWarcon(reader, 'scope', connectionId, 'matches', new Date(start.getTime() + 60_000));
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(warconReaderStatus()).toMatchObject({ lastOutcome: 'ok', cachedViews: 2 });
  });

  it('makes the live view unavailable immediately after a failed pull while recent matches stay as stale last-known data', async () => {
    const fetchImpl = vi.fn<LogiFetch>().mockImplementation(async (target) => json(target.includes('view=live') ? liveAt(start) : matchesAt(start)));
    const reader = createWarconReader(source, { fetchImpl });
    const connection = { connectionId, publicId: 'community-one' };
    const first = await observeWarconServer(reader, 'scope', connection, start, true);
    expect(first.live).toMatchObject({ freshness: 'fresh', map: 'Bakurani', scores: [{ name: 'Alpha', score: 0 }, { name: 'Bravo', score: 12 }, { name: 'Charlie', score: 7 }] });
    expect(first.recentMatches).toMatchObject({ freshness: 'fresh', matches: [{ id: 8 }, { id: 7 }] });
    expect(JSON.stringify(first)).not.toMatch(/steamId|serverId|gameServerId|connectionId|7656119|Synthetic Ranger/);
    fetchImpl.mockResolvedValue(new Response(null, { status: 503, headers: { 'retry-after': '30' } }));
    const later = new Date(start.getTime() + 61_000);
    const failed = await observeWarconServer(reader, 'scope', connection, later, true);
    expect(failed.live).toMatchObject({ freshness: 'unavailable', map: null, scores: [], observedAt: start.toISOString() });
    expect(failed.recentMatches).toMatchObject({ freshness: 'stale', observedAt: start.toISOString(), matches: [{ id: 8 }, { id: 7 }] });
    expect(warconReaderStatus().lastOutcome).toBe('upstream');
    // Retry-After 30 s keeps the live view from being polled again before that.
    const calls = fetchImpl.mock.calls.length;
    await observeWarcon(reader, 'scope', connectionId, 'live', new Date(later.getTime() + 20_000));
    expect(fetchImpl).toHaveBeenCalledTimes(calls);
    await observeWarcon(reader, 'scope', connectionId, 'live', new Date(later.getTime() + 30_000));
    expect(fetchImpl).toHaveBeenCalledTimes(calls + 1);
  });

  it('shows cached live facts as stale, not fresh, once the website clock passes the producer threshold', async () => {
    const fetchImpl = vi.fn<LogiFetch>().mockResolvedValue(json(liveAt(start)));
    const reader = createWarconReader(source, { fetchImpl });
    const observation = await observeWarcon(reader, 'scope', connectionId, 'live', start);
    const data = observation.envelope?.result.view === 'live' ? observation.envelope.result.data : null;
    expect(toWarconLivePublic('community-one', data, new Date(start.getTime() + 50_000), observation.answered)).toMatchObject({ freshness: 'stale', scores: [], map: 'Bakurani' });
    expect(toWarconLivePublic('community-one', data, new Date(start.getTime() + 181_000), observation.answered).freshness).toBe('unavailable');
    const recent = await observeWarcon(reader, 'scope', connectionId, 'matches', start);
    expect(toWarconRecentMatchesPublic('community-one', null, recent.envelope?.fetchedAt ?? null, start, recent.answered).freshness).toBe('unavailable');
  });
});

describe('getWarconServersPublic', () => {
  const sourceJson = (warconConnections: unknown[]) => JSON.stringify([{
    sourceInstanceId: 'local', origin: 'https://logi.example', guildId: '100000000000000001', gameId: 'wardogs',
    publicServers: [{ connectionId: 'conn-a', publicId: 'community-one', name: 'Approved', published: true, address: null, statsUrl: null }], warconConnections,
  }]);

  it('is null without a Warcon key and empty when no listed server has an approved connection', async () => {
    vi.stubEnv('LOGI_SOURCES_JSON', sourceJson([{ connectionId: 'conn-a', publicId: 'community-one' }]));
    resetServerEnvForTests();
    expect(await getWarconServersPublic(['community-one'], 'community-one')).toBeNull();
    vi.stubEnv('LOGI_WARCON_API_KEY_WDG', 'synthetic-warcon-key-not-a-credential');
    resetServerEnvForTests();
    expect(await getWarconServersPublic(['community-two'], null)).toEqual([]);
  });

  it('serves labelled synthetic facts for the synthetic Wardogs server only in fixture mode', async () => {
    vi.stubEnv('LOGI_READERS_SOURCE', 'synthetic-fixture');
    resetServerEnvForTests();
    expect(await getWarconServersPublic(['community-one'], null)).toEqual([]);
    const [entry] = (await getWarconServersPublic([SYNTHETIC_WARCON_PUBLIC_ID], SYNTHETIC_WARCON_PUBLIC_ID)) ?? [];
    expect(entry).toMatchObject({ publicId: SYNTHETIC_WARCON_PUBLIC_ID, synthetic: true, live: { freshness: 'fresh', map: 'Synthetic Training Ground', playerCount: 12 } });
    expect(entry?.recentMatches?.matches).toHaveLength(5);
    expect(JSON.stringify(entry)).not.toMatch(/steamId|7656119|Never Public|join-code|serverId/);
    const [withoutRecent] = (await getWarconServersPublic([SYNTHETIC_WARCON_PUBLIC_ID], null)) ?? [];
    expect(withoutRecent?.recentMatches).toBeNull();
  });
});
