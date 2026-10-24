import { describe, expect, it } from 'vitest';
import { matchDetailHref, matchesListHref, parseMatchFilters } from './query';

describe('one public match page parameter', () => {
  it('gives page precedence and removes obsolete provider state from generated URLs', () => {
    const parsed = parseMatchFilters({ view: 'results', page: '2', logiPage: '3' });
    expect(parsed).toMatchObject({ page: 2 });
    expect(parsed).not.toHaveProperty('logiPage');
    expect(matchesListHref({ ...parsed, page: 4 }, '/hll')).toBe('/hll/matches?view=results&page=4');
    expect(matchDetailHref('sample', parsed, '/hll')).toBe('/hll/matches/sample?page=2');
  });
  it('accepts old provider-only links as a validated fallback', () => {
    expect(parseMatchFilters({ logiPage: '3' }).page).toBe(3);
    expect(parseMatchFilters({ logiPage: '-4' }).page).toBe(1);
    expect(parseMatchFilters({ page: '-4', logiPage: '3' }).page).toBe(1);
    expect(matchesListHref(parseMatchFilters({}), '/wardogs')).toBe('/wardogs/matches');
  });
});
