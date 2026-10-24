import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { MatchesScreen } from '@/components/public/matches-screen';
import { PageMain } from '@/components/shell/page-main';
import { PageHeader } from '@/components/ui';
import { routing } from '@/i18n/routing';
import { GAME_REGISTRY, isGameRoute } from '@/modules/games/registry';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { readPublicLogiEventPeople } from '@/modules/integrations/logi-people';
import { readPublicLogiPlayerMatchPeople } from '@/modules/integrations/logi-public-players';
import { PublicLogiMatchPeople } from '@/components/public/logi-people';
import { getPublicLogiEvents } from '@/modules/integrations/logi-public';
import { logiEventHref, publicLogiMatchView } from '@/modules/integrations/logi/public-matches';
import { operationalMatchIdentity } from '@/modules/matches/operational-presentation';

export const dynamic = 'force-dynamic';
export default async function ConnectedMatchPage({ params }: { params: Promise<{ locale: string; game: string; id: string }> }) {
  const { locale, game, id } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game)) notFound();
  setRequestLocale(locale);
  const events = await getPublicLogiEvents(game);
  const selected = events.find((row) => row.ref.externalId === id || row.aliases?.includes(id));
  if (!selected) notFound();
  // This temporary redirect is valid only while both public records still agree.
  if (selected.ref.externalId !== id || selected.archive) redirect(`/${locale}${logiEventHref(selected)}`);
  const people = await readPublicLogiEventPeople(getDb(), getServerEnv(), GAME_REGISTRY[game].db, id);
  const sourcePeople = await readPublicLogiPlayerMatchPeople(getDb(), getServerEnv(), GAME_REGISTRY[game].db, id);
  const t = await getTranslations({ locale, namespace: 'matches' });
  const view = publicLogiMatchView(selected);
  return <PageMain width="full" labelledBy="match-title">
    <PageHeader back={{ href: `/${game}/matches${view === 'results' ? '?view=results' : ''}`, label: t('detail.back') }} eyebrow={`${t('detail.eyebrow')} // ${t(`games.${GAME_REGISTRY[game].db}`)}`} title={operationalMatchIdentity(selected).title} titleId="match-title" />
    <MatchesScreen locale={locale} filters={{ view, page: 1 }} mode="detail" selectedEvent={selected} game={game} />
    <PublicLogiMatchPeople locale={locale} people={people} sourcePeople={sourcePeople} />
  </PageMain>;
}
