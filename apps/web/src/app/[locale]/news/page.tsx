import { GAMES, type Executor, type Locale } from '@valkyria/db';
import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { bilingualAlternates, OG_LOCALE } from '@/components/public/metadata';
import { sharingMetadata } from '@/modules/social/metadata';
import { NewsCard, type NewsCardLabels } from '@/components/public/news-card';
import newsStyles from '@/components/public/news.module.css';
import { ListLoadError } from '@/components/public/list-load-error';
import { firstParam, hasNewsFilters, newsListHref, parseMissingTranslation, parseNewsFilters } from '@/components/public/query';
import { PageMain } from '@/components/shell/page-main';
import { EmptyState, FeedbackNotice, FilterBar, GameButton, PageHeader, Pagination, type FilterGroup } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getAvailableTaxonomy, getPublishedNewsBySlug, listPublishedNews } from '@/modules/content/public';
import type { AvailableTaxonomy } from '@/modules/content/types';

const PAGE_SIZE = 12;

export async function generateMetadata({ params, searchParams }: PageProps<'/[locale]/news'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const filters = parseNewsFilters(await searchParams);
  const t = await getTranslations({ locale, namespace: 'news.meta' });
  const sharing = sharingMetadata(locale, 'news', undefined, undefined, t('title'), t('description'));
  return {
    title: t('title'),
    description: t('description'),
    alternates: bilingualAlternates(locale, '/news'),
    openGraph: { type: 'website', title: t('title'), description: t('description'), url: `/${locale}/news`, locale: OG_LOCALE[locale], images: sharing.images },
    twitter: sharing.twitter,
    // Filtered/search views are useful to share but are not separate documents.
    ...(hasNewsFilters(filters) ? { robots: { index: false, follow: true } } : {}),
  };
}

type MissingSource = { locale: Locale; slug: string; title: string };

/**
 * Validates `?missing=<locale>:<slug>`: the source article must be published and must
 * really lack a published translation in the current locale; otherwise the notice is omitted.
 */
async function loadMissingSource(db: Executor, current: Locale, missing: { locale: Locale; slug: string }): Promise<MissingSource | null> {
  let lookup = await getPublishedNewsBySlug(missing.locale, missing.slug, db);
  if (lookup?.kind === 'redirect') lookup = await getPublishedNewsBySlug(missing.locale, lookup.slug, db);
  if (lookup?.kind !== 'article') return null;
  if (lookup.article.counterparts[current]) return null;
  return { locale: missing.locale, slug: lookup.article.slug, title: lookup.article.title };
}

const EMPTY_TAXONOMY: AvailableTaxonomy = { categories: [], tags: [], games: [] };

/** Localized news collection: filters/search/pagination in the URL, published posts only. */
export default async function NewsPage({ params, searchParams }: PageProps<'/[locale]/news'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const query = await searchParams;
  const filters = parseNewsFilters(query);
  const missing = parseMissingTranslation(firstParam(query, 'missing'), locale);
  const t = await getTranslations({ locale, namespace: 'news' });

  const db = getDb();
  const [list, taxonomy, source] = await Promise.all([
    listPublishedNews({ locale, page: filters.page, pageSize: PAGE_SIZE, category: filters.category, game: filters.game, q: filters.q }, db).catch((error: unknown) => {
      console.error('[news] list query failed', error instanceof Error ? error.name : 'unknown');
      return null;
    }),
    getAvailableTaxonomy(locale, db).catch(() => EMPTY_TAXONOMY),
    missing ? loadMissingSource(db, locale, missing).catch(() => null) : Promise.resolve(null),
  ]);

  const filtered = hasNewsFilters(filters);
  const labels: NewsCardLabels = {
    games: { wardogs: t('games.wardogs'), 'hell-let-loose': t('games.hell-let-loose') },
    placeholder: t('list.placeholderLabel'),
    tags: t('article.tags'),
  };

  const filterGroups: FilterGroup[] = [];
  if (taxonomy.categories.length > 0) {
    filterGroups.push({
      name: 'category',
      label: t('list.categoryGroup'),
      options: [
        { value: 'all', label: t('list.all'), href: newsListHref({ ...filters, category: undefined, page: 1 }), current: !filters.category },
        ...taxonomy.categories.map((category) => ({
          value: category.key,
          label: category.label,
          href: newsListHref({ ...filters, category: category.key, page: 1 }),
          current: filters.category === category.key,
        })),
      ],
    });
  }
  filterGroups.push({
    name: 'game',
    label: t('list.gameGroup'),
    options: [
      { value: 'all', label: t('list.all'), href: newsListHref({ ...filters, game: undefined, page: 1 }), current: !filters.game },
      ...GAMES.map((game) => ({ value: game, label: labels.games[game], href: newsListHref({ ...filters, game, page: 1 }), current: filters.game === game })),
    ],
  });
  const hiddenParams: Record<string, string> = {};
  if (filters.category) hiddenParams.category = filters.category;
  if (filters.game) hiddenParams.game = filters.game;

  return (
    <PageMain labelledBy="news-title">
      <PageHeader
        breadcrumbs={[{ href: '/', label: t('list.breadcrumbHome') }, { label: t('list.title') }]}
        eyebrow={t('list.eyebrow')}
        title={t('list.title')}
        titleId="news-title"
        description={<p>{t('list.intro')}</p>}
      />
      {source ? (
        <div className={newsStyles.notice} data-missing-translation={`${source.locale}:${source.slug}`}>
          <FeedbackNotice kind="info" title={t('missing.title')} live={false}>
            <p className={newsStyles.noticeText}>{t(`missing.body.${source.locale}`)}</p>
            <p className={newsStyles.noticeText}>
              <Link href={`/news/${source.slug}`} locale={source.locale} hrefLang={source.locale} className={newsStyles.noticeLink} data-missing-source="">
                {t.rich(`missing.link.${source.locale}`, { title: source.title, source: (chunks) => <span lang={source.locale}>{chunks}</span> })}
              </Link>
            </p>
          </FeedbackNotice>
        </div>
      ) : null}
      {list === null ? (
        <ListLoadError message={t('list.loadError')} retryLabel={t('list.retry')} retryHref={newsListHref(filters)} />
      ) : (
        <>
          {list.total > 0 || filtered ? (
            <FilterBar
              action="/news"
              searchLabel={t('list.searchLabel')}
              searchValue={filters.q}
              searchPlaceholder={t('list.searchPlaceholder')}
              hiddenParams={hiddenParams}
              filters={filterGroups}
              resetHref={filtered ? '/news' : null}
              resultSummary={t('list.resultCount', { count: list.total })}
            />
          ) : null}
          {list.items.length > 0 ? (
            <ol className={newsStyles.grid} aria-label={t('list.listLabel')} data-news-list="">
              {list.items.map((item, index) => (
                <li key={item.translationId}>
                  <NewsCard item={item} locale={locale} labels={labels} priority={index < 3} />
                </li>
              ))}
            </ol>
          ) : list.total > 0 ? (
            <EmptyState
              title={t('list.pageEmptyTitle')}
              action={
                <GameButton href={newsListHref({ ...filters, page: 1 })} intent="secondary">
                  {t('list.firstPage')}
                </GameButton>
              }
            >
              <p>{t('list.pageEmptyBody')}</p>
            </EmptyState>
          ) : filtered ? (
            <EmptyState
              title={t('list.filteredEmptyTitle')}
              action={
                <GameButton href="/news" intent="secondary" data-clear-filters="">
                  {t('list.clearFilters')}
                </GameButton>
              }
            >
              <p>{t('list.filteredEmptyBody')}</p>
            </EmptyState>
          ) : (
            <EmptyState title={t('list.emptyTitle')}>
              <p>{t('list.emptyBody')}</p>
            </EmptyState>
          )}
          <Pagination page={list.page} pageCount={list.pageCount} hrefForPage={(page) => newsListHref({ ...filters, page })} />
        </>
      )}
    </PageMain>
  );
}
