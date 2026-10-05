import { describe, expect, it } from 'vitest';
import { matchesListHref, parseMatchFilters } from './query';

describe('independent connected and archive match pagination', () => {
  it('parses and preserves both page positions in archive navigation', () => {
    const parsed = parseMatchFilters({ view: 'results', page: '2', logiPage: '3' });
    expect(parsed).toMatchObject({ page: 2, logiPage: 3 });
    expect(matchesListHref({ ...parsed, page: 4 }, '/hll')).toBe('/hll/matches?view=results&page=4&logiPage=3');
  });
  it('bounds the connected page and omits its default from links', () => {
    expect(parseMatchFilters({ logiPage: '-4' })).toMatchObject({ logiPage: 1 });
    expect(matchesListHref(parseMatchFilters({}), '/wardogs')).toBe('/wardogs/matches');
  });
});
