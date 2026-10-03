import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { EditorialListScreen } from '@/components/admin/editorial-list';
import { routing } from '@/i18n/routing';
import { adminPageMetadata, requireAdminPage } from '@/modules/auth/admin-guard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/manual'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminEditorial.manual' });
  return adminPageMetadata({ locale, title: t('metaTitle'), capability: 'content.edit', game: 'hell-let-loose' });
}

/** Field Manual workspace: the same table as posts, limited to manual articles in scope. */
export default async function AdminManualPage({ params, searchParams }: PageProps<'/[locale]/admin/manual'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: '/admin/manual', capability: 'content.edit', game: 'hell-let-loose' });
  if (!access.ok) return access.denied;
  return <EditorialListScreen locale={locale} actor={access.principal} raw={await searchParams} kind="manual" />;
}
