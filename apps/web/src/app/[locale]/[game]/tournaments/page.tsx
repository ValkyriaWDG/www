import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { bilingualAlternates, OG_LOCALE } from '@/components/public/metadata';
import { TournamentsScreen } from '@/components/public/tournaments-screen';
import { routing } from '@/i18n/routing';
import { gameHasSection, isGameRoute } from '@/modules/games/registry';
import { sectionBase } from '@/modules/games/routes';
import { sharingMetadata } from '@/modules/social/metadata';

export async function generateMetadata({ params }: PageProps<'/[locale]/[game]/tournaments'>): Promise<Metadata> {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game) || !gameHasSection(game, 'tournaments')) return {};
  const [t, games] = await Promise.all([getTranslations({ locale, namespace: 'matches.tournaments.meta' }), getTranslations({ locale, namespace: 'games' })]);
  const title = games('sectionTitle', { section: t('title'), game: games(`names.${game}`) });
  const sharing = sharingMetadata(locale, 'matches', undefined, undefined, title, t('description'), game);
  return {
    title,
    description: t('description'),
    alternates: bilingualAlternates(locale, `${sectionBase(game)}/tournaments`),
    openGraph: { type: 'website', title, description: t('description'), url: `/${locale}${sectionBase(game)}/tournaments`, locale: OG_LOCALE[locale], images: sharing.images },
    twitter: sharing.twitter,
  };
}

/** Published tournaments of a game (legacy `/turnaje`). */
export default async function GameTournamentsPage({ params }: PageProps<'/[locale]/[game]/tournaments'>) {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game) || !gameHasSection(game, 'tournaments')) notFound();
  setRequestLocale(locale);
  return <TournamentsScreen locale={locale} game={game} />;
}
