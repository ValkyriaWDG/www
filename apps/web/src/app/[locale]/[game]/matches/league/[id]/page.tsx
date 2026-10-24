import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { MatchesScreen } from '@/components/public/matches-screen';
import { leagueMatchTitle } from '@/components/public/league-match-parts';
import { PageMain } from '@/components/shell/page-main';
import { PageHeader } from '@/components/ui';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getPublicLogiEvents } from '@/modules/integrations/logi-public';
import { logiEventHref } from '@/modules/integrations/logi/public-matches';
import { getLeagueFixtures } from '@/modules/integrations/logi/readers/fixtures';
import { leagueBrowserRows } from '@/modules/matches/league-browser';
import { mapPublishedLeagueMatchSlugs } from '@/modules/matches/queries';

export const dynamic = 'force-dynamic';

/** Only the already-public, configured tracked collection can resolve a League detail. */
export default async function LeagueMatchPage({ params }: { params: Promise<{ locale: string; game: string; id: string }> }) {
  const { locale, game, id } = await params;
  if (!hasLocale(routing.locales, locale) || game !== 'wardogs') notFound();
  setRequestLocale(locale);
  const [fixtures, events] = await Promise.all([getLeagueFixtures(), getPublicLogiEvents('wardogs')]);
  const fixture = fixtures?.items.find((item) => item.id === id);
  if (!fixture || fixture.tracking !== 'tracked') notFound();
  if (fixture.eventId) {
    const event = events.find((item) => item.ref.externalId === fixture.eventId || item.aliases?.includes(fixture.eventId!));
    if (!event) notFound();
    redirect(`/${locale}${logiEventHref(event)}`);
  }
  const published = await mapPublishedLeagueMatchSlugs(getDb(), [id]);
  if (published.has(id)) redirect(`/${locale}/wardogs/matches/${encodeURIComponent(published.get(id)!)}`);
  const now = new Date();
  const view = leagueBrowserRows(fixtures, events, new Set(), { view: 'results', now }).some((item) => item.fixture.id === id) ? 'results' : 'upcoming';
  if (!leagueBrowserRows(fixtures, events, new Set(), { view, now }).some((item) => item.fixture.id === id)) notFound();
  const t = await getTranslations({ locale, namespace: 'matches' });
  return <PageMain width="full" labelledBy="match-title">
    <PageHeader back={{ href: `/wardogs/matches${view === 'results' ? '?view=results' : ''}`, label: t('detail.back') }} eyebrow="Wardogs League" title={leagueMatchTitle(fixture)} titleId="match-title" />
    <MatchesScreen locale={locale} filters={{ view, page: 1 }} mode="detail" selectedFixture={fixture} game="wardogs" />
  </PageMain>;
}
