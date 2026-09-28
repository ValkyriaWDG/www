import type { Executor, Game, Locale } from '@valkyria/db';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getHllManualArtwork } from '@/components/hll/artwork';
import { bilingualAlternates } from '@/components/public/metadata';
import { ListLoadError } from '@/components/public/list-load-error';
import newsStyles from '@/components/public/news.module.css';
import { buildHref, firstParam, parseMissingTranslation, parseSearch, parseTermKey, type RawSearchParams } from '@/components/public/query';
import { PageMain } from '@/components/shell/page-main';
import { EmptyState, FeedbackNotice, GameButton, PageHeader } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { mediaUrl } from '@/modules/content/rich-text/render';
import {
  getPublishedManualBySlug,
  listManualCategories,
  listPublishedManual,
  MANUAL_SEARCH_MAX,
  type ManualCategorySummary,
  type ManualSummary,
} from '@/modules/field-manual/public';
import { GAME_REGISTRY, type GameRoute } from '@/modules/games/registry';
import { gamePath } from '@/modules/games/routes';
import { ManualSearch } from './manual-search';
import styles from './manual.module.css';

export type ManualFilters = { category?: string; q?: string };

export function parseManualFilters(query: RawSearchParams | undefined): ManualFilters {
  return { category: parseTermKey(firstParam(query, 'category')), q: parseSearch(firstParam(query, 'q'), MANUAL_SEARCH_MAX) };
}

export function manualListHref(game: GameRoute, filters: ManualFilters): string {
  return buildHref(gamePath(game, 'field-manual'), [
    ['category', filters.category],
    ['q', filters.q],
  ]);
}

type MissingSource = { locale: Locale; slug: string; title: string };

/**
 * Validates `?missing=<locale>:<slug>` from the language switch: the source article must be
 * a published article of this game that really lacks a published translation here.
 */
async function loadMissingSource(db: Executor, game: Game, current: Locale, missing: { locale: Locale; slug: string }): Promise<MissingSource | null> {
  let lookup = await getPublishedManualBySlug(db, { locale: missing.locale, game, slug: missing.slug });
  if (lookup?.kind === 'redirect') lookup = await getPublishedManualBySlug(db, { locale: missing.locale, game, slug: lookup.slug });
  if (lookup?.kind !== 'article' || lookup.article.counterparts[current]) return null;
  return { locale: missing.locale, slug: lookup.article.slug, title: lookup.article.title };
}

export async function manualListMetadata(locale: AppLocale, game: GameRoute, query: RawSearchParams | undefined): Promise<Metadata> {
  const filters = parseManualFilters(query);
  const games = await getTranslations({ locale, namespace: 'games' });
  return {
    title: games('sectionTitle', { section: games('manual.title'), game: games(`names.${game}`) }),
    description: games('manual.metaDescription', { game: games(`names.${game}`) }),
    alternates: bilingualAlternates(locale, gamePath(game, 'field-manual')),
    // Category and search views are shareable UI state, not separate documents.
    ...(filters.category || filters.q ? { robots: { index: false, follow: true } } : {}),
  };
}

function ArticleCard({ item, game, priority }: { item: ManualSummary; game: GameRoute; priority: boolean }) {
  const artwork = !item.cover ? getHllManualArtwork(game, item.category?.key) : null;
  return (
    <article className={styles.articleCard} data-manual-article={item.slug} data-has-cover={item.cover || artwork ? 'true' : 'false'}>
      {item.cover ? (
        <div className={styles.articleMedia}>
          {/* eslint-disable-next-line @next/next/no-img-element -- publication-aware media route */}
          <img
            src={mediaUrl(item.cover.assetId, 'thumb')}
            alt={item.cover.alt}
            width={item.cover.width}
            height={item.cover.height}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
          />
        </div>
      ) : artwork ? (
        <div className={styles.articleMedia} data-decorative-artwork="">
          {/* eslint-disable-next-line @next/next/no-img-element -- registered static WebP; category title names the decorative art */}
          <img src={artwork.src} alt="" width={artwork.width} height={artwork.height} style={{ objectPosition: artwork.objectPosition }} loading={priority ? 'eager' : 'lazy'} decoding="async" />
        </div>
      ) : null}
      <div className={styles.articleBody}>
        {item.category ? <p className={styles.cardEyebrow}>{item.category.label}</p> : null}
        <h2 className={styles.articleTitle}>
          <Link href={gamePath(game, 'field-manual', item.slug)} className={styles.cardLink}>
            {item.title}
          </Link>
        </h2>
        {item.excerpt ? <p className={styles.articleExcerpt}>{item.excerpt}</p> : null}
      </div>
    </article>
  );
}

function CategoryCard({ category, cover, game, href, countLabel }: { category: ManualCategorySummary; cover: ManualSummary['cover']; game: GameRoute; href: string; countLabel: string }) {
  const artwork = !cover ? getHllManualArtwork(game, category.key) : null;
  return (
    <article className={styles.categoryCard} data-manual-category={category.key} data-has-cover={cover || artwork ? '' : undefined}>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- publication-aware media route; decorative behind the label
        <img className={styles.categoryImage} src={mediaUrl(cover.assetId, 'thumb')} alt="" width={cover.width} height={cover.height} loading="lazy" decoding="async" />
      ) : artwork ? (
        // eslint-disable-next-line @next/next/no-img-element -- registered static WebP; decorative behind the category label
        <img className={styles.categoryImage} src={artwork.src} alt="" width={artwork.width} height={artwork.height} style={{ objectPosition: artwork.objectPosition }} loading="lazy" decoding="async" data-decorative-artwork="" />
      ) : null}
      <div className={styles.categoryText}>
        <h2 className={styles.categoryTitle}>
          <Link href={href} className={styles.cardLink}>
            {category.label}
          </Link>
        </h2>
        {category.description ? <p className={styles.categoryDescription}>{category.description}</p> : null}
        <p className={styles.categoryCount}>{countLabel}</p>
      </div>
    </article>
  );
}

/**
 * Field manual collection (reference 10): a search/category rail beside a 3-column card
 * grid. States: browse (category cards), category (its articles), search results, no
 * results, unknown category, empty manual and read error. Only published articles of this
 * game and locale are listed; URL query state (`category`, `q`) is authoritative.
 */
export async function ManualScreen({ locale, game, query }: { locale: AppLocale; game: GameRoute; query: RawSearchParams | undefined }) {
  const filters = parseManualFilters(query);
  const dbGame = GAME_REGISTRY[game].db;
  const games = await getTranslations({ locale, namespace: 'games' });
  const t = await getTranslations({ locale, namespace: 'games.manual' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const tNews = await getTranslations({ locale, namespace: 'news' });
  const listPath = gamePath(game, 'field-manual');
  const missing = parseMissingTranslation(firstParam(query, 'missing'), locale);

  const db = getDb();
  const [loaded, source] = await Promise.all([
    Promise.all([
      listManualCategories(db, { locale, game: dbGame }),
      listPublishedManual(db, { locale, game: dbGame, category: filters.category, q: filters.q, limit: 100 }),
    ]).catch((error: unknown) => {
      console.error('[field-manual] list query failed', error instanceof Error ? error.name : 'unknown');
      return null;
    }),
    missing ? loadMissingSource(db, dbGame, locale, missing).catch(() => null) : Promise.resolve(null),
  ]);

  const categories = loaded?.[0] ?? [];
  const list = loaded?.[1] ?? { items: [], total: 0 };
  const activeCategory = filters.category ? categories.find((category) => category.key === filters.category) : undefined;
  const searching = Boolean(filters.q);
  const mode = searching ? 'search' : filters.category ? 'category' : 'browse';
  const subtitle = mode === 'search' ? t('searchSubtitle') : mode === 'category' ? (activeCategory?.label ?? t('unknownCategoryTitle')) : t('browseSubtitle');

  const firstCover = new Map<string, ManualSummary['cover']>();
  if (mode === 'browse') {
    for (const item of list.items) if (item.category && item.cover && !firstCover.has(item.category.key)) firstCover.set(item.category.key, item.cover);
  }

  let content;
  if (loaded === null) {
    content = <ListLoadError message={t('loadError')} retryLabel={t('retry')} retryHref={manualListHref(game, filters)} />;
  } else if (categories.length === 0 && mode === 'browse') {
    content = (
      <EmptyState title={t('emptyTitle')}>
        <p>{t('emptyBody')}</p>
      </EmptyState>
    );
  } else if (mode === 'browse') {
    content = (
      <ul className={styles.grid} aria-label={t('categoryGridLabel')} data-manual-grid="categories">
        {categories.map((category) => (
          <li key={category.key}>
            <CategoryCard
              category={category}
              cover={firstCover.get(category.key) ?? null}
              game={game}
              href={manualListHref(game, { category: category.key })}
              countLabel={t('articleCount', { count: category.count })}
            />
          </li>
        ))}
      </ul>
    );
  } else if (mode === 'category' && !activeCategory) {
    content = (
      <EmptyState
        title={t('unknownCategoryTitle')}
        action={
          <GameButton href={listPath} intent="secondary">
            {t('allCategories')}
          </GameButton>
        }
      >
        <p>{t('unknownCategoryBody')}</p>
      </EmptyState>
    );
  } else if (list.items.length === 0) {
    content = (
      <div data-manual-no-results="">
        <EmptyState
          title={t('noResultsTitle')}
          action={
            <GameButton href={manualListHref(game, { category: filters.category })} intent="secondary" data-clear-search="">
              {t('clearSearch')}
            </GameButton>
          }
        >
          <p>{t('noResultsBody')}</p>
        </EmptyState>
      </div>
    );
  } else {
    content = (
      <ol className={styles.grid} aria-label={t('articleListLabel')} data-manual-grid="articles">
        {list.items.map((item, index) => (
          <li key={item.translationId}>
            <ArticleCard item={item} game={game} priority={index < 3} />
          </li>
        ))}
      </ol>
    );
  }

  const summary = searching
    ? activeCategory
      ? t('resultSummaryCategory', { count: list.total, q: filters.q ?? '', category: activeCategory.label })
      : t('resultSummary', { count: list.total, q: filters.q ?? '' })
    : null;

  return (
    <PageMain width="full" labelledBy="manual-title">
      <PageHeader
        breadcrumbs={[{ href: gamePath(game), label: games(`menuLabel.${game}`) }, { label: t('title') }]}
        eyebrow={games(`eyebrow.${game}`)}
        title={t('title')}
        titleId="manual-title"
        description={
          <>
            <p className={styles.subtitle} data-manual-mode={mode}>
              {subtitle}
            </p>
            <p>{t('intro', { game: games(`names.${game}`) })}</p>
          </>
        }
      />
      {source ? (
        <div className={newsStyles.notice} data-missing-translation={`${source.locale}:${source.slug}`}>
          <FeedbackNotice kind="info" title={tNews('missing.title')} live={false}>
            <p className={newsStyles.noticeText}>{tNews(`missing.body.${source.locale}`)}</p>
            <p className={newsStyles.noticeText}>
              <Link href={gamePath(game, 'field-manual', source.slug)} locale={source.locale} hrefLang={source.locale} className={newsStyles.noticeLink} data-missing-source="">
                {tNews.rich(`missing.link.${source.locale}`, { title: source.title, source: (chunks) => <span lang={source.locale}>{chunks}</span> })}
              </Link>
            </p>
          </FeedbackNotice>
        </div>
      ) : null}
      <div className={styles.layout} data-mode={mode}>
        <aside className={styles.rail} aria-label={t('searchLabel')}>
          {loaded !== null && (categories.length > 0 || searching) ? (
            <ManualSearch
              action={listPath}
              query={filters.q ?? ''}
              category={activeCategory?.key}
              label={t('searchLabel')}
              placeholder={t('searchPlaceholder')}
              submitLabel={tCommon('actions.search')}
              searchingLabel={t('searching')}
            />
          ) : null}
          {summary ? (
            <div className={styles.summary} data-manual-summary="">
              <p role="status">{summary}</p>
              <Link href={manualListHref(game, { category: activeCategory?.key })} className={styles.clearLink} data-clear-search="">
                {t('clearSearch')}
              </Link>
            </div>
          ) : null}
          {categories.length > 0 ? (
            <nav aria-label={t('categoriesLabel')} className={styles.categoryNav}>
              <ul className={styles.categoryList}>
                <li>
                  <Link href={listPath} className={styles.categoryLink} aria-current={mode === 'browse' ? 'page' : undefined}>
                    <span>{t('allCategories')}</span>
                  </Link>
                </li>
                {categories.map((category) => (
                  <li key={category.key}>
                    <Link
                      href={manualListHref(game, { category: category.key })}
                      className={styles.categoryLink}
                      aria-current={!searching && activeCategory?.key === category.key ? 'page' : undefined}
                      data-category-link={category.key}
                    >
                      <span>{category.label}</span>
                      <span className={styles.categoryLinkCount} aria-hidden="true">
                        {category.count}
                      </span>
                      <span className="visually-hidden">{`, ${t('articleCount', { count: category.count })}`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </aside>
        <div className={styles.content}>{content}</div>
      </div>
    </PageMain>
  );
}
