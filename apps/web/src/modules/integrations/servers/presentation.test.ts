import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetServerEnvForTests } from '@/lib/env';
import type { ServerPresentationRow } from '@/modules/settings/schemas';
import type { ServerSnapshot } from '../contract';
import { applyServerPresentation, getPublicServerOverview, getServerPresentation, isServerPublished, resetServerPresentationCache, SERVER_PRESENTATION_CACHE_MS } from './presentation';
import { getServerOverview, type ServerOverview } from './provider';

const { select, getDb } = vi.hoisted(() => ({ select: vi.fn(), getDb: vi.fn() }));
vi.mock('@/lib/db', () => ({ getDb }));
vi.mock('./provider', () => ({ getServerOverview: vi.fn() }));
const fakeDb = () => ({ select: () => ({ from: () => ({ where: () => ({ limit: select }) }) }) });

const now = new Date('2026-10-03T12:00:00Z');

function snapshot(game: 'hll' | 'wardogs', source: 'crcon' | 'logi', publicId: string, name: string, freshness: ServerSnapshot['freshness'] = 'fresh'): ServerSnapshot {
  return {
    ref: { source, sourceInstanceId: source === 'logi' ? 'primary-logi' : 'configured', guildId: source === 'logi' ? '100000000000000001' : null, game, kind: 'server', externalId: `${publicId}-connection` },
    publicId, name, reachability: freshness === 'unavailable' ? 'unknown' : 'online', map: null, mode: null, players: 10, capacity: 100, nextMap: null, timeRemainingSeconds: null,
    score: null, teams: null, observedAt: now.toISOString(), freshness, connect: { kind: 'address', address: `${publicId}.example.invalid:7777` }, statsUrl: null,
  };
}

const crcon: ServerOverview = { state: 'ok', synthetic: false, partial: true, attemptedAt: now.toISOString(), servers: [snapshot('hll', 'crcon', 'valkyria-1', 'Valkyria #1'), snapshot('hll', 'crcon', 'valkyria-2', 'Valkyria #2'), snapshot('hll', 'crcon', 'event', 'Event server', 'unavailable')] };
const logi: ServerOverview = { state: 'ok', synthetic: false, partial: false, attemptedAt: now.toISOString(), servers: [snapshot('wardogs', 'logi', 'community-one', 'Community one'), snapshot('wardogs', 'logi', 'community-two', 'Community two')] };

beforeEach(() => {
  getDb.mockImplementation(fakeDb);
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  resetServerEnvForTests();
  resetServerPresentationCache();
});

function withDatabase() {
  vi.stubEnv('DATABASE_URL', 'postgres://synthetic.invalid/valkyria');
  resetServerEnvForTests();
}

/** CI sets DATABASE_URL for the whole job; the no-database case must not inherit it. */
function withoutDatabase() {
  vi.stubEnv('DATABASE_URL', undefined);
  resetServerEnvForTests();
}

describe('server presentation overrides', () => {
  it('renames, hides and reorders CRCON servers without touching telemetry or freshness', () => {
    const rows: ServerPresentationRow[] = [
      { game: 'hll', publicId: 'valkyria-2', sortOrder: 0 },
      { game: 'hll', publicId: 'valkyria-1', name: 'Valkyria Main' },
      { game: 'hll', publicId: 'event', published: false },
      { game: 'wardogs', publicId: 'valkyria-1', name: 'Other game, ignored' },
    ];
    const result = applyServerPresentation('hll', crcon, rows);
    if (result.state !== 'ok') throw new Error('expected ok');
    expect(result.servers.map((server) => [server.publicId, server.name])).toEqual([['valkyria-2', 'Valkyria #2'], ['valkyria-1', 'Valkyria Main']]);
    expect(result.servers[1]).toMatchObject({ freshness: 'fresh', players: 10, connect: { kind: 'address', address: 'valkyria-1.example.invalid:7777' }, ref: { source: 'crcon' } });
    // The only server that did not answer is hidden, so the overview is no longer partial.
    expect(result.partial).toBe(false);
    expect(crcon.servers.map((server) => server.name)).toEqual(['Valkyria #1', 'Valkyria #2', 'Event server']);
  });

  it('applies the same rules to Logi overviews and keeps configured order for rows without an order', () => {
    const rows: ServerPresentationRow[] = [{ game: 'wardogs', publicId: 'community-two', name: 'Wardogs public', sortOrder: 5 }];
    const result = applyServerPresentation('wardogs', logi, rows);
    if (result.state !== 'ok') throw new Error('expected ok');
    expect(result.servers.map((server) => server.name)).toEqual(['Wardogs public', 'Community one']);
    // Logi marks a partial overview by unavailable freshness: a stale but answered server keeps it complete.
    const partialLogi: ServerOverview = { ...logi, partial: true, servers: [{ ...logi.servers[0]!, freshness: 'stale' }, { ...logi.servers[1]!, freshness: 'unavailable', reachability: 'unknown' }] };
    expect(applyServerPresentation('wardogs', partialLogi, [{ game: 'wardogs', publicId: 'community-two', published: false }])).toMatchObject({ partial: false, servers: [{ publicId: 'community-one', freshness: 'stale' }] });
    expect(applyServerPresentation('wardogs', partialLogi, [{ game: 'wardogs', publicId: 'community-one', published: false }])).toMatchObject({ partial: true, servers: [{ publicId: 'community-two' }] });
    expect(applyServerPresentation('wardogs', logi, [])).toBe(logi);
    expect(applyServerPresentation('wardogs', logi, [{ game: 'hll', publicId: 'community-one', published: false }])).toBe(logi);
    expect(applyServerPresentation('wardogs', { state: 'not_configured' }, rows)).toEqual({ state: 'not_configured' });
    const unavailable: ServerOverview = { state: 'unavailable', attemptedAt: now.toISOString(), servers: logi.servers };
    expect(applyServerPresentation('wardogs', unavailable, [{ game: 'wardogs', publicId: 'community-one', published: false }])).toEqual({ ...unavailable, servers: [logi.servers[1]] });
    expect(isServerPublished(rows, 'wardogs', 'community-two')).toBe(true);
    expect(isServerPublished([{ game: 'wardogs', publicId: 'community-two', published: false }], 'wardogs', 'community-two')).toBe(false);
  });

  it('returns the provider overview unchanged without a database', async () => {
    withoutDatabase();
    vi.mocked(getServerOverview).mockResolvedValue(crcon);
    expect(await getPublicServerOverview('hll', now)).toBe(crcon);
    expect(select).not.toHaveBeenCalled();
  });

  it('reads stored rows through one bounded cache for repeated public reads', async () => {
    withDatabase();
    vi.mocked(getServerOverview).mockResolvedValue(crcon);
    select.mockResolvedValue([{ value: [{ game: 'hll', publicId: 'valkyria-1', name: 'Renamed' }] }]);
    const first = await getPublicServerOverview('hll', now);
    if (first.state !== 'ok') throw new Error('expected ok');
    expect(first.servers[0]?.name).toBe('Renamed');
    await getPublicServerOverview('hll', new Date(now.getTime() + SERVER_PRESENTATION_CACHE_MS - 1));
    expect(select).toHaveBeenCalledTimes(1);
    select.mockResolvedValue([{ value: [{ game: 'hll', publicId: 'valkyria-1', published: false }] }]);
    const later = await getPublicServerOverview('hll', new Date(now.getTime() + SERVER_PRESENTATION_CACHE_MS));
    if (later.state !== 'ok') throw new Error('expected ok');
    expect(select).toHaveBeenCalledTimes(2);
    expect(later.servers.map((server) => server.publicId)).toEqual(['valkyria-2', 'event']);
  });

  it('ignores invalid stored rows and keeps the last known rows during a database failure', async () => {
    withDatabase();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    select.mockResolvedValue([{ value: [{ game: 'hll', publicId: 'Not A Slug' }] }]);
    expect(await getServerPresentation(now)).toEqual([]);
    resetServerPresentationCache();
    select.mockResolvedValue([{ value: [{ game: 'hll', publicId: 'valkyria-1', name: 'Known' }] }]);
    expect(await getServerPresentation(now)).toHaveLength(1);
    select.mockRejectedValue(new Error('connection refused'));
    expect(await getServerPresentation(new Date(now.getTime() + SERVER_PRESENTATION_CACHE_MS))).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.flat().join(' ')).not.toContain('connection refused');
  });

  it('degrades when the database handle itself cannot be created', async () => {
    withDatabase();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getDb.mockImplementation(() => {
      throw new Error('DATABASE_URL is not configured.');
    });
    vi.mocked(getServerOverview).mockResolvedValue(crcon);
    expect(await getServerPresentation(now)).toEqual([]);
    expect(await getPublicServerOverview('hll', now)).toBe(crcon);
  });

  it('does not let a read started before a save repopulate the cache after the reset', async () => {
    withDatabase();
    let resolveRead: (rows: unknown) => void = () => undefined;
    select.mockReturnValueOnce(new Promise((resolve) => { resolveRead = resolve; }));
    const stale = getServerPresentation(now);
    // The administrator saves meanwhile; the pending read still carries the pre-save rows.
    resetServerPresentationCache();
    resolveRead([{ value: [{ game: 'hll', publicId: 'valkyria-1', name: 'Before save' }] }]);
    expect(await stale).toEqual([{ game: 'hll', publicId: 'valkyria-1', name: 'Before save' }]);
    select.mockResolvedValue([{ value: [{ game: 'hll', publicId: 'valkyria-1', name: 'After save' }] }]);
    expect(await getServerPresentation(new Date(now.getTime() + 1))).toEqual([{ game: 'hll', publicId: 'valkyria-1', name: 'After save' }]);
    expect(select).toHaveBeenCalledTimes(2);
    // The fresh rows are cached normally afterwards.
    expect(await getServerPresentation(new Date(now.getTime() + 2))).toEqual([{ game: 'hll', publicId: 'valkyria-1', name: 'After save' }]);
    expect(select).toHaveBeenCalledTimes(2);
  });
});
