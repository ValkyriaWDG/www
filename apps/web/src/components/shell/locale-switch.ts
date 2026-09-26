import { type AppLocale, routing } from '@/i18n/routing';
import { filterSafeQuery } from '@/lib/locale-redirect';

/** Server endpoint (content slice) that resolves entity counterparts and 307-redirects. */
export const LOCALE_SWITCH_ENDPOINT = '/api/locale-switch';

/**
 * Builds the language-switch link for the current real URL (`/cs/...`). Only allowlisted
 * filters survive; pagination is dropped because the target collection may be shorter.
 * A malformed path falls back to the current locale home so no arbitrary target leaks.
 */
export function buildLocaleSwitchHref(target: AppLocale, pathname: string, search: string | URLSearchParams, current: AppLocale): string {
  const query = filterSafeQuery(new URLSearchParams(search));
  query.delete('page');
  const qs = query.toString();
  const safePath = isLocalizedPath(pathname) ? pathname : `/${current}`;
  const from = `${safePath}${qs ? `?${qs}` : ''}`;
  return `${LOCALE_SWITCH_ENDPOINT}?${new URLSearchParams({ to: target, from }).toString()}`;
}

function isLocalizedPath(pathname: string): boolean {
  if (!pathname.startsWith('/') || pathname.startsWith('//') || pathname.includes('\\')) return false;
  const first = pathname.split('/')[1];
  return first !== undefined && (routing.locales as readonly string[]).includes(first);
}
