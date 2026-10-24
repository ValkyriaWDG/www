import 'server-only';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { GAME_REGISTRY, type GameRoute } from '@/modules/games/registry';
import { canonicalMatchPath } from '@/modules/games/routes';
import { getPublicLogiEvents } from '@/modules/integrations/logi-public';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { getNextPublicLogiMatch, logiEventHref } from '@/modules/integrations/logi/public-matches';
import { getLeagueFixtures } from '@/modules/integrations/logi/readers/fixtures';
import { getNextPublicMatch, mapPublishedLeagueMatchSlugs } from './queries';
import { leagueBrowserRows, type LeagueBrowserRow } from './league-browser';
import type { PublicMatchSummary } from './types';
import { operationalMatchIdentity } from './operational-presentation';

export type PublicNextMatch = {
  href: string;
  opponent: string;
  /** A producer's whole title must not be formatted as one opposing team. */
  title?: string;
  game: PublicMatchSummary['game'];
  startsAt: string;
  competition?: string | null;
};

export function selectNextWebsiteMatch(local: PublicMatchSummary | null, events: readonly PublicLogiEvent[], game: GameRoute, now = new Date(), leagueRows: readonly LeagueBrowserRow[] = []): PublicNextMatch | null {
  const scoped = events.filter((event) => event.ref.game === game);
  const archive = local?.game === GAME_REGISTRY[game].db && !scoped.some((event) => event.archive?.slug === local.slug) ? local : null;
  const current = getNextPublicLogiMatch(scoped, now);
  let selected: PublicNextMatch | null = current?.startsAt && (!archive || Date.parse(current.startsAt) <= Date.parse(archive.startsAt))
    ? { href: logiEventHref(current), title: operationalMatchIdentity(current).title, opponent: '', game: GAME_REGISTRY[game].db, startsAt: current.startsAt, competition: current.archive?.competitionName ?? null }
    : archive ? { href: canonicalMatchPath(archive.game, archive.slug), opponent: archive.opponentName, game: archive.game, startsAt: archive.startsAt, competition: archive.competitionName } : null;
  // Rows already passed the common browser's publication/view rules. A null kickoff
  // stays unknown; neither the observation time nor a source end time replaces it.
  for (const row of leagueRows) {
    const startsAt = row.fixture.scheduledAt;
    if (game !== 'wardogs' || row.game !== GAME_REGISTRY[game].db || startsAt === null || row.at !== startsAt || !Number.isFinite(Date.parse(startsAt))) continue;
    if (!selected || Date.parse(startsAt) < Date.parse(selected.startsAt)) selected = { href: row.href, title: row.fixture.title, opponent: '', game: row.game, startsAt, competition: 'Wardogs League' };
  }
  return selected;
}

/** Each source can fail independently; an unavailable provider leaves the published archive intact. */
export async function getNextWebsiteMatch(game: GameRoute, now = new Date()): Promise<PublicNextMatch | null> {
  if (!getServerEnv().DATABASE_URL) return null;
  const events = await getPublicLogiEvents(game).catch(() => []);
  const linkedSlugs = events.flatMap((event) => event.archive ? [event.archive.slug] : []);
  const db = getDb();
  const [local, league] = await Promise.all([
    getNextPublicMatch(db, now, GAME_REGISTRY[game].db, linkedSlugs).catch(() => null),
    game === 'wardogs' ? getLeagueFixtures(now).then(async (fixtures) => {
      if (!fixtures?.items.length || fixtures.state === 'unavailable') return [];
      // A failed binding lookup suppresses League rows, never treats them as unbound.
      const published = await mapPublishedLeagueMatchSlugs(db, fixtures.items.map((fixture) => fixture.id));
      return leagueBrowserRows(fixtures, events, new Set(published.keys()), { view: 'upcoming', now });
    }).catch(() => []) : [],
  ]);
  return selectNextWebsiteMatch(local, events, game, now, league);
}
