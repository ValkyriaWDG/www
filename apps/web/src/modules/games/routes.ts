import type { Game } from '@valkyria/db/schema';
import { GAME_REGISTRY, type GameRoute, type GameSection, gameHasSection, gameRouteFromDb, isGameRoute, isGameSection } from './registry';

/**
 * Pure route builders and parsers for game sections. Paths are *logical* (no locale
 * prefix) for the next-intl `Link`; `/hll/news` renders as `/cs/hll/news` or
 * `/en/hll/news`. Build URLs here instead of concatenating strings in components.
 */

const LOCALES = ['cs', 'en'] as const;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** `/hll`, `/hll/news`, `/hll/news/<slug>`. Slugs must already be validated route slugs. */
export function gamePath(game: GameRoute, section?: GameSection, slug?: string): string {
  if (!section) return `/${game}`;
  if (slug === undefined) return `/${game}/${section}`;
  if (!SLUG.test(slug)) throw new Error('Invalid route slug');
  return `/${game}/${section}/${slug}`;
}

/** Base prefix for list/detail helpers: `''` for the shared community routes, `/hll` for a game. */
export function sectionBase(game: GameRoute | null): string {
  return game ? `/${game}` : '';
}

export type ParsedPath = {
  /** Active game section or `null` for community hub/shared/account/admin routes. */
  game: GameRoute | null;
  /** First segment after the game (or after the locale for shared routes); `null` for landings. */
  section: string | null;
  /** Remaining segments (e.g. a detail slug). */
  rest: string[];
};

/** Removes the query/hash and a leading supported locale; always returns a `/`-prefixed path. */
export function toLogicalPath(pathname: string): string {
  const clean = pathname.split(/[?#]/)[0] || '/';
  const segments = clean.split('/').filter(Boolean);
  if (segments[0] && (LOCALES as readonly string[]).includes(segments[0])) segments.shift();
  return `/${segments.join('/')}`;
}

export function parseLogicalPath(pathname: string): ParsedPath {
  const segments = toLogicalPath(pathname).split('/').filter(Boolean);
  const first = segments[0];
  if (isGameRoute(first)) return { game: first, section: segments[1] ?? null, rest: segments.slice(2) };
  return { game: null, section: first ?? null, rest: segments.slice(1) };
}

/** Active game of a (localized or logical) path. */
export function gameOfPath(pathname: string): GameRoute | null {
  return parseLogicalPath(pathname).game;
}

/** Query keys that keep their meaning across games (list state only, never pagination). */
const PORTABLE_QUERY: Partial<Record<GameSection, readonly string[]>> = {
  news: ['q'],
  matches: ['view', 'q'],
  members: ['q'],
};
const SAFE_VALUE = /^[\p{L}\p{N} _.,:-]{1,80}$/u;

/** Why the target is not the same kind of page: the detail had no counterpart or the section is absent. */
export type GameSwitchNotice = 'detail' | 'section';
export const GAME_SWITCH_PARAM = 'switch';

export function parseGameSwitchNotice(value: string | undefined): GameSwitchNotice | null {
  return value === 'detail' || value === 'section' ? value : null;
}

/**
 * Target of the persistent game switch. Keeps the locale (logical path) and the page
 * category where the target game has it. A detail page never maps to an invented
 * same-slug entity in the other game: it opens the target's list with a notice. A
 * section the target lacks opens the target landing with a notice. Shared community
 * routes map to the matching game section when one exists, else the landing.
 */
export function resolveGameSwitch(pathname: string, search: string | URLSearchParams, target: GameRoute): string {
  const parsed = parseLogicalPath(pathname);
  if (parsed.game === target) return toLogicalPath(pathname);
  const section = parsed.section;
  if (!section || !isGameSection(section)) return gamePath(target);
  if (!gameHasSection(target, section)) {
    // Shared routes without a game counterpart (privacy, account, admin…) are handled above.
    return `${gamePath(target)}?${GAME_SWITCH_PARAM}=section`;
  }
  if (parsed.rest.length > 0) {
    return `${gamePath(target, section)}?${GAME_SWITCH_PARAM}=detail`;
  }
  const source = new URLSearchParams(search);
  const query = new URLSearchParams();
  for (const key of PORTABLE_QUERY[section] ?? []) {
    const value = source.get(key);
    if (value !== null && SAFE_VALUE.test(value)) query.set(key, value);
  }
  const text = query.toString();
  return `${gamePath(target, section)}${text ? `?${text}` : ''}`;
}

/** Menu destinations of a game in its registry order. */
export function gameMenu(game: GameRoute): { section: GameSection; href: string }[] {
  return GAME_REGISTRY[game].sections.map((section) => ({ section, href: gamePath(game, section) }));
}

/**
 * Canonical logical URL of a published article: game articles live under their game,
 * community articles (no game) under the shared `/news`. Slugs are unique per locale
 * across all games (`content_translation_live_slug_uq`), so the game prefix is derived
 * from the published snapshot and never ambiguous.
 */
export function canonicalNewsPath(game: Game | null, slug: string): string {
  return game ? gamePath(gameRouteFromDb(game), 'news', slug) : `/news/${slug}`;
}

/** Canonical logical URL of a published match (every match belongs to exactly one game). */
export function canonicalMatchPath(game: Game, slug: string): string {
  return gamePath(gameRouteFromDb(game), 'matches', slug);
}
