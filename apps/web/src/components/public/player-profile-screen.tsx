import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { PageMain } from '@/components/shell/page-main';
import { FeedbackNotice, GameButton, PageHeader, SectionFrame } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { GAME_REGISTRY, type GameRoute } from '@/modules/games/registry';
import { sectionBase } from '@/modules/games/routes';
import { readPublicLogiPlayerDirectory, type PublicPlayerDirectory } from '@/modules/integrations/logi-public-players';
import { readPublicPlayerStatistics } from '@/modules/integrations/logi-public-player-statistics';
import { bilingualAlternates } from './metadata';
import { LogiPlayerStatistics } from './logi-people';
import { PlayerRecordedStatistics } from './player-recorded-statistics';
import { buildHref, membersListHref, parseMemberFilters, type RawSearchParams } from './query';
import { TagList } from './tags';
import styles from './members.module.css';

const loadPlayer = cache(async (key: string, game: GameRoute | null) => /^[a-f0-9]{64}$/.test(key)
  ? readPublicLogiPlayerDirectory(getDb(), getServerEnv(), { game: game ? GAME_REGISTRY[game].db : undefined }) : null);

const temporarilyUnavailable = (directory: PublicPlayerDirectory | null) => Boolean(directory?.availability.enabledGames.length
  && (directory.availability.state === 'unavailable' || directory.availability.state === 'partial'));

async function PlayerUnavailable({ locale, playerKey, game, query }: { locale: AppLocale; playerKey: string; game: GameRoute | null; query?: RawSearchParams }) {
  const t = await getTranslations({ locale, namespace: 'members' });
  const filters = parseMemberFilters(query);
  if (game) filters.game = undefined;
  const base = sectionBase(game);
  const retryHref = buildHref(`${base}/players/${playerKey}`, [['game', filters.game], ['role', filters.role], ['q', filters.q], ['page', filters.page]]);
  return <PageMain width="reading" labelledBy="player-title">
    <meta name="robots" content="noindex, follow" />
    <PageHeader title={t('player.title')} titleId="player-title" back={{ href: membersListHref(filters, base), label: t('profile.back') }} />
    <div data-public-player-unavailable="">
      <FeedbackNotice kind="warning" title={t('player.unavailableTitle')}
        action={<GameButton href={retryHref} intent="secondary">{t('list.retry')}</GameButton>}>
        <p>{t('player.unavailableBody')}</p>
      </FeedbackNotice>
    </div>
  </PageMain>;
}

export async function playerProfileMetadata(locale: AppLocale, key: string, game: GameRoute | null): Promise<Metadata> {
  const directory = await loadPlayer(key, game);
  const player = directory?.players.find((row) => row.key === key);
  const t = await getTranslations({ locale, namespace: 'members' });
  if (!player) return temporarilyUnavailable(directory) ? { title: t('player.unavailableTitle'), robots: { index: false, follow: true } } : {};
  // Metadata may finish before the late page publication fence. A generic title
  // prevents an earlier supplied name surviving in HTML after an outage/withdrawal.
  return { title: t('player.title'), description: t('player.description'), alternates: bilingualAlternates(locale, `/players/${key}`) };
}

export async function PlayerProfileScreen({ locale, playerKey, game, query }: { locale: AppLocale; playerKey: string; game: GameRoute | null; query?: RawSearchParams }) {
  const initialDirectory = await loadPlayer(playerKey, game);
  const initial = initialDirectory?.players.find((row) => row.key === playerKey);
  if (!initial) {
    if (temporarilyUnavailable(initialDirectory)) return PlayerUnavailable({ locale, playerKey, game, query });
    notFound();
  }
  if (initial.profileSlug) redirect(`/${locale}${initial.href}`);
  const [recorded, t, people] = await Promise.all([
    readPublicPlayerStatistics(getDb(), getServerEnv(), initial.key, { game: game ? GAME_REGISTRY[game].db : undefined }),
    getTranslations({ locale, namespace: 'members' }), getTranslations({ locale, namespace: 'logiPeople' }),
  ]);
  // Optional statistics introduce another I/O boundary after the initial page lookup.
  // Re-resolve outside React's request cache so a withdrawal, expiry or changed native
  // identity during that request cannot leave the earlier name or lineup on the page.
  const finalDirectory = await readPublicLogiPlayerDirectory(getDb(), getServerEnv(), { game: game ? GAME_REGISTRY[game].db : undefined });
  const player = finalDirectory.players.find((row) => row.key === playerKey);
  if (!player) {
    if (temporarilyUnavailable(finalDirectory)) return PlayerUnavailable({ locale, playerKey, game, query });
    notFound();
  }
  if (player.profileSlug) redirect(`/${locale}${player.href}`);
  const filters = parseMemberFilters(query);
  if (game) filters.game = undefined;
  return <PageMain width="reading" labelledBy="player-title">
    <PageHeader title={player.displayName ?? t('player.unknownName')} titleId="player-title" eyebrow={t('player.title')}
      back={{ href: membersListHref(filters, sectionBase(game)), label: t('profile.back') }} description={<p>{t('player.description')}</p>} />
    <section className={styles.profile} data-public-player-profile="" aria-label={t('player.title')}>
      <TagList label={t('profile.gamesLabel')} items={player.games.map((game) => ({ key: game, label: t(`games.${game}`), tone: 'game' as const }))} />
    </section>
    {player.activity.map((activity) => <SectionFrame key={activity.game} title={t(`games.${activity.game}`)} titleId={`player-${activity.game}`}>
      <p><time dateTime={activity.observedAt}>{people('updated', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Prague' }).format(new Date(activity.observedAt)) })}</time></p>
      <h3>{t('list.columns.matches')}</h3>
      {activity.rosters.length ? <ul>{activity.rosters.map((row, index) => <li key={`${row.href}:${index}`}>
        <Link href={row.href}>{row.title}</Link>{' · '}{row.reserve ? people('reserves') : row.squad ?? people('unknown')}{row.slot === null ? '' : ` · ${people('position')} ${row.slot + 1}`}
      </li>)}</ul> : <p>{t('list.noPublicMatches')}</p>}
      <h3>{t('player.statisticsTitle')}</h3>
      {recorded.find((row) => row.game === activity.game) ? <PlayerRecordedStatistics locale={locale} stats={recorded.find((row) => row.game === activity.game)!} /> : activity.statistics ? <LogiPlayerStatistics locale={locale} stats={activity.statistics} /> : <p>{t('player.statisticsMissing')}</p>}
    </SectionFrame>)}
  </PageMain>;
}
