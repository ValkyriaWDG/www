/**
 * Wardogs League match URL policy, identical to the producer's `matchUrl()`
 * (Logi `src/domain/wardogs-league/match-url.ts`, PR #158 at c42ea77): only exact
 * HTTPS detail links on `wardogsleague.net`, canonicalised without the trailing slash.
 * Pure module: shared by the match input schema, the admin form and the League reader.
 */
export const LEAGUE_MATCH_URL_PATTERN = /^https:\/\/wardogsleague\.net\/matches\/[a-zA-Z0-9_-]{1,80}\/?$/;
/** OpenAPI cap of the producer's `url` query parameter. */
export const LEAGUE_MATCH_URL_MAX_LENGTH = 125;

export type LeagueMatchUrl = { id: string; url: string };

/** Canonical `{ id, url }` for an accepted League detail link, or `null` for anything else. */
export function canonicalLeagueMatchUrl(input: unknown): LeagueMatchUrl | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (value.length === 0 || value.length > LEAGUE_MATCH_URL_MAX_LENGTH || !LEAGUE_MATCH_URL_PATTERN.test(value)) return null;
  const id = new URL(value).pathname.split('/')[2];
  if (!id) return null;
  return { id, url: `https://wardogsleague.net/matches/${id}` };
}

export function isLeagueMatchUrl(input: unknown): boolean {
  return canonicalLeagueMatchUrl(input) !== null;
}
