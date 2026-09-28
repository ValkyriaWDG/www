import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { NewsArticleScreen, newsArticleMetadata } from '@/components/public/news-article-screen';
import { routing } from '@/i18n/routing';

// Slugs are resolved per request from published translations (the locale layout is static-param only).
export const dynamicParams = true;

export async function generateMetadata({ params }: PageProps<'/[locale]/news/[slug]'>): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return newsArticleMetadata(locale, slug, null);
}

/** Community article; game articles (including old shared links) redirect to their game section. */
export default async function NewsArticlePage({ params }: PageProps<'/[locale]/news/[slug]'>) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <NewsArticleScreen locale={locale} slug={slug} game={null} />;
}
