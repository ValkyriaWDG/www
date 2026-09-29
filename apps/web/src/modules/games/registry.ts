import type { Game } from '@valkyria/db/schema';

/**
 * Typed game registry for the unified platform (ADR-WEB-002). One entry maps each URL
 * segment to the existing database game ID and the hosted-Logi game ID. Locale is an
 * independent axis. Unknown values are rejected everywhere; there is no `all` game and
 * no fallback to a default game. The module is pure (safe for client components): it
 * imports only the database *type*, and the unit test pins the values to `GAMES`.
 */

export const GAME_ROUTES = ['hll', 'wardogs'] as const;
export type GameRoute = (typeof GAME_ROUTES)[number];

/** Game identifiers used by the hosted Logi API (contract 0.2). */
export const LOGI_GAME_IDS = ['hell_let_loose', 'wardogs'] as const;
export type LogiGameId = (typeof LOGI_GAME_IDS)[number];

/** Public sections a game can expose, in the English route vocabulary. */
export const GAME_SECTIONS = ['news', 'matches', 'tournaments', 'servers', 'members', 'field-manual', 'faq', 'clan', 'community'] as const;
export type GameSection = (typeof GAME_SECTIONS)[number];

export type GameTheme = 'hll' | 'wardogs';

export type GameDefinition = {
  route: GameRoute;
  /** Existing database identifier (`content_document.game`, `match.game`, member affiliations). */
  db: Game;
  logi: LogiGameId;
  theme: GameTheme;
  /** Sections this game exposes, in menu order. */
  sections: readonly GameSection[];
};

export const GAME_REGISTRY: Readonly<Record<GameRoute, GameDefinition>> = {
  hll: {
    route: 'hll',
    db: 'hell-let-loose',
    logi: 'hell_let_loose',
    theme: 'hll',
    sections: ['news', 'matches', 'tournaments', 'servers', 'members', 'field-manual', 'faq', 'clan', 'community'],
  },
  wardogs: {
    route: 'wardogs',
    db: 'wardogs',
    logi: 'wardogs',
    theme: 'wardogs',
    // Existing Wardogs menu order, unchanged. Observed Wardogs servers are added once an
    // approved server source exists (legacy inventory); until then the switch explains it.
    sections: ['news', 'clan', 'members', 'matches'],
  },
};

export function isGameRoute(value: unknown): value is GameRoute {
  return typeof value === 'string' && (GAME_ROUTES as readonly string[]).includes(value);
}

export function isGameSection(value: unknown): value is GameSection {
  return typeof value === 'string' && (GAME_SECTIONS as readonly string[]).includes(value);
}

/** Registry entry for a URL segment, or `null` for anything unknown. */
export function getGame(route: unknown): GameDefinition | null {
  return isGameRoute(route) ? GAME_REGISTRY[route] : null;
}

/** Database game → route segment. Throws on an unmapped value (a programming error). */
export function gameRouteFromDb(game: Game): GameRoute {
  const entry = Object.values(GAME_REGISTRY).find((definition) => definition.db === game);
  if (!entry) throw new Error(`Unmapped database game: ${String(game)}`);
  return entry.route;
}

/** Database game from an untrusted string, or `null`. */
export function parseDbGame(value: unknown): Game | null {
  if (typeof value !== 'string') return null;
  const entry = Object.values(GAME_REGISTRY).find((definition) => definition.db === value);
  return entry ? entry.db : null;
}

/** Logi game ID (external input) → route segment; unknown IDs are rejected with `null`. */
export function gameRouteFromLogi(value: unknown): GameRoute | null {
  if (typeof value !== 'string') return null;
  const entry = Object.values(GAME_REGISTRY).find((definition) => definition.logi === value);
  return entry ? entry.route : null;
}

export function gameHasSection(route: GameRoute, section: GameSection): boolean {
  return GAME_REGISTRY[route].sections.includes(section);
}
