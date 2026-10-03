import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { SectionFrame } from '@/components/ui/panels';
import { ScrollRegion } from '@/components/ui/scroll-region';
import { formatNumber } from '@/i18n/date-format';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { HistoryMetric } from '@/modules/integrations/logi/readers/history-report';
import type { HistoryPlayerPublic, HistoryReportPublic } from '@/modules/integrations/logi/readers/history-public';
import { formatPlaytime, HISTORY_RANKING_CAP, historyHref, type HistoryQuery, type HistorySort, sortHistoryPlayers } from './history-query';
import matchStyles from './matches.module.css';
import styles from './history.module.css';

type Column = { key: string; label: string; sort?: HistorySort; secondary?: boolean };
const SECONDARY_METRICS = ['headshots', 'teamKills', 'suicides', 'vehicleKills'] as const satisfies readonly HistoryMetric[];

function Dash({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="visually-hidden">{label}</span>
    </>
  );
}

/**
 * Player rankings of a publishing source: eligible players (at or above the playtime
 * floor) sorted by the URL's `sort`/`dir`, column headers as links with `aria-sort`,
 * W/L/D with unknown results counted separately, K/D and win rate "—" when unknown, a
 * coverage marker on every total that does not cover all of the player's games, the
 * feed-only metrics as a secondary group (collapsed on phones), the count of players
 * below the floor and a 50-row cap lifted by `players=all`.
 */
export async function PlayerRankings({ report, locale, query, base }: { report: HistoryReportPublic; locale: AppLocale; query: HistoryQuery; base: string }) {
  const [t, tA11y] = await Promise.all([getTranslations({ locale, namespace: 'history.players' }), getTranslations({ locale, namespace: 'common.a11y' })]);
  const frame = (children: ReactNode, state: string) => (
    <div className={styles.section} data-history-players={state}>
      <SectionFrame title={t('title')} titleAs="h2" titleId="history-players-title" description={<p className={styles.note}>{t('description')}</p>}>
        {children}
      </SectionFrame>
    </div>
  );
  if (!report.playersPublished || report.players === null) {
    return frame(<p className={styles.note}>{t('notPublished')}</p>, 'not-published');
  }
  const number = (value: number) => formatNumber(value, locale);
  const unknown = t('unknownValue');
  const eligible = sortHistoryPlayers(report.players.filter((player) => player.eligible), query.sort, query.dir);
  const belowFloor = report.players.length - eligible.length;
  const capped = !query.allPlayers && eligible.length > HISTORY_RANKING_CAP;
  const rows = capped ? eligible.slice(0, HISTORY_RANKING_CAP) : eligible;

  const columns: Column[] = [
    { key: 'player', label: t('columns.player') },
    { key: 'matches', label: t('columns.matches'), sort: 'matches' },
    { key: 'record', label: t('columns.record') },
    { key: 'winRate', label: t('columns.winRate'), sort: 'winRate' },
    { key: 'kills', label: t('columns.kills'), sort: 'kills' },
    { key: 'deaths', label: t('columns.deaths'), sort: 'deaths' },
    { key: 'kd', label: t('columns.kd'), sort: 'kd' },
    { key: 'playtime', label: t('columns.playtime'), sort: 'seconds' },
    { key: 'cashDelta', label: t('columns.cashDelta'), sort: 'cashDelta' },
    ...SECONDARY_METRICS.map((metric) => ({ key: metric, label: t(`columns.${metric}`), secondary: true })),
  ];

  const header = (column: Column) => {
    if (!column.sort) return column.label;
    const active = query.sort === column.sort;
    const nextDir = active && query.dir === 'desc' ? 'asc' : 'desc';
    return (
      <Link href={historyHref(base, query, { sort: column.sort, dir: nextDir })} className={styles.sortLink} aria-label={t('sortBy', { column: column.label })} data-history-sort={column.sort}>
        <span>{column.label}</span>
        {active ? <span className={styles.sortGlyph} aria-hidden="true">{query.dir === 'desc' ? '▼' : '▲'}</span> : null}
        {active ? <span className="visually-hidden"> ({t(query.dir === 'desc' ? 'sortedDesc' : 'sortedAsc')})</span> : null}
      </Link>
    );
  };

  /** A total with its coverage marker when it does not cover every game of the player. */
  const total = (player: HistoryPlayerPublic, metric: HistoryMetric, render: (value: number) => ReactNode = number) => {
    const { value, knownGames } = player.metrics[metric];
    if (value === null) return <Dash label={unknown} />;
    return (
      <>
        {render(value)}
        {knownGames < player.matches ? <span className={styles.coverage} data-history-coverage={metric}>{t('coverage', { count: knownGames })}</span> : null}
      </>
    );
  };

  const body = rows.length === 0 ? (
    <p className={styles.note} data-history-ranking="empty">{t('empty')}</p>
  ) : (
    <ScrollRegion label={tA11y('scrollRegion', { label: t('caption') })} className={matchStyles.rounds} data-scroll-table="history-players" data-sticky-column="">
      <table data-history-ranking="">
        <caption className="visually-hidden">{t('caption')}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.secondary ? styles.secondary : undefined} aria-sort={column.sort ? (query.sort === column.sort ? (query.dir === 'desc' ? 'descending' : 'ascending') : 'none') : undefined}>
                {header(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((player, index) => (
            <tr key={player.key} data-history-player={player.key}>
              <th scope="row">
                <span className={styles.playerCell}>
                  <span className={styles.playerName}>
                    <span className={styles.rank}>{number(index + 1)}. </span>
                    {player.name ?? t('unknownPlayer')}
                  </span>
                  <span className={styles.platform}>{t(`platform.${player.platform}`)}</span>
                </span>
              </th>
              <td data-numeric="">{number(player.matches)}</td>
              <td data-numeric="">
                {t('record', { wins: number(player.wins), losses: number(player.losses), draws: number(player.draws) })}
                {player.unknownResults > 0 ? (
                  <span className={styles.unknownResults}>
                    <span aria-hidden="true">{t('unknownResults', { count: number(player.unknownResults) })}</span>
                    <span className="visually-hidden"> {t('unknownResultsLong', { count: player.unknownResults })}</span>
                  </span>
                ) : null}
              </td>
              <td data-numeric="">{player.winRate === null ? <Dash label={unknown} /> : formatNumber(player.winRate, locale, { style: 'percent', maximumFractionDigits: 0 })}</td>
              <td data-numeric="">{total(player, 'kills')}</td>
              <td data-numeric="">{total(player, 'deaths')}</td>
              <td data-numeric="" data-history-kd="">{player.kd === null ? <Dash label={unknown} /> : formatNumber(player.kd, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td data-numeric="">{total(player, 'seconds', (seconds) => formatPlaytime(seconds) ?? '—')}</td>
              <td data-numeric="" data-history-cash="">{total(player, 'cashDelta', (cash) => formatNumber(cash, locale, { signDisplay: 'exceptZero' }))}</td>
              {SECONDARY_METRICS.map((metric) => (
                <td key={metric} data-numeric="" className={styles.secondary}>{total(player, metric)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );

  return frame(
    <>
      {body}
      <div className={styles.foot}>
        {rows.length > 0 ? <p className={`${styles.phoneNote}`}>{t('secondary')}</p> : null}
        {belowFloor > 0 ? <p data-history-below-floor={belowFloor}>{t('belowFloor', { count: belowFloor, min: number(query.minMinutes) })}</p> : null}
        {capped ? (
          <p data-history-capped="">
            {t('capped', { shown: number(rows.length), total: number(eligible.length) })}{' '}
            <Link href={historyHref(base, query, { allPlayers: true })} className={styles.footLink} data-history-show-all="">{t('showAll', { count: number(eligible.length) })}</Link>
          </p>
        ) : null}
        {query.allPlayers && eligible.length > HISTORY_RANKING_CAP ? (
          <p>
            <Link href={historyHref(base, query, { allPlayers: false })} className={styles.footLink} data-history-show-top="">{t('showTop', { count: number(HISTORY_RANKING_CAP) })}</Link>
          </p>
        ) : null}
      </div>
    </>,
    'published',
  );
}
