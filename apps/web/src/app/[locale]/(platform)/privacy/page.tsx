import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { CorePage } from '@/components/public/core-page';
import { corePageMetadata, loadCorePage } from '@/components/public/core-page-data';
import { routing } from '@/i18n/routing';

export async function generateMetadata({ params }: PageProps<'/[locale]/privacy'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return corePageMetadata(locale, 'privacy');
}

/** Privacy information of the active locale (published core page). */
export default async function PrivacyPage({ params }: PageProps<'/[locale]/privacy'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const page = await loadCorePage(locale, 'privacy');
  return <CorePage locale={locale} pageKey="privacy" page={page} />;
}
