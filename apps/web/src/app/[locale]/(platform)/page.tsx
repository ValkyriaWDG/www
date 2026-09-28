import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { CommunityHub } from '@/components/hub/community-hub';
import { bilingualAlternates } from '@/components/public/metadata';
import { routing } from '@/i18n/routing';

export async function generateMetadata({ params }: PageProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'games.hub.meta' });
  return { title: { absolute: t('title') }, description: t('description'), alternates: bilingualAlternates(locale, '') };
}

/** Community hub (`/cs`, `/en`): shared Valkyria identity with the two game choices. */
export default async function HubPage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <CommunityHub locale={locale} />;
}
