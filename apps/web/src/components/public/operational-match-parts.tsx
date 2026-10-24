import { getTranslations } from 'next-intl/server';
import { DetailPane, GameButton, StatusBadge } from '@/components/ui';
import { formatDate } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { logiEventHref, publicLogiMatchTime, publicLogiMatchView } from '@/modules/integrations/logi/public-matches';
import { operationalMatchIdentity, publicResultLabel } from '@/modules/matches/operational-presentation';
import { zoneName } from './match-format';
import styles from './match-scoreboard.module.css';

export const getOperationalTranslations = (locale: AppLocale) => getTranslations({ locale, namespace: 'logi' });
type T = Awaited<ReturnType<typeof getOperationalTranslations>>;

export function OperationalMatchStart({ event, locale, t }: { event: PublicLogiEvent; locale: AppLocale; t: T }) {
  const time = publicLogiMatchTime(event);
  return <span className={styles.date}><time dateTime={time.at}><strong>{formatDate(time.at, locale, 'dateShort')}</strong><span>{formatDate(time.at, locale, 'time')} {zoneName(time.at, locale)}</span></time>{time.kind === 'end' ? <small>{t('endTime')}</small> : null}</span>;
}

export function OperationalMatchTeams({ event, t, expanded = false }: { event: PublicLogiEvent; t: T; expanded?: boolean }) {
  const identity = operationalMatchIdentity(event);
  return <span className={styles.identity} data-expanded={expanded || undefined} data-source-title-primary={identity.sourceTitlePrimary || undefined}>
    {identity.sourceTitlePrimary ? <>
      <strong className={styles.fallbackTitle}>{identity.title}</strong>
      <span className={styles.suppliedTeams}>
        <span>{t('suppliedTeams')}</span>
        <span role="list">{identity.teams.map((team) => <span className={styles.suppliedTeam} key={team.key} role="listitem">
          <span>{team.name}{team.code ? ` (${team.code})` : null}</span>{team.side ? <small>{team.side}</small> : null}
        </span>)}</span>
      </span>
    </> : identity.teams.length ? <span className={styles.teams}><span className="visually-hidden">{t('teams')}: </span>{identity.teams.map((team, index) => <span className={styles.teamGroup} key={team.key}>
      {index > 0 ? <span className={styles.versus} aria-hidden="true">VS</span> : null}
      <span className={styles.team} title={team.name}>
        {expanded ? <span className={styles.monogram} aria-hidden="true">{(team.code ?? team.name).slice(0, 3)}</span> : null}
        <span className={styles.teamName}><strong>{expanded ? team.name : team.code ?? team.name}</strong>{expanded && team.code ? <small>{team.code}</small> : null}{team.side ? <small>{team.side}</small> : null}</span>
        {!expanded && team.code ? <span className="visually-hidden"> {team.name}</span> : null}
      </span>
    </span>)}</span> : <strong className={styles.fallbackTitle}>{identity.title}</strong>}
    {identity.subtitle ? <small className={styles.subtitle}>{identity.subtitle}</small> : null}
  </span>;
}

/** Factions retain their own labels; a result is never silently relabelled Valkyria. */
export function OperationalMatchResult({ event, t, locale = 'cs', variant = 'row' }: { event: PublicLogiEvent; t: T; locale?: AppLocale; variant?: 'row' | 'detail' }) {
  const participants = event.result.participants;
  if (!participants.length) return <span className={styles.pending}><span aria-hidden="true">—</span><small>{t('resultPending')}</small></span>;
  const pair = participants.length === 2;
  return <span className={styles.result} data-variant={variant} data-result-state={event.result.state}>
    <span className={pair ? styles.scorePair : styles.scoreList}>
      {participants.map((participant, index) => <span className={styles.scoreEntry} key={participant.id}>
        {pair && index > 0 ? <span className={styles.scoreSeparator} aria-hidden="true">:</span> : null}
        <span className={styles.scoreSide}><span className={styles.scoreLabel}>{publicResultLabel(participant.label, event.ref.game, locale) || t('unknown')}</span><strong className={styles.scoreValue}>{participant.score ?? '—'}</strong></span>
      </span>)}
    </span>
    <span className="visually-hidden">{participants.map((participant) => `${participant.label || t('unknown')}: ${participant.score ?? '—'}`).join('; ')}</span>
    <small className={styles.verification}>{t(event.result.state === 'unknown' ? 'resultPending' : event.result.state)}</small>
  </span>;
}

export function OperationalMatchStatus({ event, t }: { event: PublicLogiEvent; t: T }) {
  const status = event.status ?? (event.result.state !== 'unknown' ? 'played' : publicLogiMatchView(event) === 'upcoming' ? 'scheduled' : 'unknownStatus');
  return <StatusBadge kind={status === 'starting' ? 'info' : status === 'concluded' || status === 'played' ? 'success' : 'neutral'}>{t(status)}</StatusBadge>;
}

export async function OperationalMatchPreview({ event, locale, mode = 'preview' }: { event: PublicLogiEvent; locale: AppLocale; mode?: 'preview' | 'detail' }) {
  const [t, matches] = await Promise.all([getOperationalTranslations(locale), getTranslations({ locale, namespace: 'matches' })]);
  const identity = operationalMatchIdentity(event);
  return <div data-operational-match-detail="" data-detail-mode={mode}><DetailPane title={mode === 'detail' ? matches('detail.overview') : identity.title} titleId={mode === 'detail' ? 'match-overview-title' : 'match-preview-title'} media={<div className={styles.banner}><OperationalMatchTeams event={event} t={t} expanded /></div>} metadata={[
    { label: t('date'), value: <OperationalMatchStart event={event} locale={locale} t={t} /> },
    { label: t('game'), value: t(event.ref.game) },
    { label: t('status'), value: <OperationalMatchStatus event={event} t={t} /> },
    ...(event.archive?.competitionName ? [{ label: matches('detail.competition'), value: event.archive.competitionName }] : []),
  ]} actions={mode === 'preview' ? <GameButton href={logiEventHref(event)} fullWidth>{matches('detail.openDetail')}</GameButton> : undefined}>
    <section className={styles.detailResult} aria-label={t('result')}><h3>{t('result')}</h3><OperationalMatchResult event={event} t={t} locale={locale} variant="detail" /></section>
  </DetailPane></div>;
}
