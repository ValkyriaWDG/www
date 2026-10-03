'use client';

import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/ui';
import { ServerIcon } from '@/components/ui/icons';
import { formatDate, formatNumber } from '@/i18n/date-format';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { ServerBrowserData } from '@/modules/integrations/servers/browser';
import { warconFor } from '@/modules/integrations/servers/view';
import { TeamScores } from './team-scores';
import { useServerPolling } from './use-server-polling';
import { WarconLiveFacts } from './warcon-panel';
import styles from './server-summary.module.css';

/** The Wardogs menu uses the same scoped, ageing public read model as its server browser. */
export function ServerSummary({ initialData, locale }: { initialData: ServerBrowserData; locale: AppLocale }) {
  const t = useTranslations('games.servers');
  const w = useTranslations('games.servers.warcon');
  const poll = useServerPolling('wardogs', null, initialData);
  const { overview } = poll.data;
  const servers = overview.state === 'not_configured' ? [] : overview.servers;
  const emptyMessage = overview.state === 'not_configured' ? t('notConfigured.title')
    : overview.state === 'unavailable' ? t('unavailable.title') : t('empty.body');
  return (
    <section className={styles.summary} aria-labelledby="home-servers-title" aria-busy={!poll.ready} data-home-servers="" data-server-state={overview.state}>
      <header className={styles.header}>
        <h2 id="home-servers-title"><ServerIcon size={20} />{t('summary.title')}</h2>
        <Link href="/wardogs/servers">{t('summary.browse')}</Link>
      </header>
      {overview.state === 'ok' && overview.synthetic ? <p className={styles.notice} data-synthetic-data="">{t('synthetic')}</p> : null}
      {servers.length === 0 ? <p className={styles.notice}>{emptyMessage}</p> : (
        <ul className={styles.servers}>
          {servers.slice(0, 3).map((server) => (
            <li key={server.publicId}>
              <Link className={styles.server} href={`/wardogs/servers?server=${server.publicId}`}>
                <span className={styles.name}>{server.name}</span>
                <span className={styles.population}><span className="visually-hidden">{t('detail.population')}: </span>{server.players === null ? '—' : formatNumber(server.players, locale)} / {server.capacity === null ? '—' : formatNumber(server.capacity, locale)}</span>
              </Link>
              <div className={styles.facts}>
                <span>{server.map ?? t('mapUnknown')}</span>
                <StatusBadge kind={server.freshness === 'fresh' ? 'success' : server.freshness === 'stale' ? 'warning' : 'neutral'}>{t(`freshness.${server.freshness}`)}</StatusBadge>
              </div>
              {server.teamScores?.length ? <TeamScores scores={server.teamScores} locale={locale} /> : null}
              {(() => {
                const warcon = warconFor(poll.data, server.publicId);
                return warcon ? (
                  <div className={styles.warcon} data-home-warcon={server.publicId}>
                    <p className={styles.warconTitle}>{w('title')}</p>
                    {warcon.synthetic ? <p className={styles.notice} data-synthetic-data="warcon">{w('synthetic')}</p> : null}
                    <WarconLiveFacts live={warcon.live} locale={locale} compact />
                  </div>
                ) : null;
              })()}
              <p className={styles.observed}>{server.observedAt ? <time dateTime={server.observedAt}>{t('observed', { time: formatDate(server.observedAt, locale, 'dateTimeZone') })}</time> : t('neverObserved')}</p>
            </li>
          ))}
        </ul>
      )}
      {poll.failed ? <p className={styles.notice} role="status">{t('refresh.failed')}</p> : null}
      {overview.state !== 'not_configured' ? (
        <label className={styles.refresh}><input type="checkbox" checked={poll.automatic} disabled={!poll.ready} onChange={(event) => poll.setAutomatic(event.target.checked)} />{t('refresh.auto', { seconds: poll.interval })}</label>
      ) : null}
    </section>
  );
}
