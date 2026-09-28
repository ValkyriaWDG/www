import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { MatchEditor } from '@/components/admin-community/match-editor';
import { routing } from '@/i18n/routing';
import { can } from '@/modules/access/policy';
import { requireAdminPage } from '@/modules/auth/admin-guard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/matches/new'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminCommunity.matches.editor' });
  return { title: t('createTitle'), robots: { index: false, follow: false } };
}

/** Creates a draft fixture (status Scheduled, publication Draft). */
export default async function NewMatchPage({ params }: PageProps<'/[locale]/admin/matches/new'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: '/admin/matches/new', capability: 'matches.edit' });
  if (!access.ok) return access.denied;
  return <MatchEditor uiLocale={locale} initial={null} canPublish={can(access.principal, 'matches.publish')} />;
}
