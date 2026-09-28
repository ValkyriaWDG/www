import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { NewsArticleScreen, newsArticleMetadata } from '@/components/public/news-article-screen';
import { routing } from '@/i18n/routing';
import { gameHasSection, isGameRoute } from '@/modules/games/registry';

export const dynamicParams = true;

export async function generateMetadata({ params }: PageProps<'/[locale]/[game]/news/[slug]'>): Promise<Metadata> {
  const { locale, game, slug } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game)) return {};
  return newsArticleMetadata(locale, slug, game);
}

/** Game article; a post of another game or of the community redirects to its canonical URL. */
export default async function GameNewsArticlePage({ params }: PageProps<'/[locale]/[game]/news/[slug]'>) {
  const { locale, game, slug } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game) || !gameHasSection(game, 'news')) notFound();
  setRequestLocale(locale);
  return <NewsArticleScreen locale={locale} slug={slug} game={game} />;
}
