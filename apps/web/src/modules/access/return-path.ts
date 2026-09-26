import { routing, type AppLocale } from '@/i18n/routing';

const MAX_RETURN_PATH_LENGTH = 512;
// C0/C1 control characters, including tab/newline (header and URL smuggling).
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/;
// Percent-encoded slash, backslash or dot: used to smuggle traversal/`//` past checks.
const ENCODED_SEPARATORS = /%(?:2f|5c|2e)/i;
const PARSE_ORIGIN = 'https://return-path.invalid';
/** Localized UI areas that are never a useful post-login destination. */
const EXCLUDED_SUFFIXES = new Set(['login']);

export function defaultReturnPath(locale: AppLocale): string {
  return `/${locale}/account`;
}

/**
 * Validates an untrusted post-login destination (query `returnTo`, OAuth
 * `callbackURL`). Only same-origin, localized UI paths (`/cs/...` or `/en/...`) are
 * accepted; absolute/protocol-relative URLs, backslashes, schemes, control characters,
 * encoded separators, traversal, `/api/*` and over-long values fall back to the
 * account page of `locale`. The result is always a relative path safe to redirect to.
 */
export function sanitizeReturnPath(input: unknown, locale: AppLocale): string {
  const fallback = defaultReturnPath(locale);
  if (typeof input !== 'string') return fallback;
  if (input.length === 0 || input.length > MAX_RETURN_PATH_LENGTH) return fallback;
  if (CONTROL_CHARACTERS.test(input) || input.includes('\\')) return fallback;
  if (!input.startsWith('/') || input.startsWith('//')) return fallback;
  const rawPath = input.split(/[?#]/, 1)[0] ?? '';
  if (ENCODED_SEPARATORS.test(rawPath)) return fallback;

  let url: URL;
  try {
    url = new URL(input, PARSE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PARSE_ORIGIN) return fallback;

  // Dot or empty segments would be normalized/reinterpreted; reject instead.
  if (rawPath.split('/').slice(1).some((segment) => segment === '.' || segment === '..' || segment === '')) return fallback;

  const segments = url.pathname.split('/').slice(1);
  const [first, second] = segments;
  if (!first || !(routing.locales as readonly string[]).includes(first)) return fallback;
  if (segments.some((segment) => segment === 'api')) return fallback;
  if (second && EXCLUDED_SUFFIXES.has(second)) return fallback;

  return `${url.pathname}${url.search}`;
}

/** True when `input` is already a canonical safe return path (used to validate OAuth bodies). */
export function isSafeReturnPath(input: unknown): input is string {
  if (typeof input !== 'string') return false;
  for (const locale of routing.locales) {
    if (sanitizeReturnPath(input, locale) === input) return true;
  }
  return false;
}

/**
 * The only accepted OAuth error destination: the localized login page, optionally
 * carrying a sanitized `returnTo`. Better Auth appends `error=<code>` itself.
 */
export function loginErrorPath(locale: AppLocale, returnTo?: string | null): string {
  const safe = returnTo ? sanitizeReturnPath(returnTo, locale) : null;
  return safe && safe !== defaultReturnPath(locale)
    ? `/${locale}/login?returnTo=${encodeURIComponent(safe)}`
    : `/${locale}/login`;
}

/** Validates an OAuth `errorCallbackURL`: exactly a value `loginErrorPath` could produce. */
export function isSafeLoginErrorPath(input: unknown): input is string {
  if (typeof input !== 'string' || input.length > MAX_RETURN_PATH_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(input, PARSE_ORIGIN);
  } catch {
    return false;
  }
  if (url.origin !== PARSE_ORIGIN || !input.startsWith('/')) return false;
  const locale = routing.locales.find((candidate) => url.pathname === `/${candidate}/login`);
  if (!locale) return false;
  const keys = [...url.searchParams.keys()];
  if (keys.length === 0) return input === `/${locale}/login`;
  if (keys.length !== 1 || keys[0] !== 'returnTo') return false;
  return loginErrorPath(locale, url.searchParams.get('returnTo')) === input;
}
