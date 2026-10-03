import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { GameSwitchNotice } from '@/components/games/switch-notice';
import { HllLanding } from '@/components/hll/hll-landing';
import { HomeMenu } from '@/components/shell/home/home-menu';
import { ServerSummary } from '@/components/servers/server-summary';
import type { NextMatch } from '@/components/shell/home/next-match-strip';
import { getShellLinks } from '@/components/shell/shell-config';
import { bilingualAlternates } from '@/components/public/metadata';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { GAME_REGISTRY, isGameRoute } from '@/modules/games/registry';
import { canonicalMatchPath, gamePath } from '@/modules/games/routes';
import { getNextPublicMatch } from '@/modules/matches/queries';
import { getPublicServerOverview } from '@/modules/integrations/servers/presentation';
import { sharingMetadata } from '@/modules/social/metadata';

export async function generateMetadata({ params }: PageProps<'/[locale]/[game]'>): Promise<Metadata> {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game)) return {};
  const t = await getTranslations({ locale, namespace: `games.${game}.meta` });
  const sharing = sharingMetadata(locale, 'site', undefined, undefined, t('title'), t('description'), game);
  return {
    title: { absolute: t('title') }, description: t('description'), alternates: bilingualAlternates(locale, gamePath(game)),
    openGraph: { type: 'website', title: t('title'), description: t('description'), url: `/${locale}${gamePath(game)}`, siteName: 'Valkyria', locale: locale === 'cs' ? 'cs_CZ' : 'en_GB', images: sharing.images },
    twitter: sharing.twitter,
  };
}

/**
 * Game landing: the Wardogs main menu (reference-09 composition over the persistent
 * scene, unchanged) or the HLL game-menu landing (left menu and cinematic stage).
 */
export default async function GameLandingPage({ params, searchParams }: PageProps<'/[locale]/[game]'>) {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game)) notFound();
  setRequestLocale(locale);
  const query = await searchParams;
  if (game === 'hll') return <HllLanding locale={locale} notice={<GameSwitchNotice locale={locale} game={game} query={query} />} />;
  // The home keeps the compact server overview only; Warcon facts belong to the servers page detail.
  const [{ discordUrl }, nextMatch, overview] = await Promise.all([getShellLinks(), loadNextMatch(), getPublicServerOverview('wardogs')]);
  return <HomeMenu discordUrl={discordUrl} nextMatch={nextMatch} base={gamePath(game)} serverSummary={<ServerSummary initialOverview={overview} locale={locale} />} notice={<GameSwitchNotice locale={locale} game={game} query={query} />} />;
}

/** Earliest published upcoming Wardogs fixture, or null (no strip) when none exists or data is unavailable. */
async function loadNextMatch(): Promise<NextMatch | null> {
  try {
    if (!getServerEnv().DATABASE_URL) return null;
    const next = await getNextPublicMatch(getDb(), new Date(), GAME_REGISTRY.wardogs.db);
    if (!next) return null;
    return {
      href: canonicalMatchPath(next.game, next.slug),
      opponent: next.opponentName,
      game: next.game,
      startsAt: next.startsAt,
      competition: next.competitionName,
    };
  } catch {
    return null;
  }
}
