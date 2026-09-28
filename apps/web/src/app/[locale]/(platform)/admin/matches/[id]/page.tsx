import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { MatchEditor } from '@/components/admin-community/match-editor';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { can } from '@/modules/access/policy';
import { requireAdminPage } from '@/modules/auth/admin-guard';
import { getMatchForAdmin } from '@/modules/matches/queries';
import { statisticsSources } from '@/modules/matches/statistics-service';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/matches/[id]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminCommunity.matches.editor' });
  return { title: t('editMetaTitle'), robots: { index: false, follow: false } };
}

/** Edit one match: facts, schedule, recaps per locale, result and status transitions. */
export default async function EditMatchPage({ params, searchParams }: PageProps<'/[locale]/admin/matches/[id]'>) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: `/admin/matches/${encodeURIComponent(id)}`, capability: 'matches.edit' });
  if (!access.ok) return access.denied;
  const match = await getMatchForAdmin(getDb(), access.principal, id);
  if (!match) notFound();
  const created = (await searchParams).created === '1';
  return (
    <MatchEditor
      key={match.id}
      uiLocale={locale}
      initial={match}
      canPublish={can(access.principal, 'matches.publish')}
      created={created}
      statisticsSources={match.game === 'hell-let-loose' ? statisticsSources() : []}
    />
  );
}
