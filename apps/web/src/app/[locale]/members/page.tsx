import { GAMES, PUBLIC_ROLE_KEYS } from '@valkyria/db';
import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ListLoadError } from '@/components/public/list-load-error';
import { MemberAvatar } from '@/components/public/member-avatar';
import styles from '@/components/public/members.module.css';
import { bilingualAlternates } from '@/components/public/metadata';
import { buildHref, hasMemberFilters, membersListHref, parseMemberFilters, type MemberFilters } from '@/components/public/query';
import { TagList } from '@/components/public/tags';
import { PageMain } from '@/components/shell/page-main';
import { EmptyState, FilterBar, GameButton, PageHeader, Pagination, SelectionTable, type FilterGroup, type SelectionColumn } from '@/components/ui';
import { formatNumber } from '@/i18n/date-format';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { listPublicMembers } from '@/modules/members/queries';
import type { PublicMember } from '@/modules/members/types';
import emblem from '../../../../public/brand/valkyria-emblem-733.webp';

const PAGE_SIZE = 24;

export async function generateMetadata({ params, searchParams }: PageProps<'/[locale]/members'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const filters = parseMemberFilters(await searchParams);
  const t = await getTranslations({ locale, namespace: 'members.meta' });
  return {
    title: t('title'),
    description: t('description'),
    alternates: bilingualAlternates(locale, '/members'),
    ...(hasMemberFilters(filters) ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Profile URL that carries the directory filters so "back" restores them. */
function profileHref(slug: string, filters: MemberFilters): string {
  return buildHref(`/members/${slug}`, [
    ['game', filters.game],
    ['role', filters.role],
    ['q', filters.q],
    ['page', filters.page],
  ]);
}

/** Public member directory (published + consented profiles), reference-12 roster. */
export default async function MembersPage({ params, searchParams }: PageProps<'/[locale]/members'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const filters = parseMemberFilters(await searchParams);
  const t = await getTranslations({ locale, namespace: 'members' });
  const list = await listPublicMembers(getDb(), { game: filters.game, role: filters.role, q: filters.q, page: filters.page, pageSize: PAGE_SIZE }).catch(
    (error: unknown) => {
      console.error('[members] list query failed', error instanceof Error ? error.name : 'unknown');
      return null;
    },
  );
  const filtered = hasMemberFilters(filters);

  const filterGroups: FilterGroup[] = [
    {
      name: 'game',
      label: t('list.gameGroup'),
      options: [
        { value: 'all', label: t('list.all'), href: membersListHref({ ...filters, game: undefined, page: 1 }), current: !filters.game },
        ...GAMES.map((game) => ({ value: game, label: t(`games.${game}`), href: membersListHref({ ...filters, game, page: 1 }), current: filters.game === game })),
      ],
    },
    {
      name: 'role',
      label: t('list.roleGroup'),
      options: [
        { value: 'all', label: t('list.all'), href: membersListHref({ ...filters, role: undefined, page: 1 }), current: !filters.role },
        ...PUBLIC_ROLE_KEYS.map((role) => ({ value: role, label: t(`roles.${role}`), href: membersListHref({ ...filters, role, page: 1 }), current: filters.role === role })),
      ],
    },
  ];
  const hiddenParams: Record<string, string> = {};
  if (filters.game) hiddenParams.game = filters.game;
  if (filters.role) hiddenParams.role = filters.role;

  const columns: SelectionColumn<PublicMember>[] = [
    {
      key: 'member',
      header: t('list.columns.member'),
      rowHeader: true,
      cell: (member) => (
        <span className={styles.memberCell}>
          <MemberAvatar avatar={member.avatar} name={member.displayName} size="sm" />
          <span className={styles.memberName} data-member-name="">
            {member.displayName}
          </span>
        </span>
      ),
    },
    {
      key: 'roles',
      header: t('list.columns.roles'),
      cell: (member) =>
        member.publicRoleKeys.length > 0 ? (
          <TagList label={t('profile.rolesLabel')} items={member.publicRoleKeys.map((role) => ({ key: role, label: t(`roles.${role}`) }))} />
        ) : (
          <span className="visually-hidden">{t('list.noRoles')}</span>
        ),
    },
    {
      key: 'games',
      header: t('list.columns.games'),
      cell: (member) =>
        member.games.length > 0 ? (
          <TagList label={t('profile.gamesLabel')} items={member.games.map((game) => ({ key: game, label: t(`games.${game}`), tone: 'game' as const }))} />
        ) : (
          <span className="visually-hidden">{t('list.noGames')}</span>
        ),
    },
  ];

  return (
    <PageMain labelledBy="members-title">
      <PageHeader
        breadcrumbs={[{ href: '/', label: t('list.breadcrumbHome') }, { label: t('list.title') }]}
        eyebrow={t('list.eyebrow')}
        title={t('list.title')}
        titleId="members-title"
        description={<p>{t('list.intro')}</p>}
      />
      {list === null ? (
        <ListLoadError message={t('list.loadError')} retryLabel={t('list.retry')} retryHref={membersListHref(filters)} />
      ) : (
        <>
          {list.total > 0 || filtered ? (
            <FilterBar
              action="/members"
              searchLabel={t('list.searchLabel')}
              searchValue={filters.q}
              searchPlaceholder={t('list.searchPlaceholder')}
              hiddenParams={hiddenParams}
              filters={filterGroups}
              resetHref={filtered ? '/members' : null}
              resultSummary={t('list.rosterCount', { count: list.total })}
            />
          ) : null}
          {list.items.length > 0 ? (
            <section className={styles.roster} aria-labelledby="roster-title" data-member-roster="">
              <div className={styles.rosterHead}>
                <span className={styles.rosterMark} aria-hidden="true">
                  <Image src={emblem} alt="" sizes="52px" />
                </span>
                <h2 id="roster-title" className={styles.rosterTitle}>
                  {t('list.rosterTitle')}
                </h2>
                <p className={styles.count}>
                  <span className={styles.countLabel}>{t('list.countLabel')}</span>
                  <span className={styles.countValue}>{formatNumber(list.total, locale)}</span>
                </p>
              </div>
              <div className={styles.table}>
                <SelectionTable
                  caption={t('list.caption')}
                  captionHidden
                  columns={columns}
                  rows={list.items}
                  getRowKey={(member) => member.slug}
                  getRowHref={(member) => profileHref(member.slug, filters)}
                  linkColumn="member"
                />
              </div>
            </section>
          ) : list.total > 0 ? (
            <EmptyState
              title={t('list.pageEmptyTitle')}
              action={
                <GameButton href={membersListHref({ ...filters, page: 1 })} intent="secondary">
                  {t('list.firstPage')}
                </GameButton>
              }
            />
          ) : filtered ? (
            <EmptyState
              title={t('list.filteredEmptyTitle')}
              action={
                <GameButton href="/members" intent="secondary" data-clear-filters="">
                  {t('list.clearFilters')}
                </GameButton>
              }
            >
              <p>{t('list.filteredEmptyBody')}</p>
            </EmptyState>
          ) : (
            <EmptyState title={t('list.emptyTitle')}>
              <p>{t('list.emptyBody')}</p>
            </EmptyState>
          )}
          <Pagination page={list.page} pageCount={list.pageCount} hrefForPage={(page) => membersListHref({ ...filters, page })} />
        </>
      )}
    </PageMain>
  );
}
