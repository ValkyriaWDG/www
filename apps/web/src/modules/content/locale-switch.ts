import { LOCALES, type Locale } from '@valkyria/db';
import { filterSafeQuery } from '@/lib/locale-redirect';
import { isValidSlug } from './slug';
import type { CounterpartResolution } from './types';

/**
 * Language-switch target resolution (`GET /api/locale-switch?to=<cs|en>&from=<path>`).
 * - `from` must be a same-site relative path under `/cs` or `/en`; anything else
 *   (protocol-relative `//`, backslashes, schemes, control/encoded characters, dot
 *   segments, overlong input) falls back to `/<to>`.
 * - `/xx/news/<slug>` is mapped by entity identity to the published counterpart slug;
 *   without one → `/<to>/news?missing=<from>:<slug>` (only when the source is published),
 *   otherwise `/<to>/news`.
 * - Every other path keeps its suffix under `/<to>` with only allowlisted, bounded
 *   query parameters; pagination is always reset and tokens/return URLs never forwarded.
 */

export const MAX_SWITCH_PATH_LENGTH = 512;
const DEFAULT_LOCALE: Locale = 'cs';
// Unreserved path characters only: no percent-encoding, spaces, backslashes or controls.
const SAFE_PATH = /^\/[A-Za-z0-9\-._~/]*$/;

export type CounterpartResolver = (fromLocale: Locale, slug: string, toLocale: Locale) => Promise<CounterpartResolution>;

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

type ParsedFrom = { locale: Locale; segments: string[]; query: URLSearchParams };

/** Validates the `from` value; returns null for anything that is not a safe localized path. */
export function parseSwitchSource(from: string | null | undefined): ParsedFrom | null {
  if (typeof from !== 'string' || from.length === 0 || from.length > MAX_SWITCH_PATH_LENGTH) return null;
  const hashIndex = from.indexOf('#');
  const withoutHash = hashIndex >= 0 ? from.slice(0, hashIndex) : from;
  const queryIndex = withoutHash.indexOf('?');
  const path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const search = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '';
  if (!SAFE_PATH.test(path) || path.startsWith('//')) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(search)) return null;
  const segments = path.split('/').filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === '.' || segment === '..')) return null;
  if (path.includes('//')) return null;
  const [first, ...rest] = segments;
  if (!isLocale(first)) return null;
  let query: URLSearchParams;
  try {
    query = new URLSearchParams(search);
  } catch {
    return null;
  }
  return { locale: first, segments: rest, query };
}

function safeQuery(query: URLSearchParams): string {
  const filtered = filterSafeQuery(query);
  filtered.delete('page');
  const text = filtered.toString();
  return text ? `?${text}` : '';
}

/** Resolves the redirect target path (always relative, always under `/<to>`). */
export async function resolveLocaleSwitch(
  params: { to: string | null | undefined; from: string | null | undefined },
  resolveCounterpart: CounterpartResolver,
): Promise<string> {
  const to = isLocale(params.to) ? params.to : DEFAULT_LOCALE;
  const source = parseSwitchSource(params.from);
  if (!source) return `/${to}`;
  const { segments } = source;

  if (segments[0] === 'news' && segments.length === 2) {
    const slug = segments[1]!;
    if (!isValidSlug(slug)) return `/${to}/news`;
    const resolution = await resolveCounterpart(source.locale, slug, to);
    if (!resolution) return `/${to}/news`;
    if (resolution.kind === 'published') return `/${to}/news/${resolution.slug}`;
    const missing = new URLSearchParams({ missing: `${source.locale}:${resolution.sourceSlug}` });
    return `/${to}/news?${missing.toString()}`;
  }

  const suffix = segments.length > 0 ? `/${segments.join('/')}` : '';
  return `/${to}${suffix}${safeQuery(source.query)}`;
}
