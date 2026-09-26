import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PreviewPage, previewMetadata } from '@/components/admin/preview-page';
import { routing } from '@/i18n/routing';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/[locale]/admin/content/[id]/preview'>): Promise<Metadata> {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? previewMetadata(locale) : {};
}

/** Private, no-store, noindex preview of a core page translation. */
export default async function PagePreviewPage({ params, searchParams }: PageProps<'/[locale]/admin/content/[id]/preview'>) {
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <PreviewPage locale={locale} id={id} raw={await searchParams} mode="page" />;
}
