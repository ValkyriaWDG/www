import { describe, expect, it } from 'vitest';
import { aggregateHistory, latestHistoryRecords, listHistoryMaps } from './history-report';
import {
  DEFAULT_HISTORY_PUBLIC_FILTERS, emptyHistoryGamesPublic, emptyHistoryReportPublic, HISTORY_GAMES_PAGE_SIZE, parseHistoryPage, parseHistoryPublicFilters, toHistoryFilters, toHistoryGamesPublic, toHistoryReportPublic,
  type HistoryPublicContext,
} from './history-public';
import { syntheticHistoryPages } from './synthetic';

const now = new Date('2026-10-03T12:00:00.000Z');
const records = latestHistoryRecords(syntheticHistoryPages(now).flatMap((page) => page.items));
const report = aggregateHistory(records);
const maps = listHistoryMaps(records);
/** Deterministic stand-in for the server's salted key; the real derivation is tested with the reader. */
const playerKey = (platform: string, platformId: string) => `key-${platform.length}-${platformId.length}-${platformId.slice(-2)}`;
const context = (overrides: Partial<HistoryPublicContext> = {}): HistoryPublicContext => ({
  publicId: 'community-one', state: 'fresh', synthetic: false, coverage: { kind: 'all', from: null }, refreshedAt: now.toISOString(), lastCollectedAt: '2026-10-03T11:55:00.000Z', publishPlayers: true, playerKey, ...overrides,
});

/** Provider identities and operational fields that must never reach a public DTO. */
const FORBIDDEN = /platformId|sourceId|guildId|sourceDigest|externalId|serverName|"revision"|collectedAt"|updatedAt|apiKey|scopeKey|salt|synthetic-steam|synthetic-xbox|synthetic-unknown|0123456789abcdef|Warcon Test Server|synthetic-match/;

describe('history report projection', () => {
  it('publishes aggregates and opaque player rows for a publishing source without any provider identity', () => {
    const dto = toHistoryReportPublic(context(), DEFAULT_HISTORY_PUBLIC_FILTERS, report, maps);
    expect(dto).toMatchObject({
      publicId: 'community-one', state: 'fresh', synthetic: false, coverage: { kind: 'all', from: null }, refreshedAt: now.toISOString(), lastCollectedAt: '2026-10-03T11:55:00.000Z',
      filters: { from: null, until: null, map: null, minMinutes: 60 }, games: 23, outcomes: { decided: 19, draw: 2, noResult: 1, unknown: 1 }, feedGames: 22, playersPublished: true,
    });
    expect(dto.factions).toEqual([
      { name: 'Bravo', colorHex: '#00ff00', wins: 8, appearances: 23, winShare: 8 / 19 },
      { name: 'Alpha', colorHex: '#ff0000', wins: 6, appearances: 23, winShare: 6 / 19 },
      { name: 'Charlie', colorHex: '#0000ff', wins: 5, appearances: 23, winShare: 5 / 19 },
    ]);
    expect(dto.maps).toEqual([{ name: 'Synthetic Harbour', games: 8 }, { name: 'Synthetic Training Ground', games: 8 }, { name: 'Synthetic Ridge', games: 7 }]);
    expect(dto.players).toHaveLength(24);
    expect(dto.eligiblePlayers).toBe(report.eligiblePlayers);
    expect(Object.keys(dto.players![0]!).sort()).toEqual(['draws', 'eligible', 'kd', 'key', 'lastSeen', 'losses', 'matches', 'metrics', 'name', 'platform', 'unknownResults', 'winRate', 'wins']);
    expect(Object.keys(dto.players![0]!.metrics)).toEqual(['seconds', 'kills', 'deaths', 'cashDelta', 'headshots', 'teamKills', 'suicides', 'vehicleKills']);
    expect(dto.players!.map((player) => player.key)).toEqual(report.players.map((player) => playerKey(player.platform, player.platformId)));
    expect(new Set(dto.players!.map((player) => player.key)).size).toBe(24);
    expect(JSON.stringify(dto)).not.toMatch(FORBIDDEN);
    expect(JSON.stringify(dto)).toContain('[SYNTHETIC] Player 03 (renamed)');
  });

  it('keeps faction aggregates but no player rows for a source without publishPlayers', () => {
    const dto = toHistoryReportPublic(context({ publishPlayers: false }), DEFAULT_HISTORY_PUBLIC_FILTERS, report, maps);
    expect(dto).toMatchObject({ playersPublished: false, players: null, games: 23, eligiblePlayers: report.eligiblePlayers });
    expect(dto.factions).toHaveLength(3);
    expect(JSON.stringify(dto)).not.toMatch(/\[SYNTHETIC\] Player/);
    expect(JSON.stringify(dto)).not.toMatch(FORBIDDEN);
  });

  it('carries the state, synthetic flag, window coverage and the floor of the report', () => {
    const windowed = toHistoryReportPublic(context({ state: 'stale', synthetic: true, coverage: { kind: 'window', from: '2026-04-06T12:00:00.000Z' } }), { ...DEFAULT_HISTORY_PUBLIC_FILTERS, minMinutes: 0 }, aggregateHistory(records, 0), maps);
    expect(windowed).toMatchObject({ state: 'stale', synthetic: true, coverage: { kind: 'window', from: '2026-04-06T12:00:00.000Z' }, filters: { minMinutes: 0 } });
    expect(windowed.eligiblePlayers).toBe(24);
    expect(emptyHistoryReportPublic('community-one', 'preparing', DEFAULT_HISTORY_PUBLIC_FILTERS, true)).toEqual({
      publicId: 'community-one', state: 'preparing', synthetic: true, coverage: { kind: 'all', from: null }, refreshedAt: null, lastCollectedAt: null, filters: DEFAULT_HISTORY_PUBLIC_FILTERS,
      games: 0, outcomes: { decided: 0, draw: 0, noResult: 0, unknown: 0 }, feedGames: 0, firstEndedAt: null, lastEndedAt: null, factions: [], maps: [], playersPublished: false, eligiblePlayers: 0, players: null,
    });
  });
});

describe('history games projection', () => {
  it('lists games newest first in pages of 20 with factions, scores and opaque player rows', () => {
    const page1 = toHistoryGamesPublic(context(), DEFAULT_HISTORY_PUBLIC_FILTERS, records, 1);
    const page2 = toHistoryGamesPublic(context(), DEFAULT_HISTORY_PUBLIC_FILTERS, records, 2);
    const page3 = toHistoryGamesPublic(context(), DEFAULT_HISTORY_PUBLIC_FILTERS, records, 3);
    expect(page1).toMatchObject({ publicId: 'community-one', state: 'fresh', page: 1, pageSize: HISTORY_GAMES_PAGE_SIZE, total: 23, playersPublished: true, filters: { from: null, until: null, map: null } });
    expect(page1.games).toHaveLength(20);
    expect(page2.games).toHaveLength(3);
    expect(page3.games).toEqual([]);
    expect(page1.games.map((game) => game.endedAt)).toEqual([...page1.games.map((game) => game.endedAt)].sort().reverse());
    expect(page1.games[0]).toMatchObject({ id: 'synthetic-game-01', map: 'Synthetic Training Ground', mode: 'Synthetic Objective', lighting: 'Synthetic Dawn', outcome: 'decided', winner: 'Alpha', hasFeed: true });
    expect(page1.games[0]!.factions).toEqual([{ name: 'Alpha', colorHex: '#ff0000', score: 100 }, { name: 'Bravo', colorHex: '#00ff00', score: 35 }, { name: 'Charlie', colorHex: '#0000ff', score: 35 }]);
    expect(Object.keys(page1.games[0]!).sort()).toEqual(['endedAt', 'factions', 'hasFeed', 'id', 'lighting', 'map', 'mode', 'outcome', 'players', 'startedAt', 'winner']);
    expect(Object.keys(page1.games[0]!.players![0]!).sort()).toEqual(['cashDelta', 'deaths', 'faction', 'headshots', 'key', 'kills', 'name', 'platform', 'result', 'seconds', 'suicides', 'teamKills', 'vehicleKills']);
    const corrected = page1.games.find((game) => game.id === 'synthetic-game-03')!;
    expect(corrected).toMatchObject({ winner: 'Bravo' });
    expect(corrected.players!.find((player) => player.deaths === 0)).toMatchObject({ kills: 3, result: expect.any(String) });
    const noFeed = page1.games.find((game) => game.id === 'synthetic-game-07')!;
    expect(noFeed.hasFeed).toBe(false);
    expect(noFeed.players!.every((player) => player.headshots === null && player.teamKills === null && player.suicides === null && player.vehicleKills === null && player.kills !== null)).toBe(true);
    const unknown = page2.games.find((game) => game.id === 'synthetic-game-21')!;
    expect(unknown).toMatchObject({ outcome: 'unknown', winner: null, factions: [{ name: 'Alpha', score: null }, { name: 'Bravo', score: null }, { name: 'Charlie', score: null }] });
    expect(unknown.players!.every((player) => player.result === null)).toBe(true);
    expect(JSON.stringify([page1, page2])).not.toMatch(FORBIDDEN);
    expect(toHistoryGamesPublic(context(), DEFAULT_HISTORY_PUBLIC_FILTERS, records, 0).page).toBe(1);
    expect(toHistoryGamesPublic(context(), DEFAULT_HISTORY_PUBLIC_FILTERS, records, Number.NaN).page).toBe(1);
  });

  it('hides player rows for a source without publishPlayers and appends a winner missing from the factions', () => {
    const hidden = toHistoryGamesPublic(context({ publishPlayers: false }), DEFAULT_HISTORY_PUBLIC_FILTERS, records, 1);
    expect(hidden.playersPublished).toBe(false);
    expect(hidden.games.every((game) => game.players === null)).toBe(true);
    expect(JSON.stringify(hidden)).not.toMatch(/\[SYNTHETIC\] Player/);
    const record = structuredClone(records[0]!);
    record.session.warcon.factions = [{ name: 'Bravo', colorHex: null }];
    record.session.participants = [{ id: 'Alpha', label: 'Alpha', score: 100 }, { id: 'Bravo', label: 'Bravo', score: 10 }];
    record.session.warcon.winner = 'Alpha';
    const [game] = toHistoryGamesPublic(context(), DEFAULT_HISTORY_PUBLIC_FILTERS, [record], 1).games;
    expect(game!.factions).toEqual([{ name: 'Bravo', colorHex: null, score: 10 }, { name: 'Alpha', colorHex: null, score: 100 }]);
    expect(emptyHistoryGamesPublic('community-one', 'denied', DEFAULT_HISTORY_PUBLIC_FILTERS, 2)).toEqual({
      publicId: 'community-one', state: 'denied', synthetic: false, coverage: { kind: 'all', from: null }, refreshedAt: null, lastCollectedAt: null, filters: { from: null, until: null, map: null }, page: 2, pageSize: 20, total: 0, playersPublished: false, games: [],
    });
  });
});

describe('public filter parsing', () => {
  it('normalizes instants, drops an inverted period, bounds the map and the floor and never throws', () => {
    expect(parseHistoryPublicFilters({ from: '2026-09-01T00:00:00Z', until: '2026-10-01', map: '  Synthetic Ridge ', minMinutes: '30' })).toEqual({ from: '2026-09-01T00:00:00.000Z', until: '2026-10-01T00:00:00.000Z', map: 'Synthetic Ridge', minMinutes: 30 });
    expect(parseHistoryPublicFilters({ from: '2026-10-01T00:00:00Z', until: '2026-09-01T00:00:00Z' })).toEqual(DEFAULT_HISTORY_PUBLIC_FILTERS);
    expect(parseHistoryPublicFilters({ from: '2026-10-01T00:00:00Z', until: '2026-10-01T00:00:00Z', minMinutes: 0 })).toEqual({ ...DEFAULT_HISTORY_PUBLIC_FILTERS, minMinutes: 0 });
    expect(parseHistoryPublicFilters({ from: 'yesterday', until: '2026-10-01T00:00:00Z' })).toEqual({ ...DEFAULT_HISTORY_PUBLIC_FILTERS, until: '2026-10-01T00:00:00.000Z' });
    expect(parseHistoryPublicFilters({ map: '', minMinutes: '-5' })).toEqual(DEFAULT_HISTORY_PUBLIC_FILTERS);
    expect(parseHistoryPublicFilters({ map: 'x'.repeat(201), minMinutes: 100_001 })).toEqual(DEFAULT_HISTORY_PUBLIC_FILTERS);
    expect(parseHistoryPublicFilters({ minMinutes: 100_000 }).minMinutes).toBe(100_000);
    expect(parseHistoryPublicFilters({ minMinutes: 1.5 }).minMinutes).toBe(60);
    expect(parseHistoryPublicFilters({ from: ['a'], until: 7, map: {}, minMinutes: null })).toEqual(DEFAULT_HISTORY_PUBLIC_FILTERS);
    expect(parseHistoryPublicFilters(undefined)).toEqual(DEFAULT_HISTORY_PUBLIC_FILTERS);
    expect(toHistoryFilters({ from: '2026-09-01T00:00:00.000Z', until: null, map: 'Synthetic Ridge' })).toEqual({ from: '2026-09-01T00:00:00.000Z', map: 'Synthetic Ridge' });
    expect(toHistoryFilters({ from: null, until: null, map: null })).toEqual({});
    expect([parseHistoryPage('3'), parseHistoryPage(2), parseHistoryPage('0'), parseHistoryPage('-1'), parseHistoryPage('abc'), parseHistoryPage(undefined), parseHistoryPage('1234567')]).toEqual([3, 2, 1, 1, 1, 1, 1]);
  });
});
