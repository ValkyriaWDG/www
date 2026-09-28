import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { headers } from 'next/headers';
import { ArticleView, getArticleViewLabels } from '@/components/content/article-view';
import { OG_LOCALE, publishedAlternates, seoTitle } from '@/components/public/metadata';
import { isSlug } from '@/components/public/query';
import { PageMain } from '@/components/shell/page-main';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getSiteOrigin } from '@/lib/site';
import { getPublishedNewsBySlug, getRelatedNews } from '@/modules/content/public';
import { sharingMetadata } from '@/modules/social/metadata';
import { articleStructuredData, serializeStructuredData } from '@/modules/social/structured-data';

// Slugs are resolved per request from published translations (the locale layout is static-param only).
export const dynamicParams = true;

/** One published lookup per request, shared by metadata and page (never a draft). */
const loadArticle = cache(async (locale: string, slug: string) => (isSlug(slug) ? getPublishedNewsBySlug(locale, slug, getDb()) : null));

export async function generateMetadata({ params }: PageProps<'/[locale]/news/[slug]'>): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const lookup = await loadArticle(locale, slug);
  if (lookup?.kind !== 'article') return {};
  const { article } = lookup;
  const title = article.seoTitle || article.title;
  const description = article.seoDescription || article.excerpt;
  const alternates = publishedAlternates(locale, article.slug, article.counterparts);
  const site = await getTranslations({ locale, namespace: 'common.site' });
  const sharing = sharingMetadata(locale, 'news', article.slug, article.revisionId, title, description);
  return {
    title: seoTitle(title, site('name')),
    description,
    alternates,
    twitter: sharing.twitter,
    openGraph: {
      type: 'article',
      title,
      description,
      url: alternates.canonical as string,
      siteName: site('name'),
      locale: OG_LOCALE[locale],
      ...(article.publishedAt ? { publishedTime: article.publishedAt.toISOString() } : {}),
      ...(article.updatedAt ? { modifiedTime: article.updatedAt.toISOString() } : {}),
      ...(article.authorLabel ? { authors: [article.authorLabel] } : {}),
      images: sharing.images,
    },
  };
}

/**
 * Published article of the current locale. A previous published slug permanently
 * redirects to the live slug in the same locale; unknown, draft, scheduled, archived or
 * unpublished translations are a 404 (never another language's text under this URL).
 */
export default async function NewsArticlePage({ params }: PageProps<'/[locale]/news/[slug]'>) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const lookup = await loadArticle(locale, slug);
  if (!lookup) notFound();
  if (lookup.kind === 'redirect') permanentRedirect(`/${locale}/news/${lookup.slug}`);
  const { article } = lookup;
  const structuredData = articleStructuredData(article, getSiteOrigin());
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const [labels, related] = await Promise.all([
    getArticleViewLabels(locale),
    getRelatedNews({ locale, documentId: article.documentId, limit: 3 }, getDb()).catch(() => []),
  ]);
  return (
    <PageMain width="reading" labelledBy="article-title">
      {structuredData ? <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: serializeStructuredData(structuredData) }} /> : null}
      <ArticleView article={article} labels={labels} related={related} siteOrigin={getSiteOrigin()} dateLocale={locale} titleId="article-title" />
    </PageMain>
  );
}
