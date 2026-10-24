import { getTranslations } from 'next-intl/server';
import { EmptyState, GameButton, SelectionTable, StatusBadge } from '@/components/ui';
import { formatDate } from '@/i18n/date-format';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { logiEventHref, publicLogiMatchTime, queryPublicLogiMatches } from '@/modules/integrations/logi/public-matches';
import styles from './logi-matches.module.css';

export { logiEventHref } from '@/modules/integrations/logi/public-matches';

export async function LogiMatches({ locale, events, selected, view = 'upcoming', q = '', page = 1, now = new Date() }: { locale: AppLocale; events: PublicLogiEvent[]; selected?: PublicLogiEvent; view?: 'upcoming' | 'results'; q?: string; page?: number; now?: Date }) {
  const t = await getTranslations({ locale, namespace: 'logi' });
  const format = (iso: string | null) => iso ? formatDate(iso, locale, 'dateTimeZone') : t('unknown');
  const rows = selected ? [selected] : queryPublicLogiMatches(events, { view, q, page, now }).items;
  return <section className={styles.section} aria-labelledby="connected-matches-title" data-logi-matches="">
    <h2 id="connected-matches-title">{selected ? t('result') : t('publicTitle')}</h2>
    {rows.length ? <SelectionTable caption={t('title')} captionHidden rows={rows} getRowKey={(row) => `${row.ref.game}:${row.ref.externalId}`} getRowHref={logiEventHref} linkColumn="match" columns={[
      { key: 'start', header: t('date'), cell: (row) => {
        const time = publicLogiMatchTime(row);
        return <span className={styles.date}><time dateTime={time.at}>{format(time.at)}</time>{time.kind === 'end' ? <small>{t('endTime')}</small> : null}</span>;
      } },
      { key: 'match', header: t('match'), rowHeader: true, cell: (row) => <div className={styles.identity}><span>{row.title}</span>{row.teams.length ? <ul className={styles.teams} aria-label={t('teams')}>{row.teams.map((team) => <li key={team.id}><span>{team.name}{team.shortCode ? <strong> · {team.shortCode}</strong> : null}</span>{team.side ? <small>{team.side}</small> : null}</li>)}</ul> : null}</div> },
      { key: 'game', header: t('game'), cell: (row) => t(row.ref.game) },
      { key: 'status', header: t('status'), cell: (row) => <StatusBadge kind="neutral">{t(row.status ?? 'unknown')}</StatusBadge> },
      { key: 'result', header: t('result'), numeric: true, cell: (row) => row.result.participants.length ? <div className={styles.result}>{row.result.participants.map((participant) => <div key={participant.id}>{participant.label || t('unknown')}: {participant.score ?? '—'}</div>)}<small>{row.result.provenance?.kind === 'event_result_import' ? t('importedProvisional') : t(row.result.state)}</small></div> : t('unknown') },
      ...(rows.some((row) => row.archive) ? [{ key: 'archive', header: t('details'), cell: (row: PublicLogiEvent) => row.archive ? <div className={styles.archive}>
        {row.archive.opponentName ? <span>{t('archiveMatch', { opponent: row.archive.opponentName })}</span> : null}
        {row.archive.competitionName ? <small>{row.archive.competitionName}</small> : null}
        <Link className={styles.archiveLink} href={`/${row.ref.game}/matches/${encodeURIComponent(row.archive.slug)}`}>{t('archiveDetails')}</Link>
      </div> : '—' }] : []),
    ]} /> : <EmptyState title={t('empty')} />}
    {selected ? <>{selected.result.provenance?.kind === 'event_result_import' ? <p>{t('importedOn', { date: format(selected.result.provenance.importedAt) })}</p> : null}<p>{t('updated', { date: format(selected.observedAt) })}</p><GameButton href={`/${selected.ref.game}/matches`}>{t('back')}</GameButton></> : null}
  </section>;
}
