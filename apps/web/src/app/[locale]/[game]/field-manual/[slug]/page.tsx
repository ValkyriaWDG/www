import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { manualArticleMetadata, ManualArticleScreen } from '@/components/field-manual/manual-article-screen';
import { routing } from '@/i18n/routing';
import { gameHasSection, isGameRoute } from '@/modules/games/registry';

export const dynamicParams = true;

export async function generateMetadata({ params }: PageProps<'/[locale]/[game]/field-manual/[slug]'>): Promise<Metadata> {
  const { locale, game, slug } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game) || !gameHasSection(game, 'field-manual')) return {};
  return manualArticleMetadata(locale, game, slug);
}

/** Published field manual article of the game; drafts, other games and unknown slugs are a 404. */
export default async function GameFieldManualArticlePage({ params }: PageProps<'/[locale]/[game]/field-manual/[slug]'>) {
  const { locale, game, slug } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game) || !gameHasSection(game, 'field-manual')) notFound();
  setRequestLocale(locale);
  return <ManualArticleScreen locale={locale} game={game} slug={slug} />;
}
