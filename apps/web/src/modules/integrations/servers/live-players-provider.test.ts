import { afterEach, describe, expect, it } from 'vitest';
import { resetServerEnvForTests } from '@/lib/env';
import { getServerLivePlayers, observeLivePlayers, resetLivePlayersForTests } from './live-players-provider';

const now = new Date('2026-09-29T12:00:00Z');
const server = { publicId: 'alpha', name: 'Alpha', baseUrl: 'https://one.example.org', address: null, statsUrl: null };
const body = (time = now, stats: unknown[] = [{ player: '[SYN] Alpha', team: { side: 'axis' }, kills: 3 }], refresh = 15) => ({ result: { snapshot_timestamp: time.getTime() / 1000, stats, refresh_interval_sec: refresh } });

afterEach(() => { resetLivePlayersForTests(); delete process.env.SERVER_STATUS_SOURCE; delete process.env.HLL_SERVER_SOURCES_JSON; resetServerEnvForTests(); });

describe('live player shared cache', () => {
  it('deduplicates in-flight requests and reuses success for at least thirty seconds', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetcher = async () => { calls++; await gate; return Response.json(body()); };
    const first = observeLivePlayers(server, now, fetcher);
    const second = observeLivePlayers(server, now, fetcher);
    expect(calls).toBe(1);
    release();
    expect((await first).freshness).toBe('fresh');
    expect(await second).toEqual(await first);
    await observeLivePlayers(server, new Date(now.getTime() + 29_000), fetcher);
    expect(calls).toBe(1);
    await observeLivePlayers(server, new Date(now.getTime() + 30_000), fetcher);
    expect(calls).toBe(2);
  });

  it('honors a longer upstream refresh interval and keeps source time rather than fetch time', async () => {
    let calls = 0;
    const fetcher = async () => { calls++; return Response.json(body(new Date(now.getTime() - 180_000), [], 90)); };
    expect(await observeLivePlayers(server, now, fetcher)).toMatchObject({ state: 'ok', freshness: 'stale', players: [], observedAt: new Date(now.getTime() - 180_000).toISOString(), refreshAfterSeconds: 90 });
    await observeLivePlayers(server, new Date(now.getTime() + 60_000), fetcher);
    expect(calls).toBe(1);
  });

  it('retains failed refreshes as stale, rate limits failures, then expires old player data', async () => {
    let calls = 0;
    let fail = false;
    const fetcher = async () => { calls++; return fail ? new Response('', { status: 503 }) : Response.json(body()); };
    await observeLivePlayers(server, now, fetcher);
    fail = true;
    expect(await observeLivePlayers(server, new Date(now.getTime() + 31_000), fetcher)).toMatchObject({ state: 'ok', freshness: 'stale', observedAt: now.toISOString(), players: [{ name: '[SYN] Alpha' }] });
    await observeLivePlayers(server, new Date(now.getTime() + 32_000), fetcher);
    expect(calls).toBe(2);
    expect(await observeLivePlayers(server, new Date(now.getTime() + 31 * 60_000), fetcher)).toMatchObject({ state: 'unavailable', freshness: 'unavailable', players: [] });
  });

  it('does not turn first-request failure, future timestamps or missing snapshots into empty successful servers', async () => {
    for (const response of [new Response('', { status: 401 }), Response.json(body(new Date(now.getTime() + 60_000))), Response.json({ result: {} })]) {
      resetLivePlayersForTests();
      expect(await observeLivePlayers(server, now, async () => response)).toMatchObject({ state: 'unavailable', freshness: 'unavailable', observedAt: null, players: [] });
    }
  });

  it('does not reuse names from another source after a configured URL changes', async () => {
    await observeLivePlayers(server, now, async () => Response.json(body()));
    const changed = { ...server, baseUrl: 'https://two.example.org' };
    expect(await observeLivePlayers(changed, now, async () => new Response('', { status: 503 }))).toMatchObject({ state: 'unavailable', players: [] });
  });

  it('does not fetch an unknown public ID or an unconfigured game', async () => {
    process.env.SERVER_STATUS_SOURCE = 'crcon';
    process.env.HLL_SERVER_SOURCES_JSON = JSON.stringify([{ publicId: 'alpha', baseUrl: 'https://one.example.org' }]);
    resetServerEnvForTests();
    expect(await getServerLivePlayers('hll', 'https://untrusted.invalid', now)).toMatchObject({ state: 'not_configured', players: [] });
    expect(await getServerLivePlayers('wardogs', 'alpha', now)).toMatchObject({ state: 'not_configured', players: [] });
  });
});
