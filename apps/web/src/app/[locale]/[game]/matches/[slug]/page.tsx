import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { MatchDetailScreen, matchDetailMetadata } from '@/components/public/match-detail-screen';
import { routing } from '@/i18n/routing';
import { gameHasSection, isGameRoute } from '@/modules/games/registry';

export const dynamicParams = true;

export async function generateMetadata({ params }: PageProps<'/[locale]/[game]/matches/[slug]'>): Promise<Metadata> {
  const { locale, game, slug } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game)) return {};
  return matchDetailMetadata(locale, slug, game);
}

export default async function GameMatchDetailPage({ params, searchParams }: PageProps<'/[locale]/[game]/matches/[slug]'>) {
  const { locale, game, slug } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game) || !gameHasSection(game, 'matches')) notFound();
  setRequestLocale(locale);
  return <MatchDetailScreen locale={locale} slug={slug} game={game} query={await searchParams} />;
}
