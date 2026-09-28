import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { ArticleView, getArticleViewLabels } from '@/components/content/article-view';
import { OG_LOCALE, publishedAlternates, seoTitle } from '@/components/public/metadata';
import { isSlug } from '@/components/public/query';
import { PageMain } from '@/components/shell/page-main';
import type { AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getSiteOrigin } from '@/lib/site';
import { getPublishedNewsBySlug, getRelatedNews } from '@/modules/content/public';
import { mediaUrl } from '@/modules/content/rich-text/render';
import type { ArticleDTO } from '@/modules/content/types';
import { GAME_REGISTRY, type GameRoute } from '@/modules/games/registry';
import { canonicalNewsPath, sectionBase } from '@/modules/games/routes';

/** One published lookup per request, shared by metadata and page (never a draft). */
const loadArticle = cache(async (locale: string, slug: string) => (isSlug(slug) ? getPublishedNewsBySlug(locale, slug, getDb()) : null));

/** The article only when it is requested under its canonical section, else `null`. */
async function loadCanonical(locale: AppLocale, slug: string, game: GameRoute | null): Promise<ArticleDTO | null> {
  const lookup = await loadArticle(locale, slug);
  if (lookup?.kind !== 'article') return null;
  return canonicalNewsPath(lookup.article.game, lookup.article.slug) === `${sectionBase(game)}/news/${slug}` ? lookup.article : null;
}

export async function newsArticleMetadata(locale: AppLocale, slug: string, game: GameRoute | null): Promise<Metadata> {
  const article = await loadCanonical(locale, slug, game);
  if (!article) return {};
  const title = article.seoTitle || article.title;
  const description = article.seoDescription || article.excerpt;
  const alternates = publishedAlternates(locale, article.slug, article.counterparts, `${sectionBase(game)}/news`);
  const site = await getTranslations({ locale, namespace: 'common.site' });
  return {
    title: seoTitle(title, site('name')),
    description,
    alternates,
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
      ...(article.cover
        ? { images: [{ url: mediaUrl(article.cover.assetId, 'full'), width: article.cover.width, height: article.cover.height, alt: article.cover.alt }] }
        : {}),
    },
  };
}

/**
 * Published article of the current locale under its canonical section. Community posts
 * (no game) live at `/news/<slug>`, game posts at `/<game>/news/<slug>`; any other
 * section, or a previous published slug, permanently redirects to the canonical URL so
 * old shared links keep working without rendering a game's post in another section.
 * Unknown, draft, scheduled, archived or unpublished translations are a 404.
 */
export async function NewsArticleScreen({ locale, slug, game }: { locale: AppLocale; slug: string; game: GameRoute | null }) {
  const lookup = await loadArticle(locale, slug);
  if (lookup?.kind === 'redirect') {
    const target = await loadArticle(locale, lookup.slug);
    if (target?.kind !== 'article') notFound();
    permanentRedirect(`/${locale}${canonicalNewsPath(target.article.game, target.article.slug)}`);
  }
  if (!lookup) notFound();
  const { article } = lookup;
  const canonical = canonicalNewsPath(article.game, article.slug);
  if (canonical !== `${sectionBase(game)}/news/${slug}`) permanentRedirect(`/${locale}${canonical}`);
  const [labels, related] = await Promise.all([
    getArticleViewLabels(locale),
    getRelatedNews({ locale, documentId: article.documentId, limit: 3, gameScope: game ? GAME_REGISTRY[game].db : undefined }, getDb()).catch(() => []),
  ]);
  return (
    <PageMain width="reading" labelledBy="article-title">
      <ArticleView
        article={article}
        labels={labels}
        related={related}
        backHref={`${sectionBase(game)}/news`}
        siteOrigin={getSiteOrigin()}
        dateLocale={locale}
        titleId="article-title"
      />
    </PageMain>
  );
}
