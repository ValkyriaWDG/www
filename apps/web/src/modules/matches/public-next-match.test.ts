import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPublicLogiEvents } from '@/modules/integrations/logi-public';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { getLeagueFixtures } from '@/modules/integrations/logi/readers/fixtures';
import type { LeagueFixturePublic, LeagueFixturesPublic } from '@/modules/integrations/logi/readers/public';
import { leagueBrowserRows } from './league-browser';
import { getNextPublicMatch, mapPublishedLeagueMatchSlugs } from './queries';
import { getNextWebsiteMatch, selectNextWebsiteMatch } from './public-next-match';
import type { PublicMatchSummary } from './types';

vi.mock('@/lib/db', () => ({ getDb: vi.fn(() => ({})) }));
vi.mock('@/lib/env', () => ({ getServerEnv: () => ({ DATABASE_URL: 'synthetic-test-database' }) }));
vi.mock('@/modules/integrations/logi-public', () => ({ getPublicLogiEvents: vi.fn() }));
vi.mock('@/modules/integrations/logi/readers/fixtures', () => ({ getLeagueFixtures: vi.fn() }));
vi.mock('./queries', () => ({ getNextPublicMatch: vi.fn(), mapPublishedLeagueMatchSlugs: vi.fn() }));

const now = new Date('2026-10-05T12:00:00Z');
const local: PublicMatchSummary = { slug: 'synthetic-local', game: 'hell-let-loose', opponentName: 'Synthetic opponent', opponentShortCode: null, opponentLogo: null, competitionType: 'friendly', competitionName: null, startsAt: '2026-10-10T18:00:00Z', timeZone: 'Europe/Prague', originalStartsAt: null, status: 'scheduled', result: null };
const logi: PublicLogiEvent = { ref: { source: 'logi', sourceInstanceId: 'synthetic', guildId: '100000000000000001', game: 'hll', kind: 'match', externalId: 'event-1' }, title: 'Synthetic Red / Blue', kind: 'match', status: 'registration', startsAt: '2026-10-09T18:00:00Z', endsAt: '2026-10-09T20:00:00Z', sourceUpdatedAt: null, observedAt: now.toISOString(), teams: [], result: { state: 'unknown', version: null, reviewedAt: null, endedAt: null, participants: [], provenance: null } };
const wardogsLocal = { ...local, game: 'wardogs' as const };
const wardogsEvent = { ...logi, ref: { ...logi.ref, game: 'wardogs' as const } };
const fixture = (changes: Partial<LeagueFixturePublic> = {}): LeagueFixturePublic => ({ id: 'synthetic-league', sourceUrl: 'https://wardogsleague.net/matches/synthetic-league', eventId: null, tracking: 'tracked', state: 'fresh', observedAt: now.toISOString(), title: '[SYNTHETIC] Alpha / Bravo / Charlie', fixtureNumber: 42, type: 'Friendly', status: 'Scheduled', scheduledAt: '2026-10-08T18:00:00Z', teams: [{ code: 'AAA', name: 'Alpha' }, { code: 'BBB', name: 'Bravo' }, { code: 'CCC', name: 'Charlie' }], map: null, hosting: null, ...changes });
const fixtures = (items: LeagueFixturePublic[] = [fixture()]): LeagueFixturesPublic => ({ observedAt: now.toISOString(), state: 'fresh', synthetic: true, truncated: false, items });
const leagueRows = (items: LeagueFixturePublic[]) => leagueBrowserRows(fixtures(items), [], new Set(), { view: 'upcoming', now });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getPublicLogiEvents).mockResolvedValue([]);
  vi.mocked(getNextPublicMatch).mockResolvedValue(null);
  vi.mocked(getLeagueFixtures).mockResolvedValue(null);
  vi.mocked(mapPublishedLeagueMatchSlugs).mockResolvedValue(new Map());
});

describe('homepage next fixture from published sources', () => {
  it('chooses the earlier Logi fixture and preserves its whole title without inventing an opponent', () => {
    expect(selectNextWebsiteMatch(local, [logi], 'hll', now)).toMatchObject({ href: '/hll/matches/logi/event-1', title: logi.title, startsAt: logi.startsAt });
  });
  it('keeps an earlier local fixture and falls back to the archive when Logi is unavailable', () => {
    expect(selectNextWebsiteMatch(local, [{ ...logi, startsAt: '2026-10-11T18:00:00Z', endsAt: '2026-10-11T20:00:00Z' }], 'hll', now)).toMatchObject({ href: '/hll/matches/synthetic-local', opponent: local.opponentName });
    expect(selectNextWebsiteMatch(local, [], 'hll', now)?.href).toBe('/hll/matches/synthetic-local');
  });
  it('does not advertise the old date of a linked archive fixture after its current event has concluded', () => {
    expect(selectNextWebsiteMatch(local, [{ ...logi, status: 'concluded', archive: { slug: local.slug } }], 'hll', now)).toBeNull();
  });
  it('never substitutes an end date for a missing start or crosses game scope', () => {
    expect(selectNextWebsiteMatch(null, [{ ...logi, startsAt: null }], 'hll', now)).toBeNull();
    expect(selectNextWebsiteMatch(local, [logi], 'wardogs', now)).toBeNull();
  });
  it('keeps a pending Wardogs source title consistent with the list/header without inferring a two-team opponent', async () => {
    const pending: PublicLogiEvent = { ...wardogsEvent, title: 'VLK vs III vs KOD', teams: [
      { id: 'synthetic-captured-vlk', slot: 'a', name: 'Valkyria', shortCode: 'VLK', side: null },
      { id: 'synthetic-captured-kod', slot: 'b', name: 'KidsOnDrugs', shortCode: 'KOD', side: null },
    ] };
    const before = structuredClone(pending);
    const expected = { href: '/wardogs/matches/logi/event-1', title: 'VLK vs III vs KOD', opponent: '', game: 'wardogs', startsAt: pending.startsAt, competition: null };
    expect(selectNextWebsiteMatch(wardogsLocal, [pending], 'wardogs', now)).toEqual(expected);
    vi.mocked(getPublicLogiEvents).mockResolvedValue([pending]);
    vi.mocked(getNextPublicMatch).mockResolvedValue(wardogsLocal);
    expect(await getNextWebsiteMatch('wardogs', now)).toEqual(expected);
    expect(pending).toEqual(before);
  });
  it('chooses the earliest actual League kickoff across all sources without inferring an opposing team', () => {
    expect(selectNextWebsiteMatch(wardogsLocal, [wardogsEvent], 'wardogs', now, leagueRows([fixture()]))).toEqual({ href: '/wardogs/matches/league/synthetic-league', title: fixture().title, opponent: '', game: 'wardogs', startsAt: fixture().scheduledAt, competition: 'Wardogs League' });
  });
  it('keeps earlier native/archive dates and compares multiple League rows independently of source order', () => {
    const later = leagueRows([fixture({ scheduledAt: '2026-10-12T18:00:00Z' })]);
    expect(selectNextWebsiteMatch(wardogsLocal, [wardogsEvent], 'wardogs', now, later)?.href).toBe('/wardogs/matches/logi/event-1');
    expect(selectNextWebsiteMatch(wardogsLocal, [], 'wardogs', now, later)?.href).toBe('/wardogs/matches/synthetic-local');
    expect(selectNextWebsiteMatch(null, [], 'wardogs', now, leagueRows([fixture({ id: 'later', scheduledAt: '2026-10-12T18:00:00Z' }), fixture({ id: 'earlier' })]))?.href).toBe('/wardogs/matches/league/earlier');
  });
  it('never borrows a League observation timestamp for an unknown kickoff or crosses game scope', () => {
    expect(selectNextWebsiteMatch(null, [], 'wardogs', now, leagueRows([fixture({ scheduledAt: null })]))).toBeNull();
    expect(selectNextWebsiteMatch(local, [logi], 'hll', now, leagueRows([fixture()]))?.href).toBe('/hll/matches/logi/event-1');
    expect(selectNextWebsiteMatch(null, [], 'hll', now, leagueRows([fixture()]))).toBeNull();
  });
});

describe('next-match League source composition', () => {
  it('uses the common public fixture rules and published archive binding lookup', async () => {
    vi.mocked(getNextPublicMatch).mockResolvedValue(wardogsLocal);
    vi.mocked(getLeagueFixtures).mockResolvedValue(fixtures());
    expect((await getNextWebsiteMatch('wardogs', now))?.href).toBe('/wardogs/matches/league/synthetic-league');
    expect(mapPublishedLeagueMatchSlugs).toHaveBeenCalledWith(expect.anything(), ['synthetic-league']);
    vi.mocked(mapPublishedLeagueMatchSlugs).mockResolvedValue(new Map([['synthetic-league', local.slug]]));
    expect((await getNextWebsiteMatch('wardogs', now))?.href).toBe('/wardogs/matches/synthetic-local');
  });
  it.each(['source', 'bindings'] as const)('keeps native and archive fallbacks when the League %s read fails', async (failure) => {
    vi.mocked(getNextPublicMatch).mockResolvedValue(wardogsLocal);
    vi.mocked(getPublicLogiEvents).mockResolvedValue([wardogsEvent]);
    if (failure === 'source') vi.mocked(getLeagueFixtures).mockRejectedValue(new Error('Synthetic source failure'));
    else {
      vi.mocked(getLeagueFixtures).mockResolvedValue(fixtures());
      vi.mocked(mapPublishedLeagueMatchSlugs).mockRejectedValue(new Error('Synthetic binding failure'));
    }
    expect((await getNextWebsiteMatch('wardogs', now))?.href).toBe('/wardogs/matches/logi/event-1');
    vi.mocked(getPublicLogiEvents).mockResolvedValue([]);
    expect((await getNextWebsiteMatch('wardogs', now))?.href).toBe('/wardogs/matches/synthetic-local');
    vi.mocked(getNextPublicMatch).mockResolvedValue(null);
    expect(await getNextWebsiteMatch('wardogs', now)).toBeNull();
  });
  it('never bypasses an unpublished event binding, paused row or absent kickoff', async () => {
    for (const item of [fixture({ eventId: 'not-published' }), fixture({ tracking: 'paused' }), fixture({ scheduledAt: null })]) {
      vi.mocked(getLeagueFixtures).mockResolvedValue(fixtures([item]));
      expect(await getNextWebsiteMatch('wardogs', now)).toBeNull();
    }
  });
  it('does not read the Wardogs fixture source for HLL', async () => {
    vi.mocked(getNextPublicMatch).mockResolvedValue(local);
    expect((await getNextWebsiteMatch('hll', now))?.href).toBe('/hll/matches/synthetic-local');
    expect(getLeagueFixtures).not.toHaveBeenCalled();
    expect(mapPublishedLeagueMatchSlugs).not.toHaveBeenCalled();
  });
  it('keeps the archive when the native source fails independently', async () => {
    vi.mocked(getNextPublicMatch).mockResolvedValue(wardogsLocal);
    vi.mocked(getPublicLogiEvents).mockRejectedValue(new Error('Synthetic native failure'));
    expect((await getNextWebsiteMatch('wardogs', now))?.href).toBe('/wardogs/matches/synthetic-local');
  });
});
