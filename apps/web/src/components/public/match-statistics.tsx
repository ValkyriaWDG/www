import type { StatisticsSide } from '@valkyria/db/schema';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Tabs } from '@/components/ui/tabs';
import { formatDate, formatNumber } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import type { MatchStatisticsView } from '@/modules/matches/types';
import styles from './matches.module.css';

const TEAM_METRICS = ['players', 'kills', 'deaths', 'teamkills', 'combat', 'offense', 'defense', 'support'] as const;
const KNOWN_TYPES = ['infantry', 'machine_gun', 'sniper', 'grenade', 'bazooka', 'pak', 'mine', 'satchel', 'armor', 'artillery', 'self_propelled_artillery', 'commander'] as const;

/**
 * Imported game statistics on a public HLL match detail (legacy Summary / Players /
 * Weapons). Team totals and weapons are public; player rows only when an editor
 * published them. The source, CRCON game ID and import time are always visible.
 */
export async function MatchStatistics({ statistics, locale, titleId, opponentLabel }: { statistics: MatchStatisticsView; locale: AppLocale; titleId: string; opponentLabel: string }) {
  const t = await getTranslations({ locale, namespace: 'matches.statistics' });
  const valkyria = statistics.valkyriaSide;
  const opponent: StatisticsSide = valkyria === 'allies' ? 'axis' : 'allies';
  const sideName = (side: StatisticsSide) => t(`sides.${side}`);
  const teamName = (side: StatisticsSide) => (side === valkyria ? t('valkyria', { side: sideName(side) }) : t('opponent', { name: opponentLabel, side: sideName(side) }));
  const number = (value: number) => formatNumber(value, locale);
  const scrollable = (label: string, table: ReactNode) => (
    <div className={styles.rounds} role="region" aria-label={label} tabIndex={0}>
      {table}
    </div>
  );

  const types = [...new Set([...KNOWN_TYPES.filter((type) => statistics.teams[valkyria].killsByType[type] || statistics.teams[opponent].killsByType[type]), ...Object.keys(statistics.teams[valkyria].killsByType), ...Object.keys(statistics.teams[opponent].killsByType)])];
  const isKnownType = (type: string): type is (typeof KNOWN_TYPES)[number] => (KNOWN_TYPES as readonly string[]).includes(type);
  const typeLabel = (type: string) => (isKnownType(type) ? t(`weaponTypes.${type}`) : type);

  const summary = (
    <div className={styles.statsPanel} data-statistics-summary="">
      {scrollable(
        t('summaryCaption'),
        <table>
          <caption className="visually-hidden">{t('summaryCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('metric')}</th>
              <th scope="col">{teamName(valkyria)}</th>
              <th scope="col">{teamName(opponent)}</th>
            </tr>
          </thead>
          <tbody>
            {TEAM_METRICS.map((metric) => (
              <tr key={metric}>
                <th scope="row">{t(`metrics.${metric}`)}</th>
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
            t('killsByType'),
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('weaponType')}</th>
                  <th scope="col">{teamName(valkyria)}</th>
                  <th scope="col">{teamName(opponent)}</th>
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
        t('playersCaption'),
        <table>
          <caption className="visually-hidden">{t('playersCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('columns.player')}</th>
              <th scope="col">{t('columns.team')}</th>
              <th scope="col">{t('columns.kills')}</th>
              <th scope="col">{t('columns.deaths')}</th>
              <th scope="col">{t('columns.kd')}</th>
              <th scope="col">{t('columns.kpm')}</th>
              <th scope="col">{t('metrics.combat')}</th>
              <th scope="col">{t('metrics.offense')}</th>
              <th scope="col">{t('metrics.defense')}</th>
              <th scope="col">{t('metrics.support')}</th>
              <th scope="col">{t('columns.topWeapon')}</th>
            </tr>
          </thead>
          <tbody>
            {statistics.players.map((player, index) => (
              <tr key={`${player.name}-${index}`} data-player-side={player.side}>
                <th scope="row" className={styles.playerName}>
                  {player.name}
                </th>
                <td>{player.side === 'unknown' ? t('unknownSide') : player.side === valkyria ? t('valkyriaShort') : opponentLabel}</td>
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
      <h4 className={styles.statsSubtitle}>{teamName(side)}</h4>
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
        <br />
        {t('importedAt', { time: formatDate(statistics.observedAt, locale, 'dateTimeZone') })}
      </p>
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
