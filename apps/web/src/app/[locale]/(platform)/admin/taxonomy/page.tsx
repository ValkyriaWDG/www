import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { TaxonomyListScreen } from '@/components/admin/taxonomy-list';
import { routing } from '@/i18n/routing';
import { adminPageMetadata, requireAdminPage } from '@/modules/auth/admin-guard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/taxonomy'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminTaxonomy' });
  return adminPageMetadata({ locale, title: t('metaTitle'), capability: 'content.edit' });
}

/**
 * Categories and tags workspace. The module has no fixed game: the page lists the Field
 * Manual games in the actor's scope and the shared news taxonomy only for platform-wide
 * editors; every term page and action re-checks its own scope.
 */
export default async function AdminTaxonomyPage({ params }: PageProps<'/[locale]/admin/taxonomy'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: '/admin/taxonomy', capability: 'content.edit' });
  if (!access.ok) return access.denied;
  return <TaxonomyListScreen locale={locale} actor={access.principal} />;
}
