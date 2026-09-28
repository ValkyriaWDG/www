import { GAMES, type Executor, type Locale } from '@valkyria/db';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { GameSwitchNotice } from '@/components/games/switch-notice';
import { bilingualAlternates } from '@/components/public/metadata';
import { NewsCard, type NewsCardLabels } from '@/components/public/news-card';
import newsStyles from '@/components/public/news.module.css';
import { ListLoadError } from '@/components/public/list-load-error';
import { firstParam, hasNewsFilters, newsListHref, parseMissingTranslation, parseNewsFilters, type RawSearchParams } from '@/components/public/query';
import { PageMain } from '@/components/shell/page-main';
import { EmptyState, FeedbackNotice, FilterBar, GameButton, PageHeader, Pagination, type FilterGroup } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getAvailableTaxonomy, getPublishedNewsBySlug, listPublishedNews } from '@/modules/content/public';
import type { AvailableTaxonomy } from '@/modules/content/types';
import { GAME_REGISTRY, type GameRoute } from '@/modules/games/registry';
import { canonicalNewsPath, sectionBase } from '@/modules/games/routes';

const PAGE_SIZE = 12;
const EMPTY_TAXONOMY: AvailableTaxonomy = { categories: [], tags: [], games: [] };

type MissingSource = { locale: Locale; slug: string; title: string; href: string };

/** List metadata for the shared (`game === null`) or a game-scoped news collection. */
export async function newsListMetadata(locale: AppLocale, query: RawSearchParams | undefined, game: GameRoute | null): Promise<Metadata> {
  const filters = parseNewsFilters(query);
  const t = await getTranslations({ locale, namespace: 'news.meta' });
  const games = await getTranslations({ locale, namespace: 'games' });
  return {
    title: game ? games('sectionTitle', { section: t('title'), game: games(`names.${game}`) }) : t('title'),
    description: t('description'),
    alternates: bilingualAlternates(locale, `${sectionBase(game)}/news`),
    // Filtered/search views are useful to share but are not separate documents.
    ...(hasNewsFilters(filters) ? { robots: { index: false, follow: true } } : {}),
  };
}

/**
 * Validates `?missing=<locale>:<slug>`: the source article must be published and must
 * really lack a published translation in the current locale; otherwise the notice is omitted.
 */
async function loadMissingSource(db: Executor, current: Locale, missing: { locale: Locale; slug: string }): Promise<MissingSource | null> {
  let lookup = await getPublishedNewsBySlug(missing.locale, missing.slug, db);
  if (lookup?.kind === 'redirect') lookup = await getPublishedNewsBySlug(missing.locale, lookup.slug, db);
  if (lookup?.kind !== 'article') return null;
  if (lookup.article.counterparts[current]) return null;
  return { locale: missing.locale, slug: lookup.article.slug, title: lookup.article.title, href: canonicalNewsPath(lookup.article.game, lookup.article.slug) };
}

/**
 * Published news collection with filters/search/pagination in the URL. `game === null`
 * is the shared community list (all games, optional game filter); a game section lists
 * that game's posts plus explicit community posts, each linking to its canonical URL.
 */
export async function NewsListScreen({ locale, query, game }: { locale: AppLocale; query: RawSearchParams | undefined; game: GameRoute | null }) {
  const base = sectionBase(game);
  const dbGame = game ? GAME_REGISTRY[game].db : undefined;
  const filters = parseNewsFilters(query);
  if (dbGame) filters.game = undefined;
  const missing = parseMissingTranslation(firstParam(query, 'missing'), locale);
  const t = await getTranslations({ locale, namespace: 'news' });
  const games = await getTranslations({ locale, namespace: 'games' });

  const db = getDb();
  const [list, taxonomy, source] = await Promise.all([
    listPublishedNews(
      { locale, page: filters.page, pageSize: PAGE_SIZE, category: filters.category, game: filters.game, gameScope: dbGame, q: filters.q },
      db,
    ).catch((error: unknown) => {
      console.error('[news] list query failed', error instanceof Error ? error.name : 'unknown');
      return null;
    }),
    getAvailableTaxonomy(locale, db, dbGame).catch(() => EMPTY_TAXONOMY),
    missing ? loadMissingSource(db, locale, missing).catch(() => null) : Promise.resolve(null),
  ]);

  const filtered = hasNewsFilters(filters);
  const labels: NewsCardLabels = {
    games: { wardogs: t('games.wardogs'), 'hell-let-loose': t('games.hell-let-loose') },
    placeholder: t('list.placeholderLabel'),
    tags: t('article.tags'),
  };
  const href = (next: Parameters<typeof newsListHref>[0]) => newsListHref(next, base);

  const filterGroups: FilterGroup[] = [];
  if (taxonomy.categories.length > 0) {
    filterGroups.push({
      name: 'category',
      label: t('list.categoryGroup'),
      options: [
        { value: 'all', label: t('list.all'), href: href({ ...filters, category: undefined, page: 1 }), current: !filters.category },
        ...taxonomy.categories.map((category) => ({
          value: category.key,
          label: category.label,
          href: href({ ...filters, category: category.key, page: 1 }),
          current: filters.category === category.key,
        })),
      ],
    });
  }
  if (!game) {
    filterGroups.push({
      name: 'game',
      label: t('list.gameGroup'),
      options: [
        { value: 'all', label: t('list.all'), href: href({ ...filters, game: undefined, page: 1 }), current: !filters.game },
        ...GAMES.map((value) => ({ value, label: labels.games[value], href: href({ ...filters, game: value, page: 1 }), current: filters.game === value })),
      ],
    });
  }
  const hiddenParams: Record<string, string> = {};
  if (filters.category) hiddenParams.category = filters.category;
  if (filters.game) hiddenParams.game = filters.game;
  const listPath = `${base}/news`;

  return (
    <PageMain labelledBy="news-title">
      <PageHeader
        breadcrumbs={[{ href: base || '/', label: game ? games(`menuLabel.${game}`) : t('list.breadcrumbHome') }, { label: t('list.title') }]}
        eyebrow={game ? games(`eyebrow.${game}`) : t('list.eyebrow')}
        title={t('list.title')}
        titleId="news-title"
        description={<p>{game ? games('newsIntro', { game: games(`names.${game}`) }) : t('list.intro')}</p>}
      />
      {game ? <GameSwitchNotice locale={locale} game={game} query={query} /> : null}
      {source ? (
        <div className={newsStyles.notice} data-missing-translation={`${source.locale}:${source.slug}`}>
          <FeedbackNotice kind="info" title={t('missing.title')} live={false}>
            <p className={newsStyles.noticeText}>{t(`missing.body.${source.locale}`)}</p>
            <p className={newsStyles.noticeText}>
              <Link href={source.href} locale={source.locale} hrefLang={source.locale} className={newsStyles.noticeLink} data-missing-source="">
                {t.rich(`missing.link.${source.locale}`, { title: source.title, source: (chunks) => <span lang={source.locale}>{chunks}</span> })}
              </Link>
            </p>
          </FeedbackNotice>
        </div>
      ) : null}
      {list === null ? (
        <ListLoadError message={t('list.loadError')} retryLabel={t('list.retry')} retryHref={href(filters)} />
      ) : (
        <>
          {list.total > 0 || filtered ? (
            <FilterBar
              action={listPath}
              searchLabel={t('list.searchLabel')}
              searchValue={filters.q}
              searchPlaceholder={t('list.searchPlaceholder')}
              hiddenParams={hiddenParams}
              filters={filterGroups}
              resetHref={filtered ? listPath : null}
              resultSummary={t('list.resultCount', { count: list.total })}
            />
          ) : null}
          {list.items.length > 0 ? (
            <ol className={newsStyles.grid} aria-label={t('list.listLabel')} data-news-list="">
              {list.items.map((item, index) => (
                <li key={item.translationId}>
                  <NewsCard item={item} locale={locale} labels={labels} priority={index < 3} communityLabel={game ? games('communityLabel') : undefined} />
                </li>
              ))}
            </ol>
          ) : list.total > 0 ? (
            <EmptyState
              title={t('list.pageEmptyTitle')}
              action={
                <GameButton href={href({ ...filters, page: 1 })} intent="secondary">
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
                <GameButton href={listPath} intent="secondary" data-clear-filters="">
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
          <Pagination page={list.page} pageCount={list.pageCount} hrefForPage={(page) => href({ ...filters, page })} />
        </>
      )}
    </PageMain>
  );
}
