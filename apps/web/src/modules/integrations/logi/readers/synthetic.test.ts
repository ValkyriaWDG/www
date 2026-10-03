import { describe, expect, it } from 'vitest';
import { leagueFixturesPageSchema, leagueReadSchema, warconEnvelopeSchema } from './contracts';
import { canonicalLeagueMatchUrl } from './league-url';
import { SYNTHETIC_LEAGUE_FIXTURE_EVENT_ID, SYNTHETIC_LEAGUE_FIXTURE_IDS, syntheticLeagueFixtures, syntheticLeagueRead, syntheticWarconLive, syntheticWarconMatches } from './synthetic';

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
