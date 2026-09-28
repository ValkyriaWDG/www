import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ClanScreen } from '@/components/public/clan-screen';
import { corePageMetadata } from '@/components/public/core-page-data';
import { routing } from '@/i18n/routing';

export async function generateMetadata({ params }: PageProps<'/[locale]/clan'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return corePageMetadata(locale, 'clan');
}

/** Clan story (published page) with Discord, HLL website and next-step links. */
export default async function ClanPage({ params }: PageProps<'/[locale]/clan'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <ClanScreen locale={locale} game={null} />;
}
