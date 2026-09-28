import { PROFILE_STATES } from '@valkyria/db/schema';
import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { formatDate } from '@/components/admin-community/format';
import { pickEnum, pickPage, pickParam, queryHref, type SearchParams } from '@/components/admin-community/list-query';
import { PROFILE_STATE_KIND } from '@/components/admin-community/status';
import styles from '@/components/admin-community/admin-community.module.css';
import { FilterForm } from '@/components/admin-community/filter-form';
import { EmptyState, FeedbackNotice, GameButton, PageHeader, Pagination, SelectionTable, StatusBadge } from '@/components/ui';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { requireAdminPage } from '@/modules/auth/admin-guard';
import { listMembersForAdmin } from '@/modules/members/queries';
import type { AdminMemberListItem, AdminMemberPage } from '@/modules/members/types';

export const dynamic = 'force-dynamic';

const PATH = '/admin/members';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/members'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminCommunity.members.list' });
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/** Public member profiles: state filter, search, consent and biography availability. */
export default async function AdminMembersPage({ params, searchParams }: PageProps<'/[locale]/admin/members'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: PATH, capability: 'members.edit' });
  if (!access.ok) return access.denied;

  const t = await getTranslations({ locale, namespace: 'adminCommunity.members.list' });
  const tc = await getTranslations({ locale, namespace: 'adminCommunity.common' });
  const sp = (await searchParams) as SearchParams;
  const filters = { q: pickParam(sp, 'q'), state: pickEnum(sp, 'state', PROFILE_STATES) };
  const page = pickPage(sp);

  let result: AdminMemberPage | null = null;
  let loadFailed = false;
  try {
    result = await listMembersForAdmin(getDb(), access.principal, { ...filters, page, pageSize: 20 });
  } catch (error) {
    console.error(`[admin.members] list failed: ${error instanceof Error ? error.name : 'unknown'}`);
    loadFailed = true;
  }

  const anyFilter = Boolean(filters.q || filters.state);

  return (
    <div className={styles.page} data-admin-members="">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={
          <GameButton href="/admin/members/new" intent="primary" size="lg" data-action="new-member">
            {t('newMember')}
          </GameButton>
        }
      />
      <FilterForm
        action={PATH}
        label={t('filters.label')}
        search={{ label: t('searchLabel'), placeholder: t('searchPlaceholder'), value: filters.q }}
        selects={[{ name: 'state', label: t('filters.state'), value: filters.state, options: PROFILE_STATES.map((state) => ({ value: state, label: tc(`profileState.${state}`) })) }]}
        clearHref={anyFilter ? PATH : null}
        summary={result ? t('count', { count: result.total }) : undefined}
      />
      {loadFailed ? (
        <FeedbackNotice kind="error" title={tc('loadErrorTitle')}>
          {tc('loadErrorBody')}
        </FeedbackNotice>
      ) : null}
      {result && result.items.length === 0 ? (
        <EmptyState title={anyFilter ? t('filteredEmptyTitle') : t('emptyTitle')} action={anyFilter ? <GameButton href={PATH}>{tc('clearFilters')}</GameButton> : undefined}>
          <p>{anyFilter ? t('filteredEmptyBody') : t('emptyBody')}</p>
        </EmptyState>
      ) : null}
      {result && result.items.length > 0 ? (
        <>
          <SelectionTable<AdminMemberListItem>
            caption={t('caption')}
            captionHidden
            rows={result.items}
            getRowKey={(row) => row.id}
            getRowHref={(row) => `/admin/members/${row.id}`}
            linkColumn="name"
            columns={[
              {
                key: 'name',
                header: t('columns.name'),
                rowHeader: true,
                cell: (row) => (
                  <span className={styles.cellStack}>
                    <span data-member-row={row.slug}>{row.displayName}</span>
                    <span className={`${styles.cellMuted} ${styles.code}`}>{row.slug}</span>
                    <span className="visually-hidden">{t('editRow')}</span>
                  </span>
                ),
              },
              { key: 'state', header: t('columns.state'), cell: (row) => <StatusBadge kind={PROFILE_STATE_KIND[row.state]}>{tc(`profileState.${row.state}`)}</StatusBadge> },
              {
                key: 'consent',
                header: t('columns.consent'),
                cell: (row) =>
                  row.consentConfirmedAt ? (
                    <StatusBadge kind="success">{t('consentOn', { date: formatDate(row.consentConfirmedAt, locale, 'dateShort') })}</StatusBadge>
                  ) : (
                    <StatusBadge kind="warning">{t('consentMissing')}</StatusBadge>
                  ),
              },
              { key: 'games', header: t('columns.games'), cell: (row) => (row.games.length ? row.games.map((game) => tc(`game.${game}`)).join(', ') : '—') },
              { key: 'roles', header: t('columns.roles'), cell: (row) => (row.publicRoleKeys.length ? row.publicRoleKeys.map((role) => tc(`roles.${role}`)).join(', ') : '—') },
              {
                key: 'bio',
                header: t('columns.biography'),
                cell: (row) => (
                  <span className={styles.cellStack}>
                    <span className={`${styles.cellMuted} ${styles.nowrap}`}>CS · {tc(`proseStatus.${row.biography.cs}`)}</span>
                    <span className={`${styles.cellMuted} ${styles.nowrap}`}>EN · {tc(`proseStatus.${row.biography.en}`)}</span>
                  </span>
                ),
              },
              { key: 'order', header: t('columns.order'), cell: (row) => row.sortOrder, numeric: true, align: 'end' },
              {
                key: 'edit',
                header: <span className="visually-hidden">{t('columns.actions')}</span>,
                align: 'end',
                cell: () => (
                  <span className={styles.editHint} aria-hidden="true">
                    {t('edit')} ›
                  </span>
                ),
              },
            ]}
          />
          <Pagination page={result.page} pageCount={result.pageCount} hrefForPage={(value) => queryHref(PATH, { ...filters, page: value > 1 ? value : undefined })} />
        </>
      ) : null}
    </div>
  );
}
