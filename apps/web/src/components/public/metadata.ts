import type { Locale } from '@valkyria/db/schema';
import type { Metadata } from 'next';

/**
 * Canonical and hreflang metadata for public routes. Paths are relative and resolved
 * against the layout's `metadataBase` (the canonical origin). Each locale has its own
 * canonical URL; alternates list only locales that really exist for the route.
 */

const LOCALE_ORDER: readonly Locale[] = ['cs', 'en'];

/**
 * Static or shared-entity route that exists identically in both locales (core pages,
 * lists, member profiles, matches): canonical + reciprocal cs/en + x-default → cs.
 */
export function bilingualAlternates(locale: Locale, suffix: string): NonNullable<Metadata['alternates']> {
  const languages: Record<string, string> = {};
  for (const code of LOCALE_ORDER) languages[code] = `/${code}${suffix}`;
  languages['x-default'] = `/cs${suffix}`;
  return { canonical: `/${locale}${suffix}`, languages };
}

/**
 * Editorial route (`/news/<slug>`): canonical for the current translation and alternates
 * only for published counterparts (never drafts or guessed slugs); `x-default` points to
 * the Czech translation only when it is published.
 */
export function publishedAlternates(
  locale: Locale,
  slug: string,
  counterparts: Partial<Record<Locale, string>>,
  prefix = '/news',
): NonNullable<Metadata['alternates']> {
  const languages: Record<string, string> = {};
  const published = { ...counterparts, [locale]: slug };
  for (const code of LOCALE_ORDER) {
    const target = published[code];
    if (target) languages[code] = `/${code}${prefix}/${target}`;
  }
  if (languages.cs) languages['x-default'] = languages.cs;
  return { canonical: `/${locale}${prefix}/${slug}`, languages };
}

export const OG_LOCALE: Record<Locale, string> = { cs: 'cs_CZ', en: 'en_GB' };

/**
 * Page title from an editorial SEO title: one that already names the site is used as-is
 * (no "· Valkyria" template suffix twice); otherwise the layout template applies.
 */
export function seoTitle(title: string, siteName: string): Metadata['title'] {
  return title.toLocaleLowerCase().includes(siteName.toLocaleLowerCase()) ? { absolute: title } : title;
}
