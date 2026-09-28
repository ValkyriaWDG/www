import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { EditorPage, loadEditorState, selectedContentLocale } from '@/components/admin/editor-page';
import { routing } from '@/i18n/routing';
import { requireAdminPage } from '@/modules/auth/admin-guard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/content/[id]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminEditorial.pages' });
  return { title: t('editMetaTitle'), robots: { index: false, follow: false } };
}

/** Core page editor (clan, community, privacy): same editor, fixed slug, per-language publication. */
export default async function EditCorePage({ params, searchParams }: PageProps<'/[locale]/admin/content/[id]'>) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: `/admin/content/${encodeURIComponent(id)}`, capability: 'content.edit' });
  if (!access.ok) return access.denied;
  const state = await loadEditorState(access.principal, id, locale);
  if ('denied' in state) return state.denied;
  if (state.document.kind !== 'page') redirect(`/${locale}/admin/news/${state.document.id}`);
  const contentLocale = selectedContentLocale(state, await searchParams);
  return <EditorPage locale={locale} actor={access.principal} state={state} contentLocale={contentLocale} mode="page" />;
}
