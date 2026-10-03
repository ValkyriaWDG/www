import { describe, expect, it } from 'vitest';
import type { HistoryPlayerPublic } from '@/modules/integrations/logi/readers/history-public';
import {
  formatPlaytime, hasHistoryQuery, historyFiltersFor, historyHref, parseHistoryQuery, sortHistoryPlayers, startOfLocalDayDaysAgo,
} from './history-query';

const servers = ['community-one', 'community-two'];

function player(overrides: Partial<HistoryPlayerPublic> & { key: string }): HistoryPlayerPublic {
  const metric = (value: number | null, knownGames = 1) => ({ value, knownGames });
  return {
    name: overrides.key, platform: 'steam', lastSeen: '2026-10-01T00:00:00.000Z', matches: 1, wins: 0, losses: 0, draws: 0, unknownResults: 0, eligible: true, winRate: null, kd: null,
    metrics: { seconds: metric(60), kills: metric(0), deaths: metric(0), cashDelta: metric(0), headshots: metric(0), teamKills: metric(0), suicides: metric(0), vehicleKills: metric(0) },
    ...overrides,
  };
}

describe('history page query', () => {
  it('selects the first published history server unless a published one is requested', () => {
    expect(parseHistoryQuery(undefined, servers).server).toBe('community-one');
    expect(parseHistoryQuery({ server: 'community-two' }, servers).server).toBe('community-two');
    expect(parseHistoryQuery({ server: 'unknown-server' }, servers).server).toBe('community-one');
    expect(parseHistoryQuery({ server: '../admin' }, servers).server).toBe('community-one');
    expect(parseHistoryQuery({ server: ['community-two', 'community-one'] }, servers).server).toBe('community-two');
    expect(parseHistoryQuery(undefined, []).server).toBeNull();
  });

  it('falls back to the defaults for unknown period, sort, direction, page and floor values', () => {
    expect(parseHistoryQuery(undefined, servers)).toEqual({ server: 'community-one', period: '30d', map: null, minMinutes: 60, sort: 'kills', dir: 'desc', page: 1, allPlayers: false });
    expect(parseHistoryQuery({ period: '14d', sort: 'name', dir: 'up', page: '0', min: '-1', players: 'some' }, servers)).toMatchObject({ period: '30d', sort: 'kills', dir: 'desc', page: 1, minMinutes: 60, allPlayers: false });
    expect(parseHistoryQuery({ period: 'all', sort: 'kd', dir: 'asc', page: '2', min: '0', map: ' Synthetic Ridge ', players: 'all' }, servers)).toMatchObject({ period: 'all', sort: 'kd', dir: 'asc', page: 2, minMinutes: 0, map: 'Synthetic Ridge', allPlayers: true });
    expect(parseHistoryQuery({ min: '100001' }, servers).minMinutes).toBe(60);
    expect(parseHistoryQuery({ min: '100000' }, servers).minMinutes).toBe(100000);
  });

  it('marks any query parameter as a non-default view', () => {
    expect(hasHistoryQuery(undefined)).toBe(false);
    expect(hasHistoryQuery({ switch: 'section' })).toBe(false);
    expect(hasHistoryQuery({ period: '30d' })).toBe(true);
    expect(hasHistoryQuery({ page: '2' })).toBe(true);
  });
});

describe('period boundaries in Europe/Prague', () => {
  it('starts at local midnight N days ago during summer time', () => {
    const now = new Date('2026-10-03T12:00:00.000Z');
    expect(startOfLocalDayDaysAgo(now, 30).toISOString()).toBe('2026-09-02T22:00:00.000Z');
    expect(startOfLocalDayDaysAgo(now, 7).toISOString()).toBe('2026-09-25T22:00:00.000Z');
    expect(startOfLocalDayDaysAgo(now, 0).toISOString()).toBe('2026-10-02T22:00:00.000Z');
  });

  it('uses the local date of the request, not the UTC date', () => {
    // 23:30 UTC on 2 October is already 3 October in Prague.
    const now = new Date('2026-10-02T23:30:00.000Z');
    expect(startOfLocalDayDaysAgo(now, 0).toISOString()).toBe('2026-10-02T22:00:00.000Z');
    expect(startOfLocalDayDaysAgo(now, 7).toISOString()).toBe('2026-09-25T22:00:00.000Z');
  });

  it('crosses the daylight-saving changes correctly', () => {
    // Winter now (CET), boundary in summer time (CEST).
    expect(startOfLocalDayDaysAgo(new Date('2026-11-05T12:00:00.000Z'), 30).toISOString()).toBe('2026-10-05T22:00:00.000Z');
    // Summer now (CEST), boundary in winter time (CET).
    expect(startOfLocalDayDaysAgo(new Date('2026-04-01T12:00:00.000Z'), 30).toISOString()).toBe('2026-03-01T23:00:00.000Z');
    // The transition day itself (29 March 2026, 02:00 CET → 03:00 CEST): midnight is still CET.
    expect(startOfLocalDayDaysAgo(new Date('2026-03-29T12:00:00.000Z'), 0).toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(startOfLocalDayDaysAgo(new Date('2026-03-30T12:00:00.000Z'), 1).toISOString()).toBe('2026-03-28T23:00:00.000Z');
  });

  it('converts a period to reader filters with an open end', () => {
    const now = new Date('2026-10-03T12:00:00.000Z');
    expect(historyFiltersFor({ period: '90d', map: 'Synthetic Ridge', minMinutes: 0 }, now)).toEqual({ from: '2026-07-04T22:00:00.000Z', until: null, map: 'Synthetic Ridge', minMinutes: 0 });
    expect(historyFiltersFor({ period: 'all', map: null, minMinutes: 60 }, now)).toEqual({ from: null, until: null, map: null, minMinutes: 60 });
  });
});

describe('history hrefs', () => {
  it('omits default values and page 1', () => {
    const query = parseHistoryQuery(undefined, servers);
    expect(historyHref('/wardogs/history', query)).toBe('/wardogs/history?server=community-one');
    expect(historyHref('/wardogs/history', query, { period: 'all', page: 2 })).toBe('/wardogs/history?server=community-one&period=all&page=2');
    expect(historyHref('/wardogs/history', query, { sort: 'kd', dir: 'asc', minMinutes: 0, map: 'Synthetic Ridge', allPlayers: true })).toBe('/wardogs/history?server=community-one&map=Synthetic+Ridge&min=0&sort=kd&dir=asc&players=all');
    expect(historyHref('/wardogs/history', { server: null })).toBe('/wardogs/history');
  });
});

describe('ranking order', () => {
  const rows = [
    player({ key: 'a', name: 'Alpha', kd: 1.5, winRate: 0.5, matches: 3, metrics: { ...player({ key: 'a' }).metrics, kills: { value: 10, knownGames: 3 }, cashDelta: { value: -400, knownGames: 3 } } }),
    player({ key: 'b', name: 'Bravo', kd: null, winRate: null, matches: 1, metrics: { ...player({ key: 'b' }).metrics, kills: { value: 30, knownGames: 1 }, cashDelta: { value: null, knownGames: 0 } } }),
    player({ key: 'c', name: 'Charlie', kd: 0.5, winRate: 1, matches: 3, metrics: { ...player({ key: 'c' }).metrics, kills: { value: 20, knownGames: 3 }, cashDelta: { value: 120, knownGames: 3 } } }),
    player({ key: 'd', name: 'Charlie', kd: 0.5, winRate: 1, matches: 3, metrics: { ...player({ key: 'd' }).metrics, kills: { value: 20, knownGames: 3 }, cashDelta: { value: 120, knownGames: 3 } } }),
  ];
  const keys = (sorted: HistoryPlayerPublic[]) => sorted.map((row) => row.key);

  it('sorts by the metric with unknown values last in both directions', () => {
    expect(keys(sortHistoryPlayers(rows, 'kd', 'desc'))).toEqual(['a', 'c', 'd', 'b']);
    expect(keys(sortHistoryPlayers(rows, 'kd', 'asc'))).toEqual(['c', 'd', 'a', 'b']);
    expect(keys(sortHistoryPlayers(rows, 'winRate', 'desc'))).toEqual(['c', 'd', 'a', 'b']);
    expect(keys(sortHistoryPlayers(rows, 'cashDelta', 'asc'))).toEqual(['a', 'c', 'd', 'b']);
    expect(keys(sortHistoryPlayers(rows, 'kills', 'desc'))).toEqual(['b', 'c', 'd', 'a']);
    expect(keys(sortHistoryPlayers(rows, 'matches', 'asc'))).toEqual(['b', 'a', 'c', 'd']);
  });

  it('does not mutate the input', () => {
    const copy = [...rows];
    sortHistoryPlayers(rows, 'kills', 'asc');
    expect(rows).toEqual(copy);
  });
});

describe('playtime format', () => {
  it('renders whole minutes as h:mm and keeps unknown values unknown', () => {
    expect(formatPlaytime(0)).toBe('0:00');
    expect(formatPlaytime(59)).toBe('0:00');
    expect(formatPlaytime(3600)).toBe('1:00');
    expect(formatPlaytime(30240)).toBe('8:24');
    expect(formatPlaytime(360_000 + 5 * 60 + 59)).toBe('100:05');
    expect(formatPlaytime(null)).toBeNull();
    expect(formatPlaytime(-1)).toBeNull();
  });
});
