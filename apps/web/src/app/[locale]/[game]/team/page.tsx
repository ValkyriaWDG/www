import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { LogiTeamScreen } from '@/components/public/logi-people';
import { PageMain } from '@/components/shell/page-main';
import { PageHeader } from '@/components/ui';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { canForGame, denialCode } from '@/modules/access/policy';
import { getActor } from '@/modules/access/server';
import { AccessDeniedPanel } from '@/modules/auth/ui/access-denied';
import { GAME_REGISTRY, isGameRoute } from '@/modules/games/registry';
import { readLogiTeam } from '@/modules/integrations/logi-people';
import { getPublicLogiEvents } from '@/modules/integrations/logi-public';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string; game: string }> }): Promise<Metadata> {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game)) return {};
  const [t, games] = await Promise.all([getTranslations({ locale, namespace: 'logiPeople' }), getTranslations({ locale, namespace: 'games' })]);
  return { title: games('sectionTitle', { section: t('title'), game: games(`names.${game}`) }), robots: { index: false, follow: false } };
}

export default async function TeamPage({ params }: { params: Promise<{ locale: string; game: string }> }) {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game)) notFound();
  setRequestLocale(locale);
  const actor = await getActor('read');
  if (actor.kind === 'anonymous') redirect(`/${locale}/login?returnTo=${encodeURIComponent(`/${locale}/${game}/team`)}`);
  if (!canForGame(actor, 'team.read', GAME_REGISTRY[game].db))
    return <AccessDeniedPanel locale={locale} code={denialCode(actor, 'team.read') ?? 'forbidden'} />;
  const t = await getTranslations({ locale, namespace: 'logiPeople' });
  const [view, events] = await Promise.all([
    readLogiTeam(getDb(), getServerEnv(), actor, GAME_REGISTRY[game].db),
    getPublicLogiEvents(game),
  ]);
  return (
    <PageMain width="full" labelledBy="team-title">
      <PageHeader
        title={t('title')}
        titleId="team-title"
        eyebrow={game === 'hll' ? 'Hell Let Loose' : 'Wardogs'}
        description={t('description')}
        back={{ href: '/account', label: t('account') }}
      />
      <LogiTeamScreen
        locale={locale}
        view={view}
        eventTitles={Object.fromEntries(events.map((event) => [event.ref.externalId, event.title]))}
      />
    </PageMain>
  );
}
