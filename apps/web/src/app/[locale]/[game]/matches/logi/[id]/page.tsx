import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { LogiMatches } from '@/components/public/logi-matches';
import { PageMain } from '@/components/shell/page-main';
import { PageHeader } from '@/components/ui';
import { routing } from '@/i18n/routing';
import { GAME_REGISTRY, isGameRoute } from '@/modules/games/registry';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { readPublicLogiEventPeople } from '@/modules/integrations/logi-people';
import { PublicLogiMatchPeople } from '@/components/public/logi-people';
import { getPublicLogiEvents } from '@/modules/integrations/logi-public';
import { linkedPublicLogiMatch, logiEventHref } from '@/modules/integrations/logi/public-matches';
import { canonicalMatchPath } from '@/modules/games/routes';

export const dynamic = 'force-dynamic';
export default async function ConnectedMatchPage({ params }: { params: Promise<{ locale: string; game: string; id: string }> }) {
  const { locale, game, id } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game)) notFound();
  setRequestLocale(locale);
  const events = await getPublicLogiEvents(game);
  const selected = events.find((row) => row.ref.externalId === id || row.aliases?.includes(id));
  if (!selected) notFound();
  if (selected.archive && linkedPublicLogiMatch(events, { slug: selected.archive.slug, game: GAME_REGISTRY[game].db }) === selected) {
    redirect(`/${locale}${canonicalMatchPath(GAME_REGISTRY[game].db, selected.archive.slug)}`);
  }
  // This temporary redirect is valid only while both public records still agree.
  if (selected.ref.externalId !== id) redirect(`/${locale}${logiEventHref(selected)}`);
  const people = await readPublicLogiEventPeople(getDb(), getServerEnv(), GAME_REGISTRY[game].db, id);
  return <PageMain width="full" labelledBy="logi-match-title"><PageHeader title={selected.title} titleId="logi-match-title" /><LogiMatches locale={locale} events={events} selected={selected} /><PublicLogiMatchPeople locale={locale} people={people} /></PageMain>;
}
