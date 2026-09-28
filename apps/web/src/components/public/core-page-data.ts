import 'server-only';
import type { PageKey } from '@valkyria/db/schema';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { cache } from 'react';
import type { AppLocale } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getPublishedPage } from '@/modules/content/public';
import { sharingMetadata } from '@/modules/social/metadata';
import { bilingualAlternates, OG_LOCALE, seoTitle } from './metadata';

/** Published core page of one locale, loaded once per request (metadata + page). */
export const loadCorePage = cache((locale: AppLocale, pageKey: PageKey) => getPublishedPage(locale, pageKey, getDb()));

/**
 * Title/description from the published page's SEO fields (fallback: title/excerpt, then the
 * localized section name). Core pages exist in both locales, so both are alternates; an
 * unpublished page is not indexed.
 */
export async function corePageMetadata(locale: AppLocale, pageKey: PageKey): Promise<Metadata> {
  const [page, t, site] = await Promise.all([
    loadCorePage(locale, pageKey),
    getTranslations({ locale, namespace: 'pages' }),
    getTranslations({ locale, namespace: 'common.site' }),
  ]);
  const title = page?.seoTitle || page?.title || t(`${pageKey}.meta.title`);
  const description = page?.seoDescription || page?.excerpt || t(`${pageKey}.meta.description`);
  const alternates = bilingualAlternates(locale, `/${pageKey}`);
  const sharing = sharingMetadata(locale, 'site', undefined, undefined, title, description);
  return {
    title: seoTitle(title, site('name')),
    description,
    alternates,
    openGraph: { type: 'website', title, description, url: alternates.canonical as string, siteName: site('name'), locale: OG_LOCALE[locale], images: sharing.images },
    twitter: sharing.twitter,
    ...(page ? {} : { robots: { index: false, follow: true } }),
  };
}
