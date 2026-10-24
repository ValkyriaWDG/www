import { describe, expect, it } from 'vitest';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { LEAGUE_FIXTURES_MAX_AGE_MS, type LeagueFixturePublic, type LeagueFixturesPublic } from '@/modules/integrations/logi/readers/public';
import { leagueBrowserRows } from './league-browser';

const now = new Date('2026-10-24T12:00:00Z');
const future = '2026-10-25T16:00:00Z';
const past = '2026-10-23T16:00:00Z';
const fixture = (id: string, changes: Partial<LeagueFixturePublic> = {}): LeagueFixturePublic => ({
  id, sourceUrl: `https://wardogsleague.net/matches/${id}`, eventId: null, tracking: 'tracked', state: 'fresh', observedAt: now.toISOString(),
  title: '[SYNTHETIC] Tři týmy', fixtureNumber: 42, type: 'Tournament', status: 'Scheduled', scheduledAt: future,
  teams: [{ code: 'AAA', name: 'Synthetic Alpha' }, { code: 'BBB', name: 'Synthetic Bravo' }, { code: 'CCC', name: null }],
  map: { name: 'Synthetic Harbour', zone: 'North', lighting: 'Dawn' }, hosting: { mode: 'Self hosted', teamCode: 'CCC' }, ...changes,
});
const list = (items: LeagueFixturePublic[], changes: Partial<LeagueFixturesPublic> = {}): LeagueFixturesPublic => ({ observedAt: now.toISOString(), state: 'fresh', synthetic: true, truncated: false, items, ...changes });
const rows = (items: LeagueFixturePublic[], view: 'upcoming' | 'results' = 'upcoming', q?: string) => leagueBrowserRows(list(items), [], new Set(), { view, now, q });
const event: PublicLogiEvent = {
  ref: { source: 'logi', sourceInstanceId: 'synthetic', guildId: '100000000000000001', game: 'wardogs', kind: 'match', externalId: 'published-event' },
  title: 'Synthetic public match', kind: 'match', status: 'registration', startsAt: future, endsAt: future, observedAt: now.toISOString(), sourceUpdatedAt: null, teams: [],
  result: { state: 'unknown', version: null, reviewedAt: null, endedAt: null, participants: [], provenance: null },
};

describe('League fixtures in the common match browser', () => {
  it('keeps source order, exact schedule, N-team facts and synthetic titles without manufacturing results', () => {
    const unknown = fixture('unknown', { scheduledAt: null, state: 'stale' });
    const scheduled = fixture('scheduled');
    const input = list([unknown, scheduled], { state: 'stale', truncated: true });
    const result = leagueBrowserRows(input, [], new Set(), { view: 'upcoming', now });
    expect(result.map((row) => row.key)).toEqual(['league:wardogs:unknown', 'league:wardogs:scheduled']);
    expect(result[0]).toEqual({ kind: 'league', key: 'league:wardogs:unknown', href: '/wardogs/matches/league/unknown', at: null, game: 'wardogs', fixture: unknown });
    expect(result[1]!.at).toBe(future);
    expect(result[0]!.fixture).toBe(unknown);
    expect(result[0]!.fixture.teams).toHaveLength(3);
    expect(input).toMatchObject({ synthetic: true, truncated: true, state: 'stale' });
    expect(JSON.stringify(result)).not.toMatch(/score|result|endedAt/);
  });

  it.each([
    ['Completed', future, 'results'], [' cancelled ', null, 'results'], ['Live', past, 'upcoming'],
    ['Confirmed', future, 'results'], [' confirmed ', null, 'results'], ['CONFIRMED', future, 'results'],
    ['Set by admin', future, 'results'], [' set by admin ', null, 'results'], ['SET BY ADMIN', future, 'results'],
    ['Scheduled', past, 'results'], [null, past, 'results'], ['Scheduled', future, 'upcoming'],
    [null, null, 'upcoming'], ['Scheduled', now.toISOString(), 'upcoming'], ['Unknown source status', null, 'upcoming'],
    ['Confirmation pending', future, 'upcoming'], ['Set by administrator', null, 'upcoming'],
  ] as const)('places status %s at %s in %s without altering source facts', (status, scheduledAt, view) => {
    const item = fixture('classification', { status, scheduledAt });
    expect(rows([item], view)).toHaveLength(1);
    expect(rows([item], view === 'upcoming' ? 'results' : 'upcoming')).toEqual([]);
    expect(rows([item], view)[0]!.fixture).toEqual(item);
    expect(rows([item], view)[0]!.fixture).not.toHaveProperty('result');
  });

  it('suppresses published and unpublished event bindings and published archive duplicates', () => {
    const items = [fixture('public-bound', { eventId: event.ref.externalId }), fixture('unpublished-bound', { eventId: 'unpublished-event' }), fixture('archive-bound'), fixture('unbound')];
    expect(leagueBrowserRows(list(items), [event], new Set(['archive-bound']), { view: 'upcoming', now }).map((row) => row.fixture.id)).toEqual(['unbound']);
    expect(leagueBrowserRows(list(items), [], new Set(['archive-bound']), { view: 'upcoming', now }).map((row) => row.fixture.id)).toEqual(['unbound']);
  });

  it.each(['pending', 'unmatched', 'ignored', 'paused', 'archived'] as const)('does not promote a %s tracking row', (tracking) => {
    expect(rows([fixture('non-tracked', { tracking })])).toEqual([]);
  });

  it.each([' TRI TYMY ', 'bravo', 'ccc', 'harbour', 'north', 'dawn', 'tournament'])('searches the supplied title/team/code/map/type using %s', (q) => {
    expect(rows([fixture('searched')], 'upcoming', q)).toHaveLength(1);
    expect(rows([fixture('searched')], 'results', q)).toEqual([]);
  });

  it('drops nonmatching searches and repeated fixture IDs while retaining the first source facts', () => {
    const first = fixture('same');
    expect(rows([first, fixture('same', { title: 'Later duplicate' })]).map((row) => row.fixture)).toEqual([first]);
    expect(rows([first], 'upcoming', 'absent-opponent')).toEqual([]);
  });

  it('keeps the existing public age and unavailable boundaries', () => {
    const expired = fixture('expired', { observedAt: new Date(now.getTime() - LEAGUE_FIXTURES_MAX_AGE_MS - 1).toISOString() });
    expect(rows([expired])).toEqual([]);
    expect(leagueBrowserRows(null, [], new Set(), { view: 'upcoming', now })).toEqual([]);
    expect(leagueBrowserRows(list([fixture('hidden')], { state: 'unavailable' }), [], new Set(), { view: 'upcoming', now })).toEqual([]);
  });
});
