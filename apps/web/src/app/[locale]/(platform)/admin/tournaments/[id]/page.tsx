import { GAMES } from '@valkyria/db/schema';
import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { TournamentEditor } from '@/components/admin-community/tournament-editor';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { can, canForGame } from '@/modules/access/policy';
import { adminPageMetadata, requireAdminPage } from '@/modules/auth/admin-guard';
import { getTournamentForAdmin } from '@/modules/tournaments/queries';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/tournaments/[id]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminCommunity.tournaments.editor' });
  return adminPageMetadata({ locale, title: t('editMetaTitle'), capability: 'matches.edit' });
}

/** Edit one tournament: facts, links, descriptions per locale, publication and linked matches. */
export default async function EditTournamentPage({ params, searchParams }: PageProps<'/[locale]/admin/tournaments/[id]'>) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: `/admin/tournaments/${encodeURIComponent(id)}`, capability: 'matches.edit' });
  if (!access.ok) return access.denied;
  const tournament = await getTournamentForAdmin(getDb(), access.principal, id);
  if (!tournament) notFound();
  const created = (await searchParams).created === '1';
  const games = GAMES.filter((game) => canForGame(access.principal, 'matches.edit', game));
  return (
    <TournamentEditor
      key={tournament.id}
      uiLocale={locale}
      initial={tournament}
      canPublish={can(access.principal, 'matches.publish') && canForGame(access.principal, 'matches.publish', tournament.game)}
      games={games}
      created={created}
    />
  );
}
