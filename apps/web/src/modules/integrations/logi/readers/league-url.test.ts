import { describe, expect, it } from 'vitest';
import { canonicalLeagueMatchUrl, isLeagueMatchUrl, LEAGUE_MATCH_URL_MAX_LENGTH, LEAGUE_MATCH_URL_PATTERN } from './league-url';

describe('Wardogs League match URL policy (producer match-url.ts)', () => {
  it('matches the producer regex exactly', () => {
    expect(LEAGUE_MATCH_URL_PATTERN.source).toBe('^https:\\/\\/wardogsleague\\.net\\/matches\\/[a-zA-Z0-9_-]{1,80}\\/?$');
    expect(LEAGUE_MATCH_URL_MAX_LENGTH).toBe(125);
  });

  it('canonicalises accepted detail links without the trailing slash', () => {
    expect(canonicalLeagueMatchUrl('https://wardogsleague.net/matches/cmuqt8ep605e1lf018w2nlywu/')).toEqual({ id: 'cmuqt8ep605e1lf018w2nlywu', url: 'https://wardogsleague.net/matches/cmuqt8ep605e1lf018w2nlywu' });
    expect(canonicalLeagueMatchUrl('  https://wardogsleague.net/matches/Ab_c-9  ')).toEqual({ id: 'Ab_c-9', url: 'https://wardogsleague.net/matches/Ab_c-9' });
    expect(isLeagueMatchUrl(`https://wardogsleague.net/matches/${'a'.repeat(80)}`)).toBe(true);
  });

  it.each([
    'http://wardogsleague.net/matches/abc',
    'https://wardogsleague.net.evil.example/matches/abc',
    'https://evil.example/wardogsleague.net/matches/abc',
    'https://wardogsleague.net/matches/abc?x=1',
    'https://wardogsleague.net/matches/abc#frag',
    'https://user:pw@wardogsleague.net/matches/abc',
    'https://wardogsleague.net/matches/requests/abc',
    'https://wardogsleague.net/matches/',
    'https://wardogsleague.net/matches/abc/def',
    'https://wardogsleague.net/matches/a.b',
    `https://wardogsleague.net/matches/${'a'.repeat(81)}`,
    'https://wardogsleague.net/teams/VLK',
    'javascript:alert(1)',
    '',
  ])('rejects %s', (value) => {
    expect(canonicalLeagueMatchUrl(value)).toBeNull();
    expect(isLeagueMatchUrl(value)).toBe(false);
  });

  it('rejects non-strings and values above the producer length cap', () => {
    expect(canonicalLeagueMatchUrl(null)).toBeNull();
    expect(canonicalLeagueMatchUrl(42)).toBeNull();
    expect(canonicalLeagueMatchUrl({ url: 'https://wardogsleague.net/matches/abc' })).toBeNull();
    // The longest accepted link (80-character id plus slash) stays within the producer's 125-character cap.
    expect(canonicalLeagueMatchUrl(`https://wardogsleague.net/matches/${'a'.repeat(80)}/`)?.url.length).toBe(114);
    expect(canonicalLeagueMatchUrl(`https://wardogsleague.net/matches/${'a'.repeat(80)}/${' '.repeat(20)}x`)).toBeNull();
  });
});
