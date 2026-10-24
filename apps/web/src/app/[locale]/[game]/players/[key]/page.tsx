import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PlayerProfileScreen, playerProfileMetadata } from '@/components/public/player-profile-screen';
import type { RawSearchParams } from '@/components/public/query';
import { routing } from '@/i18n/routing';
import { isGameRoute } from '@/modules/games/registry';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ locale: string; game: string; key: string }>; searchParams: Promise<RawSearchParams> };
export async function generateMetadata({ params }: Props) {
  const { locale, game, key } = await params;
  return hasLocale(routing.locales, locale) && isGameRoute(game) ? playerProfileMetadata(locale, key, game) : {};
}
export default async function GamePlayerPage({ params, searchParams }: Props) {
  const { locale, game, key } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game)) notFound();
  setRequestLocale(locale);
  return <PlayerProfileScreen locale={locale} playerKey={key} game={game} query={await searchParams} />;
}
