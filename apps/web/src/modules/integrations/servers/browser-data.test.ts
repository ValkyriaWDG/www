import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetServerEnvForTests } from '@/lib/env';
import type { ServerSnapshot } from '../contract';
import { getServerBrowserData } from './browser';
import { getServerLivePlayers } from './live-players-provider';
import { resetServerPresentationCache } from './presentation';
import { getServerOverview, type ServerOverview } from './provider';

const select = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ getDb: () => ({ select: () => ({ from: () => ({ where: () => ({ limit: select }) }) }) }) }));
vi.mock('./provider', () => ({ getServerOverview: vi.fn() }));
vi.mock('./live-players-provider', () => ({ getServerLivePlayers: vi.fn() }));

const now = new Date('2026-10-03T12:00:00Z');
const snapshot = (publicId: string): ServerSnapshot => ({
  ref: { source: 'crcon', sourceInstanceId: 'configured', guildId: null, game: 'hll', kind: 'server', externalId: publicId },
  publicId, name: publicId, reachability: 'online', map: null, mode: null, players: 1, capacity: 100, nextMap: null, timeRemainingSeconds: null,
  score: null, teams: null, observedAt: now.toISOString(), freshness: 'fresh', connect: { kind: 'none' }, statsUrl: null,
});
const overview: ServerOverview = { state: 'ok', synthetic: false, partial: false, attemptedAt: now.toISOString(), servers: [snapshot('alpha'), snapshot('bravo')] };
const players = { state: 'ok' as const, publicId: 'bravo', observedAt: now.toISOString(), freshness: 'fresh' as const, refreshAfterSeconds: 30, players: [], synthetic: false };

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'postgres://synthetic.invalid/valkyria');
  resetServerEnvForTests();
  vi.mocked(getServerOverview).mockResolvedValue(overview);
  vi.mocked(getServerLivePlayers).mockResolvedValue(players);
  select.mockResolvedValue([{ value: [{ game: 'hll', publicId: 'alpha', published: false }] }]);
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  resetServerEnvForTests();
  resetServerPresentationCache();
});

describe('server browser data with the website presentation', () => {
  it('never asks the upstream for the live players of a hidden server', async () => {
    const data = await getServerBrowserData('hll', 'alpha');
    expect(data.overview).toMatchObject({ state: 'ok', servers: [{ publicId: 'bravo' }] });
    expect(data.livePlayers).toBeNull();
    expect(getServerLivePlayers).not.toHaveBeenCalled();
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
    expect(data).toEqual({ overview: { state: 'unavailable', attemptedAt: now.toISOString(), servers: [] }, livePlayers: null });
  });
});
