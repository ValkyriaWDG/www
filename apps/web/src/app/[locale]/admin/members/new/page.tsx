import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { MemberEditor } from '@/components/admin-community/member-editor';
import { routing } from '@/i18n/routing';
import { can } from '@/modules/access/policy';
import { requireAdminPage } from '@/modules/auth/admin-guard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/members/new'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminCommunity.members.editor' });
  return { title: t('createTitle'), robots: { index: false, follow: false } };
}

export default async function NewMemberPage({ params }: PageProps<'/[locale]/admin/members/new'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: '/admin/members/new', capability: 'members.edit' });
  if (!access.ok) return access.denied;
  return <MemberEditor uiLocale={locale} initial={null} canPublish={can(access.principal, 'members.publish')} />;
}
