import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { GameSwitchNotice } from '@/components/games/switch-notice';
import { LeagueFixtures } from '@/components/public/league-fixtures';
import { MatchesScreen } from '@/components/public/matches-screen';
import { bilingualAlternates, OG_LOCALE } from '@/components/public/metadata';
import { hasMatchFilters, parseMatchFilters } from '@/components/public/query';
import { PageMain } from '@/components/shell/page-main';
import { PageHeader } from '@/components/ui/panels';
import { routing } from '@/i18n/routing';
import { gameHasSection, isGameRoute } from '@/modules/games/registry';
import { sectionBase } from '@/modules/games/routes';
import { getLeagueFixtures } from '@/modules/integrations/logi/readers/fixtures';
import { sharingMetadata } from '@/modules/social/metadata';

export async function generateMetadata({ params, searchParams }: PageProps<'/[locale]/[game]/matches'>): Promise<Metadata> {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game)) return {};
  const filters = parseMatchFilters(await searchParams);
  const [t, games] = await Promise.all([getTranslations({ locale, namespace: 'matches.meta' }), getTranslations({ locale, namespace: 'games' })]);
  const title = games('sectionTitle', { section: t('title'), game: games(`names.${game}`) });
  const sharing = sharingMetadata(locale, 'matches', undefined, undefined, title, t('description'), game);
  return {
    title,
    description: t('description'),
    alternates: bilingualAlternates(locale, `${sectionBase(game)}/matches`),
    openGraph: { type: 'website', title, description: t('description'), url: `/${locale}${sectionBase(game)}/matches`, locale: OG_LOCALE[locale], images: sharing.images },
    twitter: sharing.twitter,
    ...(hasMatchFilters(filters) ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Game fixtures/results: Upcoming vs Results and search in the URL; the game is fixed. */
export default async function GameMatchesPage({ params, searchParams }: PageProps<'/[locale]/[game]/matches'>) {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game) || !gameHasSection(game, 'matches')) notFound();
  setRequestLocale(locale);
  const query = await searchParams;
  const filters = parseMatchFilters(query);
  const [t, games] = await Promise.all([
    getTranslations({ locale, namespace: 'matches.list' }),
    getTranslations({ locale, namespace: 'games' }),
  ]);
  // Tracked Wardogs League fixtures (unverified, read on demand) follow the unfiltered
  // Upcoming list of the Wardogs section only; `null` means the reader is not configured.
  const leagueFixtures = game === 'wardogs' && filters.view === 'upcoming' && !hasMatchFilters(filters) && filters.page === 1 ? await getLeagueFixtures() : null;
  return (
    <PageMain width="full" labelledBy="matches-title">
      <PageHeader
        breadcrumbs={[{ href: sectionBase(game), label: games(`menuLabel.${game}`) }, { label: t('title') }]}
        eyebrow={games(`eyebrow.${game}`)}
        title={t('title')}
        titleId="matches-title"
        description={<p>{games('matchesIntro', { game: games(`names.${game}`) })}</p>}
      />
      <GameSwitchNotice locale={locale} game={game} query={query} />
      <MatchesScreen locale={locale} filters={filters} mode="list" game={game} />
      {leagueFixtures ? <LeagueFixtures fixtures={leagueFixtures} locale={locale} /> : null}
    </PageMain>
  );
}
