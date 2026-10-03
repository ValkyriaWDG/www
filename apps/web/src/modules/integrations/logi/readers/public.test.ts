import { describe, expect, it } from 'vitest';
import leagueFixture from '../fixtures/league-v0.12-stale-http.json';
import warconFixture from '../fixtures/warcon-v0.11.json';
import { leagueReadSchema, warconEnvelopeResponseSchema, type LeagueFixture, type WarconLive, type WarconMatches } from './contracts';
import {
  ageLeagueFixturesPublic, ageLeaguePreviewPublic, ageWarconLivePublic, ageWarconRecentMatchesPublic, ageWarconServerPublic, LEAGUE_FIXTURES_MAX_AGE_MS, LEAGUE_FIXTURES_PUBLIC_LIMIT,
  READER_PUBLIC_MAX_AGE_MS, toLeagueFixturesPublic, toLeaguePreviewPublic, toWarconLivePublic, toWarconRecentMatchesPublic,
} from './public';
import { SYNTHETIC_LEAGUE_FIXTURE_EVENT_ID, syntheticLeagueFixtures } from './synthetic';

const now = new Date('2026-10-02T12:00:20.000Z');
const liveEnvelope = warconEnvelopeResponseSchema.parse(warconFixture.live).data;
const matchesEnvelope = warconEnvelopeResponseSchema.parse(warconFixture.matches).data;
const live = liveEnvelope.result.data as WarconLive;
const matches = matchesEnvelope.result.data as WarconMatches;
const stale = leagueReadSchema.parse(leagueFixture.stale);

/** Identity and operational keys that must never appear in any public DTO. */
const FORBIDDEN = /steamId|serverId|gameServerId|connectionId|build|tier|reservedSlots|throttledUntil|ping|cash|players"|colorHex|apiKey|origin|moderator|warnings|parserVersion|displayedMemberCount|nations|profileUrl|request|ballots|7656119/;

describe('Warcon public projections', () => {
  it('projects live facts without identities or operational fields', () => {
    const dto = toWarconLivePublic('community-one', live, now, true);
    expect(dto).toEqual({
      publicId: 'community-one', observedAt: '2026-10-02T12:00:00.000Z', freshness: 'fresh', serverName: 'Synthetic Wardogs', map: 'Bakurani', lighting: 'Day',
      playerCount: 1, maxPlayers: 100, matchSeconds: null, scores: [{ name: 'Alpha', score: 0 }, { name: 'Bravo', score: 12 }, { name: 'Charlie', score: 7 }], rotationNow: 0, rotationNext: 1,
    });
    expect(JSON.stringify(dto)).not.toMatch(FORBIDDEN);
    expect(JSON.stringify(dto)).not.toContain('Synthetic Ranger');
  });

  it('is unavailable after a failed pull, a missing status or a missing observation', () => {
    expect(toWarconLivePublic('community-one', live, now, false)).toMatchObject({ freshness: 'unavailable', map: null, scores: [], playerCount: null, observedAt: '2026-10-02T12:00:00.000Z' });
    expect(toWarconLivePublic('community-one', null, now, true).freshness).toBe('unavailable');
    expect(toWarconLivePublic('community-one', { ...live, status: null }, now, true).freshness).toBe('unavailable');
  });

  it('is never fresh when the producer reports an unhealthy connection or stale data', () => {
    expect(toWarconLivePublic('community-one', { ...live, ok: false }, now, true)).toMatchObject({ freshness: 'stale', map: 'Bakurani', scores: [], rotationNow: null });
    expect(toWarconLivePublic('community-one', { ...live, freshness: 'stale' }, now, true).freshness).toBe('stale');
    expect(toWarconLivePublic('community-one', { ...live, freshness: 'unavailable' }, now, true).freshness).toBe('unavailable');
  });

  it('ages by the website clock: stale after 45 s, unavailable after 180 s, at most stale after a failed browser refresh', () => {
    const dto = toWarconLivePublic('community-one', live, now, true);
    expect(ageWarconLivePublic(dto, now).freshness).toBe('fresh');
    expect(ageWarconLivePublic(dto, new Date(now.getTime() + 30_000))).toMatchObject({ freshness: 'stale', map: 'Bakurani', scores: [], matchSeconds: null });
    expect(ageWarconLivePublic(dto, now, true)).toMatchObject({ freshness: 'stale', scores: [] });
    expect(ageWarconLivePublic(dto, new Date(now.getTime() + 170_000))).toMatchObject({ freshness: 'unavailable', map: null, observedAt: dto.observedAt });
    expect(ageWarconLivePublic({ ...dto, freshness: 'stale' }, now).freshness).toBe('stale');
  });

  it('keeps the last five recent matches without player rows and ages them with the server policy', () => {
    const many = { ...matches, matches: Array.from({ length: 8 }, (_, index) => ({ ...matches.matches[0]!, id: index + 1, startedAt: `2026-10-02T0${index + 1}:00:00.000Z` })) };
    const dto = toWarconRecentMatchesPublic('community-one', many, matchesEnvelope.fetchedAt, now, true);
    expect(dto.matches.map((row) => row.id)).toEqual([8, 7, 6, 5, 4]);
    expect(dto.freshness).toBe('fresh');
    expect(Object.keys(dto.matches[0]!)).toEqual(['id', 'startedAt', 'endedAt', 'map', 'experiences', 'lighting', 'peakPlayers', 'finalScores', 'winner']);
    expect(JSON.stringify(dto)).not.toMatch(FORBIDDEN);
    expect(toWarconRecentMatchesPublic('community-one', matches, matchesEnvelope.fetchedAt, now, false).freshness).toBe('stale');
    expect(toWarconRecentMatchesPublic('community-one', matches, matchesEnvelope.fetchedAt, new Date(now.getTime() + 31 * 60_000), true)).toMatchObject({ freshness: 'unavailable', matches: [] });
    expect(toWarconRecentMatchesPublic('community-one', null, null, now, true).freshness).toBe('unavailable');
    expect(ageWarconRecentMatchesPublic(dto, new Date(now.getTime() + 3 * 60_000)).freshness).toBe('stale');
    expect(ageWarconRecentMatchesPublic(dto, now, true).freshness).toBe('stale');
    const entry = ageWarconServerPublic({ publicId: 'community-one', synthetic: false, live: toWarconLivePublic('community-one', live, now, true), recentMatches: dto }, new Date(now.getTime() + 31 * 60_000));
    expect(entry.live.freshness).toBe('unavailable');
    expect(entry.recentMatches?.matches).toEqual([]);
  });
});

describe('League preview projection', () => {
  const fetchedAt = Date.parse(stale.snapshot!.fetchedAt);

  it('maps the recorded stale read without moderator, member counts, nations, warnings or results', () => {
    const dto = toLeaguePreviewPublic('https://wardogsleague.net/matches/cmuqt8ep605e1lf018w2nlywu', stale, new Date(fetchedAt + 5 * 60_000), true);
    expect(dto).toMatchObject({
      state: 'stale', observedAt: '2026-10-02T19:11:02.212Z', title: 'VLK · ROG · BAMC', fixtureNumber: 38, type: 'Friendly', status: 'Scheduled', scheduledAt: '2026-10-10T18:30:00.000Z',
      teams: [{ code: 'VLK', name: 'Valkyria' }, { code: 'ROG', name: 'Team Rogue' }, { code: 'BAMC', name: 'Batallón de Asalto, Maniobra y Combate' }],
      map: { name: 'Zestafona', zone: 'SmallFactory', lighting: 'DayLateGrayFog' }, hosting: { mode: 'Self-hosted', teamCode: 'VLK' }, mapVote: { status: 'Open', closesAt: '2026-10-03T10:19:33.154Z' },
    });
    expect(dto.progress).toHaveLength(9);
    expect(JSON.stringify(dto)).not.toMatch(FORBIDDEN);
    expect(JSON.stringify(dto)).not.toMatch(/results|"moderator"|readyCheck|"rules"|scoringRule|results_not_supported/);
    expect('results' in dto).toBe(false);
  });

  it('is fresh only for a snapshot the producer did not flag and the website pulled successfully', () => {
    const fresh = { ...stale, stale: false, error: null };
    expect(toLeaguePreviewPublic(stale.snapshot!.sourceUrl, fresh, new Date(fetchedAt + 60_000), true).state).toBe('fresh');
    expect(toLeaguePreviewPublic(stale.snapshot!.sourceUrl, fresh, new Date(fetchedAt + 60_000), false).state).toBe('stale');
    expect(toLeaguePreviewPublic(stale.snapshot!.sourceUrl, { ...fresh, stale: true }, new Date(fetchedAt + 60_000), true).state).toBe('stale');
  });

  it('shows nothing for a snapshot older than the public maximum age, a cooldown read or a future observation', () => {
    const url = stale.snapshot!.sourceUrl;
    expect(toLeaguePreviewPublic(url, stale, new Date(fetchedAt + READER_PUBLIC_MAX_AGE_MS + 1), true)).toMatchObject({ state: 'unavailable', title: null, teams: [], observedAt: null, sourceUrl: url });
    expect(toLeaguePreviewPublic(url, leagueReadSchema.parse(leagueFixture.cooldown), new Date(fetchedAt), true).state).toBe('unavailable');
    expect(toLeaguePreviewPublic(url, stale, new Date(fetchedAt - 60_000), true).state).toBe('unavailable');
    expect(toLeaguePreviewPublic(url, null, new Date(fetchedAt), true).state).toBe('unavailable');
    const shown = toLeaguePreviewPublic(url, stale, new Date(fetchedAt + 60_000), true);
    expect(ageLeaguePreviewPublic(shown, new Date(fetchedAt + 2 * 60_000)).state).toBe('stale');
    expect(ageLeaguePreviewPublic(shown, new Date(fetchedAt + READER_PUBLIC_MAX_AGE_MS + 1)).state).toBe('unavailable');
  });
});

describe('League fixtures projection', () => {
  const at = new Date('2026-10-03T12:00:00.000Z');
  const items = syntheticLeagueFixtures(at);

  it('maps tracked fixtures without producer identities, keeps the paused one stale and sorts unscheduled fixtures last', () => {
    const dto = toLeagueFixturesPublic(items, at, true, true);
    expect(dto).toMatchObject({ state: 'fresh', synthetic: true, truncated: false, observedAt: items[0]!.snapshot.fetchedAt });
    expect(dto.items.map((item) => [item.id, item.state, item.tracking, item.scheduledAt === null])).toEqual([
      ['synthetic-fixture-alpha', 'fresh', 'tracked', false], ['synthetic-fixture-bravo', 'fresh', 'tracked', false], ['synthetic-fixture-charlie', 'stale', 'paused', true],
    ]);
    expect(dto.items[2]).toMatchObject({ eventId: SYNTHETIC_LEAGUE_FIXTURE_EVENT_ID, sourceUrl: 'https://wardogsleague.net/matches/synthetic-fixture-charlie' });
    expect(dto.items[0]).toMatchObject({ eventId: null, title: '[SYNTHETIC] SYA · SYB · SYC (synthetic-fixture-alpha)', fixtureNumber: 42, type: 'Friendly', status: 'Scheduled', teams: [{ code: 'SYA', name: 'Synthetic Alpha' }, { code: 'SYB', name: 'Synthetic Bravo' }, { code: 'SYC', name: 'Synthetic Charlie' }], map: { name: 'Synthetic Training Ground', zone: 'Synthetic Zone', lighting: 'Synthetic Dusk' }, hosting: { mode: 'Self-hosted', teamCode: 'SYA' } });
    expect(Object.keys(dto.items[0]!).sort()).toEqual(['eventId', 'fixtureNumber', 'hosting', 'id', 'map', 'observedAt', 'scheduledAt', 'sourceUrl', 'state', 'status', 'teams', 'title', 'tracking', 'type']);
    expect(JSON.stringify(dto)).not.toMatch(FORBIDDEN);
    expect(JSON.stringify(dto)).not.toMatch(/revision|guildId|lastAttemptAt|ageSeconds|"error"|timeout|results|"moderator"|readyCheck|"rules"|scoringRule|mapVote|progress|gameId/);
  });

  it('is stale after a failed website pull and unavailable without any answered list', () => {
    const failed = toLeagueFixturesPublic(items, at, false);
    expect(failed.state).toBe('stale');
    expect(failed.items.map((item) => item.state)).toEqual(['stale', 'stale', 'stale']);
    expect(toLeagueFixturesPublic(null, at, true)).toEqual({ observedAt: null, state: 'unavailable', synthetic: false, truncated: false, items: [] });
    expect(toLeagueFixturesPublic(null, at, false, true, true)).toMatchObject({ state: 'unavailable', synthetic: true, truncated: false });
    expect(toLeagueFixturesPublic([], at, true, false, true)).toMatchObject({ state: 'fresh', observedAt: null, truncated: true, items: [] });
    expect(toLeagueFixturesPublic(items.map((item) => ({ ...item, error: 'network' })), at, true).items.every((item) => item.state === 'stale')).toBe(true);
  });

  it('drops snapshots older than the public maximum age or from the future, sorts by kickoff and caps the list', () => {
    const old: LeagueFixture = { ...items[0]!, snapshot: { ...items[0]!.snapshot, fetchedAt: new Date(at.getTime() - LEAGUE_FIXTURES_MAX_AGE_MS - 1000).toISOString() } };
    const future: LeagueFixture = { ...items[1]!, snapshot: { ...items[1]!.snapshot, fetchedAt: new Date(at.getTime() + 60_000).toISOString() } };
    expect(toLeagueFixturesPublic([old, future, items[2]!], at, true).items.map((item) => item.id)).toEqual(['synthetic-fixture-charlie']);
    const many = Array.from({ length: LEAGUE_FIXTURES_PUBLIC_LIMIT + 5 }, (_, index) => ({
      ...items[0]!, id: `fx-${String(index).padStart(2, '0')}`,
      snapshot: { ...items[0]!.snapshot, id: `fx-${String(index).padStart(2, '0')}`, sourceUrl: `https://wardogsleague.net/matches/fx-${String(index).padStart(2, '0')}`, scheduledAt: index % 5 === 0 ? null : new Date(at.getTime() + (30 - index) * 60 * 60_000).toISOString() },
    }));
    const dto = toLeagueFixturesPublic(many, at, true);
    expect(dto.items).toHaveLength(LEAGUE_FIXTURES_PUBLIC_LIMIT);
    const scheduled = dto.items.map((item) => item.scheduledAt);
    expect(scheduled.every((value) => value !== null)).toBe(true);
    expect([...scheduled].sort()).toEqual(scheduled);
    expect(dto.items[0]!.id).toBe('fx-24');
    const withUnscheduled = toLeagueFixturesPublic(many.slice(0, 7), at, true).items;
    expect(withUnscheduled.slice(-2).map((item) => item.scheduledAt)).toEqual([null, null]);
    expect(withUnscheduled.slice(-2).map((item) => item.id)).toEqual(['fx-00', 'fx-05']);
  });

  it('ages a list for rendering: fixtures past the maximum age disappear while the collection state is kept', () => {
    const dto = toLeagueFixturesPublic(items, at, true);
    expect(ageLeagueFixturesPublic(dto, new Date(at.getTime() + 60_000))).toBe(dto);
    const later = ageLeagueFixturesPublic(dto, new Date(at.getTime() + LEAGUE_FIXTURES_MAX_AGE_MS - 10 * 60_000));
    expect(later.items.map((item) => item.id)).toEqual(['synthetic-fixture-alpha', 'synthetic-fixture-bravo']);
    expect(later).toMatchObject({ state: 'fresh', observedAt: items[0]!.snapshot.fetchedAt });
    expect(ageLeagueFixturesPublic(dto, new Date(at.getTime() + LEAGUE_FIXTURES_MAX_AGE_MS + 60_000))).toMatchObject({ state: 'fresh', observedAt: null, items: [] });
    const unavailable = toLeagueFixturesPublic(null, at, true);
    expect(ageLeagueFixturesPublic(unavailable, at)).toBe(unavailable);
  });
});
