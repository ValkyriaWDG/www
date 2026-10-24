import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import type { PublicPlayerStatistics } from '@/modules/integrations/logi-public-player-statistics';
import styles from './logi-people.module.css';

/** Already-public recorded matches across all teams; never relabelled clan/career coverage. */
export async function PlayerRecordedStatistics({ locale, stats }: { locale: AppLocale; stats: PublicPlayerStatistics }) {
  const [t, people] = await Promise.all([getTranslations({ locale, namespace: 'members.player' }), getTranslations({ locale, namespace: 'logiPeople' })]);
  const number = (value: number | null) => value === null ? '—' : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Prague' }).format(new Date(value));
  const matches = (rows: PublicPlayerStatistics['recentMatches']) => <ul className={styles.recordedList}>{rows.map((match, index) => <li key={`${match.endedAt}:${index}`}>
    <div className={styles.recordedHeading}><strong>{match.title}</strong><time dateTime={match.endedAt}>{date(match.endedAt)}</time></div>
    {match.mapName ? <span className={styles.muted}>{match.mapName}</span> : null}
    <p>{people('metrics.kills')}: {number(match.kills)} · {people('metrics.deaths')}: {number(match.deaths)} · K/D: {number(match.kd)}{stats.game === 'wardogs' ? ` · ${people('metrics.cashDelta')}: ${number(match.cashDelta)}` : ` · ${people('metrics.offense')}: ${number(match.offense)} · ${people('metrics.defense')}: ${number(match.defense)} · ${people('metrics.support')}: ${number(match.support)}`}</p>
  </li>)}</ul>;
  return <div className={styles.stack} data-public-player-statistics="">
    <p>{t('recordedCoverage', { count: stats.matches })}</p>
    <dl className={styles.metrics}>
      {[[t('recordedMatches'), stats.matches], [people('metrics.kills'), stats.kills], [people('metrics.deaths'), stats.deaths], ['K/D', stats.kd], ...(stats.game === 'wardogs' ? [[people('metrics.cashDelta'), stats.cashDelta]] : [])].map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{number(value as number | null)}</dd></div>)}
    </dl>
    <h4>{t('recordedRecent', { count: stats.recentLimit })}</h4>
    {stats.recentMatches.length ? <>
      {matches(stats.recentMatches.slice(0, 5))}
      {stats.recentMatches.length > 5 ? <details data-player-history-more="" className={styles.recordedMore}>
        <summary>{t('recordedMore', { count: stats.recentMatches.length - 5 })}</summary>
        {matches(stats.recentMatches.slice(5))}
      </details> : null}
    </> : <p>{t('recordedRecentEmpty')}</p>}
    <p><time dateTime={stats.observedAt}>{people('updated', { date: date(stats.observedAt) })}</time></p>
  </div>;
}
