import { GAMES, PUBLIC_ROLE_KEYS } from '@valkyria/db';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { GameSwitchNotice } from '@/components/games/switch-notice';
import { ListLoadError } from '@/components/public/list-load-error';
import { MemberAvatar } from '@/components/public/member-avatar';
import styles from '@/components/public/members.module.css';
import { bilingualAlternates } from '@/components/public/metadata';
import { buildHref, hasMemberFilters, membersListHref, parseMemberFilters, type MemberFilters, type RawSearchParams } from '@/components/public/query';
import { TagList } from '@/components/public/tags';
import { PageMain } from '@/components/shell/page-main';
import { EmptyState, FilterBar, GameButton, PageHeader, Pagination, SelectionTable, type FilterGroup, type SelectionColumn } from '@/components/ui';
import { formatNumber } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { GAME_REGISTRY, type GameRoute } from '@/modules/games/registry';
import { sectionBase } from '@/modules/games/routes';
import { listPublicMembers } from '@/modules/members/queries';
import type { PublicMember } from '@/modules/members/types';
import emblem from '../../../public/brand/valkyria-emblem-733.webp';

const PAGE_SIZE = 24;

export async function membersListMetadata(locale: AppLocale, query: RawSearchParams | undefined, game: GameRoute | null): Promise<Metadata> {
  const filters = parseMemberFilters(query);
  const [t, games] = await Promise.all([getTranslations({ locale, namespace: 'members.meta' }), getTranslations({ locale, namespace: 'games' })]);
  return {
    title: game ? games('sectionTitle', { section: t('title'), game: games(`names.${game}`) }) : t('title'),
    description: t('description'),
    alternates: bilingualAlternates(locale, `${sectionBase(game)}/members`),
    ...(hasMemberFilters(filters) ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Profile URL that carries the directory filters so "back" restores them. */
function profileHref(slug: string, filters: MemberFilters, base: string): string {
  return buildHref(`${base}/members/${slug}`, [
    ['game', filters.game],
    ['role', filters.role],
    ['q', filters.q],
    ['page', filters.page],
  ]);
}

/**
 * Public member directory (published + consented profiles), reference-12 roster. A game
 * section lists only members with that explicit public affiliation; hidden or
 * non-consenting members are absent from rows and counts in every scope.
 */
export async function MembersListScreen({ locale, query, game }: { locale: AppLocale; query: RawSearchParams | undefined; game: GameRoute | null }) {
  const base = sectionBase(game);
  const filters = parseMemberFilters(query);
  if (game) filters.game = undefined;
  const effectiveGame = game ? GAME_REGISTRY[game].db : filters.game;
  const [t, games] = await Promise.all([getTranslations({ locale, namespace: 'members' }), getTranslations({ locale, namespace: 'games' })]);
  const href = (next: Partial<MemberFilters>) => membersListHref(next, base);
  const list = await listPublicMembers(getDb(), { game: effectiveGame, role: filters.role, q: filters.q, page: filters.page, pageSize: PAGE_SIZE }).catch(
    (error: unknown) => {
      console.error('[members] list query failed', error instanceof Error ? error.name : 'unknown');
      return null;
    },
  );
  const filtered = hasMemberFilters(filters);

  const filterGroups: FilterGroup[] = [
    ...(game
      ? []
      : [
          {
            name: 'game',
            label: t('list.gameGroup'),
            options: [
              { value: 'all', label: t('list.allGames'), href: href({ ...filters, game: undefined, page: 1 }), current: !filters.game },
              ...GAMES.map((value) => ({ value, label: t(`games.${value}`), href: href({ ...filters, game: value, page: 1 }), current: filters.game === value })),
            ],
          },
        ]),
    {
      name: 'role',
      label: t('list.roleGroup'),
      options: [
        { value: 'all', label: t('list.allRoles'), href: href({ ...filters, role: undefined, page: 1 }), current: !filters.role },
        ...PUBLIC_ROLE_KEYS.map((role) => ({ value: role, label: t(`roles.${role}`), href: href({ ...filters, role, page: 1 }), current: filters.role === role })),
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
        breadcrumbs={[{ href: base || '/', label: game ? games(`menuLabel.${game}`) : t('list.breadcrumbHome') }, { label: t('list.title') }]}
        eyebrow={game ? games(`eyebrow.${game}`) : t('list.eyebrow')}
        title={t('list.title')}
        titleId="members-title"
        description={<p>{game ? games('membersIntro', { game: games(`names.${game}`) }) : t('list.intro')}</p>}
      />
      {game ? <GameSwitchNotice locale={locale} game={game} query={query} /> : null}
      {list === null ? (
        <ListLoadError message={t('list.loadError')} retryLabel={t('list.retry')} retryHref={href(filters)} />
      ) : (
        <>
          {list.total > 0 || filtered ? (
            <FilterBar
              action={`${base}/members`}
              searchLabel={t('list.searchLabel')}
              searchValue={filters.q}
              searchPlaceholder={t('list.searchPlaceholder')}
              hiddenParams={hiddenParams}
              filters={filterGroups}
              resetHref={filtered ? `${base}/members` : null}
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
                  getRowHref={(member) => profileHref(member.slug, filters, base)}
                  linkColumn="member"
                />
              </div>
            </section>
          ) : list.total > 0 ? (
            <EmptyState
              title={t('list.pageEmptyTitle')}
              action={
                <GameButton href={href({ ...filters, page: 1 })} intent="secondary">
                  {t('list.firstPage')}
                </GameButton>
              }
            />
          ) : filtered ? (
            <EmptyState
              title={t('list.filteredEmptyTitle')}
              action={
                <GameButton href={`${base}/members`} intent="secondary" data-clear-filters="">
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
          <Pagination page={list.page} pageCount={list.pageCount} hrefForPage={(page) => href({ ...filters, page })} />
        </>
      )}
    </PageMain>
  );
}
