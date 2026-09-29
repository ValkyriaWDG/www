'use client';

import { useTranslations } from 'next-intl';
import { formatDate, formatNumber } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import type { LivePlayersSnapshot } from '@/modules/integrations/servers/live-players';
import styles from './servers.module.css';

const METRICS = ['kills', 'deaths', 'combat', 'offense', 'defense', 'support'] as const;

export function LivePlayersTable({ snapshot, locale, serverName, connectedPlayers }: { snapshot: LivePlayersSnapshot; locale: AppLocale; serverName: string; connectedPlayers: number | null }) {
  const t = useTranslations('games.servers.livePlayers');
  const available = snapshot.state === 'ok' && snapshot.freshness !== 'unavailable';
  return (
    <section className={styles.livePlayers} aria-labelledby="server-players-title" data-live-players={snapshot.freshness}>
      <h2 id="server-players-title">{t('title')}</h2>
      <p>{serverName}</p>
      <p className={styles.connectNote}>{t('description')}</p>
      <p className={styles.observedText}>{snapshot.observedAt ? <time dateTime={snapshot.observedAt}>{t('observed', { time: formatDate(snapshot.observedAt, locale, 'dateTimeZone') })}</time> : t('noTimestamp')}</p>
      {snapshot.synthetic ? <p className={styles.synthetic}>{t('synthetic')}</p> : null}
      {snapshot.freshness === 'stale' ? <p className={styles.snapshotWarning}>{t('stale')}</p> : null}
      {available && connectedPlayers !== null && connectedPlayers !== snapshot.players.length ? <p className={styles.connectNote}>{t('populationMismatch', { connected: connectedPlayers, rows: snapshot.players.length })}</p> : null}
      {!available ? <p data-live-players-unavailable="">{t(snapshot.state === 'not_configured' ? 'notConfigured' : 'unavailable')}</p> : snapshot.players.length === 0 ? <p data-live-players-empty="">{t('empty')}</p> : (
        <div className={styles.playerScroll} tabIndex={0} role="region" aria-label={t('caption')}>
          <table>
            <caption className="visually-hidden">{t('caption')}</caption>
            <thead><tr><th scope="col">{t('columns.name')}</th><th scope="col">{t('columns.side')}</th>{METRICS.map((metric) => <th key={metric} scope="col">{t(`columns.${metric}`)}</th>)}</tr></thead>
            <tbody>{snapshot.players.map((player, index) => <tr key={`${player.name}/${index}`}><th scope="row">{player.name}</th><td>{t(`sides.${player.side}`)}</td>{METRICS.map((metric) => <td key={metric}>{player[metric] === null ? '—' : formatNumber(player[metric], locale)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
