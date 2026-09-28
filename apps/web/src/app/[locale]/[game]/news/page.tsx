import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { NewsListScreen, newsListMetadata } from '@/components/public/news-list-screen';
import { routing } from '@/i18n/routing';
import { gameHasSection, isGameRoute } from '@/modules/games/registry';

export async function generateMetadata({ params, searchParams }: PageProps<'/[locale]/[game]/news'>): Promise<Metadata> {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game)) return {};
  return newsListMetadata(locale, await searchParams, game);
}

/** Game news: the game's published posts plus explicit community posts. */
export default async function GameNewsPage({ params, searchParams }: PageProps<'/[locale]/[game]/news'>) {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game) || !gameHasSection(game, 'news')) notFound();
  setRequestLocale(locale);
  return <NewsListScreen locale={locale} query={await searchParams} game={game} />;
}
