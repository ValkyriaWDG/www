import { getTranslations } from 'next-intl/server';
import { StatusBadge } from '@/components/ui/panels';
import { formatDate } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import { getSiteOrigin } from '@/lib/site';
import { mediaUrl, RichText } from '@/modules/content/rich-text/render';
import type { ArticleDTO } from '@/modules/content/types';
import styles from './admin.module.css';

/**
 * Admin preview of an article DTO (`getPreview`) with the same server-side `RichText`
 * renderer and article typography used for public output; no editor code is loaded.
 * Labels follow the UI locale; the article itself carries its content language.
 * (The public slice's `ArticleView` can replace this once both are integrated.)
 */
export async function PreviewArticle({ article, uiLocale }: { article: ArticleDTO; uiLocale: AppLocale }) {
  const t = await getTranslations({ locale: uiLocale, namespace: 'adminEditorial.preview' });
  const tNews = await getTranslations({ locale: article.locale, namespace: 'news.richText' });
  const tGames = await getTranslations({ locale: uiLocale, namespace: 'adminEditorial.games' });
  return (
    <article className={styles.article} lang={article.locale} data-testid="preview-article">
      <header className={styles.articleHeader}>
        <p className={styles.eyebrow}>
          {[article.category?.label, article.game ? tGames(article.game) : null].filter(Boolean).join(' · ') || t('noCategory')}
        </p>
        <h1 data-testid="preview-title">{article.title || t('untitled')}</h1>
        <p className={styles.articleMeta}>
          {article.authorLabel ? <span>{article.authorLabel}</span> : null}
          <span lang={uiLocale}>
            {article.publishedAt ? t('firstPublished', { date: formatDate(article.publishedAt, uiLocale, 'date') }) : t('notPublished')}
          </span>
        </p>
      </header>
      {article.cover ? (
        <figure className={styles.articleCover} data-testid="preview-cover">
          {/* eslint-disable-next-line @next/next/no-img-element -- authorized private preview via the media route */}
          <img src={mediaUrl(article.cover.assetId, 'full')} alt={article.cover.decorative ? '' : article.cover.alt} width={article.cover.width} height={article.cover.height} />
          {article.cover.caption ? <figcaption>{article.cover.caption}</figcaption> : null}
        </figure>
      ) : null}
      {article.excerpt ? <p className={styles.articleLead}>{article.excerpt}</p> : null}
      <RichText doc={article.body} assets={article.assets} labels={{ tableRegion: tNews('tableRegion'), externalLink: tNews('externalLink') }} siteOrigin={getSiteOrigin()} />
      {article.tags.length > 0 ? (
        <ul className={styles.tagList} aria-label={t('tags')}>
          {article.tags.map((tag) => (
            <li key={tag.key}>
              <StatusBadge kind="neutral" icon={false}>
                {tag.label}
              </StatusBadge>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
