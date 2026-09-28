import { afterEach, describe, expect, it } from 'vitest';
import { resetServerEnvForTests } from '@/lib/env';
import { getServerOverview } from './provider';

const now = new Date('2026-09-28T12:00:00Z');

function configure(source?: string, scenario?: string) {
  if (source === undefined) delete process.env.SERVER_STATUS_SOURCE;
  else process.env.SERVER_STATUS_SOURCE = source;
  if (scenario === undefined) delete process.env.SERVER_STATUS_FIXTURE_SCENARIO;
  else process.env.SERVER_STATUS_FIXTURE_SCENARIO = scenario;
  resetServerEnvForTests();
}

afterEach(() => configure());

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
});
