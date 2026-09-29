import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { TournamentDetailScreen, tournamentDetailMetadata } from '@/components/public/tournament-detail-screen';
import { routing } from '@/i18n/routing';
import { gameHasSection, isGameRoute } from '@/modules/games/registry';

export async function generateMetadata({ params }: PageProps<'/[locale]/[game]/tournaments/[slug]'>): Promise<Metadata> {
  const { locale, game, slug } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game) || !gameHasSection(game, 'tournaments')) return {};
  return tournamentDetailMetadata(locale, game, slug);
}

/** Published tournament detail (legacy `/turnaje/<slug>`); drafts and unknown slugs → 404. */
export default async function GameTournamentPage({ params }: PageProps<'/[locale]/[game]/tournaments/[slug]'>) {
  const { locale, game, slug } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game) || !gameHasSection(game, 'tournaments')) notFound();
  setRequestLocale(locale);
  return <TournamentDetailScreen locale={locale} game={game} slug={slug} />;
}
