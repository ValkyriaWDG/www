import { describe, expect, it } from 'vitest';
import { leagueFixturesPageSchema, leagueReadSchema, warconEnvelopeSchema } from './contracts';
import { historyPageSchema } from './history-contracts';
import { latestHistoryRecords } from './history-report';
import { canonicalLeagueMatchUrl } from './league-url';
import {
  SYNTHETIC_HISTORY_CORRECTED_GAME, SYNTHETIC_HISTORY_CURSORS, SYNTHETIC_HISTORY_GAME_COUNT, SYNTHETIC_HISTORY_GUILD_ID, SYNTHETIC_HISTORY_MAPS, SYNTHETIC_HISTORY_PLAYER_COUNT, SYNTHETIC_HISTORY_REVISION, SYNTHETIC_HISTORY_SOURCE_ID,
  SYNTHETIC_LEAGUE_FIXTURE_EVENT_ID, SYNTHETIC_LEAGUE_FIXTURE_IDS, syntheticHistoryPages, syntheticLeagueFixtures, syntheticLeagueRead, syntheticWarconLive, syntheticWarconMatches,
} from './synthetic';

const now = new Date('2026-10-03T12:00:00.000Z');

describe('synthetic reader observations', () => {
  it('validate against the closed wire schemas and are labelled', () => {
    expect(leagueFixturesPageSchema.safeParse({ items: syntheticLeagueFixtures(now), nextCursor: null }).success).toBe(true);
    expect(leagueReadSchema.safeParse(syntheticLeagueRead(canonicalLeagueMatchUrl('https://wardogsleague.net/matches/abc')!, now)).success).toBe(true);
    expect(warconEnvelopeSchema.safeParse(syntheticWarconLive(now)).success).toBe(true);
    expect(warconEnvelopeSchema.safeParse(syntheticWarconMatches(now)).success).toBe(true);
    expect(syntheticLeagueFixtures(now).every((item) => item.snapshot.title.startsWith('[SYNTHETIC]') && item.snapshot.teams?.every((team) => team.name?.startsWith('Synthetic')))).toBe(true);
  });

  it('track three fixtures: two upcoming ones and a paused, stale one without a kickoff', () => {
    const [alpha, bravo, charlie] = syntheticLeagueFixtures(now);
    expect([alpha!.id, bravo!.id, charlie!.id]).toEqual([SYNTHETIC_LEAGUE_FIXTURE_IDS.alpha, SYNTHETIC_LEAGUE_FIXTURE_IDS.bravo, SYNTHETIC_LEAGUE_FIXTURE_IDS.charlie]);
    expect(alpha).toMatchObject({ state: 'tracked', eventId: null, stale: false, error: null, ageSeconds: 60 });
    expect(alpha!.snapshot.scheduledAt).toBe('2026-10-10T12:00:00.000Z');
    expect(bravo).toMatchObject({ state: 'tracked', eventId: null, stale: false, error: null, ageSeconds: 90 });
    expect(bravo!.snapshot.scheduledAt).toBe('2026-10-13T12:00:00.000Z');
    expect(charlie).toMatchObject({ state: 'paused', eventId: SYNTHETIC_LEAGUE_FIXTURE_EVENT_ID, stale: true, error: 'timeout', ageSeconds: 20 * 60 });
    expect(charlie!.snapshot).toMatchObject({ scheduledAt: null, fetchedAt: '2026-10-03T11:40:00.000Z' });
    for (const item of [alpha!, bravo!, charlie!]) {
      expect(canonicalLeagueMatchUrl(item.snapshot.sourceUrl)).toEqual({ id: item.id, url: item.snapshot.sourceUrl });
      expect(item.snapshot.id).toBe(item.id);
      expect(item.snapshot.results).toBeNull();
    }
  });

  it('give the alpha fixture the same snapshot as its match-page preview', () => {
    const url = canonicalLeagueMatchUrl(`https://wardogsleague.net/matches/${SYNTHETIC_LEAGUE_FIXTURE_IDS.alpha}`)!;
    expect(syntheticLeagueFixtures(now)[0]!.snapshot).toEqual(syntheticLeagueRead(url, now).snapshot);
  });
});

describe('synthetic retained game history', () => {
  const pages = syntheticHistoryPages(now);
  const records = latestHistoryRecords(pages.flatMap((page) => page.items));

  it('serves three validated pages: 20 games, an empty continuation with a cursor and 3 games plus one correction', () => {
    expect(pages.every((page) => historyPageSchema.safeParse(page).success)).toBe(true);
    expect(pages.map((page) => [page.items.length, page.revision, page.nextCursor])).toEqual([[20, SYNTHETIC_HISTORY_REVISION, SYNTHETIC_HISTORY_CURSORS[0]], [0, SYNTHETIC_HISTORY_REVISION, SYNTHETIC_HISTORY_CURSORS[1]], [4, SYNTHETIC_HISTORY_REVISION, null]]);
    expect(pages.every((page) => page.lastCollectedAt === '2026-10-03T11:55:00.000Z')).toBe(true);
    const correctedId = `synthetic-game-${String(SYNTHETIC_HISTORY_CORRECTED_GAME + 1).padStart(2, '0')}`;
    const copies = pages.flatMap((page) => page.items).filter((record) => record.id === correctedId);
    expect(copies.map((record) => [record.revision, record.session.warcon.winner])).toEqual([['3', 'Charlie'], ['6', 'Bravo']]);
    expect(copies[1]!.session.players.map((player) => player.platformId)).toEqual(copies[0]!.session.players.map((player) => player.platformId));
  });

  it('describes 23 labelled games over 60 days on three maps with the documented outcomes and 24 players', () => {
    expect(records).toHaveLength(SYNTHETIC_HISTORY_GAME_COUNT);
    expect(records.every((record) => record.guildId === SYNTHETIC_HISTORY_GUILD_ID && record.sourceId === SYNTHETIC_HISTORY_SOURCE_ID && record.serverName === '[SYNTHETIC] Warcon Test Server')).toBe(true);
    expect(records.every((record) => Date.parse(record.session.endedAt) >= now.getTime() - 60 * 24 * 60 * 60_000 && Date.parse(record.session.endedAt) < now.getTime())).toBe(true);
    expect(new Set(records.map((record) => record.session.map))).toEqual(new Set(SYNTHETIC_HISTORY_MAPS));
    expect(new Set(records.map((record) => record.session.warcon.mode))).toEqual(new Set(['Synthetic Objective', 'Synthetic Skirmish']));
    expect(new Set(records.map((record) => record.session.warcon.lighting))).toEqual(new Set(['Synthetic Dawn', 'Synthetic Dusk', 'Synthetic Night']));
    const outcomes = records.reduce((counts, record) => ({ ...counts, [record.session.warcon.outcome]: (counts[record.session.warcon.outcome] ?? 0) + 1 }), {} as Record<string, number>);
    expect(outcomes).toEqual({ decided: 19, draw: 2, no_result: 1, unknown: 1 });
    expect(records.filter((record) => !record.session.warcon.hasFeed)).toHaveLength(1);
    const players = new Set(records.flatMap((record) => record.session.players.map((player) => `${player.platform}:${player.platformId}`)));
    expect(players.size).toBe(SYNTHETIC_HISTORY_PLAYER_COUNT);
    expect(records.flatMap((record) => record.session.players).every((player) => player.name?.startsWith('[SYNTHETIC] Player') && player.platformId.startsWith('synthetic-'))).toBe(true);
    expect(records.every((record) => record.session.warcon.factions.map((faction) => [faction.name, faction.colorHex]).join() === 'Alpha,#ff0000,Bravo,#00ff00,Charlie,#0000ff')).toBe(true);
    expect(records.some((record) => record.session.players.some((player) => (player.metrics.cashDelta ?? 0) < 0))).toBe(true);
    expect(records.some((record) => record.session.players.some((player) => player.metrics.deaths === 0))).toBe(true);
    expect(records.some((record) => record.session.warcon.outcome === 'decided' && record.session.players.some((player) => player.result === null))).toBe(true);
    expect(JSON.stringify(pages)).not.toMatch(/7656119|wardogsleague|igportals/);
  });
});
