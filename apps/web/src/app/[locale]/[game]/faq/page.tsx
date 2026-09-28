import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { corePageMetadata } from '@/components/public/core-page-data';
import { FaqScreen } from '@/components/public/faq-screen';
import { routing } from '@/i18n/routing';
import { gameHasSection, isGameRoute } from '@/modules/games/registry';

export async function generateMetadata({ params }: PageProps<'/[locale]/[game]/faq'>): Promise<Metadata> {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game)) return {};
  // One shared FAQ page: the game frame points search engines at `/faq`.
  return corePageMetadata(locale, 'faq');
}

/** FAQ inside a game section (HLL, legacy `/faq`); one shared page. */
export default async function GameFaqPage({ params }: PageProps<'/[locale]/[game]/faq'>) {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game) || !gameHasSection(game, 'faq')) notFound();
  setRequestLocale(locale);
  return <FaqScreen locale={locale} game={game} />;
}
