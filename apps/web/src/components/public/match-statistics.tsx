import type { StatisticsSide } from '@valkyria/db/schema';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { CombatIcon, DeathsIcon, DefenseIcon, KillsIcon, MembersIcon, OffenseIcon, SupportIcon, type IconProps } from '@/components/ui/icons';
import { ScrollRegion } from '@/components/ui/scroll-region';
import { Tabs } from '@/components/ui/tabs';
import { formatDate, formatNumber } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import type { MatchStatisticsView } from '@/modules/matches/types';
import styles from './matches.module.css';

const TEAM_METRICS = ['players', 'kills', 'deaths', 'teamkills', 'combat', 'offense', 'defense', 'support'] as const;
/** Metrics compared in the team chart (players and teamkills stay in the table). */
const CHART_METRICS = ['kills', 'deaths', 'combat', 'offense', 'defense', 'support'] as const;
type TeamMetric = (typeof TEAM_METRICS)[number];
const METRIC_ICONS: Partial<Record<TeamMetric, (props: IconProps) => React.JSX.Element>> = {
  players: MembersIcon,
  kills: KillsIcon,
  deaths: DeathsIcon,
  combat: CombatIcon,
  offense: OffenseIcon,
  defense: DefenseIcon,
  support: SupportIcon,
};

/** Metric name with its decorative glyph; the text stays the accessible label. */
function MetricLabel({ metric, label }: { metric: TeamMetric; label: string }) {
  const Glyph = METRIC_ICONS[metric];
  return (
    <span className={styles.metricLabel}>
      {Glyph ? <Glyph size={18} /> : null}
      {label}
    </span>
  );
}

/** Decorative team marks (clan crest, opponent logo or short code) keyed by statistics side. */
export type StatisticsTeamMarks = { valkyria: ReactNode; opponent: ReactNode };
const KNOWN_TYPES = ['infantry', 'machine_gun', 'sniper', 'grenade', 'bazooka', 'pak', 'mine', 'satchel', 'armor', 'artillery', 'self_propelled_artillery', 'commander'] as const;

/**
 * Imported game statistics on a public HLL match detail (legacy Summary / Players /
 * Weapons). Team totals and weapons are public; player rows only when an editor
 * published them. The source, CRCON game ID and import time are always visible.
 */
export async function MatchStatistics({
  statistics,
  locale,
  titleId,
  opponentLabel,
  marks = null,
}: {
  statistics: MatchStatisticsView;
  locale: AppLocale;
  titleId: string;
  opponentLabel: string;
  marks?: StatisticsTeamMarks | null;
}) {
  const t = await getTranslations({ locale, namespace: 'matches.statistics' });
  const tA11y = await getTranslations({ locale, namespace: 'common.a11y' });
  if (statistics.rounds?.length) {
    const { rounds, ...primary } = statistics;
    const snapshots = [{ ordinal: 1, statistics: primary }, ...rounds];
    return (
      <div data-match-statistics-rounds="">
        <Tabs label={t('roundsTitle')} tabs={await Promise.all(snapshots.map(async (round) => ({
          id: `round-${round.ordinal}`,
          label: t('round', { number: round.ordinal }),
          content: await MatchStatistics({ statistics: round.statistics, locale, titleId: `${titleId}-round-${round.ordinal}`, opponentLabel, marks }),
        })))} />
      </div>
    );
  }
  const valkyria = statistics.valkyriaSide ?? 'allies';
  const opponent: StatisticsSide = valkyria === 'allies' ? 'axis' : 'allies';
  const sideName = (side: StatisticsSide) => t(`sides.${side}`);
  const teamName = (side: StatisticsSide) => statistics.valkyriaSide === null ? sideName(side) : (side === valkyria ? t('valkyria', { side: sideName(side) }) : t('opponent', { name: opponentLabel, side: sideName(side) }));
  const number = (value: number) => formatNumber(value, locale);
  // Marks only when Valkyria's side is known; otherwise the teams are just Allies and Axis.
  const markFor = (side: StatisticsSide) => (statistics.valkyriaSide === null || !marks ? null : side === valkyria ? marks.valkyria : marks.opponent);
  const teamLabel = (side: StatisticsSide, name: string = teamName(side)) => (
    <span className={styles.teamLabel}>
      {markFor(side)}
      <span>{name}</span>
    </span>
  );
  // Phones keep the first (metric/player) column in view while the rest scrolls.
  const scrollable = (id: 'summary' | 'weapons' | 'players', label: string, table: ReactNode) => (
    <ScrollRegion label={tA11y('scrollRegion', { label })} className={styles.rounds} data-scroll-table={id} data-sticky-column="">
      {table}
    </ScrollRegion>
  );

  const types = [...new Set([...KNOWN_TYPES.filter((type) => statistics.teams[valkyria].killsByType[type] || statistics.teams[opponent].killsByType[type]), ...Object.keys(statistics.teams[valkyria].killsByType), ...Object.keys(statistics.teams[opponent].killsByType)])];
  const isKnownType = (type: string): type is (typeof KNOWN_TYPES)[number] => (KNOWN_TYPES as readonly string[]).includes(type);
  const typeLabel = (type: string) => (isKnownType(type) ? t(`weaponTypes.${type}`) : type);

  const share = (value: number, total: number) => (total > 0 ? value / total : 0.5);
  const percent = (value: number) => formatNumber(value, locale, { style: 'percent', maximumFractionDigits: 0 });
  const chart = (
    <figure className={styles.teamChart} data-team-chart="">
      <figcaption className={styles.teamLegend}>
        <span className={styles.legendTeam} data-team="valkyria">
          <span className={styles.swatch} data-team="valkyria" aria-hidden="true" />
          {teamLabel(valkyria)}
        </span>
        <span className={styles.chartTitle}>{t('comparisonTitle')}</span>
        <span className={styles.legendTeam} data-team="opponent">
          {teamLabel(opponent)}
          <span className={styles.swatch} data-team="opponent" aria-hidden="true" />
        </span>
      </figcaption>
      <ul className={styles.chartRows}>
        {CHART_METRICS.map((metric) => {
          const a = statistics.teams[valkyria][metric];
          const b = statistics.teams[opponent][metric];
          const shareA = share(a, a + b);
          return (
            <li key={metric} className={styles.chartRow} data-metric={metric}>
              <span className={styles.chartLabel} aria-hidden="true">
                <MetricLabel metric={metric} label={t(`metrics.${metric}`)} />
              </span>
              <span className={styles.chartValue} data-lead={a > b ? '' : undefined} aria-hidden="true">
                {number(a)}
              </span>
              <span className={styles.chartBar} aria-hidden="true">
                <span className={styles.chartSegment} data-team="valkyria" style={{ flexGrow: a + b > 0 ? shareA : 1 }} />
                <span className={styles.chartSegment} data-team="opponent" style={{ flexGrow: a + b > 0 ? 1 - shareA : 1 }} />
                <span className={styles.chartTip}>
                  {percent(shareA)} : {percent(1 - shareA)}
                </span>
              </span>
              <span className={styles.chartValue} data-lead={b > a ? '' : undefined} aria-hidden="true">
                {number(b)}
              </span>
              <span className="visually-hidden">
                {t('comparisonRow', { metric: t(`metrics.${metric}`), teamA: teamName(valkyria), a: number(a), teamB: teamName(opponent), b: number(b) })}
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );

  const summary = (
    <div className={styles.statsPanel} data-statistics-summary="">
      {chart}
      {scrollable(
        'summary',
        t('summaryCaption'),
        <table>
          <caption className="visually-hidden">{t('summaryCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('metric')}</th>
              <th scope="col">{teamLabel(valkyria)}</th>
              <th scope="col">{teamLabel(opponent)}</th>
            </tr>
          </thead>
          <tbody>
            {TEAM_METRICS.map((metric) => (
              <tr key={metric}>
                <th scope="row">
                  <MetricLabel metric={metric} label={t(`metrics.${metric}`)} />
                </th>
                <td data-numeric="">{number(statistics.teams[valkyria][metric])}</td>
                <td data-numeric="">{number(statistics.teams[opponent][metric])}</td>
              </tr>
            ))}
          </tbody>
        </table>,
      )}
      {types.length > 0 ? (
        <>
          <h4 className={styles.statsSubtitle}>{t('killsByType')}</h4>
          {scrollable(
            'weapons',
            t('killsByType'),
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('weaponType')}</th>
                  <th scope="col">{teamLabel(valkyria)}</th>
                  <th scope="col">{teamLabel(opponent)}</th>
                </tr>
              </thead>
              <tbody>
                {types.map((type) => (
                  <tr key={type}>
                    <th scope="row">{typeLabel(type)}</th>
                    <td data-numeric="">{number(statistics.teams[valkyria].killsByType[type] ?? 0)}</td>
                    <td data-numeric="">{number(statistics.teams[opponent].killsByType[type] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>,
          )}
        </>
      ) : null}
    </div>
  );

  const players = statistics.players ? (
    <div className={styles.statsPanel} data-statistics-players="">
      {scrollable(
        'players',
        t('playersCaption'),
        <table>
          <caption className="visually-hidden">{t('playersCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('columns.player')}</th>
              <th scope="col">{t('columns.team')}</th>
              <th scope="col">
                <MetricLabel metric="kills" label={t('columns.kills')} />
              </th>
              <th scope="col">
                <MetricLabel metric="deaths" label={t('columns.deaths')} />
              </th>
              <th scope="col">{t('columns.kd')}</th>
              <th scope="col">{t('columns.kpm')}</th>
              <th scope="col">
                <MetricLabel metric="combat" label={t('metrics.combat')} />
              </th>
              <th scope="col">
                <MetricLabel metric="offense" label={t('metrics.offense')} />
              </th>
              <th scope="col">
                <MetricLabel metric="defense" label={t('metrics.defense')} />
              </th>
              <th scope="col">
                <MetricLabel metric="support" label={t('metrics.support')} />
              </th>
              <th scope="col">{t('columns.topWeapon')}</th>
            </tr>
          </thead>
          <tbody>
            {statistics.players.map((player, index) => (
              <tr key={`${player.name}-${index}`} data-player-side={player.side}>
                <th scope="row" className={styles.playerName}>
                  <span className={styles.playerNameText}>{player.name}</span>
                </th>
                <td>
                  {player.side === 'unknown'
                    ? t('unknownSide')
                    : statistics.valkyriaSide === null
                      ? sideName(player.side)
                      : teamLabel(player.side, player.side === valkyria ? t('valkyriaShort') : opponentLabel)}
                </td>
                <td data-numeric="">{number(player.kills)}</td>
                <td data-numeric="">{number(player.deaths)}</td>
                <td data-numeric="">{formatNumber(player.killDeathRatio, locale, { maximumFractionDigits: 2 })}</td>
                <td data-numeric="">{formatNumber(player.killsPerMinute, locale, { maximumFractionDigits: 2 })}</td>
                <td data-numeric="">{number(player.combat)}</td>
                <td data-numeric="">{number(player.offense)}</td>
                <td data-numeric="">{number(player.defense)}</td>
                <td data-numeric="">{number(player.support)}</td>
                <td>{player.topWeapon ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>,
      )}
    </div>
  ) : (
    <p className={styles.statsNote} data-statistics-players="private">
      {t('playersPrivate', { count: statistics.playerCount })}
    </p>
  );

  const weaponList = (side: StatisticsSide) => (
    <section className={styles.statsWeapons} aria-label={teamName(side)}>
      <h4 className={styles.statsSubtitle}>{teamLabel(side)}</h4>
      {statistics.teams[side].weapons.length > 0 ? (
        <ol className={styles.weaponList}>
          {statistics.teams[side].weapons.map((weapon) => (
            <li key={weapon.weapon}>
              <span>{weapon.weapon}</span>
              <span className={styles.weaponKills}>{t('kills', { count: weapon.kills })}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.statsNote}>{t('noWeapons')}</p>
      )}
    </section>
  );
  const weapons = (
    <div className={styles.statsWeaponGrid} data-statistics-weapons="">
      {weaponList(valkyria)}
      {weaponList(opponent)}
    </div>
  );

  const game = [statistics.mapName, statistics.mode].filter(Boolean).join(' · ');
  const sourceText = statistics.source === 'crcon' ? t('sourceCrcon', { game: statistics.externalGameId ?? '—' }) : t('sourceUpload');
  return (
    <section className={styles.block} aria-labelledby={`${titleId}-statistics`} data-match-statistics="">
      <h3 id={`${titleId}-statistics`} className={styles.blockTitle}>
        {t('title')}
      </h3>
      <p className={styles.statsProvenance} data-statistics-provenance="">
        {[sourceText, game || null, statistics.gameStartedAt ? formatDate(statistics.gameStartedAt, locale, 'dateTimeZone') : null].filter(Boolean).join(' · ')}
        {statistics.sourceGameUrl ? <><br /><a href={statistics.sourceGameUrl} rel="noopener noreferrer" data-statistics-source-link="">{t('sourceLink')}</a></> : null}
      </p>
      {statistics.valkyriaSide === null ? <p className={styles.statsNote}>{t('unassignedSide')}</p> : null}
      <Tabs
        label={t('title')}
        tabs={[
          { id: 'summary', label: t('tabs.summary'), content: summary },
          { id: 'players', label: t('tabs.players'), content: players },
          { id: 'weapons', label: t('tabs.weapons'), content: weapons },
        ]}
      />
    </section>
  );
}
