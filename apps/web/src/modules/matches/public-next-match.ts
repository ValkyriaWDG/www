import 'server-only';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { GAME_REGISTRY, type GameRoute } from '@/modules/games/registry';
import { canonicalMatchPath } from '@/modules/games/routes';
import { getPublicLogiEvents } from '@/modules/integrations/logi-public';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { getNextPublicLogiMatch, logiEventHref } from '@/modules/integrations/logi/public-matches';
import { getNextPublicMatch } from './queries';
import type { PublicMatchSummary } from './types';

export type PublicNextMatch = {
  href: string;
  opponent: string;
  /** A producer's whole title must not be formatted as one opposing team. */
  title?: string;
  game: PublicMatchSummary['game'];
  startsAt: string;
  competition?: string | null;
};

export function selectNextWebsiteMatch(local: PublicMatchSummary | null, events: readonly PublicLogiEvent[], game: GameRoute, now = new Date()): PublicNextMatch | null {
  const scoped = events.filter((event) => event.ref.game === game);
  const archive = local?.game === GAME_REGISTRY[game].db && !scoped.some((event) => event.archive?.slug === local.slug) ? local : null;
  const current = getNextPublicLogiMatch(scoped, now);
  if (current?.startsAt && (!archive || Date.parse(current.startsAt) <= Date.parse(archive.startsAt))) {
    return { href: logiEventHref(current), title: current.title, opponent: '', game: GAME_REGISTRY[game].db, startsAt: current.startsAt, competition: null };
  }
  return archive ? { href: canonicalMatchPath(archive.game, archive.slug), opponent: archive.opponentName, game: archive.game, startsAt: archive.startsAt, competition: archive.competitionName } : null;
}

/** Each source can fail independently; an unavailable provider leaves the published archive intact. */
export async function getNextWebsiteMatch(game: GameRoute, now = new Date()): Promise<PublicNextMatch | null> {
  if (!getServerEnv().DATABASE_URL) return null;
  const events = await getPublicLogiEvents(game);
  const linkedSlugs = events.flatMap((event) => event.archive ? [event.archive.slug] : []);
  const local = await getNextPublicMatch(getDb(), now, GAME_REGISTRY[game].db, linkedSlugs).catch(() => null);
  return selectNextWebsiteMatch(local, events, game, now);
}
