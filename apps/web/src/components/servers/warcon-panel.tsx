'use client';

import { useTranslations } from 'next-intl';
import { SectionFrame, StatusBadge, type StatusKind } from '@/components/ui';
import { formatDate, formatNumber } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import type { Freshness } from '@/modules/integrations/contract';
import type { WarconLivePublic, WarconServerPublic } from '@/modules/integrations/logi/readers/public';
import styles from './servers.module.css';

const FRESHNESS_KIND: Record<Freshness, StatusKind> = { fresh: 'success', stale: 'warning', unavailable: 'neutral' };

function Dash({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="visually-hidden">{label}</span>
    </>
  );
}

function roundTime(seconds: number, locale: AppLocale): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${formatNumber(minutes, locale)}:${String(rest).padStart(2, '0')}`;
}

/**
 * "Live (Warcon)" fact row of one approved connection on the server detail: server name,
 * map, lighting, players, round time, rotation, named scores, observation time and
 * freshness. Scores and round time appear for fresh observations only; an unavailable
 * view says so without inventing an empty server.
 */
export function WarconLiveFacts({ live, locale }: { live: WarconLivePublic; locale: AppLocale }) {
  const t = useTranslations('games.servers');
  const w = useTranslations('games.servers.warcon');
  const dash = <Dash label={t('notAvailable')} />;
  const observed = live.observedAt ? <time dateTime={live.observedAt}>{w('observed', { time: formatDate(live.observedAt, locale, 'dateTimeZone') })}</time> : w('neverObserved');
  const badge = <StatusBadge kind={FRESHNESS_KIND[live.freshness]}>{t(`freshness.${live.freshness}`)}</StatusBadge>;
  if (live.freshness === 'unavailable') {
    return (
      <div className={styles.warconLive} data-warcon-live={live.publicId} data-warcon-freshness={live.freshness}>
        <p className={styles.warconUnavailable}>{badge} <span>{observed}</span></p>
        <p className={styles.warconUnavailable}>{w('unavailable')}</p>
      </div>
    );
  }
  return (
    <div className={styles.warconLive} data-warcon-live={live.publicId} data-warcon-freshness={live.freshness}>
      <dl className={styles.warconFacts}>
        {live.serverName ? (
          <div>
            <dt>{w('serverName')}</dt>
            <dd>{live.serverName}</dd>
          </div>
        ) : null}
        <div>
          <dt>{w('map')}</dt>
          <dd>{live.map ?? dash}</dd>
        </div>
        <div>
          <dt>{w('lighting')}</dt>
          <dd>{live.lighting ?? dash}</dd>
        </div>
        <div>
          <dt>{w('players')}</dt>
          <dd className={styles.warconNumber}>{live.playerCount === null && live.maxPlayers === null ? dash : w('populationValue', { players: live.playerCount === null ? '—' : formatNumber(live.playerCount, locale), capacity: live.maxPlayers === null ? '—' : formatNumber(live.maxPlayers, locale) })}</dd>
        </div>
        {live.matchSeconds !== null ? (
          <div>
            <dt>{w('matchTime')}</dt>
            <dd className={styles.warconNumber}>{roundTime(live.matchSeconds, locale)}</dd>
          </div>
        ) : null}
        {live.rotationNow !== null && live.rotationNext !== null ? (
          <div>
            <dt>{w('rotation')}</dt>
            <dd className={styles.warconNumber}>{w('rotationValue', { now: formatNumber(live.rotationNow, locale), next: formatNumber(live.rotationNext, locale) })}</dd>
          </div>
        ) : null}
        <div className={styles.warconScoresItem}>
          <dt>{w('scores')}</dt>
          <dd>
            {live.scores.length > 0 ? (
              <ul className={styles.warconScores} data-warcon-scores="">
                {live.scores.map((score) => (
                  <li key={score.name}>
                    <span className={styles.warconScoreName}>{score.name}</span>
                    <span className={styles.warconNumber}>{formatNumber(score.score, locale)}</span>
                  </li>
                ))}
              </ul>
            ) : dash}
          </dd>
        </div>
      </dl>
      <p className={styles.warconMeta}>
        {badge}
        <span>{observed}</span>
      </p>
    </div>
  );
}

/** "Live (Warcon)" section plus the last recorded rounds of the selected Wardogs server. */
export function WarconPanel({ entry, locale, serverName }: { entry: WarconServerPublic; locale: AppLocale; serverName: string }) {
  const t = useTranslations('games.servers');
  const w = useTranslations('games.servers.warcon');
  const recent = entry.recentMatches;
  const dash = <Dash label={t('notAvailable')} />;
  return (
    <div className={styles.warconPanel} data-warcon-panel={entry.publicId}>
      <SectionFrame title={w('title')} titleAs="h3" titleId="warcon-live-title" eyebrow={serverName} description={<p>{w('intro')}</p>}>
        {entry.synthetic ? <p className={styles.synthetic} data-synthetic-data="warcon">{w('synthetic')}</p> : null}
        <WarconLiveFacts live={entry.live} locale={locale} />
      </SectionFrame>
      {recent ? (
        <SectionFrame title={w('recent.title')} titleAs="h3" titleId="warcon-recent-title" description={<p>{w('recent.intro', { count: recent.matches.length })}</p>}>
          <div data-warcon-matches={entry.publicId} data-warcon-freshness={recent.freshness}>
            {recent.freshness === 'unavailable' ? (
              <p className={styles.warconUnavailable}>{w('recent.unavailable')}</p>
            ) : recent.matches.length === 0 ? (
              <p className={styles.warconUnavailable}>{w('recent.empty')}</p>
            ) : (
              <ul className={styles.warconMatches}>
                {recent.matches.map((row) => (
                  <li key={row.id} data-warcon-match={row.id}>
                    <div className={styles.warconMatchHead}>
                      <time dateTime={row.startedAt}>{formatDate(row.startedAt, locale, 'weekdayDateTime')}</time>
                      <span className={styles.warconMatchMap}>{row.map ?? t('mapUnknown')}{row.experiences ? ` · ${row.experiences}` : ''}</span>
                      {row.endedAt === null ? <StatusBadge kind="info">{w('recent.inProgress')}</StatusBadge> : null}
                    </div>
                    <dl className={styles.warconMatchFacts}>
                      <div>
                        <dt>{w('recent.columns.peak')}</dt>
                        <dd className={styles.warconNumber}>{formatNumber(row.peakPlayers, locale)}</dd>
                      </div>
                      <div className={styles.warconScoresItem}>
                        <dt>{w('recent.columns.scores')}</dt>
                        <dd>
                          {row.finalScores && row.finalScores.length > 0 ? (
                            <ul className={styles.warconScores}>
                              {row.finalScores.map((score) => (
                                <li key={score.name}>
                                  <span className={styles.warconScoreName}>{score.name}</span>
                                  <span className={styles.warconNumber}>{formatNumber(score.score, locale)}</span>
                                </li>
                              ))}
                            </ul>
                          ) : dash}
                        </dd>
                      </div>
                      <div>
                        <dt>{w('recent.columns.winner')}</dt>
                        <dd>{row.winner ?? dash}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
            <p className={styles.warconMeta}>
              <StatusBadge kind={FRESHNESS_KIND[recent.freshness]}>{t(`freshness.${recent.freshness}`)}</StatusBadge>
              <span>{recent.observedAt ? <time dateTime={recent.observedAt}>{w('recent.observed', { time: formatDate(recent.observedAt, locale, 'dateTimeZone') })}</time> : w('neverObserved')}</span>
            </p>
          </div>
        </SectionFrame>
      ) : null}
    </div>
  );
}
