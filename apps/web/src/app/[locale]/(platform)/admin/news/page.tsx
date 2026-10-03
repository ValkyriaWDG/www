import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { EditorialListScreen } from '@/components/admin/editorial-list';
import { routing } from '@/i18n/routing';
import { adminPageMetadata, requireAdminPage } from '@/modules/auth/admin-guard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/news'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminEditorial.list' });
  return adminPageMetadata({ locale, title: t('metaTitle'), capability: 'content.edit' });
}

/** Posts workspace: searchable, paginated table with separate Czech/English states. */
export default async function AdminNewsPage({ params, searchParams }: PageProps<'/[locale]/admin/news'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: '/admin/news', capability: 'content.edit' });
  if (!access.ok) return access.denied;
  return <EditorialListScreen locale={locale} actor={access.principal} raw={await searchParams} kind="news" />;
}
