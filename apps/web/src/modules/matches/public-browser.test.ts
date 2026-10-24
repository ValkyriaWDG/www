import { describe, expect, it } from 'vitest';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import type { LeagueFixturePublic, LeagueFixturesPublic } from '@/modules/integrations/logi/readers/public';
import { leagueBrowserRows } from './league-browser';
import { archiveBrowserRow, archiveMatchWindow, logiBrowserRow, matchBrowserCounts, mergeMatchBrowserPage } from './public-browser';
import type { PublicMatchCounts, PublicMatchSummary } from './types';

const now = new Date('2026-10-24T12:00:00Z');
const at = (n: number) => new Date(now.getTime() - n * 60_000).toISOString();
const archive = (n: number): PublicMatchSummary => ({ slug: `sample-${n}`, game: 'hell-let-loose', opponentName: `Synthetic opponent ${n}`, opponentShortCode: null, opponentLogo: null, competitionType: 'friendly', competitionName: null, startsAt: at(n), timeZone: 'Europe/Prague', originalStartsAt: null, status: 'completed', result: null });
const event = (n: number, game: 'hll' | 'wardogs' = 'hll'): PublicLogiEvent => ({
  ref: { source: 'logi', sourceInstanceId: 'synthetic', guildId: '100000000000000001', game, kind: 'match', externalId: `sample-${n}` },
  title: `Synthetic ${n}`, kind: 'match', status: 'concluded', startsAt: null, endsAt: at(n), observedAt: now.toISOString(), sourceUpdatedAt: null, teams: [],
  result: { state: 'unknown', version: null, reviewedAt: null, endedAt: null, participants: [], provenance: null },
});
const leagueFixture = (id: string, scheduledAt: string | null, status: string): LeagueFixturePublic => ({ id, sourceUrl: `https://wardogsleague.net/matches/${id}`, eventId: null, tracking: 'tracked', state: 'fresh', observedAt: now.toISOString(), title: `Synthetic League ${id}`, fixtureNumber: null, type: 'Cup', status, scheduledAt, teams: [{ code: 'AAA', name: 'Synthetic Alpha' }, { code: 'BBB', name: 'Synthetic Bravo' }, { code: 'CCC', name: 'Synthetic Charlie' }], map: null, hosting: null });
const leagueList = (items: LeagueFixturePublic[]): LeagueFixturesPublic => ({ observedAt: now.toISOString(), state: 'fresh', synthetic: true, truncated: false, items });

describe('one chronological public match browser', () => {
  it.each(['upcoming', 'results'] as const)('pages archive/native/League rows exactly once with undated rows last in %s', (view) => {
    const scheduled = (index: number) => at(view === 'results' ? index : -index);
    const local = Array.from({ length: 67 }, (_, i) => ({ ...archive(i * 3), game: 'wardogs' as const, startsAt: scheduled(i * 3), status: view === 'results' ? 'completed' as const : 'scheduled' as const }));
    const events = Array.from({ length: 23 }, (_, i) => ({ ...event(i * 3 + 1, 'wardogs'), status: view === 'results' ? 'concluded' as const : 'registration' as const, endsAt: scheduled(i * 3 + 1) }));
    const fixtures = Array.from({ length: 31 }, (_, i) => leagueFixture(`scheduled-${i}`, scheduled(i * 3 + 2), view === 'results' ? 'Completed' : 'Scheduled'));
    fixtures.push(leagueFixture('undated-z', null, view === 'results' ? 'Completed' : 'Scheduled'), leagueFixture('undated-a', null, view === 'results' ? 'Completed' : 'Scheduled'));
    const league = leagueBrowserRows(leagueList(fixtures), events, new Set(), { view, now });
    const expected = [...Array.from({ length: 67 }, (_, i) => ({ index: i * 3, key: `archive:wardogs:sample-${i * 3}` })), ...Array.from({ length: 23 }, (_, i) => ({ index: i * 3 + 1, key: `logi:wardogs:sample-${i * 3 + 1}` })), ...Array.from({ length: 31 }, (_, i) => ({ index: i * 3 + 2, key: `league:wardogs:scheduled-${i}` }))].sort((left, right) => left.index - right.index).map((row) => row.key);
    expected.push('league:wardogs:undated-a', 'league:wardogs:undated-z');
    const actual: string[] = [];
    for (let page = 1; page <= Math.ceil(expected.length / 10); page++) {
      const window = archiveMatchWindow(page, 10, events.length + league.length);
      const merged = mergeMatchBrowserPage({ items: local.slice(window.offset, window.offset + window.limit), total: local.length, page, pageCount: 7 }, events, { view, game: 'wardogs', page, pageSize: 10, now }, league);
      expect(merged.total).toBe(expected.length);
      expect(merged.pageCount).toBe(Math.ceil(expected.length / 10));
      expect(merged.items.map((row) => row.key)).toEqual(expected.slice((page - 1) * 10, page * 10));
      actual.push(...merged.items.map((row) => row.key));
    }
    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(expected.length);
  });

  it('keeps Wardogs League rows out of an explicitly HLL-scoped merge', () => {
    const league = leagueBrowserRows(leagueList([leagueFixture('other-game', futureDate(), 'Scheduled')]), [], new Set(), { view: 'upcoming', now });
    const data = mergeMatchBrowserPage({ items: [], total: 0, page: 1, pageCount: 1 }, [], { view: 'upcoming', game: 'hell-let-loose', page: 1, pageSize: 10, now }, league);
    expect(data).toMatchObject({ total: 0, items: [], pageCount: 1 });
  });

  it('uses the searched League subset for shared totals and archive window displacement', () => {
    const league = leagueBrowserRows(leagueList([leagueFixture('wanted', futureDate(), 'Scheduled'), leagueFixture('other', futureDate(), 'Scheduled')]), [], new Set(), { view: 'upcoming', q: 'wanted', now });
    const data = mergeMatchBrowserPage({ items: [], total: 0, page: 1, pageCount: 1 }, [], { view: 'upcoming', q: 'wanted', page: 1, pageSize: 10, now }, league);
    expect(data.total).toBe(1);
    expect(data.items.map((row) => row.key)).toEqual(['league:wardogs:wanted']);
    expect(archiveMatchWindow(2, 10, league.length)).toEqual({ offset: 9, limit: 11, skip: 1 });
  });
  it.each([0, 1, 9, 10, 11, 33, 103])('pages interleaved sources exactly once with %i operational records', (count) => {
    const local = Array.from({ length: 137 }, (_, i) => archive(i * 2));
    const events = Array.from({ length: count }, (_, i) => event(i * 2 + 1));
    const full = [...local.map(archiveBrowserRow), ...events.map(logiBrowserRow)].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const actual = [];
    for (let page = 1; page <= Math.ceil(full.length / 10); page++) {
      const window = archiveMatchWindow(page, 10, count);
      const data = mergeMatchBrowserPage({ items: local.slice(window.offset, window.offset + window.limit), total: local.length, page, pageCount: 14 }, events, { view: 'results', page, pageSize: 10, now });
      expect(data.total).toBe(full.length);
      expect(data.items.map((row) => row.key)).toEqual(full.slice((page - 1) * 10, page * 10).map((row) => row.key));
      actual.push(...data.items.map((row) => row.key));
    }
    expect(new Set(actual).size).toBe(full.length);
  });

  it('uses the filtered operational count for the archive window and shared page totals', () => {
    const hll = event(1);
    const wardogs = event(2, 'wardogs');
    const local = archive(0);
    const page = mergeMatchBrowserPage({ items: [local], total: 1, page: 1, pageCount: 1 }, [hll, wardogs], { view: 'results', game: 'hell-let-loose', q: 'Synthetic 1', page: 1, pageSize: 10, now });
    expect(page.total).toBe(2);
    expect(page.items.map((row) => row.game)).toEqual(['hell-let-loose', 'hell-let-loose']);
  });

  it('preserves all faction scores and the unknown start without manufacturing a two-team match', () => {
    const row = event(1, 'wardogs');
    row.result = { ...row.result, state: 'confirmed', participants: [{ id: 'a', label: 'A', score: 0 }, { id: 'b', label: 'B', score: null }, { id: 'c', label: 'C', score: 100 }] };
    const data = mergeMatchBrowserPage({ items: [], total: 0, page: 1, pageCount: 1 }, [row], { view: 'results', page: 1, pageSize: 10, now });
    expect(data.items[0]).toMatchObject({ kind: 'logi', at: row.endsAt, href: '/wardogs/matches/logi/sample-1', event: { startsAt: null, result: { participants: row.result.participants } } });
  });

  it('retains deterministic archive order at tied dates across pages', () => {
    const local = Array.from({ length: 31 }, (_, i) => ({ ...archive(i), startsAt: at(0) }));
    const events = Array.from({ length: 6 }, (_, i) => event(0, i % 2 ? 'wardogs' : 'hll')).map((row, i) => ({ ...row, ref: { ...row.ref, externalId: `tie-${i}` } }));
    const keys = [];
    for (let page = 1; page <= 4; page++) {
      const window = archiveMatchWindow(page, 10, events.length);
      keys.push(...mergeMatchBrowserPage({ items: local.slice(window.offset, window.offset + window.limit), total: 31, page, pageCount: 4 }, events, { view: 'results', page, pageSize: 10, now }).items.map((row) => row.key));
    }
    expect(keys).toHaveLength(37);
    expect(new Set(keys).size).toBe(37);
    expect(keys.filter((key) => key.startsWith('archive:'))).toEqual(local.map(archiveBrowserRow).map((row) => row.key));
  });

  it('adds operational tab counts per game without mutating archive counts', () => {
    const archiveCounts: PublicMatchCounts = { upcoming: 2, results: 3, byGame: { 'hell-let-loose': { upcoming: 1, results: 2 }, wardogs: { upcoming: 1, results: 1 } } };
    const future = { ...event(1, 'wardogs'), status: 'registration' as const, endsAt: new Date(now.getTime() + 60_000).toISOString() };
    expect(matchBrowserCounts(archiveCounts, [event(1), future], now)).toEqual({ upcoming: 3, results: 4, byGame: { 'hell-let-loose': { upcoming: 1, results: 3 }, wardogs: { upcoming: 2, results: 1 } } });
    expect(archiveCounts.results).toBe(3);
    expect(archiveCounts.byGame.wardogs.upcoming).toBe(1);
  });

  it('adds League tab totals only to Wardogs while retaining native and archive counts', () => {
    const archiveCounts: PublicMatchCounts = { upcoming: 2, results: 3, byGame: { 'hell-let-loose': { upcoming: 1, results: 2 }, wardogs: { upcoming: 1, results: 1 } } };
    const original = structuredClone(archiveCounts);
    const native = { ...event(1, 'wardogs'), status: 'registration' as const, endsAt: futureDate() };
    expect(matchBrowserCounts(archiveCounts, [event(1), native], now, { upcoming: 3, results: 4 })).toEqual({ upcoming: 6, results: 8, byGame: { 'hell-let-loose': { upcoming: 1, results: 3 }, wardogs: { upcoming: 5, results: 5 } } });
    expect(archiveCounts).toEqual(original);
  });
});

function futureDate() { return new Date(now.getTime() + 60_000).toISOString(); }
