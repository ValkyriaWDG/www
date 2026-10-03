import { getTranslations } from 'next-intl/server';
import { GameSwitchNotice } from '@/components/games/switch-notice';
import { PageMain } from '@/components/shell/page-main';
import { Select, TextField } from '@/components/ui/form-fields';
import { GameButton } from '@/components/ui/game-button';
import { EmptyState, FeedbackNotice, PageHeader, SectionFrame, SyntheticNote } from '@/components/ui/panels';
import { formatDate, formatNumber } from '@/i18n/date-format';
import { getPathname } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { GameRoute } from '@/modules/games/registry';
import { gamePath } from '@/modules/games/routes';
import { getHistoryGames, getHistoryReport, listHistoryPublicIds } from '@/modules/integrations/logi/readers/history';
import type { HistoryReportPublic } from '@/modules/integrations/logi/readers/history-public';
import { getPublicServerOverview, getServerPresentation, isServerPublished } from '@/modules/integrations/servers/presentation';
import { FactionShares } from './history-factions';
import { HistoryFilterForm } from './history-form';
import { GameHistoryList } from './history-games';
import { PlayerRankings } from './history-players';
import { HISTORY_DIR_DEFAULT, HISTORY_PERIODS, HISTORY_SORT_DEFAULT, historyBlockedState, historyFiltersFor, historyHref, parseHistoryQuery, type HistoryQuery } from './history-query';
import type { RawSearchParams } from './query';
import styles from './history.module.css';

export type HistoryServer = { publicId: string; name: string };

/**
 * Published Wardogs servers with an approved history source, named by the website's
 * server presentation (an explicitly hidden server is not listed; a server without an
 * observed name keeps its public ID).
 */
export async function listHistoryServers(now: Date): Promise<HistoryServer[]> {
  const publicIds = listHistoryPublicIds();
  if (publicIds.length === 0) return [];
  const rows = await getServerPresentation(now);
  const overview = await getPublicServerOverview('wardogs', now, rows);
  const names = new Map(overview.state === 'not_configured' ? [] : overview.servers.map((server) => [server.publicId, server.name]));
  return publicIds.filter((publicId) => isServerPublished(rows, 'wardogs', publicId)).map((publicId) => ({ publicId, name: names.get(publicId) ?? publicId }));
}

/**
 * Server game history page (Wardogs): the state line, the GET filter form, summary tiles,
 * faction win shares, player rankings and the paginated game list, all computed from one
 * period boundary per request. Reader `null` (unconfigured) renders the unavailable state.
 */
export async function HistoryScreen({ locale, game, query }: { locale: AppLocale; game: GameRoute; query: RawSearchParams | undefined }) {
  const now = new Date();
  const [t, games, servers] = await Promise.all([getTranslations({ locale, namespace: 'history' }), getTranslations({ locale, namespace: 'games' }), listHistoryServers(now)]);
  const state = parseHistoryQuery(query, servers.map((server) => server.publicId));
  const base = gamePath(game, 'history');
  const filters = historyFiltersFor(state, now);
  const [report, page] = state.server
    ? await Promise.all([getHistoryReport(state.server, filters, now), getHistoryGames(state.server, filters, state.page, now)])
    : [null, null];
  const server = servers.find((row) => row.publicId === state.server) ?? null;

  const header = (
    <PageHeader
      breadcrumbs={[{ href: gamePath(game), label: games(`menuLabel.${game}`) }, { label: t('title') }]}
      eyebrow={games(`eyebrow.${game}`)}
      title={t('title')}
      titleId="history-title"
      description={<p>{t('intro')}</p>}
    />
  );

  if (!server || !report || !page) {
    return (
      <PageMain width="full" labelledBy="history-title">
        {header}
        <GameSwitchNotice locale={locale} game={game} query={query} />
        <div data-history-state="none">
          <EmptyState title={t('unavailable.title')}>
            <p>{t('unavailable.body')}</p>
          </EmptyState>
        </div>
      </PageMain>
    );
  }

  const number = (value: number) => formatNumber(value, locale);
  const dateTime = (value: string) => formatDate(value, locale, 'dateTimeZone');
  const blocked = historyBlockedState(report.state);
  const period = t(`filters.periods.${state.period}`);

  return (
    <PageMain width="full" labelledBy="history-title">
      {header}
      <GameSwitchNotice locale={locale} game={game} query={query} />
      <div className={styles.notes} data-history-state={report.state} data-history-server={server.publicId}>
        {report.synthetic ? <SyntheticNote source="history">{t('synthetic')}</SyntheticNote> : null}
        {blocked ? (
          <FeedbackNotice kind={blocked === 'preparing' ? 'info' : 'warning'} title={t(`state.${blocked}.title`)} live={false}>
            <p>{t(`state.${blocked}.body`)}</p>
          </FeedbackNotice>
        ) : null}
        {report.state === 'stale' ? (
          <FeedbackNotice kind="warning" live={false}>
            <p>{t('state.stale', { time: report.refreshedAt ? dateTime(report.refreshedAt) : t('summary.unknown') })}</p>
          </FeedbackNotice>
        ) : null}
        {report.coverage.kind === 'window' ? <p className={styles.note} data-history-coverage-window="">{t('coverage', { date: formatDate(report.coverage.from, locale) })}</p> : null}
        <p className={styles.note} data-history-note="">{t('note')}</p>
      </div>

      <Filters locale={locale} base={base} state={state} servers={servers} report={report} period={period} server={server} />

      {blocked ? null : report.games === 0 ? (
        <div className={styles.section} data-history-empty="">
          <EmptyState
            title={t('empty.title')}
            action={<GameButton href={historyHref(base, { server: state.server, period: 'all' })} intent="secondary" size="sm" data-history-reset="">{t('empty.reset')}</GameButton>}
          >
            <p>{t('empty.body')}</p>
          </EmptyState>
        </div>
      ) : (
        <>
          <div className={styles.section}>
            <SectionFrame title={t('summary.title')} titleAs="h2" titleId="history-summary-title">
              <dl className={styles.tiles} data-history-summary="">
                <div className={styles.tile}>
                  <dt>{t('summary.games')}</dt>
                  <dd><span className={styles.tileValue} data-history-games-total="">{number(report.games)}</span></dd>
                </div>
                <div className={styles.tile}>
                  <dt>{t('summary.outcomes')}</dt>
                  <dd>
                    <span className={styles.tileValue}>{number(report.outcomes.decided)}</span>
                    <span className={styles.tileDetail} data-history-outcomes="">
                      {t('summary.outcomesValue', { decided: number(report.outcomes.decided), draw: number(report.outcomes.draw), noResult: number(report.outcomes.noResult) })}
                      {report.outcomes.unknown > 0 ? t('summary.outcomesUnknown', { unknown: number(report.outcomes.unknown) }) : null}
                    </span>
                  </dd>
                </div>
                <div className={styles.tile}>
                  <dt>{t('summary.feed')}</dt>
                  <dd>
                    <span className={styles.tileValue}>{number(report.feedGames)}</span>
                    <span className={styles.tileDetail} data-history-feed="">{t('summary.feedValue', { feed: number(report.feedGames), games: report.games })}</span>
                  </dd>
                </div>
                <div className={styles.tile}>
                  <dt>{t('summary.range')}</dt>
                  <dd>
                    <span className={styles.tileDetail} data-history-range="">
                      {report.firstEndedAt && report.lastEndedAt ? t('summary.rangeValue', { first: formatDate(report.firstEndedAt, locale), last: formatDate(report.lastEndedAt, locale) }) : t('summary.unknown')}
                    </span>
                  </dd>
                </div>
                <div className={styles.tile}>
                  <dt>{t('summary.lastCollected')}</dt>
                  <dd><span className={styles.tileDetail}>{report.lastCollectedAt ? <time dateTime={report.lastCollectedAt}>{dateTime(report.lastCollectedAt)}</time> : t('summary.unknown')}</span></dd>
                </div>
                <div className={styles.tile}>
                  <dt>{t('summary.refreshed')}</dt>
                  <dd><span className={styles.tileDetail}>{report.refreshedAt ? <time dateTime={report.refreshedAt}>{dateTime(report.refreshedAt)}</time> : t('summary.unknown')}</span></dd>
                </div>
              </dl>
            </SectionFrame>
          </div>

          <div className={styles.section}>
            <SectionFrame title={t('factions.title')} titleAs="h2" titleId="history-factions-title" description={<p className={styles.note}>{t('factions.description')}</p>}>
              <FactionShares factions={report.factions} outcomes={report.outcomes} locale={locale} captionId="history-factions-caption" />
            </SectionFrame>
          </div>

          <PlayerRankings report={report} locale={locale} query={state} base={base} />
          <GameHistoryList games={page} locale={locale} query={state} base={base} />
        </>
      )}
    </PageMain>
  );
}

/** GET form: server, period, map (of the period) and the playtime floor; the active selection is summarized below it. */
async function Filters({ locale, base, state, servers, report, period, server }: { locale: AppLocale; base: string; state: HistoryQuery; servers: HistoryServer[]; report: HistoryReportPublic; period: string; server: HistoryServer }) {
  const t = await getTranslations({ locale, namespace: 'history' });
  const number = (value: number) => formatNumber(value, locale);
  const maps = report.maps.some((map) => map.name === state.map) || state.map === null ? report.maps : [...report.maps, { name: state.map, games: 0 }];
  return (
    <div className={styles.section}>
      <SectionFrame title={t('filters.title')} titleAs="h2" titleId="history-filters-title">
        <HistoryFilterForm action={getPathname({ href: base, locale })} method="get" className={styles.filters} data-history-filters="">
          {state.sort !== HISTORY_SORT_DEFAULT ? <input type="hidden" name="sort" value={state.sort} /> : null}
          {state.dir !== HISTORY_DIR_DEFAULT ? <input type="hidden" name="dir" value={state.dir} /> : null}
          {state.allPlayers ? <input type="hidden" name="players" value="all" /> : null}
          <Select name="server" id="history-server" label={t('filters.server')} defaultValue={state.server ?? ''} options={servers.map((row) => ({ value: row.publicId, label: row.name }))} />
          <Select name="period" id="history-period" label={t('filters.period')} defaultValue={state.period} options={HISTORY_PERIODS.map((value) => ({ value, label: t(`filters.periods.${value}`) }))} />
          <Select
            name="map"
            id="history-map"
            label={t('filters.map')}
            defaultValue={state.map ?? ''}
            options={[{ value: '', label: t('filters.allMaps') }, ...maps.map((map) => ({ value: map.name, label: t('filters.mapOption', { name: map.name, count: map.games }) }))]}
          />
          <TextField name="min" id="history-min" label={t('filters.min')} hint={t('filters.minHint')} type="number" inputMode="numeric" min={0} max={100000} step={1} defaultValue={state.minMinutes} />
          <div className={styles.filterActions}>
            <GameButton type="submit" intent="primary" data-history-submit="">{t('filters.submit')}</GameButton>
          </div>
        </HistoryFilterForm>
        <p className={styles.summaryLine} data-history-filter-summary="">
          {t('filters.summary', { server: server.name, period, map: state.map ?? t('filters.allMaps'), floor: t('filters.floor', { min: number(state.minMinutes) }) })}
        </p>
      </SectionFrame>
    </div>
  );
}
