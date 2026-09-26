import { defineRouting } from 'next-intl/routing';

/**
 * Canonical locale routing contract (docs/product/localization.md): the URL is the only
 * locale source. No browser-language detection, no locale cookie and no automatic
 * alternate links (CMS counterparts are resolved from published translations instead).
 */
export const routing = defineRouting({
  locales: ['cs', 'en'],
  defaultLocale: 'cs',
  localePrefix: 'always',
  localeDetection: false,
  localeCookie: false,
  alternateLinks: false,
});

export type AppLocale = (typeof routing.locales)[number];

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (routing.locales as readonly string[]).includes(value);
}

/** Intl locale used for display formatting of each UI locale. */
export const FORMAT_LOCALE: Record<AppLocale, string> = { cs: 'cs-CZ', en: 'en-GB' };

/** Explicit display time zone for dates and match times. Stored instants stay UTC. */
export const DISPLAY_TIME_ZONE = 'Europe/Prague';
