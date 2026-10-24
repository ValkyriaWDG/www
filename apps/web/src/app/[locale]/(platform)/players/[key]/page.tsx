import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PlayerProfileScreen, playerProfileMetadata } from '@/components/public/player-profile-screen';
import type { RawSearchParams } from '@/components/public/query';
import { routing } from '@/i18n/routing';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ locale: string; key: string }>; searchParams: Promise<RawSearchParams> };
export async function generateMetadata({ params }: Props) {
  const { locale, key } = await params;
  return hasLocale(routing.locales, locale) ? playerProfileMetadata(locale, key, null) : {};
}
export default async function PlayerPage({ params, searchParams }: Props) {
  const { locale, key } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <PlayerProfileScreen locale={locale} playerKey={key} game={null} query={await searchParams} />;
}
