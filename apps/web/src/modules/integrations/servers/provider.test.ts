import { afterEach, describe, expect, it } from 'vitest';
import { resetServerEnvForTests } from '@/lib/env';
import type { CrconServerConfig } from './crcon';
import { syntheticPublicInfo } from './crcon-fixtures';
import { crconSource, getServerOverview, resetServerStatusForTests } from './provider';

const now = new Date('2026-09-28T12:00:00Z');

function configure(source?: string, scenario?: string) {
  if (source === undefined) delete process.env.SERVER_STATUS_SOURCE;
  else process.env.SERVER_STATUS_SOURCE = source;
  if (scenario === undefined) delete process.env.SERVER_STATUS_FIXTURE_SCENARIO;
  else process.env.SERVER_STATUS_FIXTURE_SCENARIO = scenario;
  resetServerEnvForTests();
}

afterEach(() => {
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

  it('keeps games separate: a game without a configured set is not configured', async () => {
    configure('synthetic-fixture', 'mixed');
    expect(await getServerOverview('wardogs', now)).toEqual({ state: 'not_configured' });
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
