import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { TaxonomyTermScreen } from '@/components/admin/taxonomy-term-screen';
import { routing } from '@/i18n/routing';
import { requireAdminPage } from '@/modules/auth/admin-guard';
import { parseTaxonomyScope } from '@/modules/taxonomy/scope';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/taxonomy/manual/[game]/[id]'>): Promise<Metadata> {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminTaxonomy.form' });
  return { title: id === 'new' ? t('newTitles.manual-category') : t('titles.manual-category'), robots: { index: false, follow: false } };
}

/**
 * Field Manual category of one game (`/admin/taxonomy/manual/hll/<id|new>`). Requires
 * `content.edit` in that game, so a direct URL from another game's editor is denied.
 */
export default async function ManualCategoryPage({ params }: PageProps<'/[locale]/admin/taxonomy/manual/[game]/[id]'>) {
  const { locale, game, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const scope = parseTaxonomyScope(['manual', game]);
  if (!scope || scope.scope !== 'manual-category' || (id !== 'new' && !UUID.test(id))) notFound();
  const access = await requireAdminPage({
    locale,
    path: `/admin/taxonomy/manual/${encodeURIComponent(game)}/${encodeURIComponent(id)}`,
    capability: 'content.edit',
    game: scope.game,
  });
  if (!access.ok) return access.denied;
  return <TaxonomyTermScreen locale={locale} actor={access.principal} scope={scope} id={id.toLowerCase()} />;
}
