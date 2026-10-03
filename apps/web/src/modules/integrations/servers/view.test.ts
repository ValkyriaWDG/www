import { describe, expect, it } from 'vitest';
import { classifyFreshness, SERVER_FRESHNESS, sourceKey, type ServerSnapshot } from '../contract';
import { ageServerBrowserData, parseServerParam, populationParts, resolveSelection, warconFor } from './view';
import type { ServerBrowserData } from './browser';

const server = (publicId: string, patch: Partial<ServerSnapshot> = {}): ServerSnapshot => ({
  ref: { source: 'synthetic', sourceInstanceId: 'synthetic', guildId: null, game: 'hll', kind: 'server', externalId: publicId },
  publicId,
  name: publicId,
  reachability: 'online',
  map: null,
  mode: null,
  players: null,
  capacity: null,
  nextMap: null,
  timeRemainingSeconds: null,
  score: null,
  teams: null,
  observedAt: null,
  freshness: 'unavailable',
  connect: { kind: 'none' },
  statsUrl: null,
  ...patch,
});

describe('server freshness', () => {
  const now = new Date('2026-09-28T12:00:00Z');
  it('removes Wardogs scores on age or a failed poll while keeping a labelled last-known population', () => {
    const data: ServerBrowserData = { overview: { state: 'ok', synthetic: true, partial: false, attemptedAt: now.toISOString(), servers: [server('wardogs', { observedAt: now.toISOString(), freshness: 'fresh', players: 0, teamScores: [{ id: 'a', label: 'Alpha', score: 0 }] })] }, livePlayers: null, warcon: null };
    for (const [at, failed] of [[new Date(now.getTime() + 121_000), false], [now, true]] as const) {
      expect(ageServerBrowserData(data, at, failed).overview).toMatchObject({ servers: [{ freshness: 'stale', players: 0, teamScores: null }] });
    }
    expect(ageServerBrowserData(data, new Date(now.getTime() + 31 * 60_000)).overview).toMatchObject({ servers: [{ freshness: 'unavailable', players: null, teamScores: null }] });
  });
  it('classifies current, stale and expired observations', () => {
    expect(classifyFreshness(new Date('2026-09-28T11:59:00Z'), now, SERVER_FRESHNESS)).toBe('fresh');
    expect(classifyFreshness(new Date('2026-09-28T11:45:00Z'), now, SERVER_FRESHNESS)).toBe('stale');
    expect(classifyFreshness(new Date('2026-09-28T11:00:00Z'), now, SERVER_FRESHNESS)).toBe('unavailable');
  });
  it('never treats a missing or future timestamp as current', () => {
    expect(classifyFreshness(null, now, SERVER_FRESHNESS)).toBe('unavailable');
    expect(classifyFreshness(new Date('2026-09-28T12:05:00Z'), now, SERVER_FRESHNESS)).toBe('unavailable');
    expect(classifyFreshness(new Date('invalid'), now, SERVER_FRESHNESS)).toBe('unavailable');
  });
});

describe('server selection and values', () => {
  it('accepts only public slug IDs', () => {
    expect(parseServerParam('synthetic-alpha')).toBe('synthetic-alpha');
    expect(parseServerParam('../admin')).toBeNull();
    expect(parseServerParam('<b>')).toBeNull();
    expect(parseServerParam(undefined)).toBeNull();
  });
  it('distinguishes no selection, a selected server and a removed one', () => {
    const servers = [server('alpha'), server('bravo')];
    expect(resolveSelection(servers, null)).toEqual({ kind: 'none' });
    expect(resolveSelection(servers, 'bravo')).toMatchObject({ kind: 'selected', server: { publicId: 'bravo' } });
    expect(resolveSelection(servers, 'gone')).toEqual({ kind: 'missing' });
  });
  it('keeps unknown population values unknown instead of zero', () => {
    expect(populationParts(server('a'))).toBeNull();
    expect(populationParts(server('a', { capacity: 100 }))).toEqual({ players: null, capacity: 100 });
    expect(populationParts(server('a', { players: 0, capacity: 100 }))).toEqual({ players: 0, capacity: 100 });
  });
  it('builds game-scoped source keys and rejects unsafe parts', () => {
    expect(sourceKey(server('alpha').ref)).toBe('synthetic/synthetic/-/hll/server/alpha');
    expect(() => sourceKey({ ...server('alpha').ref, externalId: 'a/../b' })).toThrow();
  });
});

describe('Warcon projections age with the browser data', () => {
  const now = new Date('2026-09-28T12:00:00Z');
  const live = { publicId: 'wardogs', observedAt: now.toISOString(), freshness: 'fresh' as const, serverName: '[SYN] Warcon', map: 'Synthetic Training Ground', lighting: 'Dusk', playerCount: 12, maxPlayers: 98, matchSeconds: 600, scores: [{ name: 'Alpha', score: 0 }], rotationNow: 1, rotationNext: 2 };
  const recentMatches = { publicId: 'wardogs', observedAt: now.toISOString(), freshness: 'fresh' as const, matches: [{ id: 1, startedAt: now.toISOString(), endedAt: null, map: null, experiences: null, lighting: null, peakPlayers: 3, finalScores: null, winner: null }] };
  const data: ServerBrowserData = { overview: { state: 'ok', synthetic: true, partial: false, attemptedAt: now.toISOString(), servers: [server('wardogs', { observedAt: now.toISOString(), freshness: 'fresh' })] }, livePlayers: null, warcon: [{ publicId: 'wardogs', synthetic: true, live, recentMatches }] };

  it('keeps a fresh snapshot, removes scores after 45 s or a failed poll and drops live facts after 180 s', () => {
    expect(ageServerBrowserData(data, now)).toEqual(data);
    expect(ageServerBrowserData(data, new Date(now.getTime() + 50_000)).warcon?.[0]?.live).toMatchObject({ freshness: 'stale', map: 'Synthetic Training Ground', scores: [], matchSeconds: null });
    expect(ageServerBrowserData(data, now, true).warcon?.[0]).toMatchObject({ live: { freshness: 'stale', scores: [] }, recentMatches: { freshness: 'stale', matches: [{ id: 1 }] } });
    expect(ageServerBrowserData(data, new Date(now.getTime() + 181_000)).warcon?.[0]?.live).toMatchObject({ freshness: 'unavailable', map: null, observedAt: now.toISOString() });
    expect(ageServerBrowserData(data, new Date(now.getTime() + 31 * 60_000)).warcon?.[0]?.recentMatches).toMatchObject({ freshness: 'unavailable', matches: [] });
    expect(ageServerBrowserData({ ...data, warcon: null }, now).warcon).toBeNull();
  });

  it('finds the projection of a listed server by its public ID only', () => {
    expect(warconFor(data, 'wardogs')?.publicId).toBe('wardogs');
    expect(warconFor(data, 'other')).toBeNull();
    expect(warconFor({ warcon: null }, 'wardogs')).toBeNull();
  });
});
