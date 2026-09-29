import type { Game, Locale } from '@valkyria/db/schema';
import { getTranslations } from 'next-intl/server';
import { TagList } from '@/components/public/tags';
import { WARDOGS_MARK } from '@/components/public/presskit';
import publicStyles from '@/components/public/public.module.css';
import { PageHeader, StatusBadge } from '@/components/ui/panels';
import { formatDate } from '@/i18n/date-format';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { mediaUrl, RichText, type RichTextLabels } from '@/modules/content/rich-text/render';
import type { ArticleDTO, NewsSummary } from '@/modules/content/types';
import { canonicalNewsPath } from '@/modules/games/routes';
import styles from './article-view.module.css';
import { ArchiveEditorial } from './archive-editorial';

/** Localized strings for {@link ArticleView}; load them with {@link getArticleViewLabels}. */
export type ArticleViewLabels = {
  back: string;
  metaLabel: string;
  published: string;
  updated: string;
  author: string;
  category: string;
  tags: string;
  game: string;
  related: string;
  previewBadge: string;
  previewNotice: string;
  notPublished: string;
  games: Record<Game, string>;
  richText: RichTextLabels;
};

export type ArticleViewProps = {
  /** Published article, or a draft revision snapshot for an authorized preview. */
  article: ArticleDTO;
  labels: ArticleViewLabels;
  /** Marks the output as an unpublished preview (banner + badge). */
  preview?: boolean;
  /** Published related posts of the same locale (public page only). */
  related?: NewsSummary[];
  /** Logical back destination; `null` hides the back link (e.g. inside an editor). */
  backHref?: string | null;
  /** Site origin for the external-link indicator in the body. */
  siteOrigin?: string;
  /** Locale of date formatting; defaults to the article's own locale. */
  dateLocale?: AppLocale;
  titleId?: string;
};

/** Loads {@link ArticleViewLabels} for a locale (`news.article`, `news.games`, `news.richText`). */
export async function getArticleViewLabels(locale: AppLocale): Promise<ArticleViewLabels> {
  const t = await getTranslations({ locale, namespace: 'news' });
  return {
    back: t('article.back'),
    metaLabel: t('article.metaLabel'),
    published: t('article.published'),
    updated: t('article.updated'),
    author: t('article.author'),
    category: t('article.category'),
    tags: t('article.tags'),
    game: t('article.game'),
    related: t('article.related'),
    previewBadge: t('article.previewBadge'),
    previewNotice: t('article.previewNotice'),
    notPublished: t('article.notPublished'),
    games: { wardogs: t('games.wardogs'), 'hell-let-loose': t('games.hell-let-loose') },
    richText: { tableRegion: t('richText.tableRegion'), externalLink: t('richText.externalLink') },
  };
}

const UPDATE_THRESHOLD_MS = 60_000;

/**
 * Reusable article presentation: back link, h1, publication/update dates, author label,
 * category/game/tags, cover figure with caption, the validated rich-text body and related
 * posts. Renders only the DTO it is given (no data fetching), so the public route and the
 * authorized admin preview share one renderer. Content parts carry the article's `lang`.
 */
export function ArticleView({ article, labels, preview = false, related = [], backHref = '/news', siteOrigin, dateLocale, titleId = 'article-title' }: ArticleViewProps) {
  const locale: AppLocale = dateLocale ?? (article.locale as AppLocale);
  const contentLang: Locale = article.locale;
  const published = article.publishedAt;
  const updated = article.updatedAt;
  const showUpdated = Boolean(published && updated && updated.getTime() - published.getTime() > UPDATE_THRESHOLD_MS);
  const eyebrow = [article.category?.label, article.game ? labels.games[article.game] : null].filter(Boolean).join(' · ');

  const meta = (
    <>
      <dl className={styles.meta} aria-label={labels.metaLabel}>
        <div>
          <dt>{labels.published}</dt>
          <dd data-article-published="">
            {published ? <time dateTime={published.toISOString()}>{formatDate(published, locale, 'date')}</time> : labels.notPublished}
          </dd>
        </div>
        {showUpdated && updated ? (
          <div>
            <dt>{labels.updated}</dt>
            <dd>
              <time dateTime={updated.toISOString()}>{formatDate(updated, locale, 'date')}</time>
            </dd>
          </div>
        ) : null}
        {article.authorLabel ? (
          <div>
            <dt>{labels.author}</dt>
            <dd lang={contentLang}>{article.authorLabel}</dd>
          </div>
        ) : null}
      </dl>
      {article.tags.length > 0 ? (
        <div className={styles.metaTags} lang={contentLang}>
          <TagList label={labels.tags} items={article.tags.map((tag) => ({ key: tag.key, label: tag.label }))} />
        </div>
      ) : null}
    </>
  );

  return (
    <article className={styles.article} aria-labelledby={titleId} data-article={article.slug} data-preview={preview || undefined}>
      {preview ? (
        <div className={styles.previewBanner} role="note" data-preview-banner="">
          <StatusBadge kind="warning">{labels.previewBadge}</StatusBadge>
          <p>{labels.previewNotice}</p>
        </div>
      ) : null}
      <PageHeader
        back={backHref ? { href: backHref, label: labels.back } : undefined}
        eyebrow={eyebrow || undefined}
        title={
          <span lang={contentLang} className={styles.title}>
            {article.title}
          </span>
        }
        titleId={titleId}
        description={meta}
      />
      {article.excerpt ? (
        <p className={styles.excerpt} lang={contentLang}>
          {article.excerpt}
        </p>
      ) : null}
      {article.cover ? (
        <figure className={styles.cover} lang={contentLang} data-article-cover="">
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
      <div className={styles.body} lang={contentLang} data-article-body="">
        <RichText doc={article.body} assets={article.assets} labels={labels.richText} siteOrigin={siteOrigin} className={styles.bodyText} />
      </div>
      {article.archiveEditorial ? <ArchiveEditorial details={article.archiveEditorial} locale={locale} /> : null}
      {related.length > 0 ? (
        <section className={styles.related} aria-labelledby={`${titleId}-related`} data-related="">
          <h2 id={`${titleId}-related`} className={styles.relatedTitle}>
            {labels.related}
          </h2>
          <ul className={styles.relatedList}>
            {related.map((item) => (
              <li key={item.translationId} className={styles.relatedItem}>
                <div className={styles.relatedMedia}>
                  {item.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element -- publication-aware media route
                    <img src={mediaUrl(item.cover.assetId, 'thumb')} alt="" width={item.cover.width} height={item.cover.height} loading="lazy" decoding="async" />
                  ) : (
                    <div className={publicStyles.placeholder} aria-hidden="true" data-placeholder-game={item.game ?? undefined}>
                      {item.game === 'wardogs' ? (
                        // eslint-disable-next-line @next/next/no-img-element -- unchanged presskit SVG; decorative
                        <img className={publicStyles.placeholderMark} src={WARDOGS_MARK.src} width={WARDOGS_MARK.width} height={WARDOGS_MARK.height} alt="" />
                      ) : item.game ? (
                        labels.games[item.game]
                      ) : (
                        'Valkyria'
                      )}
                    </div>
                  )}
                </div>
                <div className={styles.relatedBody}>
                  <Link href={canonicalNewsPath(item.game, item.slug)} className={styles.relatedLink}>
                    {item.title}
                  </Link>
                  <p className={styles.relatedDate}>
                    <time dateTime={item.publishedAt.toISOString()}>{formatDate(item.publishedAt, locale, 'date')}</time>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
