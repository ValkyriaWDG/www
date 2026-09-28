import { GAMES, MATCH_STATUSES } from '@valkyria/db/schema';
import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { FilterForm } from '@/components/admin-community/filter-form';
import { formatDate, formatNumber } from '@/components/admin-community/format';
import { dayStart, nextDayStart, pickDate, pickEnum, pickPage, pickParam, queryHref, type SearchParams } from '@/components/admin-community/list-query';
import { MATCH_STATUS_KIND, PUBLICATION_KIND } from '@/components/admin-community/status';
import styles from '@/components/admin-community/admin-community.module.css';
import { EmptyState, FeedbackNotice, GameButton, PageHeader, Pagination, SelectionTable, StatusBadge } from '@/components/ui';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { requireAdminPage } from '@/modules/auth/admin-guard';
import { listMatchesForAdmin } from '@/modules/matches/queries';
import { DEFAULT_MATCH_TIME_ZONE } from '@/modules/matches/time';
import type { AdminMatchListItem, AdminMatchPage } from '@/modules/matches/types';

export const dynamic = 'force-dynamic';

const PATH = '/admin/matches';
const PAGE_SIZE = 20;

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/matches'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminCommunity.matches.list' });
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/** Match overview for match managers/administrators: URL filters, explicit zones, status vs publication. */
export default async function AdminMatchesPage({ params, searchParams }: PageProps<'/[locale]/admin/matches'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: PATH, capability: 'matches.edit' });
  if (!access.ok) return access.denied;

  const t = await getTranslations({ locale, namespace: 'adminCommunity.matches.list' });
  const tc = await getTranslations({ locale, namespace: 'adminCommunity.common' });
  const sp = (await searchParams) as SearchParams;
  const filters = {
    q: pickParam(sp, 'q'),
    game: pickEnum(sp, 'game', GAMES),
    status: pickEnum(sp, 'status', MATCH_STATUSES),
    publication: pickEnum(sp, 'publication', ['draft', 'published'] as const),
    from: pickDate(sp, 'from'),
    to: pickDate(sp, 'to'),
  };
  const page = pickPage(sp);
  const rangeInverted = Boolean(filters.from && filters.to && filters.from > filters.to);

  let result: AdminMatchPage | null = null;
  let loadFailed = false;
  if (!rangeInverted) {
    try {
      result = await listMatchesForAdmin(getDb(), access.principal, {
        q: filters.q,
        game: filters.game,
        status: filters.status,
        publication: filters.publication,
        from: filters.from ? dayStart(filters.from) : undefined,
        to: filters.to ? new Date((nextDayStart(filters.to)?.getTime() ?? 0) - 1) : undefined,
        page,
        pageSize: PAGE_SIZE,
      });
    } catch (error) {
      console.error(`[admin.matches] list failed: ${error instanceof Error ? error.name : 'unknown'}`);
      loadFailed = true;
    }
  }

  const current = { ...filters };
  const anyFilter = Object.values(filters).some(Boolean);
  const deleted = pickParam(sp, 'deleted') === '1';

  const startCell = (row: AdminMatchListItem) => (
    <span className={styles.cellStack}>
      <span>{formatDate(row.startsAt, locale, 'dateTimeZone', DEFAULT_MATCH_TIME_ZONE)}</span>
      {row.timeZone !== DEFAULT_MATCH_TIME_ZONE ? <span className={styles.cellMuted}>{t('localTime', { time: formatDate(row.startsAt, locale, 'dateTimeZone', row.timeZone) })}</span> : null}
      {row.originalStartsAt ? <span className={styles.cellMuted}>{t('originally', { date: formatDate(row.originalStartsAt, locale, 'dateShort', DEFAULT_MATCH_TIME_ZONE) })}</span> : null}
    </span>
  );
  const resultCell = (row: AdminMatchListItem) => {
    const r = row.result;
    if (!r) return <span aria-label={t('noResult')}>—</span>;
    const known = r.scoreValkyria !== null && r.scoreOpponent !== null;
    return (
      <span className={styles.cellStack}>
        <span className={styles.score}>{known ? `${formatNumber(r.scoreValkyria!, locale)} : ${formatNumber(r.scoreOpponent!, locale)}` : '—'}</span>
        <span className={styles.cellMuted}>
          {tc(`outcome.${r.outcome}`)} · {tc(`verification.${r.verification}`)}
        </span>
      </span>
    );
  };

  return (
    <div className={styles.page} data-admin-matches="">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={
          <GameButton href="/admin/matches/new" intent="primary" size="lg" data-action="new-match">
            {t('newMatch')}
          </GameButton>
        }
      />
      {deleted ? <FeedbackNotice kind="success">{t('deletedNotice')}</FeedbackNotice> : null}
      <FilterForm
        action={PATH}
        label={t('filters.label')}
        search={{ label: t('searchLabel'), placeholder: t('searchPlaceholder'), value: filters.q }}
        selects={[
          { name: 'game', label: t('filters.game'), value: filters.game, options: GAMES.map((game) => ({ value: game, label: tc(`game.${game}`) })) },
          { name: 'status', label: t('filters.status'), value: filters.status, options: MATCH_STATUSES.map((status) => ({ value: status, label: tc(`matchStatus.${status}`) })) },
          {
            name: 'publication',
            label: t('filters.publication'),
            value: filters.publication,
            options: (['draft', 'published'] as const).map((value) => ({ value, label: tc(`publication.${value}`) })),
          },
        ]}
        dates={{ from: filters.from, to: filters.to }}
        note={t('filters.dateHint')}
        error={rangeInverted ? t('filters.rangeInverted') : undefined}
        clearHref={anyFilter ? PATH : null}
        summary={result ? t('count', { count: result.total }) : undefined}
      />
      {loadFailed ? (
        <FeedbackNotice kind="error" title={tc('loadErrorTitle')}>
          {tc('loadErrorBody')}
        </FeedbackNotice>
      ) : null}
      {result && result.items.length === 0 ? (
        anyFilter ? (
          <EmptyState title={t('filteredEmptyTitle')} action={<GameButton href={PATH}>{tc('clearFilters')}</GameButton>}>
            <p>{t('filteredEmptyBody')}</p>
          </EmptyState>
        ) : (
          <EmptyState title={t('emptyTitle')} action={<GameButton href="/admin/matches/new" intent="primary">{t('newMatch')}</GameButton>}>
            <p>{t('emptyBody')}</p>
          </EmptyState>
        )
      ) : null}
      {result && result.items.length > 0 ? (
        <>
          <SelectionTable
            caption={t('caption')}
            captionHidden
            rows={result.items}
            getRowKey={(row) => row.id}
            getRowHref={(row) => `/admin/matches/${row.id}`}
            linkColumn="opponent"
            columns={[
              { key: 'start', header: t('columns.start'), cell: startCell, numeric: true },
              {
                key: 'opponent',
                header: t('columns.opponent'),
                rowHeader: true,
                cell: (row) => (
                  <span className={styles.cellStack}>
                    <span data-match-row={row.slug}>{row.opponentName}</span>
                    {row.opponentShortCode ? <span className={styles.cellMuted}>{row.opponentShortCode}</span> : null}
                    <span className="visually-hidden">{t('editRow')}</span>
                  </span>
                ),
              },
              { key: 'game', header: t('columns.game'), cell: (row) => tc(`game.${row.game}`) },
              {
                key: 'competition',
                header: t('columns.competition'),
                cell: (row) => (
                  <span className={styles.cellStack}>
                    <span>{tc(`competition.${row.competitionType}`)}</span>
                    {row.competitionName ? <span className={styles.cellMuted}>{row.competitionName}</span> : null}
                  </span>
                ),
              },
              { key: 'status', header: t('columns.status'), cell: (row) => <StatusBadge kind={MATCH_STATUS_KIND[row.status]}>{tc(`matchStatus.${row.status}`)}</StatusBadge> },
              {
                key: 'publication',
                header: t('columns.publication'),
                cell: (row) => <StatusBadge kind={PUBLICATION_KIND[row.publication]}>{tc(`publication.${row.publication}`)}</StatusBadge>,
              },
              { key: 'result', header: t('columns.result'), cell: resultCell },
              {
                key: 'recap',
                header: t('columns.recap'),
                cell: (row) => (
                  <span className={styles.cellStack}>
                    <span className={`${styles.cellMuted} ${styles.nowrap}`}>CS · {tc(`proseStatus.${row.recap.cs}`)}</span>
                    <span className={`${styles.cellMuted} ${styles.nowrap}`}>EN · {tc(`proseStatus.${row.recap.en}`)}</span>
                  </span>
                ),
              },
              {
                key: 'edit',
                header: <span className="visually-hidden">{t('columns.actions')}</span>,
                cell: () => (
                  <span className={styles.editHint} aria-hidden="true">
                    {t('edit')} ›
                  </span>
                ),
                align: 'end',
              },
            ]}
          />
          <Pagination page={result.page} pageCount={result.pageCount} hrefForPage={(value) => queryHref(PATH, { ...current, page: value > 1 ? value : undefined })} />
        </>
      ) : null}
    </div>
  );
}
