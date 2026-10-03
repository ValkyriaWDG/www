import { describe, expect, it } from 'vitest';
import type { HistoryRecord } from './history-contracts';
import { aggregateHistory, filterHistoryRecords, HISTORY_METRICS, latestHistoryRecords, listHistoryMaps } from './history-report';
import { SYNTHETIC_HISTORY_CORRECTED_GAME, SYNTHETIC_HISTORY_GAME_COUNT, SYNTHETIC_HISTORY_PLAYER_COUNT, syntheticHistoryPages } from './synthetic';

const now = new Date('2026-10-03T12:00:00.000Z');
const SOURCE = 'ab'.repeat(32);

/** One retained game like the producer's `historyRecord()` test helper: Valkyra beat Manticore and Lonestar with one Steam player. */
function historyRecord(id = 'game-1', overrides: { endedAt?: string; revision?: string } = {}): HistoryRecord {
  const endedAt = overrides.endedAt ?? '2026-10-02T20:00:00.000Z';
  return {
    schemaVersion: 1, id, guildId: 'guild-a', gameId: 'wardogs', provider: 'wardogs_warcon', sourceId: SOURCE, serverName: 'Synthetic Warcon', revision: overrides.revision ?? '1',
    collectedAt: endedAt, updatedAt: endedAt,
    session: {
      externalId: `external-${id}`, startedAt: new Date(Date.parse(endedAt) - 90 * 60_000).toISOString(), endedAt, complete: true, map: 'Bakurani',
      participants: [{ id: 'Valkyra', label: 'Valkyra', score: 100 }, { id: 'Manticore', label: 'Manticore', score: 60 }, { id: 'Lonestar', label: 'Lonestar', score: 30 }],
      sourceDigest: 'cd'.repeat(32),
      warcon: { schemaVersion: 1, winner: 'Valkyra', outcome: 'decided', hasFeed: true, mode: 'Objective', lighting: 'Day', factions: [{ name: 'Valkyra', colorHex: '#112233' }, { name: 'Manticore', colorHex: null }, { name: 'Lonestar', colorHex: '#445566' }] },
      players: [{ platform: 'steam', platformId: 'synthetic-player', name: 'Synthetic player', faction: 'Valkyra', result: 'win', metrics: { seconds: 5400, kills: 12, deaths: 4, cashDelta: -20, headshots: 3, teamKills: 0, suicides: 1, vehicleKills: 2 } }],
    },
  };
}

describe('aggregateHistory (ported from the producer)', () => {
  it('rejects duplicate faction metadata so wins and appearances cannot inflate', () => {
    const record = historyRecord();
    const winner = record.session.warcon.factions.find((faction) => faction.name === record.session.warcon.winner)!;
    record.session.warcon.factions.push({ ...winner });
    expect(() => aggregateHistory([record])).toThrow(/Duplicate Warcon faction/);
  });

  it('replays and corrections replace contributions; no-result and unknown player results are not losses', () => {
    const first = historyRecord();
    const correction = structuredClone(first);
    const abandoned = historyRecord('game-2');
    correction.revision = '2';
    correction.session.warcon.winner = 'Manticore';
    correction.session.players[0]!.result = 'loss';
    abandoned.session.warcon.winner = null;
    abandoned.session.warcon.outcome = 'no_result';
    abandoned.session.participants = [];
    abandoned.session.players[0]!.result = null;
    abandoned.session.players[0]!.name = 'Latest name';
    abandoned.session.endedAt = '2026-10-03T12:00:00.000Z';
    const report = aggregateHistory([correction, first, abandoned, correction]);
    expect(report.games).toBe(2);
    expect(report.outcomes).toEqual({ decided: 1, draw: 0, no_result: 1, unknown: 0 });
    expect(report.factions.find((faction) => faction.name === 'Manticore')).toMatchObject({ wins: 1, appearances: 2, winShare: 1 });
    expect(report.factions.find((faction) => faction.name === 'Valkyra')).toMatchObject({ wins: 0, appearances: 2, winShare: 0, colorHex: '#112233' });
    const player = report.players[0]!;
    expect(player.name).toBe('Latest name');
    expect([player.wins, player.losses, player.draws, player.unknownResults]).toEqual([0, 1, 0, 1]);
    expect(player.winRate).toBe(0);
    expect(player.metrics.kills.value).toBe(24);
    expect(player.metrics.cashDelta.value).toBe(-40);
    expect(player.metrics.headshots).toEqual({ value: 6, knownGames: 2 });
    expect(player.kd).toBe(3);
    expect([report.firstEndedAt, report.lastEndedAt]).toEqual(['2026-10-02T20:00:00.000Z', '2026-10-03T12:00:00.000Z']);
  });

  it('eligibility is playtime based, identity is the platform ID, incomplete metrics never become full ratios', () => {
    const first = historyRecord();
    const second = historyRecord('game-2');
    first.session.players[0]!.metrics.seconds = 60;
    second.session.players[0]!.platformId = 'another-player';
    second.session.players[0]!.metrics.deaths = null;
    const report = aggregateHistory([first, second]);
    expect(report.players).toHaveLength(2);
    expect(report.players.find((player) => player.platformId === 'synthetic-player')!.eligible).toBe(false);
    expect(report.players.find((player) => player.platformId === 'another-player')).toMatchObject({ eligible: true, kd: null, metrics: { deaths: { value: null, knownGames: 0 }, kills: { value: 12, knownGames: 1 } } });
    expect(report.eligiblePlayers).toBe(1);
    expect(aggregateHistory([first, second], 0).eligiblePlayers).toBe(2);
    expect(() => aggregateHistory([first], -1)).toThrow(/playtime floor/);
    expect(() => aggregateHistory([first], 100_001)).toThrow(/playtime floor/);
    expect(() => aggregateHistory([first], Number.NaN)).toThrow(/playtime floor/);
  });

  it('rejects mixed guilds and invalid candidates', () => {
    const foreign = historyRecord('game-2');
    foreign.guildId = 'guild-b';
    expect(() => aggregateHistory([historyRecord(), foreign])).toThrow(/Mixed history workspace/);
    expect(() => aggregateHistory([{ ...historyRecord(), sourceId: 'x' } as HistoryRecord])).toThrow();
    expect(aggregateHistory([])).toMatchObject({ games: 0, outcomes: { decided: 0, draw: 0, no_result: 0, unknown: 0 }, feedGames: 0, firstEndedAt: null, lastEndedAt: null, factions: [], players: [], eligiblePlayers: 0, minMinutes: 60 });
  });

  it('keeps the same platform ID on another platform as another player and keys never by nickname', () => {
    const steam = historyRecord();
    const xbox = historyRecord('game-2');
    xbox.session.players[0]!.platform = 'xbox';
    xbox.session.players[0]!.name = 'Synthetic player';
    const same = historyRecord('game-3');
    same.session.players[0]!.name = 'Completely different nickname';
    const report = aggregateHistory([steam, xbox, same]);
    expect(report.players.map((player) => [player.platform, player.platformId, player.matches, player.name])).toEqual([
      ['steam', 'synthetic-player', 2, 'Completely different nickname'], ['xbox', 'synthetic-player', 1, 'Synthetic player'],
    ]);
  });

  it('keeps a renamed player as one identity with the latest non-empty name, in end-time order', () => {
    const older = historyRecord('game-1', { endedAt: '2026-10-01T20:00:00.000Z' });
    const newer = historyRecord('game-2', { endedAt: '2026-10-02T20:00:00.000Z' });
    const unnamed = historyRecord('game-3', { endedAt: '2026-10-03T20:00:00.000Z' });
    older.session.players[0]!.name = 'Old name';
    newer.session.players[0]!.name = 'New name';
    unnamed.session.players[0]!.name = '';
    const report = aggregateHistory([unnamed, newer, older]);
    expect(report.players).toHaveLength(1);
    expect(report.players[0]).toMatchObject({ name: 'New name', matches: 3, lastSeen: '2026-10-03T20:00:00.000Z' });
  });

  it('counts a winner named outside the factions as one appearance and one win', () => {
    const record = historyRecord();
    record.session.participants = [];
    record.session.warcon.factions = [{ name: 'Manticore', colorHex: null }];
    const report = aggregateHistory([record]);
    expect(report.factions).toEqual([
      { name: 'Valkyra', colorHex: null, wins: 1, appearances: 1, winShare: 1 },
      { name: 'Manticore', colorHex: null, wins: 0, appearances: 1, winShare: 0 },
    ]);
  });

  it('counts draws and unknown outcomes without a winner; winShare is null without a decided game', () => {
    const draw = historyRecord('game-1');
    draw.session.warcon.winner = null;
    draw.session.warcon.outcome = 'draw';
    draw.session.players[0]!.result = 'draw';
    const unknown = historyRecord('game-2');
    unknown.session.warcon.winner = null;
    unknown.session.warcon.outcome = 'unknown';
    unknown.session.participants = [];
    unknown.session.players[0]!.result = null;
    const report = aggregateHistory([draw, unknown]);
    expect(report.outcomes).toEqual({ decided: 0, draw: 1, no_result: 0, unknown: 1 });
    expect(report.factions.every((faction) => faction.wins === 0 && faction.appearances === 2 && faction.winShare === null)).toBe(true);
    expect(report.players[0]).toMatchObject({ draws: 1, unknownResults: 1, winRate: 0 });
  });

  it('sums known metrics only, keeps feed-only zeros without a feed unknown, allows negative cash and null K/D at zero deaths', () => {
    const noFeed = historyRecord('game-1');
    noFeed.session.warcon.hasFeed = false;
    noFeed.session.players[0]!.metrics = { seconds: 3600, kills: 5, deaths: 0, cashDelta: -150, headshots: 0, teamKills: 0, suicides: 0, vehicleKills: 0 };
    const missing = historyRecord('game-2');
    missing.session.players[0]!.metrics = { seconds: 1200, kills: 7 };
    const report = aggregateHistory([noFeed, missing]);
    const player = report.players[0]!;
    expect(report.feedGames).toBe(1);
    expect(player.metrics).toEqual({
      seconds: { value: 4800, knownGames: 2 }, kills: { value: 12, knownGames: 2 }, deaths: { value: 0, knownGames: 1 }, cashDelta: { value: -150, knownGames: 1 },
      headshots: { value: null, knownGames: 0 }, teamKills: { value: null, knownGames: 0 }, suicides: { value: null, knownGames: 0 }, vehicleKills: { value: null, knownGames: 0 },
    });
    expect(player.kd).toBeNull();
    expect(player.eligible).toBe(true);
    const zeroDeaths = historyRecord('game-3');
    zeroDeaths.session.players[0]!.metrics = { seconds: 100, kills: 3, deaths: 0, cashDelta: 10 };
    expect(aggregateHistory([zeroDeaths]).players[0]!.kd).toBeNull();
    const withDeaths = historyRecord('game-4');
    withDeaths.session.players[0]!.metrics = { seconds: 100, kills: 3, deaths: 2, cashDelta: 10 };
    expect(aggregateHistory([withDeaths]).players[0]!.kd).toBe(1.5);
    expect(HISTORY_METRICS).toEqual(['seconds', 'kills', 'deaths', 'cashDelta', 'headshots', 'teamKills', 'suicides', 'vehicleKills']);
  });

  it('excludes unknown results from the win rate and sorts players by kills then platform ID, factions by wins then name', () => {
    const a = historyRecord('game-1');
    a.session.players = [
      { platform: 'steam', platformId: 'b-player', name: 'B', faction: 'Valkyra', result: 'win', metrics: { seconds: 60, kills: 5, deaths: 1, cashDelta: 0 } },
      { platform: 'steam', platformId: 'a-player', name: 'A', faction: 'Valkyra', result: null, metrics: { seconds: 60, kills: 5, deaths: 1, cashDelta: 0 } },
      { platform: 'xbox', platformId: 'c-player', name: 'C', faction: 'Manticore', result: 'loss', metrics: { seconds: 60, deaths: 1, cashDelta: 0 } },
    ];
    const b = historyRecord('game-2');
    b.session.warcon.winner = 'Manticore';
    b.session.players = [{ platform: 'steam', platformId: 'a-player', name: 'A', faction: 'Manticore', result: 'win', metrics: { seconds: 60, kills: 1, deaths: 1, cashDelta: 0 } }];
    const report = aggregateHistory([a, b]);
    expect(report.players.map((player) => [player.platformId, player.metrics.kills.value, player.winRate, player.unknownResults])).toEqual([['a-player', 6, 1, 1], ['b-player', 5, 1, 0], ['c-player', null, 0, 0]]);
    expect(report.factions.map((faction) => [faction.name, faction.wins, faction.winShare])).toEqual([['Manticore', 1, 0.5], ['Valkyra', 1, 0.5], ['Lonestar', 0, 0]]);
  });

  it('handles more than one page of games with the synthetic dataset facts (correction, rename, outcomes, platforms)', () => {
    const records = syntheticHistoryPages(now).flatMap((page) => page.items);
    expect(records).toHaveLength(SYNTHETIC_HISTORY_GAME_COUNT + 1);
    const report = aggregateHistory(records);
    expect(report.games).toBe(SYNTHETIC_HISTORY_GAME_COUNT);
    expect(report.outcomes).toEqual({ decided: 19, draw: 2, no_result: 1, unknown: 1 });
    expect(report.feedGames).toBe(22);
    expect(report.factions.map((faction) => [faction.name, faction.wins, faction.appearances, faction.colorHex])).toEqual([['Bravo', 8, 23, '#00ff00'], ['Alpha', 6, 23, '#ff0000'], ['Charlie', 5, 23, '#0000ff']]);
    expect(report.factions.map((faction) => faction.winShare)).toEqual([8 / 19, 6 / 19, 5 / 19]);
    expect(report.players).toHaveLength(SYNTHETIC_HISTORY_PLAYER_COUNT);
    expect(new Set(report.players.map((player) => player.platform))).toEqual(new Set(['steam', 'xbox', 'unknown']));
    const renamed = report.players.find((player) => player.platformId === 'synthetic-xbox-03')!;
    expect(renamed.name).toBe('[SYNTHETIC] Player 03 (renamed)');
    const zeroDeaths = report.players.find((player) => player.platformId === 'synthetic-xbox-24')!;
    expect(zeroDeaths).toMatchObject({ matches: 1, kd: null, metrics: { deaths: { value: 0, knownGames: 1 }, kills: { value: 3, knownGames: 1 } } });
    const unknownResult = report.players.find((player) => player.platformId === 'synthetic-steam-23')!;
    expect(unknownResult).toMatchObject({ matches: 2, unknownResults: 1 });
    expect(report.players.some((player) => (player.metrics.cashDelta.value ?? 0) < 0)).toBe(true);
    const missingCash = report.players.find((player) => player.platformId === 'synthetic-steam-08')!;
    expect(missingCash.metrics.cashDelta.knownGames).toBe(missingCash.matches - 1);
    expect(report.players.every((player) => player.metrics.headshots.knownGames <= player.matches)).toBe(true);
    // The correction (page 3, revision 6) replaced the first retained winner of game 3.
    const corrected = latestHistoryRecords(records).find((record) => record.id === `synthetic-game-${String(SYNTHETIC_HISTORY_CORRECTED_GAME + 1).padStart(2, '0')}`)!;
    expect(corrected).toMatchObject({ revision: '6', session: { warcon: { winner: 'Bravo' } } });
    expect(latestHistoryRecords(records).map((record) => record.session.endedAt)).toEqual([...latestHistoryRecords(records).map((record) => record.session.endedAt)].sort());
  });
});

describe('filterHistoryRecords and listHistoryMaps', () => {
  const records = syntheticHistoryPages(now).flatMap((page) => page.items);

  it('applies end-time [from, until) and the exact map locally like the producer, keeping duplicates for the aggregation', () => {
    const latest = latestHistoryRecords(records);
    const from = latest[10]!.session.endedAt;
    const until = latest[15]!.session.endedAt;
    const window = filterHistoryRecords(latest, { from, until });
    expect(window.map((record) => record.id)).toEqual(latest.slice(10, 15).map((record) => record.id));
    expect(filterHistoryRecords(latest, { until }).length).toBe(15);
    expect(filterHistoryRecords(latest, { from }).length).toBe(latest.length - 10);
    expect(filterHistoryRecords(latest, { map: 'Synthetic Ridge' }).every((record) => record.session.map === 'Synthetic Ridge')).toBe(true);
    expect(filterHistoryRecords(latest, { map: 'synthetic ridge' })).toEqual([]);
    expect(filterHistoryRecords(latest, { map: 'Synthetic Ridge', from, until }).length).toBeLessThan(window.length);
    expect(filterHistoryRecords(records, {})).toHaveLength(records.length);
    expect(filterHistoryRecords(latest, { sourceId: 'ab'.repeat(32) })).toEqual([]);
    const unmapped = structuredClone(latest[0]!);
    unmapped.session.map = null;
    expect(filterHistoryRecords([unmapped], { map: 'Synthetic Ridge' })).toEqual([]);
    expect(() => filterHistoryRecords(latest, { from: 'yesterday' })).toThrow(/Invalid history filter/);
  });

  it('lists the maps of the latest records with their counts, most played first', () => {
    expect(listHistoryMaps(records)).toEqual([{ name: 'Synthetic Harbour', games: 8 }, { name: 'Synthetic Training Ground', games: 8 }, { name: 'Synthetic Ridge', games: 7 }]);
    expect(listHistoryMaps([])).toEqual([]);
    const unmapped = structuredClone(records[0]!);
    unmapped.session.map = null;
    expect(listHistoryMaps([unmapped])).toEqual([]);
  });
});
