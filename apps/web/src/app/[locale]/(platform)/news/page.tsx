import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { NewsListScreen, newsListMetadata } from '@/components/public/news-list-screen';
import { routing } from '@/i18n/routing';

export async function generateMetadata({ params, searchParams }: PageProps<'/[locale]/news'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return newsListMetadata(locale, await searchParams, null);
}

/** Shared community news collection (all games; optional game filter). */
export default async function NewsPage({ params, searchParams }: PageProps<'/[locale]/news'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <NewsListScreen locale={locale} query={await searchParams} game={null} />;
}
