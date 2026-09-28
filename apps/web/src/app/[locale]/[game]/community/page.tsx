import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { CommunityScreen } from '@/components/public/community-screen';
import { corePageMetadata } from '@/components/public/core-page-data';
import { routing } from '@/i18n/routing';
import { gameHasSection, isGameRoute } from '@/modules/games/registry';

export async function generateMetadata({ params }: PageProps<'/[locale]/[game]/community'>): Promise<Metadata> {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game)) return {};
  return corePageMetadata(locale, 'community');
}

/** Recruitment inside a game section (HLL "Join us"); one shared community page. */
export default async function GameCommunityPage({ params }: PageProps<'/[locale]/[game]/community'>) {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game) || !gameHasSection(game, 'community')) notFound();
  setRequestLocale(locale);
  return <CommunityScreen locale={locale} game={game} />;
}
