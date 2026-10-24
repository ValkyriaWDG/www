import { describe, expect, it, vi } from 'vitest';
import { createLogiClient } from '../logi/client';
import { logiServerSnapshotSchema } from '../logi/contracts';
import fixture from '../logi/fixtures/v0.5.json';
import { createLogiServerCache, LOGI_SERVER_REFRESH_MS } from './logi';

const servers = fixture.snapshots.data.map((row) => logiServerSnapshotSchema.parse(row));

describe('direct Logi server collection', () => {
  function setup(game = 'hell_let_loose' as 'hell_let_loose' | 'wardogs') {
    let time = 100_000;
    const server = servers.find((row) => row.gameId === game)!;
    const fetchImpl = vi.fn(async () => Response.json({ data: [server], page: { nextCursor: null, limit: 100 } }));
    const reader = createLogiClient({
      sourceInstanceId: 'test-source', guildId: server.guildId, gameId: game,
      origin: 'https://logi.example.test', apiKey: 'synthetic-restricted-key', resources: ['server-snapshots'],
    }, { fetchImpl });
    return { server, fetchImpl, cache: createLogiServerCache(reader, () => time), advance: (ms = LOGI_SERVER_REFRESH_MS) => { time += ms; } };
  }

  it.each(['hell_let_loose', 'wardogs'] as const)('polls %s live state independently of persisted synchronization', async (game) => {
    const { server, cache, fetchImpl, advance } = setup(game);
    expect(await cache.read()).toEqual({ rows: [server], available: true });
    expect(await cache.read()).toEqual({ rows: [server], available: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, request] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/api/v1/clan/server-snapshots');
    expect(new URL(url).searchParams.get('game')).toBe(game);
    expect(request).toMatchObject({ cache: 'no-store', redirect: 'manual', credentials: 'omit', headers: { Authorization: 'Bearer synthetic-restricted-key' } });
    advance();
    fetchImpl.mockResolvedValue(Response.json({ data: [{ ...server, players: 17 }], page: { nextCursor: null, limit: 100 } }));
    expect((await cache.read()).rows[0]?.players).toBe(17);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('deduplicates simultaneous reads and keeps old observations stale after network failure', async () => {
    const { server, cache, fetchImpl, advance } = setup();
    await Promise.all([cache.read(), cache.read(), cache.read()]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    advance();
    fetchImpl.mockRejectedValue(new Error('offline'));
    expect(await cache.read()).toEqual({ rows: [server], available: false });
    await cache.read();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403])('clears cached data after grant refusal %s', async (status) => {
    const { cache, fetchImpl, advance } = setup();
    await cache.read();
    advance();
    fetchImpl.mockResolvedValue(new Response(null, { status }));
    expect(await cache.read()).toEqual({ rows: [], available: false });
  });

  it('rejects foreign game/guild responses and never accepts a partial pagination baseline', async () => {
    const { server, cache, fetchImpl, advance } = setup();
    await cache.read();
    advance();
    fetchImpl.mockResolvedValue(Response.json({ data: [{ ...server, guildId: 'another-guild' }], page: { nextCursor: null, limit: 100 } }));
    expect(await cache.read()).toEqual({ rows: [], available: false });
    advance(30_000);
    fetchImpl.mockResolvedValueOnce(Response.json({ data: [server], page: { nextCursor: 'next', limit: 100 } }));
    fetchImpl.mockResolvedValue(new Response(null, { status: 503 }));
    expect(await cache.read()).toEqual({ rows: [], available: false });
  });

  it('atomically removes missing connections and refuses repeated cursors', async () => {
    const { server, cache, fetchImpl, advance } = setup();
    await cache.read();
    advance();
    fetchImpl.mockResolvedValue(Response.json({ data: [], page: { nextCursor: null, limit: 100 } }));
    expect(await cache.read()).toEqual({ rows: [], available: true });
    advance();
    fetchImpl.mockResolvedValue(Response.json({ data: [server], page: { nextCursor: 'loop', limit: 100 } }));
    expect(await cache.read()).toEqual({ rows: [], available: false });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('honours bounded rate-limit backoff without relabelling the observation as current', async () => {
    const { server, cache, fetchImpl, advance } = setup();
    await cache.read();
    advance();
    fetchImpl.mockResolvedValue(new Response(null, { status: 429, headers: { 'Retry-After': '120' } }));
    expect(await cache.read()).toEqual({ rows: [server], available: false });
    advance(119_000);
    expect((await cache.read()).available).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    advance(1_000);
    fetchImpl.mockResolvedValue(Response.json({ data: [server], page: { nextCursor: null, limit: 100 } }));
    expect((await cache.read()).available).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('caps long collections at five pages and publishes no partial result', async () => {
    const { cache, fetchImpl } = setup();
    for (let page = 0; page < 5; page++) fetchImpl.mockResolvedValueOnce(Response.json({ data: [], page: { nextCursor: `page-${page}`, limit: 100 } }));
    expect(await cache.read()).toEqual({ rows: [], available: false });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });
});
