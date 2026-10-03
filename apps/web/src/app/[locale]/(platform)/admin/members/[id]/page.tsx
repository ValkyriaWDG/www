import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { MemberEditor } from '@/components/admin-community/member-editor';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { can } from '@/modules/access/policy';
import { adminPageMetadata, requireAdminPage } from '@/modules/auth/admin-guard';
import { getMemberForAdmin } from '@/modules/members/queries';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/members/[id]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminCommunity.members.editor' });
  return adminPageMetadata({ locale, title: t('editMetaTitle'), capability: 'members.edit' });
}

/** Member publication editor. The linked account (user ID) is never sent to the browser. */
export default async function EditMemberPage({ params, searchParams }: PageProps<'/[locale]/admin/members/[id]'>) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: `/admin/members/${encodeURIComponent(id)}`, capability: 'members.edit' });
  if (!access.ok) return access.denied;
  const member = await getMemberForAdmin(getDb(), access.principal, id);
  if (!member) notFound();
  const { userId: _userId, ...view } = member;
  const created = (await searchParams).created === '1';
  return <MemberEditor key={member.id} uiLocale={locale} initial={view} canPublish={can(access.principal, 'members.publish')} created={created} />;
}
