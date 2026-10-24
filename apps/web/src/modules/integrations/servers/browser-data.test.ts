import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetServerEnvForTests } from '@/lib/env';
import type { ServerSnapshot } from '../contract';
import { getServerBrowserData } from './browser';
import { getWarconServersPublic } from '../logi/readers/warcon';
import type { WarconServerPublic } from '../logi/readers/public';
import { getLogiHllServerDetail, getServerLivePlayers } from './live-players-provider';
import { resetServerPresentationCache } from './presentation';
import { getServerOverview, type ServerOverview } from './provider';
import { GET } from '@/app/api/servers/[game]/route';

const select = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ getDb: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: select }) }) }) }) }));
vi.mock('./provider', () => ({ getServerOverview: vi.fn() }));
vi.mock('./live-players-provider', () => ({ getServerLivePlayers: vi.fn(), getLogiHllServerDetail: vi.fn() }));
vi.mock('../logi/readers/warcon', () => ({ getWarconServersPublic: vi.fn() }));

const now = new Date('2026-10-03T12:00:00Z');
const snapshot = (publicId: string): ServerSnapshot => ({
  ref: { source: 'crcon', sourceInstanceId: 'configured', guildId: null, game: 'hll', kind: 'server', externalId: publicId },
  publicId, name: publicId, reachability: 'online', map: null, mode: null, players: 1, capacity: 100, nextMap: null, timeRemainingSeconds: null,
  score: null, teams: null, observedAt: now.toISOString(), freshness: 'fresh', connect: { kind: 'none' }, statsUrl: null,
});
const overview: ServerOverview = { state: 'ok', synthetic: false, partial: false, attemptedAt: now.toISOString(), servers: [snapshot('alpha'), snapshot('bravo')] };
const players = { state: 'ok' as const, publicId: 'bravo', observedAt: now.toISOString(), freshness: 'fresh' as const, refreshAfterSeconds: 30, players: [], synthetic: false };
const wardogsOverview: ServerOverview = { state: 'ok', synthetic: true, partial: false, attemptedAt: now.toISOString(), servers: [{ ...snapshot('synthetic-wardogs'), ref: { ...snapshot('synthetic-wardogs').ref, game: 'wardogs' } }, { ...snapshot('community-two'), ref: { ...snapshot('community-two').ref, game: 'wardogs' } }] };
const warconEntry = (publicId: string, recent: boolean): WarconServerPublic => ({
  publicId, synthetic: true,
  live: { publicId, observedAt: now.toISOString(), freshness: 'fresh', serverName: '[SYN] Warcon', map: 'Synthetic Training Ground', lighting: null, playerCount: 12, maxPlayers: 98, matchSeconds: null, scores: [], rotationNow: null, rotationNext: null },
  recentMatches: recent ? { publicId, observedAt: now.toISOString(), freshness: 'fresh', matches: [] } : null,
});

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'postgres://synthetic.invalid/valkyria');
  resetServerEnvForTests();
  vi.mocked(getServerOverview).mockResolvedValue(overview);
  vi.mocked(getServerLivePlayers).mockResolvedValue(players);
  vi.mocked(getLogiHllServerDetail).mockResolvedValue(null);
  vi.mocked(getWarconServersPublic).mockImplementation(async (publicIds, recentFor) => publicIds.map((publicId) => warconEntry(publicId, publicId === recentFor)));
  select.mockResolvedValue([{ value: [{ game: 'hll', publicId: 'alpha', published: false }] }]);
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  resetServerEnvForTests();
  resetServerPresentationCache();
});

describe('server browser data with the website presentation', () => {
  it.each(['hll', 'wardogs'] as const)('publishes %s initial page and actual polling JSON without connection or tenant references', async (game) => {
    const internal = {
      ...snapshot('bravo'),
      ref: { source: 'logi' as const, sourceInstanceId: 'PRIVATE_INSTANCE', guildId: 'PRIVATE_GUILD', game, kind: 'server' as const, externalId: 'PRIVATE_CONNECTION' },
      teamScores: [{ id: 'PRIVATE_FACTION_ID', label: 'Faction A', score: 0 }],
    };
    vi.mocked(getServerOverview).mockResolvedValue({ state: 'ok', synthetic: false, partial: false, attemptedAt: now.toISOString(), servers: [internal] });
    const initial = await getServerBrowserData(game, 'bravo');
    const response = await GET(new Request(`https://valkyria.example/api/servers/${game}?server=bravo`), { params: Promise.resolve({ game }) });
    const polling: unknown = await response.json();
    for (const result of [initial, polling]) {
      expect(JSON.stringify(result)).not.toContain('PRIVATE_');
      expect(result).toMatchObject({ overview: { servers: [{ publicId: 'bravo', teamScores: [{ label: 'Faction A', score: 0 }] }] } });
    }
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(getServerLivePlayers).toHaveBeenCalledWith(game, 'bravo', expect.any(Date));
    expect(internal.ref.externalId).toBe('PRIVATE_CONNECTION');
  });
  it('never asks the upstream for the live players of a hidden server', async () => {
    const data = await getServerBrowserData('hll', 'alpha');
    expect(data.overview).toMatchObject({ state: 'ok', servers: [{ publicId: 'bravo' }] });
    expect(data.livePlayers).toBeNull();
    expect(getServerLivePlayers).not.toHaveBeenCalled();
    expect(getLogiHllServerDetail).not.toHaveBeenCalled();
  });

  it('serves live players for a visible server and none without a selection', async () => {
    expect((await getServerBrowserData('hll', 'bravo')).livePlayers).toEqual(players);
    expect(getServerLivePlayers).toHaveBeenCalledExactlyOnceWith('hll', 'bravo', expect.any(Date));
    expect((await getServerBrowserData('hll', null)).livePlayers).toBeNull();
    expect(getServerLivePlayers).toHaveBeenCalledTimes(1);
  });

  it('drops live players of a server that the overview no longer lists', async () => {
    vi.mocked(getServerOverview).mockResolvedValue({ state: 'unavailable', attemptedAt: now.toISOString(), servers: [] });
    const data = await getServerBrowserData('hll', 'bravo');
    expect(getServerLivePlayers).toHaveBeenCalledTimes(1);
    expect(data).toEqual({ overview: { state: 'unavailable', attemptedAt: now.toISOString(), servers: [] }, livePlayers: null, warcon: null });
  });

  it('never composes Warcon facts for HLL', async () => {
    expect((await getServerBrowserData('hll', 'bravo')).warcon).toBeNull();
    expect(getWarconServersPublic).not.toHaveBeenCalled();
  });

  it('adds safe selected-server HLL live facts without changing other configured servers', async () => {
    const status = {
      map: 'Current map', mode: 'warfare', players: 18, capacity: 100, nextMap: 'Next map', timeRemainingSeconds: 900,
      score: { allied: 3, axis: 2 }, observedAt: now.toISOString(), freshness: 'fresh' as const,
      // An adapter regression must not reintroduce identity after initial publication.
      ref: { connectionId: 'PRIVATE_HLL_CONNECTION' },
    };
    vi.mocked(getLogiHllServerDetail).mockResolvedValue({
      status, players,
    });
    const data = await getServerBrowserData('hll', 'bravo');
    expect(data.overview).toMatchObject({ servers: [{ publicId: 'bravo', map: 'Current map', mode: 'warfare', nextMap: 'Next map', timeRemainingSeconds: 900, score: { allied: 3, axis: 2 } }] });
    expect(JSON.stringify(data)).not.toContain('PRIVATE_HLL_CONNECTION');
    expect(getLogiHllServerDetail).toHaveBeenCalledExactlyOnceWith('bravo', expect.any(Date));
  });

  it('follows the presented Wardogs overview: hidden servers get neither live players nor Warcon facts', async () => {
    vi.mocked(getServerOverview).mockResolvedValue(wardogsOverview);
    select.mockResolvedValue([{ value: [{ game: 'wardogs', publicId: 'synthetic-wardogs', published: false }] }]);
    const hidden = await getServerBrowserData('wardogs', 'synthetic-wardogs');
    expect(hidden.overview).toMatchObject({ state: 'ok', servers: [{ publicId: 'community-two' }] });
    expect(hidden.livePlayers).toBeNull();
    expect(getServerLivePlayers).not.toHaveBeenCalled();
    expect(getWarconServersPublic).toHaveBeenCalledExactlyOnceWith(['community-two'], null, expect.any(Date));
    expect(hidden.warcon).toEqual([warconEntry('community-two', false)]);

    vi.mocked(getWarconServersPublic).mockClear();
    select.mockResolvedValue([{ value: [] }]);
    resetServerPresentationCache();
    const shown = await getServerBrowserData('wardogs', 'synthetic-wardogs');
    expect(shown.overview).toMatchObject({ servers: [{ publicId: 'synthetic-wardogs' }, { publicId: 'community-two' }] });
    expect(getWarconServersPublic).toHaveBeenCalledExactlyOnceWith(['synthetic-wardogs', 'community-two'], 'synthetic-wardogs', expect.any(Date));
    expect(shown.warcon?.map((entry) => [entry.publicId, entry.recentMatches !== null])).toEqual([['synthetic-wardogs', true], ['community-two', false]]);
  });
});
