import type { Game } from '@valkyria/db/schema';
import { HLL_NEWS_ARTWORK } from '@/components/hll/artwork';
import { formatDate } from '@/i18n/date-format';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { mediaUrl } from '@/modules/content/rich-text/render';
import { canonicalNewsPath } from '@/modules/games/routes';
import type { NewsSummary } from '@/modules/content/types';
import { WARDOGS_MARK } from './presskit';
import { TagList } from './tags';
import styles from './news.module.css';
import publicStyles from './public.module.css';

export type NewsCardLabels = { games: Record<Game, string>; tags: string };

/**
 * Artwork for a post without a cover: the Wardogs mark, the HLL scene with the clan crest,
 * or the pack's community scene with the crest for shared posts. Never a broken image.
 */
export function NewsPlaceholder({ game, priority = false }: { game: Game | null; priority?: boolean }) {
  return (
    <div className={publicStyles.placeholder} aria-hidden="true" data-placeholder-game={game ?? 'community'}>
      {game === 'wardogs' ? (
        // eslint-disable-next-line @next/next/no-img-element -- unchanged presskit SVG; the eyebrow names the game
        <img className={publicStyles.placeholderMark} src={WARDOGS_MARK.src} width={WARDOGS_MARK.width} height={WARDOGS_MARK.height} alt="" />
      ) : game === 'hell-let-loose' ? (
        <>
          {/* Illustrative game scene and clan branding, never a photograph of this event. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- registered static WebP; whole placeholder is decorative */}
          <img className={publicStyles.placeholderHllScene} src={HLL_NEWS_ARTWORK.src} width={HLL_NEWS_ARTWORK.width} height={HLL_NEWS_ARTWORK.height} style={{ objectPosition: HLL_NEWS_ARTWORK.objectPosition }} alt="" loading={priority ? 'eager' : 'lazy'} decoding="async" />
          {/* eslint-disable-next-line @next/next/no-img-element -- unchanged clan emblem with intrinsic dimensions */}
          <img className={publicStyles.placeholderHllCrest} src="/brand/valkyria-emblem-733.webp" width={733} height={811} alt="" loading="lazy" decoding="async" />
        </>
      ) : (
        <>
          {/* Shared community post: the text-free community scene of the graphics pack and the clan emblem. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- registered static WebP; whole placeholder is decorative */}
          <img className={publicStyles.placeholderHllScene} src="/images/editorial/hub-480x270.webp" width={480} height={270} alt="" loading={priority ? 'eager' : 'lazy'} decoding="async" />
          {/* eslint-disable-next-line @next/next/no-img-element -- unchanged clan emblem with intrinsic dimensions */}
          <img className={publicStyles.placeholderHllCrest} src="/brand/valkyria-emblem-733.webp" width={733} height={811} alt="" loading="lazy" decoding="async" />
        </>
      )}
    </div>
  );
}

/**
 * One published post as an image panel: cover thumbnail with reserved dimensions (or a
 * neutral placeholder, never a broken image), category/game eyebrow, title link covering
 * the panel, excerpt, date and approved author label, tags. Published snapshot data only.
 */
export function NewsCard({
  item,
  locale,
  labels,
  priority = false,
  communityLabel,
}: {
  item: NewsSummary;
  locale: AppLocale;
  labels: NewsCardLabels;
  priority?: boolean;
  /**
   * In a game section, names shared community posts explicitly (they link to
   * `/news/<slug>`); the section's own game is not repeated on every card.
   */
  communityLabel?: string;
}) {
  const titleId = `news-${item.translationId}`;
  const scopeLabel = communityLabel !== undefined ? (item.game ? null : communityLabel) : item.game ? labels.games[item.game] : null;
  const sameAsCategory = scopeLabel && item.category?.label.toLocaleLowerCase() === scopeLabel.toLocaleLowerCase();
  const eyebrow = [item.category?.label, sameAsCategory ? null : scopeLabel].filter(Boolean).join(' · ');
  return (
    <article className={styles.card} aria-labelledby={titleId} data-news-card={item.slug} data-news-scope={item.game ?? 'community'}>
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
          <NewsPlaceholder game={item.game} priority={priority} />
        )}
      </div>
      <div className={styles.body}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h2 id={titleId} className={styles.title}>
          <Link href={canonicalNewsPath(item.game, item.slug)} className={styles.link}>
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
