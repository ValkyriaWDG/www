import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { MembersListScreen, membersListMetadata } from '@/components/public/members-list-screen';
import { routing } from '@/i18n/routing';
import { gameHasSection, isGameRoute } from '@/modules/games/registry';

export async function generateMetadata({ params, searchParams }: PageProps<'/[locale]/[game]/members'>): Promise<Metadata> {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game)) return {};
  return membersListMetadata(locale, await searchParams, game);
}

/** Members with a published affiliation to this game. */
export default async function GameMembersPage({ params, searchParams }: PageProps<'/[locale]/[game]/members'>) {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game) || !gameHasSection(game, 'members')) notFound();
  setRequestLocale(locale);
  return <MembersListScreen locale={locale} query={await searchParams} game={game} />;
}
