import type { Game } from '@valkyria/db/schema';
import { formatDate } from '@/i18n/date-format';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { mediaUrl } from '@/modules/content/rich-text/render';
import type { NewsSummary } from '@/modules/content/types';
import { TagList } from './tags';
import styles from './news.module.css';
import publicStyles from './public.module.css';

export type NewsCardLabels = { games: Record<Game, string>; placeholder: string; tags: string };

/**
 * One published post as an image panel: cover thumbnail with reserved dimensions (or a
 * neutral placeholder, never a broken image), category/game eyebrow, title link covering
 * the panel, excerpt, date and approved author label, tags. Published snapshot data only.
 */
export function NewsCard({ item, locale, labels, priority = false }: { item: NewsSummary; locale: AppLocale; labels: NewsCardLabels; priority?: boolean }) {
  const titleId = `news-${item.translationId}`;
  const eyebrow = [item.category?.label, item.game ? labels.games[item.game] : null].filter(Boolean).join(' · ');
  return (
    <article className={styles.card} aria-labelledby={titleId} data-news-card={item.slug}>
      <div className={styles.media}>
        {item.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- publication-aware media route, not the optimizer
          <img
            src={mediaUrl(item.cover.assetId, 'thumb')}
            alt={item.cover.alt}
            width={item.cover.width}
            height={item.cover.height}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
          />
        ) : (
          <div className={publicStyles.placeholder} aria-hidden="true">
            {item.game ? labels.games[item.game] : labels.placeholder}
          </div>
        )}
      </div>
      <div className={styles.body}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h2 id={titleId} className={styles.title}>
          <Link href={`/news/${item.slug}`} className={styles.link}>
            {item.title}
          </Link>
        </h2>
        {item.excerpt ? <p className={styles.excerpt}>{item.excerpt}</p> : null}
        <p className={styles.meta}>
          <span className={styles.metaItem}>
            <time dateTime={item.publishedAt.toISOString()}>{formatDate(item.publishedAt, locale, 'date')}</time>
          </span>
          {item.authorLabel ? <span className={styles.metaItem}>{item.authorLabel}</span> : null}
        </p>
        {item.tags.length > 0 ? (
          <div className={styles.tags}>
            <TagList label={labels.tags} items={item.tags.map((tag) => ({ key: tag.key, label: tag.label }))} />
          </div>
        ) : null}
      </div>
    </article>
  );
}
