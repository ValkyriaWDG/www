import { getTranslations } from 'next-intl/server';
import { DetailPane, GameButton, StatusBadge } from '@/components/ui';
import { formatDate } from '@/i18n/date-format';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { logiEventHref, publicLogiMatchTime } from '@/modules/integrations/logi/public-matches';
import styles from './logi-matches.module.css';

export const getOperationalTranslations = (locale: AppLocale) => getTranslations({ locale, namespace: 'logi' });
type T = Awaited<ReturnType<typeof getOperationalTranslations>>;

export function OperationalMatchStart({ event, locale, t }: { event: PublicLogiEvent; locale: AppLocale; t: T }) {
  const time = publicLogiMatchTime(event);
  return <span className={styles.date}><time dateTime={time.at}>{formatDate(time.at, locale, 'dateTimeZone')}</time>{time.kind === 'end' ? <small>{t('endTime')}</small> : null}</span>;
}

export function OperationalMatchTeams({ event, t }: { event: PublicLogiEvent; t: T }) {
  return <span className={styles.identity}><span>{event.title}</span>{event.teams.length ? <span className={styles.teams} aria-label={t('teams')}>{event.teams.map((team) => <span key={team.id}><span>{team.name}{team.shortCode ? <strong> · {team.shortCode}</strong> : null}</span>{team.side ? <small>{team.side}</small> : null}</span>)}</span> : null}</span>;
}

export function OperationalMatchResult({ event, t }: { event: PublicLogiEvent; t: T }) {
  return event.result.participants.length ? <span className={styles.result}>{event.result.participants.map((participant) => <span key={participant.id}>{participant.label || t('unknown')}: {participant.score ?? '—'}</span>)}<small>{event.result.provenance?.kind === 'event_result_import' ? t('importedProvisional') : t(event.result.state)}</small></span> : <span>{t('unknown')}</span>;
}

export function OperationalMatchStatus({ event, t }: { event: PublicLogiEvent; t: T }) {
  return <StatusBadge kind={event.status === 'starting' ? 'info' : 'neutral'}>{t(event.status ?? 'unknown')}</StatusBadge>;
}

export async function OperationalMatchPreview({ event, locale }: { event: PublicLogiEvent; locale: AppLocale }) {
  const [t, matches] = await Promise.all([getOperationalTranslations(locale), getTranslations({ locale, namespace: 'matches' })]);
  return <DetailPane title={event.title} titleId="match-preview-title" metadata={[
    { label: t('date'), value: <OperationalMatchStart event={event} locale={locale} t={t} /> },
    { label: t('game'), value: t(event.ref.game) },
    { label: t('status'), value: <OperationalMatchStatus event={event} t={t} /> },
  ]} actions={<GameButton href={logiEventHref(event)} fullWidth>{matches('detail.openDetail')}</GameButton>}>
    <div className={styles.identity}><OperationalMatchTeams event={event} t={t} /><h3>{t('result')}</h3><OperationalMatchResult event={event} t={t} />
      {event.archive ? <Link href={`/${event.ref.game}/matches/${encodeURIComponent(event.archive.slug)}`}>{t('archiveDetails')}</Link> : null}
    </div>
  </DetailPane>;
}
