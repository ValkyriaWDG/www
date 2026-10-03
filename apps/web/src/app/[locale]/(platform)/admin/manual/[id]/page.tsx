import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { EditorPage, loadEditorState, selectedContentLocale } from '@/components/admin/editor-page';
import { routing } from '@/i18n/routing';
import { adminPageMetadata, requireAdminPage } from '@/modules/auth/admin-guard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/manual/[id]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'adminEditorial.manual' });
  return adminPageMetadata({ locale, title: t('editorHeading'), capability: 'content.edit', game: 'hell-let-loose' });
}

/** Field Manual article editor for one translation (`?lang=cs|en`); requires `content.edit` in the article's game. */
export default async function EditManualArticlePage({ params, searchParams }: PageProps<'/[locale]/admin/manual/[id]'>) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: `/admin/manual/${encodeURIComponent(id)}`, capability: 'content.edit', game: 'hell-let-loose' });
  if (!access.ok) return access.denied;
  const state = await loadEditorState(access.principal, id, locale);
  if ('denied' in state) return state.denied;
  if (state.document.kind === 'news') redirect(`/${locale}/admin/news/${state.document.id}`);
  if (state.document.kind !== 'manual') redirect(`/${locale}/admin/content/${state.document.id}`);
  const contentLocale = selectedContentLocale(state, await searchParams);
  return <EditorPage locale={locale} actor={access.principal} state={state} contentLocale={contentLocale} mode="manual" />;
}
