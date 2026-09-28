import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { corePageMetadata } from '@/components/public/core-page-data';
import { FaqScreen } from '@/components/public/faq-screen';
import { routing } from '@/i18n/routing';

export async function generateMetadata({ params }: PageProps<'/[locale]/faq'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return corePageMetadata(locale, 'faq');
}

export default async function FaqPage({ params }: PageProps<'/[locale]/faq'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <FaqScreen locale={locale} game={null} />;
}
