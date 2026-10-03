import { describe, expect, it, vi } from 'vitest';
import type { ServerBrowserData } from './browser';
import type { ServerSnapshot } from '../contract';
import { ageServerBrowserData } from './view';

const getData = vi.hoisted(() => vi.fn());
vi.mock('./browser', () => ({ getServerBrowserData: getData }));
import { GET } from '@/app/api/servers/[game]/route';

const now = new Date('2026-09-29T12:00:00Z');
const server: ServerSnapshot = { ref: { source: 'synthetic', sourceInstanceId: 'synthetic', guildId: null, game: 'hll', kind: 'server', externalId: 'alpha' }, publicId: 'alpha', name: '[SYN] Alpha', observedAt: now.toISOString(), freshness: 'fresh', reachability: 'online', map: 'Synthetic Map', mode: 'Warfare', players: 0, capacity: 100, score: { allied: 3, axis: 2 }, teams: { allied: 0, axis: 0 }, nextMap: 'Synthetic Next', timeRemainingSeconds: 300, connect: { kind: 'none' }, statsUrl: null };
const data: ServerBrowserData = { overview: { state: 'ok', servers: [server], synthetic: true, partial: false, attemptedAt: now.toISOString() }, livePlayers: { state: 'ok', publicId: 'alpha', observedAt: now.toISOString(), freshness: 'fresh', synthetic: true, refreshAfterSeconds: 30, players: [{ name: '[SYN] Previously connected', side: 'unknown', kills: 3, deaths: null, combat: null, offense: null, defense: null, support: null }] }, warcon: null };

describe('server polling projection', () => {
  it('ages paused snapshots and removes expired rows while preserving true zero population', () => {
    expect(ageServerBrowserData(data, now)).toEqual(data);
    const stale = ageServerBrowserData(data, new Date(now.getTime() + 121_000));
    expect(stale.overview).toMatchObject({ servers: [{ freshness: 'stale', players: 0, score: null, teams: null, timeRemainingSeconds: null }] });
    expect(stale.livePlayers).toMatchObject({ freshness: 'stale', players: [{ name: '[SYN] Previously connected' }] });
    const expired = ageServerBrowserData(data, new Date(now.getTime() + 31 * 60_000));
    expect(expired.overview).toMatchObject({ servers: [{ freshness: 'unavailable', players: null, map: null }] });
    expect(expired.livePlayers).toMatchObject({ state: 'unavailable', players: [] });
  });

  it('downgrades all recently received facts when polling fails and never upgrades a stale source', () => {
    const failed = ageServerBrowserData(data, now, true);
    expect(failed.overview).toMatchObject({ servers: [{ freshness: 'stale', reachability: 'unknown', score: null }] });
    expect(failed.livePlayers?.freshness).toBe('stale');
    expect(ageServerBrowserData(failed, now).livePlayers?.freshness).toBe('stale');
  });

  it('exposes only the provider projection, with no-store response headers', async () => {
    getData.mockResolvedValue(data);
    const response = await GET(new Request('https://valkyria.example/api/servers/hll?server=alpha'), { params: Promise.resolve({ game: 'hll' }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(data);
    expect(getData).toHaveBeenLastCalledWith('hll', 'alpha');
  });

  it.each(['server=https://untrusted.invalid', 'url=https://untrusted.invalid', 'server=alpha&server=bravo', 'server=../admin', 'server='])('rejects unknown/ambiguous request input: %s', async (query) => {
    getData.mockClear();
    expect((await GET(new Request(`https://valkyria.example/api/servers/hll?${query}`), { params: Promise.resolve({ game: 'hll' }) })).status).toBe(400);
    expect(getData).not.toHaveBeenCalled();
  });

  it('rejects games without a server section', async () => {
    expect((await GET(new Request('https://valkyria.example/api/servers/unknown'), { params: Promise.resolve({ game: 'unknown' }) })).status).toBe(404);
  });
});
