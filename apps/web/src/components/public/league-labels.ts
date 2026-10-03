/**
 * Known Wardogs League enumerations (as published by League in English) mapped to
 * dictionary keys under `matches.detail.league.values.<group>.<slug>`, so Czech pages
 * show localized labels; any other text is shown as published. Pure module.
 */
export const LEAGUE_VALUE_GROUPS = {
  status: ['scheduled', 'live', 'completed', 'cancelled'],
  type: ['friendly', 'league', 'cup', 'tournament'],
  hosting: ['self_hosted', 'league_hosted'],
  mapVote: ['open', 'closed'],
  progress: ['locked', 'rules_agreed', 'map_vote', 'moderator_claimed', 'host_server', 'ready_check', 'live', 'placements', 'confirmed'],
} as const;
export type LeagueValueGroup = keyof typeof LEAGUE_VALUE_GROUPS;

/** `values.<group>.<slug>` for a known League value, or `null` to show the published text. */
export function leagueValueKey(group: LeagueValueGroup, raw: string | null): `values.${LeagueValueGroup}.${string}` | null {
  if (raw === null) return null;
  const slug = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return (LEAGUE_VALUE_GROUPS[group] as readonly string[]).includes(slug) ? `values.${group}.${slug}` : null;
}
