import { getTranslations } from 'next-intl/server';
import { SectionFrame, StatusBadge, type StatusKind, SyntheticNote } from '@/components/ui/panels';
import { formatDate, formatNumber } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import { canonicalLeagueMatchUrl } from '@/modules/integrations/logi/readers/league-url';
import type { LeaguePreviewPublic } from '@/modules/integrations/logi/readers/public';
import { ExternalLink } from './external-link';
import { leagueValueKey, type LeagueValueGroup } from './league-labels';
import styles from './matches.module.css';

const STATE_KIND: Record<LeaguePreviewPublic['state'], StatusKind> = { fresh: 'success', stale: 'warning', unavailable: 'neutral' };
const PROGRESS_KIND: Record<'done' | 'current' | 'not_started' | 'unknown', StatusKind> = { done: 'success', current: 'accent', not_started: 'neutral', unknown: 'neutral' };

/**
 * Unverified Wardogs League preview of a published Wardogs match with an editorial League
 * link: fixture, scheduled time, teams, map, hosting, map vote and progress with the
 * observation time. Never a result: the CMS result stays the only result. Unavailable or
 * expired previews render one quiet line, never a cached state presented as current.
 */
export async function LeaguePreview({ preview, locale, titleId }: { preview: LeaguePreviewPublic; locale: AppLocale; titleId: string }) {
  const t = await getTranslations({ locale, namespace: 'matches.detail.league' });
  const external = (await getTranslations({ locale, namespace: 'common.external' }))('suffix');
  const source = canonicalLeagueMatchUrl(preview.sourceUrl)?.url ?? null;
  // Known League enumerations get localized labels; anything else is shown as published.
  const label = (group: LeagueValueGroup, raw: string | null): string | null => {
    const key = leagueValueKey(group, raw);
    return key ? t(key as Parameters<typeof t>[0]) : raw;
  };
  const dash = <span aria-hidden="true">—</span>;
  const body = preview.state === 'unavailable' ? (
    <p className={styles.leagueUnavailable} data-league-state="unavailable">
      <StatusBadge kind="neutral">{t('unavailable')}</StatusBadge>
    </p>
  ) : (
    <div data-league-state={preview.state}>
      {preview.synthetic ? <SyntheticNote source="league">{t('synthetic')}</SyntheticNote> : null}
      <dl className={styles.leagueFacts}>
        {preview.fixtureNumber !== null ? (
          <div>
            <dt>{t('fixture', { number: formatNumber(preview.fixtureNumber, locale) })}</dt>
            <dd className={styles.leagueTitle}>{preview.title ?? dash}</dd>
          </div>
        ) : (
          <div>
            <dt>{t('matchTitle')}</dt>
            <dd className={styles.leagueTitle}>{preview.title ?? dash}</dd>
          </div>
        )}
        <div>
          <dt>{t('type')}</dt>
          <dd>{label('type', preview.type) ?? dash}</dd>
        </div>
        <div>
          <dt>{t('status')}</dt>
          <dd>{label('status', preview.status) ?? dash}</dd>
        </div>
        <div>
          <dt>{t('scheduled')}</dt>
          <dd>{preview.scheduledAt ? <time dateTime={preview.scheduledAt}>{formatDate(preview.scheduledAt, locale, 'dateTimeZone')}</time> : dash}</dd>
        </div>
        <div className={styles.leagueWide}>
          <dt>{t('teams')}</dt>
          <dd>
            {preview.teams.length > 0 ? (
              <ul className={styles.leagueTeams} data-league-teams="">
                {preview.teams.map((team) => (
                  <li key={team.code}>
                    <span className={styles.leagueTeamCode}>{team.code}</span>
                    {team.name ? <span>{team.name}</span> : null}
                  </li>
                ))}
              </ul>
            ) : dash}
          </dd>
        </div>
        <div>
          <dt>{t('map')}</dt>
          <dd>{preview.map?.name ?? dash}</dd>
        </div>
        <div>
          <dt>{t('zone')}</dt>
          <dd>{preview.map?.zone ?? dash}</dd>
        </div>
        <div>
          <dt>{t('lighting')}</dt>
          <dd>{preview.map?.lighting ?? dash}</dd>
        </div>
        <div>
          <dt>{t('hosting')}</dt>
          <dd>{preview.hosting && (preview.hosting.mode || preview.hosting.teamCode) ? (preview.hosting.mode && preview.hosting.teamCode ? t('hostingValue', { mode: label('hosting', preview.hosting.mode) ?? preview.hosting.mode, team: preview.hosting.teamCode }) : (label('hosting', preview.hosting.mode) ?? preview.hosting.teamCode)) : dash}</dd>
        </div>
        <div>
          <dt>{t('mapVote')}</dt>
          <dd>{preview.mapVote?.status ? (preview.mapVote.closesAt ? t('mapVoteCloses', { status: label('mapVote', preview.mapVote.status) ?? preview.mapVote.status, time: formatDate(preview.mapVote.closesAt, locale, 'dateTimeZone') }) : label('mapVote', preview.mapVote.status)) : dash}</dd>
        </div>
      </dl>
      {preview.progress.length > 0 ? (
        <>
          <p id={`${titleId}-league-progress`} className={`${styles.blockTitle} ${styles.leagueProgressLabel}`}>
            {t('progress')}
          </p>
          <ol className={styles.leagueProgress} aria-labelledby={`${titleId}-league-progress`} data-league-progress="">
          {preview.progress.map((step, index) => (
            <li key={`${step.label}-${index}`} data-state={step.state ?? 'unknown'}>
              <StatusBadge kind={PROGRESS_KIND[step.state ?? 'unknown']}>{t(`progressState.${step.state ?? 'unknown'}`)}</StatusBadge>
              <span className={styles.leagueStepLabel}>{label('progress', step.label) ?? step.label}</span>
              {step.detail ? <span className={styles.leagueStepDetail}>{step.detail}</span> : null}
            </li>
          ))}
          </ol>
        </>
      ) : null}
      <p className={styles.leagueMeta}>
        <StatusBadge kind={STATE_KIND[preview.state]}>{t(`freshness.${preview.state}`)}</StatusBadge>
        <span>{preview.observedAt ? <time dateTime={preview.observedAt}>{t('observed', { time: formatDate(preview.observedAt, locale, 'dateTimeZone') })}</time> : t('neverObserved')}</span>
        {preview.state === 'stale' ? <span>{t('stale')}</span> : null}
      </p>
    </div>
  );
  return (
    <div className={styles.league} data-league-preview="" data-league-state={preview.state}>
      <SectionFrame title={t('title')} titleAs="h3" titleId={`${titleId}-league`} description={<p className={styles.leagueNote}>{t('note')}</p>}>
        {body}
        {source ? (
          <p className={styles.leagueSource}>
            <ExternalLink href={source} externalLabel={external}>
              {t('source')}
            </ExternalLink>
          </p>
        ) : null}
      </SectionFrame>
    </div>
  );
}
