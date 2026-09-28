import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ClanScreen } from '@/components/public/clan-screen';
import { corePageMetadata } from '@/components/public/core-page-data';
import { routing } from '@/i18n/routing';
import { gameHasSection, isGameRoute } from '@/modules/games/registry';

export async function generateMetadata({ params }: PageProps<'/[locale]/[game]/clan'>): Promise<Metadata> {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game)) return {};
  // One shared clan page: the game frame points search engines at `/clan`.
  return corePageMetadata(locale, 'clan');
}

export default async function GameClanPage({ params }: PageProps<'/[locale]/[game]/clan'>) {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game) || !gameHasSection(game, 'clan')) notFound();
  setRequestLocale(locale);
  return <ClanScreen locale={locale} game={game} />;
}
