import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { TaxonomyTermScreen } from '@/components/admin/taxonomy-term-screen';
import { routing } from '@/i18n/routing';
import { adminPageMetadata, requireAdminPage } from '@/modules/auth/admin-guard';
import { isNewsScopeSegment, parseTaxonomyScope } from '@/modules/taxonomy/scope';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/taxonomy/[scope]/[id]'>): Promise<Metadata> {
  const { locale, scope, id } = await params;
  if (!hasLocale(routing.locales, locale) || !isNewsScopeSegment(scope)) return {};
  const t = await getTranslations({ locale, namespace: 'adminTaxonomy.form' });
  return adminPageMetadata({ locale, title: id === 'new' ? t(`newTitles.${scope}`) : t(`titles.${scope}`), capability: 'content.edit', game: null });
}

/**
 * Shared news category or tag (`/admin/taxonomy/news-category/<id|new>`,
 * `/admin/taxonomy/news-tag/<id|new>`). News taxonomy is a community resource: the page
 * requires a platform-wide `content.edit` grant, so game-scoped editors are denied here
 * even by direct URL.
 */
export default async function NewsTaxonomyPage({ params }: PageProps<'/[locale]/admin/taxonomy/[scope]/[id]'>) {
  const { locale, scope: segment, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const scope = parseTaxonomyScope([segment]);
  if (!scope || scope.scope === 'manual-category' || (id !== 'new' && !UUID.test(id))) notFound();
  const access = await requireAdminPage({
    locale,
    path: `/admin/taxonomy/${encodeURIComponent(segment)}/${encodeURIComponent(id)}`,
    capability: 'content.edit',
    game: null,
  });
  if (!access.ok) return access.denied;
  return <TaxonomyTermScreen locale={locale} actor={access.principal} scope={scope} id={id.toLowerCase()} />;
}
