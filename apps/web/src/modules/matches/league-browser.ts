import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { ageLeagueFixturesPublic, type LeagueFixturePublic, type LeagueFixturesPublic } from '@/modules/integrations/logi/readers/public';

/** A public League fixture supplies schedule facts, never a native reviewed result. */
export type LeagueBrowserRow = {
  kind: 'league';
  key: string;
  href: string;
  at: string | null;
  game: 'wardogs';
  fixture: LeagueFixturePublic;
};

const folded = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Input is already scoped and public. Bound fixtures belong to the website event or
 * archive path: an unpublished binding must never fall back to a League-only row.
 * The public-event argument intentionally cannot relax that publication boundary.
 * Keep source order; the common browser owns chronological merging and pagination.
 */
export function leagueBrowserRows(fixtures: LeagueFixturesPublic | null, _publicEvents: readonly PublicLogiEvent[], publishedLeagueMatchIds: ReadonlySet<string>, options: {
  view: 'upcoming' | 'results'; q?: string; now?: Date;
}): LeagueBrowserRow[] {
  if (!fixtures || fixtures.state === 'unavailable') return [];
  const now = options.now ?? new Date();
  const search = folded(options.q?.trim() ?? '');
  const seen = new Set<string>();
  const rows: LeagueBrowserRow[] = [];
  for (const fixture of ageLeagueFixturesPublic(fixtures, now).items) {
    if (fixture.tracking !== 'tracked' || fixture.eventId !== null || publishedLeagueMatchIds.has(fixture.id) || seen.has(fixture.id)) continue;
    seen.add(fixture.id);
    const status = fixture.status?.trim().toLowerCase();
    const view = status === 'completed' || status === 'cancelled' || status === 'confirmed' || status === 'set by admin'
      || status !== 'live' && fixture.scheduledAt !== null && Date.parse(fixture.scheduledAt) < now.getTime() ? 'results' : 'upcoming';
    if (view !== options.view) continue;
    if (search && !folded([
      fixture.title, fixture.type ?? '',
      ...fixture.teams.flatMap((team) => [team.code, team.name ?? '']),
      fixture.map?.name ?? '', fixture.map?.zone ?? '', fixture.map?.lighting ?? '',
    ].join(' ')).includes(search)) continue;
    rows.push({ kind: 'league', key: `league:wardogs:${encodeURIComponent(fixture.id)}`, href: `/wardogs/matches/league/${encodeURIComponent(fixture.id)}`, at: fixture.scheduledAt, game: 'wardogs', fixture });
  }
  return rows;
}
