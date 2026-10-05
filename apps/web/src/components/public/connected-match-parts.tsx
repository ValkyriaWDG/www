import { getTranslations } from 'next-intl/server';
import { DetailPane, GameButton, StatusBadge } from '@/components/ui';
import { formatDate } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { publicLogiMatchTime } from '@/modules/integrations/logi/public-matches';
import { zoneName } from './match-format';
import styles from './matches.module.css';

export const getConnectedMatchTranslations = (locale: AppLocale) => getTranslations({ locale, namespace: 'logi' });
type T = Awaited<ReturnType<typeof getConnectedMatchTranslations>>;

export function connectedMatchTitle(event: PublicLogiEvent, t: T) {
  return event.archive?.opponentName ? t('archiveMatch', { opponent: event.archive.opponentName }) : event.title;
}

export function ConnectedMatchStart({ event, locale, t }: { event: PublicLogiEvent; locale: AppLocale; t: T }) {
  const time = publicLogiMatchTime(event);
  return <span className={styles.startCell}>
    <time dateTime={time.at} className={styles.start}>
      <span className={styles.startDate}>{formatDate(time.at, locale, 'dateShort')}</span>
      <span className={styles.startTime}>{formatDate(time.at, locale, 'time')} {zoneName(time.at, locale)}</span>
    </time>
    {time.kind === 'end' ? <small className={styles.original}>{t('endTime')}</small> : null}
  </span>;
}

export function ConnectedMatchTeams({ event, t }: { event: PublicLogiEvent; t: T }) {
  return <span className={styles.connectedIdentity}>
    <span>{connectedMatchTitle(event, t)}</span>
    {event.teams.length ? <span className={styles.connectedTeams}>{event.teams.map((team) => team.shortCode ? `${team.name} · ${team.shortCode}` : team.name).join(' / ')}</span> : null}
  </span>;
}

export function ConnectedMatchStatus({ event, t }: { event: PublicLogiEvent; t: T }) {
  return <StatusBadge kind="neutral">{t(event.status ?? 'unknown')}</StatusBadge>;
}

export function ConnectedMatchResult({ event, t }: { event: PublicLogiEvent; t: T }) {
  return event.result.participants.length ? <span className={styles.connectedResult}>
    {event.result.participants.map((participant) => <span key={participant.id}>{participant.label || t('unknown')}: <strong>{participant.score ?? '—'}</strong></span>)}
    <small>{t(event.result.state)}</small>
  </span> : <span className={styles.dash} aria-label={t('unknown')}>—</span>;
}

export async function ConnectedMatchPreview({ event, locale, href }: { event: PublicLogiEvent; locale: AppLocale; href: string }) {
  const t = await getConnectedMatchTranslations(locale);
  return <DetailPane title={connectedMatchTitle(event, t)} titleId="match-preview-title" metadata={[
    { label: t('date'), value: <ConnectedMatchStart event={event} locale={locale} t={t} /> },
    { label: t('game'), value: t(event.ref.game) },
    { label: t('status'), value: <ConnectedMatchStatus event={event} t={t} /> },
  ]} actions={<GameButton href={href}>{t('details')}</GameButton>}>
    <ConnectedMatchResult event={event} t={t} />
  </DetailPane>;
}
