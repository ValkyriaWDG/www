import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetServerEnvForTests } from '@/lib/env';
import type { CrconServerConfig } from './crcon';
import { syntheticPublicInfo } from './crcon-fixtures';
import { crconSource, getServerOverview, resetServerStatusForTests } from './provider';
import { getLogiServerOverview } from '../logi-public';

vi.mock('../logi-public', () => ({ getLogiServerOverview: vi.fn(async () => ({ state: 'not_configured' })) }));

const now = new Date('2026-09-28T12:00:00Z');

function configure(source?: string, scenario?: string) {
  if (source === undefined) delete process.env.SERVER_STATUS_SOURCE;
  else process.env.SERVER_STATUS_SOURCE = source;
  if (scenario === undefined) delete process.env.SERVER_STATUS_FIXTURE_SCENARIO;
  else process.env.SERVER_STATUS_FIXTURE_SCENARIO = scenario;
  resetServerEnvForTests();
}

afterEach(() => {
  delete process.env.SERVER_STATUS_SOURCE_WDG;
  vi.clearAllMocks();
  configure();
  resetServerStatusForTests();
});

describe('server status provider', () => {
  it('is not configured by default and never invents servers', async () => {
    configure();
    expect(await getServerOverview('hll', now)).toEqual({ state: 'not_configured' });
    configure('');
    expect(await getServerOverview('hll', now)).toEqual({ state: 'not_configured' });
  });

  it('serves labelled synthetic snapshots with explicit freshness and no raw source fields', async () => {
    configure('synthetic-fixture', 'mixed');
    const overview = await getServerOverview('hll', now);
    expect(overview.state).toBe('ok');
    if (overview.state !== 'ok') return;
    expect(overview.synthetic).toBe(true);
    expect(overview.servers.map((server) => [server.publicId, server.freshness])).toEqual([
      ['synthetic-alpha', 'fresh'],
      ['synthetic-bravo', 'stale'],
      ['synthetic-charlie', 'unavailable'],
    ]);
    expect(overview.servers.every((server) => server.name.startsWith('[SYNTHETIC]'))).toBe(true);
    expect(overview.servers[2]).toMatchObject({ reachability: 'unknown', players: null, map: null, observedAt: null });
    expect(overview.servers[0]?.ref.game).toBe('hll');
  });

  it('keeps the Wardogs three-team observation separate from HLL', async () => {
    configure('synthetic-fixture', 'mixed');
    const overview = await getServerOverview('wardogs', now);
    if (overview.state !== 'ok') throw new Error('expected ok');
    expect(overview.servers).toHaveLength(1);
    expect(overview.servers[0]).toMatchObject({ ref: { game: 'wardogs' }, players: 0, capacity: 98, score: null, teamScores: [{ id: 'alpha', score: 0 }, { id: 'bravo', score: 12 }, { id: 'charlie', score: 7 }] });
    configure('synthetic-fixture', 'unavailable');
    expect(await getServerOverview('wardogs', now)).toMatchObject({ state: 'unavailable', servers: [{ freshness: 'stale', teamScores: null }] });
  });

  it('routes Wardogs to Logi independently of the HLL source, with explicit disable and inheritance', async () => {
    process.env.SERVER_STATUS_SOURCE_WDG = 'logi';
    configure('crcon');
    await getServerOverview('wardogs', now);
    expect(getLogiServerOverview).toHaveBeenCalledExactlyOnceWith('wardogs', now);
    await getServerOverview('hll', now, crconSource([]));
    expect(getLogiServerOverview).toHaveBeenCalledTimes(1);
    process.env.SERVER_STATUS_SOURCE_WDG = 'none';
    configure('synthetic-fixture');
    expect(await getServerOverview('wardogs', now)).toEqual({ state: 'not_configured' });
    expect(await getServerOverview('hll', now)).toMatchObject({ state: 'ok' });
    process.env.SERVER_STATUS_SOURCE_WDG = '';
    configure('synthetic-fixture');
    expect(await getServerOverview('wardogs', now)).toMatchObject({ state: 'ok' });
  });

  it('reports a source failure as unavailable and shows only still-relevant last known rows as stale', async () => {
    configure('synthetic-fixture', 'mixed');
    await getServerOverview('hll', now);
    configure('synthetic-fixture', 'unavailable');
    const later = new Date(now.getTime() + 5 * 60_000);
    const overview = await getServerOverview('hll', later);
    expect(overview.state).toBe('unavailable');
    if (overview.state !== 'unavailable') return;
    expect(overview.servers.map((server) => [server.publicId, server.freshness])).toEqual([
      ['synthetic-alpha', 'stale'],
      ['synthetic-bravo', 'stale'],
    ]);
  });

  it('distinguishes a configured but empty set', async () => {
    configure('synthetic-fixture', 'empty');
    expect(await getServerOverview('hll', now)).toMatchObject({ state: 'ok', servers: [] });
  });

  it('shows round details only while an observation is fresh', async () => {
    configure('synthetic-fixture', 'mixed');
    const overview = await getServerOverview('hll', now);
    if (overview.state !== 'ok') throw new Error('expected ok');
    expect(overview.servers[0]).toMatchObject({ nextMap: 'Synthetic Map East', timeRemainingSeconds: 3252, score: { allied: 3, axis: 2 }, teams: { allied: 33, axis: 31 } });
    expect(overview.servers[1]).toMatchObject({ freshness: 'stale', map: 'Synthetic Map South', nextMap: null, timeRemainingSeconds: null, score: null });
  });
});

describe('CRCON server status source', () => {
  const servers: CrconServerConfig[] = [
    { publicId: 'valkyria-1', name: 'Valkyria #1', baseUrl: 'https://one.example.org', address: 'one.example.org:7777', statsUrl: 'https://stats.example.org/' },
    { publicId: 'valkyria-2', name: null, baseUrl: 'https://two.example.org', address: null, statsUrl: null },
  ];
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

  it('observes every configured server, preferring the configured display name', async () => {
    const calls: string[] = [];
    const source = crconSource(servers, async (url) => {
      calls.push(url.toString());
      return json(syntheticPublicInfo({ name: { name: `[SYNTHETIC] ${url.hostname}` } }));
    });
    const overview = await getServerOverview('hll', now, source);
    expect(calls).toEqual(['https://one.example.org/api/get_public_info', 'https://two.example.org/api/get_public_info']);
    expect(overview).toMatchObject({ state: 'ok', synthetic: false, partial: false });
    if (overview.state !== 'ok') return;
    expect(overview.servers.map((server) => [server.publicId, server.name, server.freshness, server.reachability])).toEqual([
      ['valkyria-1', 'Valkyria #1', 'fresh', 'online'],
      ['valkyria-2', '[SYNTHETIC] two.example.org', 'fresh', 'online'],
    ]);
    expect(overview.servers[0]).toMatchObject({
      ref: { source: 'crcon', game: 'hll', kind: 'server' },
      map: 'Synthetic Map North',
      mode: 'Warfare',
      nextMap: 'Synthetic Map East',
      players: 64,
      capacity: 100,
      score: { allied: 3, axis: 2 },
      connect: { kind: 'address', address: 'one.example.org:7777' },
      statsUrl: 'https://stats.example.org/',
      observedAt: now.toISOString(),
    });
    // A second view within the cache window reuses the observations.
    await getServerOverview('hll', new Date(now.getTime() + 5000), source);
    expect(calls).toHaveLength(2);
  });

  it('keeps answering servers when one fails, and marks the failed one unknown', async () => {
    const source = crconSource(servers, async (url) => (url.hostname === 'two.example.org' ? new Response('down', { status: 503 }) : json(syntheticPublicInfo())));
    const overview = await getServerOverview('hll', now, source);
    expect(overview).toMatchObject({ state: 'ok', partial: true });
    if (overview.state !== 'ok') return;
    expect(overview.servers[1]).toMatchObject({ publicId: 'valkyria-2', name: 'valkyria-2', reachability: 'unknown', freshness: 'unavailable', players: null, map: null });
  });

  it('turns a later failure into a stale last known row, and an outage of all servers into unavailable', async () => {
    let healthy = true;
    const source = crconSource(servers, async () => (healthy ? json(syntheticPublicInfo()) : new Response('down', { status: 500 })));
    await getServerOverview('hll', now, source);
    healthy = false;
    const later = new Date(now.getTime() + 5 * 60_000);
    const overview = await getServerOverview('hll', later, source);
    expect(overview.state).toBe('unavailable');
    if (overview.state !== 'unavailable') return;
    expect(overview.servers.map((server) => [server.publicId, server.freshness, server.reachability, server.score])).toEqual([
      ['valkyria-1', 'stale', 'unknown', null],
      ['valkyria-2', 'stale', 'unknown', null],
    ]);
  });

  it('keeps configured servers selectable when every first observation fails', async () => {
    const source = crconSource(servers, async () => new Response('down', { status: 503 }));
    const overview = await getServerOverview('hll', now, source);
    expect(overview.state).toBe('unavailable');
    if (overview.state !== 'unavailable') return;
    expect(overview.servers.map((server) => [server.publicId, server.freshness, server.players, server.observedAt])).toEqual([
      ['valkyria-1', 'unavailable', null, null],
      ['valkyria-2', 'unavailable', null, null],
    ]);
    expect(overview.servers[0]?.name).toBe('Valkyria #1');
  });

  it('downgrades a failure within the fresh window to stale without round details', async () => {
    let failing: string[] = [];
    const source = crconSource(servers, async (url) => (failing.includes(url.hostname) ? new Response('down', { status: 503 }) : json(syntheticPublicInfo())));
    await getServerOverview('hll', now, source);
    // After the 15-second cache, well inside the 2-minute fresh window.
    failing = ['two.example.org'];
    const partial = await getServerOverview('hll', new Date(now.getTime() + 20_000), source);
    expect(partial).toMatchObject({ state: 'ok', partial: true });
    if (partial.state !== 'ok') return;
    expect(partial.servers[0]).toMatchObject({ publicId: 'valkyria-1', freshness: 'fresh', reachability: 'online', score: { allied: 3, axis: 2 } });
    expect(partial.servers[1]).toMatchObject({
      publicId: 'valkyria-2',
      freshness: 'stale',
      reachability: 'unknown',
      map: 'Synthetic Map North',
      observedAt: now.toISOString(),
      nextMap: null,
      timeRemainingSeconds: null,
      score: null,
      teams: null,
    });

    failing = ['one.example.org', 'two.example.org'];
    const outage = await getServerOverview('hll', new Date(now.getTime() + 40_000), source);
    expect(outage.state).toBe('unavailable');
    if (outage.state !== 'unavailable') return;
    expect(outage.servers.map((server) => [server.publicId, server.freshness, server.reachability, server.score, server.teams, server.timeRemainingSeconds])).toEqual([
      ['valkyria-1', 'stale', 'unknown', null, null, null],
      ['valkyria-2', 'stale', 'unknown', null, null, null],
    ]);
  });

  it('downgrades recent last known rows to stale when the whole source throws', async () => {
    let down = false;
    const source = {
      synthetic: false,
      async list() {
        if (down) throw new Error('synthetic source timeout');
        return [{ kind: 'ok' as const, observation: { id: 'valkyria-1', publicId: 'valkyria-1', name: 'Valkyria #1', reachability: 'online' as const, map: 'Synthetic Map North', mode: 'Warfare', players: 64, capacity: 100, nextMap: 'Synthetic Map East', timeRemainingSeconds: 1200, score: { allied: 3, axis: 2 }, teams: { allied: 32, axis: 32 }, address: null, statsUrl: null, observedAt: now } }];
      },
    };
    await getServerOverview('hll', now, source);
    down = true;
    const overview = await getServerOverview('hll', new Date(now.getTime() + 20_000), source);
    expect(overview.state).toBe('unavailable');
    if (overview.state !== 'unavailable') return;
    expect(overview.servers).toHaveLength(1);
    expect(overview.servers[0]).toMatchObject({ freshness: 'stale', reachability: 'unknown', map: 'Synthetic Map North', nextMap: null, timeRemainingSeconds: null, score: null, teams: null });
  });

  it('serves HLL only and treats an empty configuration as not configured', async () => {
    const source = crconSource(servers, async () => json(syntheticPublicInfo()));
    expect(await getServerOverview('wardogs', now, source)).toEqual({ state: 'not_configured' });
    expect(await getServerOverview('hll', now, crconSource([], async () => json(syntheticPublicInfo())))).toEqual({ state: 'not_configured' });
  });

  it('is enabled by SERVER_STATUS_SOURCE=crcon and disabled by an invalid server list', async () => {
    process.env.HLL_SERVER_SOURCES_JSON = '[{"publicId":"x","baseUrl":"http://remote.example.org"}]';
    configure('crcon');
    try {
      expect(await getServerOverview('hll', now)).toEqual({ state: 'not_configured' });
    } finally {
      delete process.env.HLL_SERVER_SOURCES_JSON;
    }
  });
});
