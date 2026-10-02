import { getTranslations } from 'next-intl/server';
import { EmptyState, FilterBar, GameButton, LinkTabs, Pagination, SelectionTable, StatusBadge } from '@/components/ui';
import type { AppLocale } from '@/i18n/routing';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import styles from './logi-matches.module.css';
import type { GameRoute } from '@/modules/games/registry';
import { matchesListHref, type MatchFilters } from './query';

export function logiEventHref(event: PublicLogiEvent) {
  return `/${event.ref.game}/matches/logi/${encodeURIComponent(event.ref.externalId)}`;
}
export async function LogiMatches({ locale, events, selected, view = 'upcoming', q = '', page = 1 }: { locale: AppLocale; events: PublicLogiEvent[]; selected?: PublicLogiEvent; view?: 'upcoming' | 'results'; q?: string; page?: number }) {
  const t = await getTranslations({ locale, namespace: 'logi' });
  const format = (iso: string | null) => iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Prague' }).format(new Date(iso)) : t('unknown');
  const rows = selected ? [selected] : events.filter((event) => (event.status === 'concluded') === (view === 'results') && event.title.toLocaleLowerCase(locale).includes(q.toLocaleLowerCase(locale))).slice((page - 1) * 10, page * 10);
  return <section className={styles.section} aria-labelledby="connected-matches-title" data-logi-matches="">
    <h2 id="connected-matches-title">{selected ? t('result') : t('publicTitle')}</h2>
    {rows.length ? <SelectionTable caption={t('title')} captionHidden rows={rows} getRowKey={(row) => `${row.ref.game}:${row.ref.externalId}`} getRowHref={logiEventHref} linkColumn="match" columns={[
      { key: 'start', header: t('start'), cell: (row) => row.startsAt ? <time dateTime={row.startsAt}>{format(row.startsAt)}</time> : t('unknown') },
      { key: 'match', header: t('match'), rowHeader: true, cell: (row) => row.title },
      { key: 'game', header: t('game'), cell: (row) => t(row.ref.game) },
      { key: 'status', header: t('status'), cell: (row) => <StatusBadge kind="neutral">{t(row.status ?? 'unknown')}</StatusBadge> },
      { key: 'result', header: t('result'), cell: (row) => row.result.participants.length ? <div>{row.result.participants.map((team) => <div key={team.id}>{team.label}: {team.score ?? '—'}</div>)}<small>{t(row.result.state)}</small></div> : t('unknown') },
    ]} /> : <EmptyState title={t('empty')} />}
    {selected ? <><p>{t('updated', { date: format(selected.observedAt) })}</p><GameButton href={`/${selected.ref.game}/matches`}>{t('back')}</GameButton></> : null}
  </section>;
}

export async function LogiMatchBrowser({ locale, events, game, filters }: { locale: AppLocale; events: PublicLogiEvent[]; game?: GameRoute | null; filters: MatchFilters }) {
  const t = await getTranslations({ locale, namespace: 'logi' });
  const base = game ? `/${game}` : '';
  const href = (next: Partial<MatchFilters>) => matchesListHref(next, base);
  const count = events.filter((event) => (event.status === 'concluded') === (filters.view === 'results') && event.title.toLocaleLowerCase(locale).includes((filters.q ?? '').toLocaleLowerCase(locale))).length;
  return <div className={styles.section}>
    <LinkTabs label={t('all')} current={filters.view} tabs={(['upcoming', 'results'] as const).map((view) => ({ key: view, label: t(view), href: href({ ...filters, view, page: 1 }) }))} />
    <FilterBar action={`${base}/matches`} searchLabel={t('match')} searchValue={filters.q} hiddenParams={{ view: filters.view, ...(filters.game ? { game: filters.game } : {}) }} />
    <LogiMatches locale={locale} events={events} view={filters.view} q={filters.q} page={filters.page} />
    <Pagination page={filters.page} pageCount={Math.ceil(count / 10)} hrefForPage={(page) => href({ ...filters, page })} />
    <h2>{t('archive')}</h2>
  </div>;
}
