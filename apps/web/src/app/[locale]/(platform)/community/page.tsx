import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { CommunityScreen } from '@/components/public/community-screen';
import { corePageMetadata } from '@/components/public/core-page-data';
import { routing } from '@/i18n/routing';

export async function generateMetadata({ params }: PageProps<'/[locale]/community'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return corePageMetadata(locale, 'community');
}

export default async function CommunityPage({ params }: PageProps<'/[locale]/community'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <CommunityScreen locale={locale} game={null} />;
}
