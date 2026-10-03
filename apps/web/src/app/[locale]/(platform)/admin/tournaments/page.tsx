import { GAMES } from '@valkyria/db/schema';
import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { FilterForm } from '@/components/admin-community/filter-form';
import { formatDate, formatNumber } from '@/components/admin-community/format';
import { pickEnum, pickPage, pickParam, queryHref, type SearchParams } from '@/components/admin-community/list-query';
import { PUBLICATION_KIND } from '@/components/admin-community/status';
import styles from '@/components/admin-community/admin-community.module.css';
import { EmptyState, FeedbackNotice, GameButton, PageHeader, Pagination, SelectionTable, StatusBadge } from '@/components/ui';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { adminPageMetadata, requireAdminPage } from '@/modules/auth/admin-guard';
import { listTournamentsForAdmin } from '@/modules/tournaments/queries';
import type { AdminTournamentListItem, AdminTournamentPage } from '@/modules/tournaments/types';

export const dynamic = 'force-dynamic';

const PATH = '/admin/tournaments';
const PAGE_SIZE = 20;

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/tournaments'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminCommunity.tournaments.list' });
  return adminPageMetadata({ locale, title: t('metaTitle'), capability: 'matches.edit' });
}

/** Tournament overview for match managers/administrators within their game scope. */
export default async function AdminTournamentsPage({ params, searchParams }: PageProps<'/[locale]/admin/tournaments'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: PATH, capability: 'matches.edit' });
  if (!access.ok) return access.denied;

  const t = await getTranslations({ locale, namespace: 'adminCommunity.tournaments.list' });
  const tc = await getTranslations({ locale, namespace: 'adminCommunity.common' });
  const sp = (await searchParams) as SearchParams;
  const filters = {
    q: pickParam(sp, 'q'),
    game: pickEnum(sp, 'game', GAMES),
    publication: pickEnum(sp, 'publication', ['draft', 'published'] as const),
  };
  const page = pickPage(sp);

  let result: AdminTournamentPage | null = null;
  let loadFailed = false;
  try {
    result = await listTournamentsForAdmin(getDb(), access.principal, { ...filters, page, pageSize: PAGE_SIZE });
  } catch (error) {
    console.error(`[admin.tournaments] list failed: ${error instanceof Error ? error.name : 'unknown'}`);
    loadFailed = true;
  }

  const anyFilter = Object.values(filters).some(Boolean);
  const deleted = pickParam(sp, 'deleted') === '1';
  const dates = (row: AdminTournamentListItem) =>
    row.startsOn || row.endsOn
      ? [row.startsOn ? formatDate(row.startsOn, locale, 'date') : '…', row.endsOn ? formatDate(row.endsOn, locale, 'date') : '…'].join(' – ')
      : t('noDates');

  return (
    <div className={styles.page} data-admin-tournaments="">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={
          <GameButton href="/admin/tournaments/new" intent="primary" size="lg" data-action="new-tournament">
            {t('newTournament')}
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
          {
            name: 'publication',
            label: t('filters.publication'),
            value: filters.publication,
            options: (['draft', 'published'] as const).map((value) => ({ value, label: tc(`publication.${value}`) })),
          },
        ]}
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
          <EmptyState title={t('emptyTitle')} action={<GameButton href="/admin/tournaments/new" intent="primary">{t('newTournament')}</GameButton>}>
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
            getRowHref={(row) => `/admin/tournaments/${row.id}`}
            linkColumn="name"
            columns={[
              {
                key: 'name',
                header: t('columns.name'),
                rowHeader: true,
                cell: (row) => (
                  <span className={styles.cellStack}>
                    <span data-tournament-row={row.slug}>{row.name}</span>
                    {row.season ? <span className={styles.cellMuted}>{row.season}</span> : null}
                    <span className="visually-hidden">{t('editRow')}</span>
                  </span>
                ),
              },
              { key: 'game', header: t('columns.game'), cell: (row) => tc(`game.${row.game}`) },
              { key: 'dates', header: t('columns.dates'), cell: dates },
              { key: 'matches', header: t('columns.matches'), numeric: true, cell: (row) => formatNumber(row.matchCount, locale) },
              {
                key: 'publication',
                header: t('columns.publication'),
                cell: (row) => <StatusBadge kind={PUBLICATION_KIND[row.publication]}>{tc(`publication.${row.publication}`)}</StatusBadge>,
              },
              {
                key: 'description',
                header: t('columns.description'),
                cell: (row) => (
                  <span className={styles.cellStack}>
                    <span className={`${styles.cellMuted} ${styles.nowrap}`}>CS · {tc(`proseStatus.${row.description.cs}`)}</span>
                    <span className={`${styles.cellMuted} ${styles.nowrap}`}>EN · {tc(`proseStatus.${row.description.en}`)}</span>
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
          <Pagination page={result.page} pageCount={result.pageCount} hrefForPage={(value) => queryHref(PATH, { ...filters, page: value > 1 ? value : undefined })} />
        </>
      ) : null}
    </div>
  );
}
