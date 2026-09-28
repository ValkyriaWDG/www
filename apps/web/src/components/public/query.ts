import { GAMES, LOCALES, PUBLIC_ROLE_KEYS, type Game, type Locale, type PublicRoleKey } from '@valkyria/db/schema';

/**
 * Pure URL-state helpers for the public list pages. Every value read from the query string
 * is validated against a small allowlist or bounded format; anything else is ignored so a
 * crafted URL can only ever select the default view. Hrefs are logical (unprefixed) paths
 * for the next-intl `Link`, with a stable parameter order.
 */

export type RawSearchParams = Record<string, string | string[] | undefined>;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CONTROL = /[\u0000-\u001f\u007f]/g;

export const SEARCH_MAX_LENGTH = 80;
export const PAGE_MAX = 1000;

/** First value of a query parameter (repeated keys use the first occurrence). */
export function firstParam(params: RawSearchParams | undefined, key: string): string | undefined {
  const value = params?.[key];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first : undefined;
}

export function parseGame(value: string | undefined): Game | undefined {
  return value !== undefined && (GAMES as readonly string[]).includes(value) ? (value as Game) : undefined;
}

export function parseRole(value: string | undefined): PublicRoleKey | undefined {
  return value !== undefined && (PUBLIC_ROLE_KEYS as readonly string[]).includes(value) ? (value as PublicRoleKey) : undefined;
}

export function parseLocale(value: string | undefined): Locale | undefined {
  return value !== undefined && (LOCALES as readonly string[]).includes(value) ? (value as Locale) : undefined;
}

/** Positive page number (default 1); malformed or out-of-range values fall back to 1. */
export function parsePage(value: string | undefined, max = PAGE_MAX): number {
  if (value === undefined || !/^\d{1,5}$/.test(value)) return 1;
  const page = Number(value);
  return page >= 1 && page <= max ? page : 1;
}

/** Trimmed search text without control characters, whitespace collapsed and bounded. */
export function parseSearch(value: string | undefined, max = SEARCH_MAX_LENGTH): string | undefined {
  if (value === undefined) return undefined;
  const clean = value.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  return [...clean].slice(0, max).join('').trim() || undefined;
}

/** Taxonomy key (lowercase slug, ≤64 chars). */
export function parseTermKey(value: string | undefined): string | undefined {
  return value !== undefined && value.length <= 64 && SLUG.test(value) ? value : undefined;
}

export function isSlug(value: unknown, max = 120): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && SLUG.test(value);
}

/** Builds `path?key=value…` in the given key order, skipping empty values and page 1. */
export function buildHref(path: string, params: [key: string, value: string | number | null | undefined][]): string {
  const query = new URLSearchParams();
  for (const [key, value] of params) {
    if (value === undefined || value === null || value === '') continue;
    if (key === 'page' && Number(value) <= 1) continue;
    query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

/* ------------------------------------------------------------------ news */

export type NewsFilters = { category?: string; game?: Game; q?: string; page: number };

export function parseNewsFilters(params: RawSearchParams | undefined): NewsFilters {
  return {
    category: parseTermKey(firstParam(params, 'category')),
    game: parseGame(firstParam(params, 'game')),
    q: parseSearch(firstParam(params, 'q')),
    page: parsePage(firstParam(params, 'page')),
  };
}

/**
 * List URL under a section base: `''` for the shared community list, `/hll` or `/wardogs`
 * for a game section (see `sectionBase`).
 */
export function newsListHref(filters: Partial<NewsFilters>, base = ''): string {
  return buildHref(`${base}/news`, [
    ['category', filters.category],
    ['game', filters.game],
    ['q', filters.q],
    ['page', filters.page],
  ]);
}

export function hasNewsFilters(filters: NewsFilters): boolean {
  return Boolean(filters.category || filters.game || filters.q);
}

/**
 * `?missing=<locale>:<slug>` set by the locale-switch endpoint when an article has no
 * published translation in the current locale. Only another supported locale and a valid
 * slug are accepted; the caller must still verify that the source article is published.
 */
export function parseMissingTranslation(value: string | undefined, current: Locale): { locale: Locale; slug: string } | null {
  if (value === undefined || value.length > 140) return null;
  const separator = value.indexOf(':');
  if (separator < 0) return null;
  const locale = parseLocale(value.slice(0, separator));
  const slug = value.slice(separator + 1);
  if (!locale || locale === current || !isSlug(slug)) return null;
  return { locale, slug };
}

/* --------------------------------------------------------------- members */

export type MemberFilters = { game?: Game; role?: PublicRoleKey; q?: string; page: number };

export function parseMemberFilters(params: RawSearchParams | undefined): MemberFilters {
  return {
    game: parseGame(firstParam(params, 'game')),
    role: parseRole(firstParam(params, 'role')),
    q: parseSearch(firstParam(params, 'q')),
    page: parsePage(firstParam(params, 'page')),
  };
}

export function membersListHref(filters: Partial<MemberFilters>, base = ''): string {
  return buildHref(`${base}/members`, [
    ['game', filters.game],
    ['role', filters.role],
    ['q', filters.q],
    ['page', filters.page],
  ]);
}

export function hasMemberFilters(filters: MemberFilters): boolean {
  return Boolean(filters.game || filters.role || filters.q);
}

/* --------------------------------------------------------------- matches */

export type MatchView = 'upcoming' | 'results';
export type MatchFilters = { view: MatchView; game?: Game; q?: string; page: number };

export function parseMatchView(value: string | undefined): MatchView | undefined {
  return value === 'upcoming' || value === 'results' ? value : undefined;
}

export function parseMatchFilters(params: RawSearchParams | undefined, fallbackView: MatchView = 'upcoming'): MatchFilters {
  return {
    view: parseMatchView(firstParam(params, 'view')) ?? fallbackView,
    game: parseGame(firstParam(params, 'game')),
    q: parseSearch(firstParam(params, 'q')),
    page: parsePage(firstParam(params, 'page')),
  };
}

/** List URL; the default `upcoming` view is implicit. */
export function matchesListHref(filters: Partial<MatchFilters>, base = ''): string {
  return buildHref(`${base}/matches`, [
    ['view', filters.view === 'results' ? 'results' : undefined],
    ['game', filters.game],
    ['q', filters.q],
    ['page', filters.page],
  ]);
}

/**
 * Canonical detail URL that keeps the list context (game/search/page) for the desktop
 * list+detail layout; the view is derived from the match status on the detail page.
 */
export function matchDetailHref(slug: string, filters: Partial<Omit<MatchFilters, 'view'>> = {}, base = ''): string {
  return buildHref(`${base}/matches/${slug}`, [
    ['game', filters.game],
    ['q', filters.q],
    ['page', filters.page],
  ]);
}

export function hasMatchFilters(filters: MatchFilters): boolean {
  return Boolean(filters.game || filters.q);
}
