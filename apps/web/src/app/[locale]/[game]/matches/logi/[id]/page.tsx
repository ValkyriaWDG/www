import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { LogiMatches } from '@/components/public/logi-matches';
import { PageMain } from '@/components/shell/page-main';
import { PageHeader } from '@/components/ui';
import { routing } from '@/i18n/routing';
import { isGameRoute } from '@/modules/games/registry';
import { getPublicLogiEvents } from '@/modules/integrations/logi-public';

export const dynamic = 'force-dynamic';
export default async function ConnectedMatchPage({ params }: { params: Promise<{ locale: string; game: string; id: string }> }) {
  const { locale, game, id } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game)) notFound();
  setRequestLocale(locale);
  const events = await getPublicLogiEvents(game);
  const selected = events.find((row) => row.ref.externalId === id);
  if (!selected) notFound();
  return <PageMain width="full" labelledBy="logi-match-title"><PageHeader title={selected.title} titleId="logi-match-title" /><LogiMatches locale={locale} events={events} selected={selected} /></PageMain>;
}
