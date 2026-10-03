import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { formatNumber } from '@/i18n/date-format';
import { csMessages, enMessages } from '@/i18n/messages';
import { describeResult, formatScore, matchFormatLabel, outcomeKind, sharedRoundMode, statusKind, viewForStatus, zoneName } from './match-format';
import { initialsOf } from './member-format';
import { bilingualAlternates, publishedAlternates, seoTitle } from './metadata';
import {
  buildHref,
  matchDetailHref,
  matchesListHref,
  membersListHref,
  newsListHref,
  parseMatchFilters,
  parseMemberFilters,
  parseMissingTranslation,
  parseNewsFilters,
  parsePage,
  parseSearch,
} from './query';

describe('match result presentation', () => {
  it('never formats unknown scores as numbers', () => {
    expect(formatScore(null, null)).toBeNull();
    expect(formatScore(2, null)).toBeNull();
    expect(formatScore(undefined, 0)).toBeNull();
    expect(formatScore(2, 1)).toBe('2 : 1');
    expect(formatScore(0, 0)).toBe('0 : 0');
  });

  it('describes a completed match with unknown scores as unpublished, never 0:0', () => {
    const description = describeResult({
      status: 'completed',
      result: { scoreValkyria: null, scoreOpponent: null, outcome: 'unknown', verification: 'provisional' },
    });
    expect(description).toEqual({ kind: 'unpublished' });
    expect(JSON.stringify(description)).not.toMatch(/0\s*:\s*0/);
    expect(describeResult({ status: 'completed', result: null })).toEqual({ kind: 'unpublished' });
  });

  it('keeps published scores, outcome-only results and non-played states distinct', () => {
    expect(
      describeResult({ status: 'completed', result: { scoreValkyria: 2, scoreOpponent: 1, outcome: 'win', verification: 'verified' } }),
    ).toEqual({ kind: 'score', valkyria: 2, opponent: 1, outcome: 'win', verification: 'verified' });
    expect(
      describeResult({ status: 'completed', result: { scoreValkyria: null, scoreOpponent: null, outcome: 'loss', verification: 'provisional' } }),
    ).toEqual({ kind: 'outcome', outcome: 'loss', verification: 'provisional' });
    // A stale result row on a cancelled or upcoming fixture is never shown.
    const stale = { scoreValkyria: 0, scoreOpponent: 0, outcome: 'draw' as const, verification: 'verified' as const };
    expect(describeResult({ status: 'cancelled', result: stale })).toEqual({ kind: 'cancelled' });
    expect(describeResult({ status: 'scheduled', result: stale })).toEqual({ kind: 'pending' });
    expect(describeResult({ status: 'postponed', result: null })).toEqual({ kind: 'pending' });
    expect(describeResult({ status: 'live', result: null })).toEqual({ kind: 'pending' });
  });

  it('maps statuses to views and badge tones', () => {
    expect(viewForStatus('scheduled')).toBe('upcoming');
    expect(viewForStatus('live')).toBe('upcoming');
    expect(viewForStatus('postponed')).toBe('upcoming');
    expect(viewForStatus('completed')).toBe('results');
    expect(viewForStatus('cancelled')).toBe('results');
    expect(new Set(['scheduled', 'live', 'postponed', 'completed', 'cancelled'].map((s) => statusKind(s as never))).size).toBe(5);
    expect(outcomeKind('win')).toBe('success');
    expect(outcomeKind('loss')).toBe('danger');
  });

  it('names the Prague zone per instant in regional conventions (DST explicit)', () => {
    expect(zoneName('2026-10-03T17:00:00Z', 'en')).toBe('CEST');
    expect(zoneName('2026-11-03T18:00:00Z', 'en')).toBe('CET');
    expect(zoneName('2026-10-03T17:00:00Z', 'cs')).toBe('SELČ');
    expect(zoneName('2026-11-03T18:00:00Z', 'cs')).toBe('SEČ');
    expect(zoneName('not a date', 'cs')).toBe('');
  });
});

describe('match format line', () => {
  const bestOf = (count: number) => `Best of ${count} (Bo${count})`;

  it('does not repeat an imported format that only restates the best-of count', () => {
    expect(matchFormatLabel('best of 1', 1, bestOf)).toBe('Best of 1 (Bo1)');
    expect(matchFormatLabel(' Bo3 ', 3, bestOf)).toBe('Best of 3 (Bo3)');
    expect(matchFormatLabel('BEST OF 5', 5, bestOf)).toBe('Best of 5 (Bo5)');
    expect(matchFormatLabel('Best of 3 (Bo3)', 3, bestOf)).toBe('Best of 3 (Bo3)');
  });

  it('reports the mode shared by every round and nothing when rounds differ or lack one', () => {
    expect(sharedRoundMode([{ mode: 'Warfare' }, { mode: 'Warfare' }])).toBe('Warfare');
    expect(sharedRoundMode([{ mode: 'Warfare' }])).toBe('Warfare');
    expect(sharedRoundMode([{ mode: 'Warfare' }, { mode: 'Offensive' }])).toBeNull();
    expect(sharedRoundMode([{ mode: 'Warfare' }, { mode: null }])).toBeNull();
    expect(sharedRoundMode([{ mode: null }])).toBeNull();
    expect(sharedRoundMode([])).toBeNull();
  });

  it('keeps a distinct format text beside the best-of label', () => {
    expect(matchFormatLabel('Warfare 50v50', 3, bestOf)).toBe('Warfare 50v50 · Best of 3 (Bo3)');
    expect(matchFormatLabel('best of 1', 3, bestOf)).toBe('best of 1 · Best of 3 (Bo3)');
  });

  it('shows only what is known', () => {
    expect(matchFormatLabel('best of 1', null, bestOf)).toBe('best of 1');
    expect(matchFormatLabel(null, 2, bestOf)).toBe('Best of 2 (Bo2)');
    expect(matchFormatLabel('  ', null, bestOf)).toBe('');
    expect(matchFormatLabel(null, null, bestOf)).toBe('');
  });
});

describe('query parsing', () => {
  it('accepts only allowlisted filters and bounded values', () => {
    expect(parseNewsFilters({ category: 'announcement', game: 'wardogs', q: '  tabulka  ', page: '2' })).toEqual({
      category: 'announcement',
      game: 'wardogs',
      q: 'tabulka',
      page: 2,
    });
    expect(parseNewsFilters({ category: 'Bad Key', game: 'fortnite', q: '\u0000 ', page: '-1' })).toEqual({
      category: undefined,
      game: undefined,
      q: undefined,
      page: 1,
    });
    expect(parseNewsFilters({ page: ['3', '4'] }).page).toBe(3);
    expect(parsePage('1001')).toBe(1);
    expect(parsePage('abc')).toBe(1);
    expect(parseSearch('a'.repeat(200))).toHaveLength(80);
    expect(parseSearch('Žluťoučký   kůň')).toBe('Žluťoučký kůň');
  });

  it('parses member and match filters with safe defaults', () => {
    expect(parseMemberFilters({ role: 'officer', game: 'hell-let-loose' })).toEqual({ game: 'hell-let-loose', role: 'officer', q: undefined, page: 1 });
    expect(parseMemberFilters({ role: 'admin' }).role).toBeUndefined();
    expect(parseMatchFilters({}).view).toBe('upcoming');
    expect(parseMatchFilters({ view: 'results' }).view).toBe('results');
    expect(parseMatchFilters({ view: 'drafts' }, 'results').view).toBe('results');
  });

  it('validates the missing-translation parameter', () => {
    expect(parseMissingTranslation('cs:ukazka-pouze-cesky', 'en')).toEqual({ locale: 'cs', slug: 'ukazka-pouze-cesky' });
    expect(parseMissingTranslation('en:ukazka-pouze-cesky', 'en')).toBeNull();
    expect(parseMissingTranslation('de:slug', 'en')).toBeNull();
    expect(parseMissingTranslation('cs:../admin', 'en')).toBeNull();
    expect(parseMissingTranslation('cs:', 'en')).toBeNull();
    expect(parseMissingTranslation(undefined, 'en')).toBeNull();
  });

  it('builds stable logical hrefs and drops page 1 and empty values', () => {
    expect(newsListHref({ category: 'update', game: undefined, q: 'a b', page: 1 })).toBe('/news?category=update&q=a+b');
    expect(newsListHref({ page: 2 })).toBe('/news?page=2');
    expect(membersListHref({})).toBe('/members');
    expect(matchesListHref({ view: 'upcoming', game: 'wardogs' })).toBe('/matches?game=wardogs');
    expect(matchesListHref({ view: 'results', page: 3 })).toBe('/matches?view=results&page=3');
    expect(matchDetailHref('ukazka', { game: 'wardogs', page: 1 })).toBe('/matches/ukazka?game=wardogs');
    expect(buildHref('/x', [['a', null], ['b', '']])).toBe('/x');
  });
});

describe('count messages', () => {
  const format = (message: string, locale: 'cs' | 'en', count: number) => String(new IntlMessageFormat(message, locale).format({ count }));

  it('use Czech plural forms', () => {
    const matches = csMessages.matches.list.resultCount;
    expect(format(matches, 'cs', 1)).toBe('1 zápas');
    expect(format(matches, 'cs', 3)).toBe('3 zápasy');
    expect(format(matches, 'cs', 5)).toBe('5 zápasů');
    expect(format(csMessages.news.list.resultCount, 'cs', 2)).toBe('2 články');
    expect(format(csMessages.news.list.resultCount, 'cs', 16)).toBe('16 článků');
    expect(format(csMessages.members.list.rosterCount, 'cs', 4)).toBe('4 profily');
    expect(format(enMessages.matches.list.resultCount, 'en', 1)).toBe('1 match');
    expect(format(enMessages.news.list.resultCount, 'en', 6)).toBe('6 articles');
  });

  it('group digits exactly like the cs-CZ/en-GB number helper', () => {
    expect(format(csMessages.matches.list.resultCount, 'cs', 1234)).toBe(`${formatNumber(1234, 'cs')} zápasů`);
    expect(format(enMessages.matches.list.resultCount, 'en', 1234)).toBe(`${formatNumber(1234, 'en')} matches`);
  });
});

describe('member initials', () => {
  it('uses whole graphemes and uppercases letters', () => {
    expect(initialsOf('Syntetický hráč Alfa')).toBe('SH');
    expect(initialsOf('čenda')).toBe('Č');
    expect(initialsOf('🦊 Foxtrot')).toBe('🦊F');
    expect(initialsOf('   ')).toBe('?');
  });
});

describe('alternates', () => {
  it('does not repeat the site name in SEO titles', () => {
    expect(seoTitle('Ochrana soukromí – Valkyria', 'Valkyria')).toEqual({ absolute: 'Ochrana soukromí – Valkyria' });
    expect(seoTitle('Novinky', 'Valkyria')).toBe('Novinky');
  });

  it('lists both locales for shared routes', () => {
    expect(bilingualAlternates('en', '/members/alfa')).toEqual({
      canonical: '/en/members/alfa',
      languages: { cs: '/cs/members/alfa', en: '/en/members/alfa', 'x-default': '/cs/members/alfa' },
    });
  });

  it('lists only published counterparts for articles', () => {
    expect(publishedAlternates('cs', 'ukazka-pouze-cesky', { cs: 'ukazka-pouze-cesky' })).toEqual({
      canonical: '/cs/news/ukazka-pouze-cesky',
      languages: { cs: '/cs/news/ukazka-pouze-cesky', 'x-default': '/cs/news/ukazka-pouze-cesky' },
    });
    const en = publishedAlternates('en', 'sample', { cs: 'ukazka', en: 'sample' });
    expect(en.languages).toEqual({ cs: '/cs/news/ukazka', en: '/en/news/sample', 'x-default': '/cs/news/ukazka' });
    const enOnly = publishedAlternates('en', 'sample', { en: 'sample' });
    expect(enOnly.languages).toEqual({ en: '/en/news/sample' });
  });
});
