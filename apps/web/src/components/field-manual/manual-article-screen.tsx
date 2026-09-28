import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { OG_LOCALE, publishedAlternates, seoTitle } from '@/components/public/metadata';
import { isSlug } from '@/components/public/query';
import { PageMain } from '@/components/shell/page-main';
import { PageHeader } from '@/components/ui';
import { formatDate } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getSiteOrigin } from '@/lib/site';
import { headingOutline, mediaUrl, outlineAnchors, RichText } from '@/modules/content/rich-text/render';
import { getPublishedManualBySlug } from '@/modules/field-manual/public';
import { GAME_REGISTRY, type GameRoute } from '@/modules/games/registry';
import { gamePath } from '@/modules/games/routes';
import styles from './manual.module.css';

const UPDATE_THRESHOLD_MS = 60_000;

/** One published lookup per request, shared by metadata and page (never a draft). */
const loadManual = cache(async (locale: string, game: GameRoute, slug: string) =>
  isSlug(slug) ? getPublishedManualBySlug(getDb(), { locale, game: GAME_REGISTRY[game].db, slug }) : null,
);

export async function manualArticleMetadata(locale: AppLocale, game: GameRoute, slug: string): Promise<Metadata> {
  const lookup = await loadManual(locale, game, slug);
  if (lookup?.kind !== 'article') return {};
  const { article } = lookup;
  const title = article.seoTitle || article.title;
  const description = article.seoDescription || article.excerpt;
  const alternates = publishedAlternates(locale, article.slug, article.counterparts, gamePath(game, 'field-manual'));
  const site = await getTranslations({ locale, namespace: 'common.site' });
  return {
    title: seoTitle(title, site('name')),
    description,
    alternates,
    openGraph: { type: 'article', title, description, url: alternates.canonical as string, siteName: site('name'), locale: OG_LOCALE[locale] },
  };
}

/**
 * Published field manual article of this game and locale: title, summary, table of
 * contents from the body headings, the validated rich-text body and a provenance block
 * (original source, date, language, credits, last review). A previous published slug
 * redirects permanently; drafts, other games and unknown slugs are a 404.
 */
export async function ManualArticleScreen({ locale, game, slug }: { locale: AppLocale; game: GameRoute; slug: string }) {
  const lookup = await loadManual(locale, game, slug);
  if (lookup?.kind === 'redirect') permanentRedirect(`/${locale}${gamePath(game, 'field-manual', lookup.slug)}`);
  if (!lookup) notFound();
  const { article, meta } = lookup;
  const [t, tNews] = await Promise.all([getTranslations({ locale, namespace: 'games.manual.article' }), getTranslations({ locale, namespace: 'news' })]);
  const contentLang = article.locale;
  const outline = headingOutline(article.body);
  const published = article.publishedAt;
  const updated = article.updatedAt;
  const showUpdated = Boolean(published && updated && updated.getTime() - published.getTime() > UPDATE_THRESHOLD_MS);
  const hasProvenance = Boolean(meta.sourceUrl || meta.sourcePublishedOn || meta.sourceLanguage || meta.credits || meta.reviewedAt);
  const sourceDate = meta.sourcePublishedOn ? new Date(`${meta.sourcePublishedOn}T12:00:00Z`) : null;

  return (
    <PageMain width="wide" labelledBy="manual-article-title">
      <article className={styles.manualArticle} aria-labelledby="manual-article-title" data-manual-slug={article.slug}>
        <PageHeader
          back={{ href: gamePath(game, 'field-manual'), label: t('back') }}
          eyebrow={article.category?.label}
          title={<span lang={contentLang}>{article.title}</span>}
          titleId="manual-article-title"
          description={
            <dl className={styles.articleMeta}>
              {published ? (
                <div>
                  <dt>{tNews('article.published')}</dt>
                  <dd>
                    <time dateTime={published.toISOString()}>{formatDate(published, locale, 'date')}</time>
                  </dd>
                </div>
              ) : null}
              {showUpdated && updated ? (
                <div>
                  <dt>{tNews('article.updated')}</dt>
                  <dd>
                    <time dateTime={updated.toISOString()}>{formatDate(updated, locale, 'date')}</time>
                  </dd>
                </div>
              ) : null}
              {article.authorLabel ? (
                <div>
                  <dt>{tNews('article.author')}</dt>
                  <dd lang={contentLang}>{article.authorLabel}</dd>
                </div>
              ) : null}
            </dl>
          }
        />
        <div className={styles.articleLayout}>
          {outline.length > 1 ? (
            <nav className={styles.toc} aria-labelledby="manual-toc-title" data-manual-toc="">
              <h2 id="manual-toc-title" className={styles.tocTitle}>
                {t('toc')}
              </h2>
              <ol className={styles.tocList} lang={contentLang}>
                {outline.map((entry) => (
                  <li key={entry.id} data-level={entry.level}>
                    <a href={`#${entry.id}`}>{entry.text}</a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
          <div className={styles.articleMain}>
            {article.excerpt ? (
              <p className={styles.articleLead} lang={contentLang}>
                {article.excerpt}
              </p>
            ) : null}
            {article.cover ? (
              <figure className={styles.articleCover} lang={contentLang} data-article-cover="">
                {/* eslint-disable-next-line @next/next/no-img-element -- publication-aware media route, not the optimizer */}
                <img
                  src={mediaUrl(article.cover.assetId, 'full')}
                  alt={article.cover.decorative ? '' : article.cover.alt}
                  width={article.cover.width}
                  height={article.cover.height}
                  fetchPriority="high"
                  decoding="async"
                />
                {article.cover.caption ? <figcaption>{article.cover.caption}</figcaption> : null}
              </figure>
            ) : null}
            <div className={styles.articleText} lang={contentLang} data-article-body="">
              <RichText
                doc={article.body}
                assets={article.assets}
                labels={{ tableRegion: tNews('richText.tableRegion'), externalLink: tNews('richText.externalLink') }}
                siteOrigin={getSiteOrigin()}
                anchors={outlineAnchors(outline)}
              />
            </div>
            {hasProvenance ? (
              <section className={styles.provenance} aria-labelledby="manual-source-title" data-manual-provenance="">
                <h2 id="manual-source-title" className={styles.provenanceTitle}>
                  {t('source')}
                </h2>
                <dl className={styles.provenanceList}>
                  {meta.sourceUrl ? (
                    <div>
                      <dt>{t('sourceLink')}</dt>
                      <dd>
                        <a href={meta.sourceUrl} rel="noopener noreferrer" className={styles.sourceLink}>
                          {meta.sourceUrl.replace(/^https:\/\//, '')}
                          <span className="visually-hidden"> {tNews('richText.externalLink')}</span>
                        </a>
                      </dd>
                    </div>
                  ) : null}
                  {sourceDate ? (
                    <div>
                      <dt>{t('sourcePublished')}</dt>
                      <dd>
                        <time dateTime={meta.sourcePublishedOn!}>{formatDate(sourceDate, locale, 'date')}</time>
                      </dd>
                    </div>
                  ) : null}
                  {meta.sourceLanguage === 'cs' || meta.sourceLanguage === 'sk' || meta.sourceLanguage === 'en' ? (
                    <div>
                      <dt>{t('sourceLanguage')}</dt>
                      <dd>{t(`languages.${meta.sourceLanguage}`)}</dd>
                    </div>
                  ) : null}
                  {meta.credits ? (
                    <div>
                      <dt>{t('credits')}</dt>
                      <dd lang={contentLang}>{meta.credits}</dd>
                    </div>
                  ) : null}
                  {meta.reviewedAt ? (
                    <div>
                      <dt>{t('reviewed')}</dt>
                      <dd>
                        <time dateTime={meta.reviewedAt.toISOString()}>{formatDate(meta.reviewedAt, locale, 'date')}</time>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            ) : null}
          </div>
        </div>
      </article>
    </PageMain>
  );
}
