import { GAMES } from '@valkyria/db/schema';
import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { TournamentEditor } from '@/components/admin-community/tournament-editor';
import { routing } from '@/i18n/routing';
import { can, canForGame } from '@/modules/access/policy';
import { requireAdminPage } from '@/modules/auth/admin-guard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/tournaments/new'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminCommunity.tournaments.editor' });
  return { title: t('createTitle'), robots: { index: false, follow: false } };
}

/** Creates a draft tournament for a game in the editor's scope. */
export default async function NewTournamentPage({ params }: PageProps<'/[locale]/admin/tournaments/new'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: '/admin/tournaments/new', capability: 'matches.edit' });
  if (!access.ok) return access.denied;
  const games = GAMES.filter((game) => canForGame(access.principal, 'matches.edit', game));
  return <TournamentEditor uiLocale={locale} initial={null} canPublish={can(access.principal, 'matches.publish')} games={games} />;
}
