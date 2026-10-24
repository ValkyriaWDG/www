import { GAMES, PUBLIC_ROLE_KEYS } from '@valkyria/db';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';
import { GameSwitchNotice } from '@/components/games/switch-notice';
import { ListLoadError } from '@/components/public/list-load-error';
import { MemberAvatar } from '@/components/public/member-avatar';
import { PublicPlayerDirectoryNotice } from '@/components/public/public-player-directory-notice';
import styles from '@/components/public/members.module.css';
import { bilingualAlternates } from '@/components/public/metadata';
import { buildHref, hasMemberFilters, membersListHref, parseMemberFilters, type MemberFilters, type RawSearchParams } from '@/components/public/query';
import { TagList } from '@/components/public/tags';
import { PageMain } from '@/components/shell/page-main';
import { EmptyState, FilterBar, GameButton, PageHeader, Pagination, SelectionTable, type FilterGroup, type SelectionColumn } from '@/components/ui';
import { formatNumber } from '@/i18n/date-format';
import type { AppLocale } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { GAME_REGISTRY, type GameRoute } from '@/modules/games/registry';
import { sectionBase } from '@/modules/games/routes';
import { listPublicPlayerDirectory, type PublicPlayerDirectoryRow } from '@/modules/members/public-directory';
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
 * One directory of approved personal profiles and owner-published supplied gaming
 * names. A game section requires that public affiliation; exact editorial withdrawals
 * still suppress the corresponding source player before filtering and counting.
 */
export async function MembersListScreen({ locale, query, game }: { locale: AppLocale; query: RawSearchParams | undefined; game: GameRoute | null }) {
  const base = sectionBase(game);
  const filters = parseMemberFilters(query);
  if (game) filters.game = undefined;
  const effectiveGame = game ? GAME_REGISTRY[game].db : filters.game;
  const [t, games] = await Promise.all([getTranslations({ locale, namespace: 'members' }), getTranslations({ locale, namespace: 'games' })]);
  const href = (next: Partial<MemberFilters>) => membersListHref(next, base);
  const list = await listPublicPlayerDirectory(getDb(), getServerEnv(), { game: effectiveGame, role: filters.role, q: filters.q, page: filters.page, pageSize: PAGE_SIZE }).catch(
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

  const columns: SelectionColumn<PublicPlayerDirectoryRow>[] = [
    {
      key: 'member',
      header: t('list.columns.member'),
      rowHeader: true,
      cell: (member) => (
        <span className={styles.memberCell}>
          <MemberAvatar avatar={member.avatar} name={member.displayName ?? t('player.unknownName')} size="sm" />
          <span className={styles.memberName} data-member-name="">
            {member.displayName ?? t('player.unknownName')}
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
    {
      key: 'matches',
      header: t('list.columns.matches'),
      cell: (member) => {
        const matches = member.matches
          .sort((left, right) => Date.parse(right.startsAt ?? '1970-01-01') - Date.parse(left.startsAt ?? '1970-01-01') || left.title.localeCompare(right.title));
        return matches.length ? (
          <div className={styles.matchActivity}>
            <span>{t('list.matchCount', { count: matches.length })}</span>
            {matches.slice(0, 2).map((match) => <Link key={match.href} href={match.href}>{match.title}</Link>)}
            {matches.length > 2 ? <span>{t('list.moreMatches', { count: matches.length - 2 })}</span> : null}
          </div>
        ) : <span>{t('list.noPublicMatches')}</span>;
      },
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
          <PublicPlayerDirectoryNotice locale={locale} availability={list.availability} retryHref={href(filters)} />
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
                  getRowKey={(member) => member.key}
                  getRowHref={(member) => member.profileSlug ? profileHref(member.profileSlug, filters, base) : buildHref(`${base}${member.href}`, [['game', filters.game], ['q', filters.q], ['page', filters.page]])}
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
          ) : list.availability.state === 'partial' || list.availability.state === 'unavailable' ? null : filtered ? (
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
