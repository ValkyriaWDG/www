import { routing } from '@/i18n/routing';

/** Logical UI suffixes that exist under `/cs` and `/en`. */
export const UI_ROOT_SEGMENTS = [
  'news',
  'clan',
  'members',
  'matches',
  'community',
  'privacy',
  'login',
  'account',
  'admin',
] as const;

/** Non-sensitive shareable filter/query keys preserved on redirects and language switches. */
export const SAFE_QUERY_KEYS = ['game', 'status', 'q', 'page', 'category', 'tag', 'role', 'view', 'lang'] as const;

const SAFE_QUERY_VALUE = /^[\p{L}\p{N} _.,:-]{0,80}$/u;

/** Keeps only allowlisted query parameters with bounded, printable values. */
export function filterSafeQuery(params: URLSearchParams): URLSearchParams {
  const result = new URLSearchParams();
  for (const key of SAFE_QUERY_KEYS) {
    const value = params.get(key);
    if (value !== null && SAFE_QUERY_VALUE.test(value)) result.set(key, value);
  }
  return result;
}

/**
 * Returns the Czech redirect target for `/` or an unprefixed known UI route, or `null`
 * when the path must fall through to routing (which responds with 404). Unsupported
 * explicit locales such as `/de/news` are never rewritten.
 */
export function resolveUnprefixedRedirect(pathname: string, params: URLSearchParams): string | null {
  if (pathname === '/' || pathname === '') return `/${routing.defaultLocale}`;
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0];
  if (!first || !(UI_ROOT_SEGMENTS as readonly string[]).includes(first)) return null;
  if (segments.some((segment) => segment === '.' || segment === '..' || segment.includes('\\'))) return null;
  const query = filterSafeQuery(params).toString();
  return `/${routing.defaultLocale}/${segments.join('/')}${query ? `?${query}` : ''}`;
}
