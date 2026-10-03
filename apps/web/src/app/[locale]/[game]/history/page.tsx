import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { HistoryScreen } from '@/components/public/history-screen';
import { hasHistoryQuery } from '@/components/public/history-query';
import { bilingualAlternates } from '@/components/public/metadata';
import { routing } from '@/i18n/routing';
import { gameHasSection, isGameRoute } from '@/modules/games/registry';
import { gamePath } from '@/modules/games/routes';

export async function generateMetadata({ params, searchParams }: PageProps<'/[locale]/[game]/history'>): Promise<Metadata> {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game) || !gameHasSection(game, 'history')) return {};
  const [t, games] = await Promise.all([getTranslations({ locale, namespace: 'history.meta' }), getTranslations({ locale, namespace: 'games' })]);
  return {
    title: games('sectionTitle', { section: t('title'), game: games(`names.${game}`) }),
    description: t('description'),
    alternates: bilingualAlternates(locale, gamePath(game, 'history')),
    // Server, period, map, floor, sort and page are view state of one document, not separate indexable facts.
    ...(hasHistoryQuery(await searchParams) ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Retained Warcon server game history of the Wardogs section; games without the section are not found. */
export default async function GameHistoryPage({ params, searchParams }: PageProps<'/[locale]/[game]/history'>) {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game) || !gameHasSection(game, 'history')) notFound();
  setRequestLocale(locale);
  return <HistoryScreen locale={locale} game={game} query={await searchParams} />;
}
