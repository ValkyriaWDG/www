import { GAMES } from '@valkyria/db/schema';
import { EmptyState, FilterBar, GameButton, LinkTabs, Pagination, SelectionTable, type SelectionColumn } from '@/components/ui';
import { formatNumber } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { GAME_REGISTRY, gameRouteFromDb, type GameRoute } from '@/modules/games/registry';
import { sectionBase } from '@/modules/games/routes';
import { getPublicMatch, getPublicMatchCounts, listPublicMatches, mapPublishedLeagueMatchSlugs } from '@/modules/matches/queries';
import { archiveMatchWindow, matchBrowserCounts, mergeMatchBrowserPage, type MatchBrowserRow } from '@/modules/matches/public-browser';
import type { PublicMatchCounts, PublicMatchDetail, PublicMatchSummary } from '@/modules/matches/types';
import { ListLoadError } from './list-load-error';
import { MatchDetailExtras, MatchDetailPane } from './match-detail';
import { getMatchTranslations, MatchResult, MatchStart, MatchStatusBadge, MatchTeams } from './match-parts';
import { hasMatchFilters, matchDetailHref, matchesListHref, type MatchFilters, type MatchView } from './query';
import { TagList } from './tags';
import { getPublicLogiEvents } from '@/modules/integrations/logi-public';
import { getLeagueMatchPreview } from '@/modules/integrations/logi/readers/league';
import { LeaguePreview } from './league-preview';
import { publicLogiMatchRows } from '@/modules/integrations/logi/public-matches';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { getLeagueFixtures } from '@/modules/integrations/logi/readers/fixtures';
import type { LeagueFixturePublic } from '@/modules/integrations/logi/readers/public';
import { leagueBrowserRows } from '@/modules/matches/league-browser';
import { LeagueMatchPreview, LeagueMatchStart, LeagueMatchTeams, LeagueMatchStatus } from './league-match-parts';
import { SyntheticNote } from '@/components/ui/panels';
import { getOperationalTranslations, OperationalMatchPreview, OperationalMatchResult, OperationalMatchStart, OperationalMatchStatus, OperationalMatchTeams } from './operational-match-parts';
import styles from './matches.module.css';

export const MATCH_PAGE_SIZE = 10;

const VIEWS: MatchView[] = ['upcoming', 'results'];

/**
 * Reference-13 match browser shared by `/matches` (list + preview of the first row) and
 * `/matches/<slug>` (same list for the match's view with that row selected + full detail;
 * below 1280 px only the standalone detail is shown). The detail's maps/rounds and
 * statistics span the full width below list and pane. Rows are real links to the detail.
 */
export async function MatchesScreen({
  locale,
  filters: requested,
  mode,
  selected,
  selectedEvent,
  selectedFixture,
  game = null,
}: {
  locale: AppLocale;
  filters: MatchFilters;
  mode: 'list' | 'detail';
  /** The canonical detail (detail mode). */
  selected?: PublicMatchDetail | null;
  selectedEvent?: PublicLogiEvent;
  selectedFixture?: LeagueFixturePublic;
  /** Game section (fixed game, no game filter) or `null` for the shared all-games list. */
  game?: GameRoute | null;
}) {
  const [t, operational] = await Promise.all([getMatchTranslations(locale), getOperationalTranslations(locale)]);
  const now = new Date();
  const db = getDb();
  const base = sectionBase(game);
  const scopedGame = game ? GAME_REGISTRY[game].db : undefined;
  const filters: MatchFilters = scopedGame ? { ...requested, game: undefined } : requested;
  const effectiveGame = scopedGame ?? filters.game;
  const [logiEvents, fixtures] = await Promise.all([getPublicLogiEvents(), effectiveGame === 'hell-let-loose' ? null : getLeagueFixtures(now)]);
  const scopedEvents = logiEvents.filter((event) => !effectiveGame || GAME_REGISTRY[event.ref.game].db === effectiveGame);
  const operationalRows = publicLogiMatchRows(scopedEvents, { view: filters.view, q: filters.q, now });
  // Only a currently visible provider counterpart replaces an archive list row. Its
  // canonical archive detail stays available; stale provider data restores the row.
  const linkedPublicSlugs = logiEvents.flatMap((event) => event.archive ? [event.archive.slug] : []);
  const listHref = (next: Partial<MatchFilters>) => matchesListHref(next, base);
  // Game lists keep their list context on the detail URL; the shared list links to each
  // match's canonical game section.
  const detailHref = (row: { slug: string; game: PublicMatchSummary['game'] }, context: Partial<Omit<MatchFilters, 'view'>>) =>
    game ? matchDetailHref(row.slug, context, base) : matchDetailHref(row.slug, {}, sectionBase(gameRouteFromDb(row.game)));
  let page: ReturnType<typeof mergeMatchBrowserPage> | null = null;
  let counts: PublicMatchCounts | null = null;
  try {
    const publishedLeagueIds = new Set((fixtures?.items.length ? await mapPublishedLeagueMatchSlugs(db, fixtures.items.map((fixture) => fixture.id)) : new Map<string, string>()).keys());
    const leagueRows = leagueBrowserRows(fixtures, logiEvents, publishedLeagueIds, { view: filters.view, q: filters.q, now });
    const leagueCounts = Object.fromEntries(VIEWS.map((view) => [view, leagueBrowserRows(fixtures, logiEvents, publishedLeagueIds, { view, now }).length])) as Record<MatchView, number>;
    const [archive, archiveCounts] = await Promise.all([
      listPublicMatches(db, { view: filters.view, game: effectiveGame, q: filters.q, page: filters.page, pageSize: MATCH_PAGE_SIZE }, linkedPublicSlugs, archiveMatchWindow(filters.page, MATCH_PAGE_SIZE, operationalRows.length + leagueRows.length)),
      getPublicMatchCounts(db, linkedPublicSlugs),
    ]);
    page = mergeMatchBrowserPage(archive, scopedEvents, { view: filters.view, game: effectiveGame, q: filters.q, page: filters.page, pageSize: MATCH_PAGE_SIZE, now }, leagueRows);
    counts = matchBrowserCounts(archiveCounts, logiEvents, now, leagueCounts);
  } catch (error) {
    console.error('[matches] list query failed', error instanceof Error ? error.name : 'unknown');
  }

  let pane: PublicMatchDetail | null = selected ?? null;
  if (mode === 'list' && page && page.items[0]) {
    const first = page.items[0];
    if (first.kind === 'archive') pane = await getPublicMatch(db, first.match.slug, locale).catch(() => null);
    if (first.kind === 'logi' && first.event.archive) pane = await getPublicMatch(db, first.event.archive.slug, locale).catch(() => null);
  }
  const previewEvent = selectedEvent ?? (!pane && mode === 'list' && page?.items[0]?.kind === 'logi' ? page.items[0].event : null);
  const previewFixture = selectedFixture ?? (mode === 'list' && page?.items[0]?.kind === 'league' ? page.items[0].fixture : null);
  const linkedEvent = pane ? scopedEvents.find((event) => event.archive?.slug === pane.slug) : undefined;
  // Editorial League link of a published Wardogs match: an unverified preview, read on demand, never a result.
  const league = mode === 'detail' && pane?.game === 'wardogs' && pane.leagueMatchUrl ? await getLeagueMatchPreview(pane.leagueMatchUrl) : null;

  const filtered = hasMatchFilters(filters);
  const listFilters = { game: filters.game, q: filters.q };
  const viewCount = (view: MatchView) => (counts ? (effectiveGame ? counts.byGame[effectiveGame][view] : counts[view]) : null);
  const tabs = VIEWS.map((view) => {
    const count = viewCount(view);
    const label = t(`list.views.${view}`);
    return {
      key: view,
      href: listHref({ ...listFilters, view }),
      label: count === null ? label : t('list.viewTab', { label, formatted: formatNumber(count, locale) }),
    };
  });

  const columns: SelectionColumn<MatchBrowserRow>[] = [
    { key: 'start', header: t('list.columns.start'), numeric: true, cell: (row) => row.kind === 'league' ? <LeagueMatchStart fixture={row.fixture} locale={locale} /> : row.kind === 'logi' ? <OperationalMatchStart event={row.event} locale={locale} t={operational} /> : <MatchStart match={row.match} locale={locale} t={t} /> },
    { key: 'match', header: t('list.columns.match'), rowHeader: true, cell: (row) => row.kind === 'league' ? <LeagueMatchTeams fixture={row.fixture} /> : row.kind === 'logi' ? <OperationalMatchTeams event={row.event} t={operational} /> : <MatchTeams match={row.match} t={t} /> },
    {
      key: 'competition',
      header: t('list.columns.competition'),
      cell: (row) => row.kind === 'league' ? <span className={styles.competition}>{game ? null : <TagList items={[{ key: 'game', label: t('gamesShort.wardogs'), tone: 'game' }]} />}<span>Wardogs League</span>{row.fixture.map?.name ? <span className={styles.competitionName}>{row.fixture.map.name}</span> : null}</span> : row.kind === 'logi' ? (
        <span className={styles.competition}>
          {game ? null : <TagList items={[{ key: 'game', label: t(`gamesShort.${row.game}`), tone: 'game' }]} />}
          <span className={styles.competitionName}>{row.event.archive?.competitionName ?? '—'}</span>
        </span>
      ) : (
        <span className={styles.competition}>
          <TagList
            items={[
              // A game section lists only its own game; the chip matters on the shared list.
              ...(game ? [] : [{ key: 'game', label: t(`gamesShort.${row.match.game}`), tone: 'game' as const }]),
              { key: 'type', label: t(`competition.${row.match.competitionType}`) },
            ]}
          />
          {row.match.competitionName ? <span className={styles.competitionName}>{row.match.competitionName}</span> : null}
        </span>
      ),
    },
    { key: 'status', header: t('list.columns.status'), cell: (row) => row.kind === 'league' ? <LeagueMatchStatus fixture={row.fixture} locale={locale} /> : row.kind === 'logi' ? <OperationalMatchStatus event={row.event} t={operational} /> : <MatchStatusBadge match={row.match} t={t} /> },
    ...(filters.view === 'results'
      ? [{ key: 'result', header: t('list.columns.result'), align: 'end' as const, numeric: true, cell: (row: MatchBrowserRow) => row.kind === 'league' ? <span className={styles.note}>{operational('resultPending')}</span> : row.kind === 'logi' ? <OperationalMatchResult event={row.event} t={operational} locale={locale} /> : <MatchResult match={row.match} t={t} variant="row" /> }]
      : []),
  ];

  // No published fixtures at all in this view of the section (independent of filters) vs.
  // no filter matches. A game section is its own scope; the shared list's game filter is a filter.
  const emptyView = counts ? (scopedGame ? counts.byGame[scopedGame][filters.view] : counts[filters.view]) === 0 : !filtered;
  const otherView: MatchView = filters.view === 'upcoming' ? 'results' : 'upcoming';

  let listContent;
  if (!page) {
    listContent = <ListLoadError message={t('list.loadError')} retryLabel={t('list.retry')} retryHref={listHref(filters)} />;
  } else if (page.items.length > 0) {
    listContent = (
      <div className={styles.table} data-match-table={filters.view}>
        <SelectionTable
          caption={t(`list.caption.${filters.view}`)}
          captionHidden
          columns={columns.filter((column) => column.key !== 'competition' || !game || page.items.some((row) => row.kind !== 'logi' || row.event.archive?.competitionName))}
          rows={page.items}
          getRowKey={(row) => row.key}
          getRowHref={(row) => row.kind !== 'archive' ? row.href : detailHref(row.match, { ...listFilters, page: filters.page })}
          linkColumn="match"
          selectedKey={mode === 'detail' ? page.items.find((row) => row.kind === 'archive' ? row.match.slug === selected?.slug : row.kind === 'league' ? row.fixture.id === selectedFixture?.id : row.event.ref.externalId === selectedEvent?.ref.externalId || Boolean(selected && row.event.archive?.slug === selected.slug))?.key : null}
        />
      </div>
    );
  } else if (page.total > 0) {
    listContent = (
      <EmptyState
        title={t('list.pageEmptyTitle')}
        action={
          <GameButton href={listHref({ ...filters, page: 1 })} intent="secondary">
            {t('list.firstPage')}
          </GameButton>
        }
      />
    );
  } else if (filtered && !emptyView) {
    listContent = (
      <EmptyState
        title={t('list.filteredEmptyTitle')}
        action={
          <GameButton href={listHref({ view: filters.view })} intent="secondary" data-clear-filters="">
            {t('list.clearFilters')}
          </GameButton>
        }
      >
        <p>{t('list.filteredEmptyBody')}</p>
      </EmptyState>
    );
  } else {
    const upcoming = filters.view === 'upcoming';
    listContent = (
      <EmptyState
        title={upcoming ? t('list.emptyUpcomingTitle') : t('list.emptyResultsTitle')}
        action={
          <GameButton href={listHref({ ...listFilters, view: otherView })} intent="secondary">
            {upcoming ? t('list.showResults') : t('list.showUpcoming')}
          </GameButton>
        }
      >
        <p>{upcoming ? t('list.emptyUpcomingBody') : t('list.emptyResultsBody')}</p>
      </EmptyState>
    );
  }

  const hiddenParams: Record<string, string> = {};
  if (filters.view === 'results') hiddenParams.view = 'results';
  if (filters.game) hiddenParams.game = filters.game;

  return (
    <div className={styles.browser} data-mode={mode} data-view={filters.view} data-unified-matches="">
      <div className={styles.toolbar}>
        <LinkTabs label={t('list.viewsLabel')} tabs={tabs} current={mode === 'list' ? filters.view : ''} />
        <FilterBar
          action={`${base}/matches`}
          searchLabel={t('list.searchLabel')}
          searchValue={filters.q}
          searchPlaceholder={t('list.searchPlaceholder')}
          hiddenParams={hiddenParams}
          filters={
            game
              ? []
              : [
                  {
                    name: 'game',
                    label: t('list.gameGroup'),
                    options: [
                      { value: 'all', label: t('list.all'), href: listHref({ ...filters, game: undefined, page: 1 }), current: !filters.game },
                      ...GAMES.map((value) => ({
                        value,
                        label: t(`games.${value}`),
                        href: listHref({ ...filters, game: value, page: 1 }),
                        current: filters.game === value,
                      })),
                    ],
                  },
                ]
          }
          resetHref={filtered ? listHref({ view: filters.view }) : null}
          resultSummary={page ? t('list.resultCount', { count: page.total }) : undefined}
        />
      </div>
      <div className={styles.list}>
        {fixtures?.synthetic && page?.items.some((row) => row.kind === 'league') ? <SyntheticNote source="league-fixtures">{t('list.leagueFixtures.synthetic')}</SyntheticNote> : null}
        {listContent}
        {page ? <Pagination page={page.page} pageCount={page.pageCount} hrefForPage={(value) => listHref({ ...filters, page: value })} /> : null}
        <p className={styles.note}>{t('list.timeZoneNote')}</p>
        {fixtures?.truncated ? <p className={styles.note}>{t('list.leagueFixtures.truncated')}</p> : null}
      </div>
      {pane ? (
        <div className={styles.pane}>
          <MatchDetailPane
            match={pane}
            locale={locale}
            mode={mode === 'detail' ? 'detail' : 'preview'}
            detailHref={detailHref(pane, { ...listFilters, page: filters.page })}
            titleId={mode === 'detail' ? 'match-overview-title' : 'match-preview-title'}
            operational={linkedEvent}
          />
        </div>
      ) : null}
      {previewEvent ? <div className={styles.pane}><OperationalMatchPreview event={previewEvent} locale={locale} mode={mode === 'detail' ? 'detail' : 'preview'} /></div> : null}
      {previewFixture ? <div className={styles.pane}><LeagueMatchPreview fixture={previewFixture} locale={locale} mode={mode === 'detail' ? 'detail' : 'preview'} /></div> : null}
      {mode === 'detail' && pane ? <MatchDetailExtras match={pane} locale={locale} titleId="match-overview-title" /> : null}
      {mode === 'detail' && league ? <LeaguePreview preview={league} locale={locale} titleId="match-overview-title" /> : null}
    </div>
  );
}
