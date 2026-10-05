import { describe, expect, it } from 'vitest';
import { matchesListHref, parseMatchFilters } from './query';

describe('one public match page', () => {
  it('uses the shared page and removes the retired provider-specific parameter', () => {
    const parsed = parseMatchFilters({ view: 'results', page: '2', logiPage: '3' });
    expect(parsed.page).toBe(2);
    expect(matchesListHref({ ...parsed, page: 4 }, '/hll')).toBe('/hll/matches?view=results&page=4');
  });
  it('accepts an old bookmarked provider page as a fallback and emits the canonical shared page', () => {
    const parsed = parseMatchFilters({ view: 'results', logiPage: '3' });
    expect(parsed.page).toBe(3);
    expect(matchesListHref(parsed, '/hll')).toBe('/hll/matches?view=results&page=3');
    expect(parseMatchFilters({ logiPage: '-4' }).page).toBe(1);
    expect(matchesListHref(parseMatchFilters({}), '/wardogs')).toBe('/wardogs/matches');
  });
});
