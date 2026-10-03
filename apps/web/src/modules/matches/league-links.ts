import { canonicalLeagueMatchUrl } from '@/modules/integrations/logi/readers/league-url';

/**
 * Pure mapping between external Wardogs League match IDs and the website's own match
 * pages, through the editorial `league_match_url` a match manager stored. Used by the
 * tracked-fixtures section of the Wardogs matches page; the database read lives in
 * `queries.ts`.
 */

/** League match ID as accepted by the producer URL policy (`[a-zA-Z0-9_-]{1,80}`). */
export const LEAGUE_MATCH_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
/** League IDs resolved per page at most (the public list shows 20). */
export const LEAGUE_LINK_LOOKUP_LIMIT = 100;

/** Canonical League detail URL of an accepted League match ID, or `null`. */
export function leagueMatchUrlForId(id: string): string | null {
  return LEAGUE_MATCH_ID_PATTERN.test(id) ? `https://wardogsleague.net/matches/${id}` : null;
}

/** Distinct accepted League IDs, in input order, bounded. */
export function acceptedLeagueMatchIds(ids: readonly string[], limit = LEAGUE_LINK_LOOKUP_LIMIT): string[] {
  const seen = new Set<string>();
  const accepted: string[] = [];
  for (const id of ids) {
    if (!LEAGUE_MATCH_ID_PATTERN.test(id) || seen.has(id)) continue;
    seen.add(id);
    accepted.push(id);
    if (accepted.length >= limit) break;
  }
  return accepted;
}

/**
 * League ID → match slug for the rows whose stored League link names one of `ids`.
 * Rows are expected in display order; the first match per League ID wins and rows
 * without an accepted canonical link are ignored.
 */
export function mapLeagueMatchSlugs(rows: readonly { slug: string; leagueMatchUrl: string | null }[], ids: readonly string[]): Map<string, string> {
  const wanted = new Set(acceptedLeagueMatchIds(ids));
  const result = new Map<string, string>();
  for (const row of rows) {
    const canonical = canonicalLeagueMatchUrl(row.leagueMatchUrl);
    if (!canonical || !wanted.has(canonical.id) || result.has(canonical.id)) continue;
    result.set(canonical.id, row.slug);
  }
  return result;
}
