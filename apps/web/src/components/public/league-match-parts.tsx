import { getTranslations } from 'next-intl/server';
import { DetailPane, GameButton, StatusBadge } from '@/components/ui';
import { formatDate } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import type { LeagueFixturePublic } from '@/modules/integrations/logi/readers/public';
import { ExternalLink } from './external-link';
import { leagueValueKey } from './league-labels';
import { zoneName } from './match-format';
import styles from './match-scoreboard.module.css';

export function leagueMatchTitle(fixture: LeagueFixturePublic) {
  return fixture.teams.length ? fixture.teams.map((team) => team.code).join(' vs. ') : fixture.title;
}

export async function LeagueMatchStart({ fixture, locale }: { fixture: LeagueFixturePublic; locale: AppLocale }) {
  const t = await getTranslations({ locale, namespace: 'matches.list.leagueFixtures' });
  return fixture.scheduledAt ? <span className={styles.date}><time dateTime={fixture.scheduledAt}><strong>{formatDate(fixture.scheduledAt, locale, 'dateShort')}</strong><span>{formatDate(fixture.scheduledAt, locale, 'time')} {zoneName(fixture.scheduledAt, locale)}</span></time></span> : <span className={styles.subtitle}>{t('unscheduled')}</span>;
}

export function LeagueMatchTeams({ fixture, expanded = false }: { fixture: LeagueFixturePublic; expanded?: boolean }) {
  return <span className={styles.identity}>
    {fixture.teams.length ? <span className={styles.teams}>{fixture.teams.map((team, index) => <span className={styles.teamGroup} key={team.code}>
      {index > 0 ? <span className={styles.versus} aria-hidden="true">VS</span> : null}
      <span className={styles.team} title={team.name ?? team.code}>{expanded ? <span className={styles.monogram} aria-hidden="true">{team.code.slice(0, 3)}</span> : null}<span className={styles.teamName}><strong>{expanded ? team.name ?? team.code : team.code}</strong>{expanded && team.name ? <small>{team.code}</small> : null}</span></span>
    </span>)}</span> : <strong className={styles.fallbackTitle}>{fixture.title}</strong>}
    {fixture.teams.length && fixture.title !== leagueMatchTitle(fixture) ? <small className={styles.subtitle}>{fixture.title}</small> : null}
  </span>;
}

export async function LeagueMatchStatus({ fixture, locale }: { fixture: LeagueFixturePublic; locale: AppLocale }) {
  const [t, fixtures] = await Promise.all([
    getTranslations({ locale, namespace: 'matches.detail.league' }),
    getTranslations({ locale, namespace: 'matches.list.leagueFixtures' }),
  ]);
  const key = leagueValueKey('status', fixture.status);
  return <span className={styles.status}>
    <StatusBadge kind={fixture.status === 'live' ? 'info' : 'neutral'}>{key ? t(key as Parameters<typeof t>[0]) : fixture.status ?? '—'}</StatusBadge>
    {fixture.state === 'stale' ? <StatusBadge kind="warning">{fixtures('freshness.stale')}</StatusBadge> : null}
  </span>;
}

export async function LeagueMatchPreview({ fixture, locale, mode = 'preview' }: { fixture: LeagueFixturePublic; locale: AppLocale; mode?: 'preview' | 'detail' }) {
  const [t, league, external] = await Promise.all([getTranslations({ locale, namespace: 'matches' }), getTranslations({ locale, namespace: 'matches.list.leagueFixtures' }), getTranslations({ locale, namespace: 'common.external' })]);
  return <div data-league-match-detail="" data-league-state={fixture.state} data-detail-mode={mode}>
    <DetailPane title={mode === 'detail' ? t('detail.overview') : leagueMatchTitle(fixture)} titleId={mode === 'detail' ? 'match-overview-title' : 'match-preview-title'}
      media={<div className={styles.banner}><LeagueMatchTeams fixture={fixture} expanded /></div>}
      metadata={[
        { label: t('detail.competition'), value: 'Wardogs League' },
        { label: t('detail.start'), value: <LeagueMatchStart fixture={fixture} locale={locale} /> },
        { label: t('detail.status'), value: <LeagueMatchStatus fixture={fixture} locale={locale} /> },
        ...(fixture.map?.name ? [{ label: league('map'), value: [fixture.map.name, fixture.map.zone, fixture.map.lighting].filter(Boolean).join(' · ') }] : []),
      ]}
      actions={mode === 'preview' ? <GameButton href={`/wardogs/matches/league/${encodeURIComponent(fixture.id)}`} fullWidth>{t('detail.openDetail')}</GameButton> : undefined}>
      {fixture.state === 'stale' ? <p className={styles.subtitle}>{league('stale')}</p> : null}
      <p className={styles.subtitle}><StatusBadge kind={fixture.state === 'fresh' ? 'success' : 'warning'}>{league(`freshness.${fixture.state}`)}</StatusBadge>{' '}<time dateTime={fixture.observedAt}>{league('observed', { time: formatDate(fixture.observedAt, locale, 'dateTimeZone') })}</time></p>
      <ExternalLink href={fixture.sourceUrl} externalLabel={external('suffix')}>{league('links.source')}</ExternalLink>
    </DetailPane>
  </div>;
}
