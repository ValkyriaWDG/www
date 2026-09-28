import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { MemberProfileScreen, memberProfileMetadata } from '@/components/public/member-profile-screen';
import { routing } from '@/i18n/routing';
import { gameHasSection, isGameRoute } from '@/modules/games/registry';

export const dynamicParams = true;

export async function generateMetadata({ params }: PageProps<'/[locale]/[game]/members/[slug]'>): Promise<Metadata> {
  const { locale, game, slug } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game)) return {};
  return memberProfileMetadata(locale, slug, game);
}

/** Profile inside a game section; members without that public affiliation are a 404 here. */
export default async function GameMemberProfilePage({ params, searchParams }: PageProps<'/[locale]/[game]/members/[slug]'>) {
  const { locale, game, slug } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game) || !gameHasSection(game, 'members')) notFound();
  setRequestLocale(locale);
  return <MemberProfileScreen locale={locale} slug={slug} game={game} query={await searchParams} />;
}
