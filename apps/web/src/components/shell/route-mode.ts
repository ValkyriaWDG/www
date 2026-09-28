import { routing } from '@/i18n/routing';
import { isGameRoute } from '@/modules/games/registry';

/**
 * Visual treatment of the persistent scene for the current route: a game landing
 * (`/wardogs`, `/hll`) gets the open scene, the community hub (`/`) a dimmed scene with
 * the crest, `/admin/**` the quiet static backdrop, everything else the darker scrim.
 */
export type RouteMode = 'home' | 'hub' | 'public' | 'admin';

/** Primary navigation sections of the shared frame (logical suffixes under `/cs` and `/en`). */
export const NAV_SECTIONS = [
  { key: 'home', href: '/' },
  { key: 'news', href: '/news' },
  { key: 'clan', href: '/clan' },
  { key: 'members', href: '/members' },
  { key: 'matches', href: '/matches' },
] as const;

export type NavSection = (typeof NAV_SECTIONS)[number]['key'];

/** Wardogs menu: the same sections under `/wardogs`. */
export const WARDOGS_NAV_SECTIONS: readonly { key: NavSection; href: string }[] = [
  { key: 'home', href: '/wardogs' },
  { key: 'news', href: '/wardogs/news' },
  { key: 'clan', href: '/wardogs/clan' },
  { key: 'members', href: '/wardogs/members' },
  { key: 'matches', href: '/wardogs/matches' },
];

/** Removes a leading `/cs` or `/en` segment; always returns a path starting with `/`. */
export function stripLocale(pathname: string): string {
  const clean = pathname.split(/[?#]/)[0] || '/';
  const segments = clean.split('/').filter(Boolean);
  if (segments[0] && (routing.locales as readonly string[]).includes(segments[0])) segments.shift();
  return `/${segments.join('/')}`;
}

export function getRouteMode(pathname: string): RouteMode {
  const path = stripLocale(pathname);
  if (path === '/') return 'hub';
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 1 && isGameRoute(segments[0])) return 'home';
  return segments[0] === 'admin' ? 'admin' : 'public';
}

/**
 * Current primary section by path prefix (`/news/some-article` → `news`) within a menu
 * (`NAV_SECTIONS` for the shared frame, `WARDOGS_NAV_SECTIONS` under `/wardogs`);
 * `null` outside that menu.
 */
export function getCurrentSection(
  pathname: string,
  items: readonly { key: NavSection; href: string }[] = NAV_SECTIONS,
): NavSection | null {
  const path = stripLocale(pathname);
  const home = items.find((item) => item.key === 'home');
  if (home && path === home.href) return 'home';
  const match = items.find((item) => item.key !== 'home' && (path === item.href || path.startsWith(`${item.href}/`)));
  return match ? match.key : null;
}
