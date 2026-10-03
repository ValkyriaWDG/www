import type { Game } from '@valkyria/db/schema';
import { GAME_REGISTRY, gameHasSection, gameRouteFromDb, getGame, type GameRoute } from '@/modules/games/registry';

/**
 * Taxonomy scopes of the administration (pure, safe for client components). A manual
 * category belongs to one game's Field Manual; news categories and tags are shared
 * platform terms. The URL form uses the public game segment (`/admin/taxonomy/manual/hll/…`).
 */

export type TaxonomyScope = { scope: 'manual-category'; game: Game } | { scope: 'news-category' } | { scope: 'news-tag' };
export type TaxonomyScopeKind = TaxonomyScope['scope'];

export const TAXONOMY_LIMITS = {
  key: 64,
  label: 80,
  description: 300,
  sortOrderMax: 10_000,
} as const;

/** Lower-case words joined by single hyphens, like route slugs. */
export const TAXONOMY_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const NEWS_SCOPE_SEGMENTS = ['news-category', 'news-tag'] as const;
export type NewsScopeSegment = (typeof NEWS_SCOPE_SEGMENTS)[number];

export function isNewsScopeSegment(value: unknown): value is NewsScopeSegment {
  return typeof value === 'string' && (NEWS_SCOPE_SEGMENTS as readonly string[]).includes(value);
}

/** `manual/<gameRoute>` or a news segment → scope, or `null` for anything unknown. */
export function parseTaxonomyScope(segments: readonly string[]): TaxonomyScope | null {
  if (segments.length === 2 && segments[0] === 'manual') {
    const game = getGame(segments[1]);
    if (!game || !gameHasSection(game.route, 'field-manual')) return null;
    return { scope: 'manual-category', game: game.db };
  }
  if (segments.length === 1 && isNewsScopeSegment(segments[0])) return { scope: segments[0] };
  return null;
}

/** Logical admin path (without locale) of a scope's list anchor, create page or edit page. */
export function taxonomyScopePath(scope: TaxonomyScope, id?: string | 'new'): string {
  const base = scope.scope === 'manual-category' ? `/admin/taxonomy/manual/${gameRouteFromDb(scope.game)}` : `/admin/taxonomy/${scope.scope}`;
  return id === undefined ? base : `${base}/${id}`;
}

/** Stable section anchor on the list page. */
export function taxonomySectionId(scope: TaxonomyScope): string {
  return scope.scope === 'manual-category' ? `manual-${gameRouteFromDb(scope.game)}` : scope.scope;
}

/** Games that expose a Field Manual (the only games with manual categories). */
export function manualGames(): Game[] {
  return (Object.keys(GAME_REGISTRY) as GameRoute[]).filter((route) => gameHasSection(route, 'field-manual')).map((route) => GAME_REGISTRY[route].db);
}

/** Resource game of a scope for authorization: community (`null`) for news taxonomy. */
export function taxonomyScopeGame(scope: TaxonomyScope): Game | null {
  return scope.scope === 'manual-category' ? scope.game : null;
}

export function sameTaxonomyScope(a: TaxonomyScope, b: TaxonomyScope): boolean {
  if (a.scope !== b.scope) return false;
  return a.scope === 'manual-category' && b.scope === 'manual-category' ? a.game === b.game : true;
}

/** Picker order: explicit sort order, then the Czech label (primary language), then the key. */
export function sortTaxonomyOptions<T extends { key: string; labelCs: string; sortOrder: number }>(options: readonly T[]): T[] {
  const collator = new Intl.Collator('cs-CZ');
  return [...options].sort((a, b) => a.sortOrder - b.sortOrder || collator.compare(a.labelCs, b.labelCs) || a.key.localeCompare(b.key));
}
