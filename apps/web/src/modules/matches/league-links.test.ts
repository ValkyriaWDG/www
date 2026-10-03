import { describe, expect, it } from 'vitest';
import { acceptedLeagueMatchIds, LEAGUE_LINK_LOOKUP_LIMIT, leagueMatchUrlForId, mapLeagueMatchSlugs } from './league-links';

describe('League match links', () => {
  it('builds the canonical League URL for accepted IDs only', () => {
    expect(leagueMatchUrlForId('cmuqt8ep605e1lf018w2nlywu')).toBe('https://wardogsleague.net/matches/cmuqt8ep605e1lf018w2nlywu');
    expect(leagueMatchUrlForId('Ab_c-9')).toBe('https://wardogsleague.net/matches/Ab_c-9');
    for (const id of ['', 'a.b', 'a/b', 'a b', '../x', 'a'.repeat(81), 'x?y=1']) expect(leagueMatchUrlForId(id)).toBeNull();
  });

  it('keeps distinct accepted IDs in input order within the lookup limit', () => {
    expect(acceptedLeagueMatchIds(['b', 'a', 'b', 'bad id', 'c'])).toEqual(['b', 'a', 'c']);
    expect(acceptedLeagueMatchIds(Array.from({ length: LEAGUE_LINK_LOOKUP_LIMIT + 10 }, (_, index) => `id-${index}`))).toHaveLength(LEAGUE_LINK_LOOKUP_LIMIT);
    expect(acceptedLeagueMatchIds(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
  });

  it('maps League IDs to the first matching slug through the canonical stored link', () => {
    const rows = [
      { slug: 'first', leagueMatchUrl: 'https://wardogsleague.net/matches/alpha' },
      { slug: 'second', leagueMatchUrl: 'https://wardogsleague.net/matches/alpha/' },
      { slug: 'other', leagueMatchUrl: 'https://wardogsleague.net/matches/gamma' },
      { slug: 'none', leagueMatchUrl: null },
      { slug: 'foreign', leagueMatchUrl: 'https://evil.example/matches/beta' },
      { slug: 'beta-match', leagueMatchUrl: 'https://wardogsleague.net/matches/beta' },
    ];
    const mapped = mapLeagueMatchSlugs(rows, ['alpha', 'beta', 'delta', 'bad id']);
    expect([...mapped.entries()]).toEqual([['alpha', 'first'], ['beta', 'beta-match']]);
    expect(mapLeagueMatchSlugs(rows, []).size).toBe(0);
    expect(mapLeagueMatchSlugs([], ['alpha']).size).toBe(0);
  });
});
