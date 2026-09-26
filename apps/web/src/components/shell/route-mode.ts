import { routing } from '@/i18n/routing';

/** Visual treatment of the persistent scene for the current route. */
export type RouteMode = 'home' | 'public' | 'admin';

/** Primary navigation sections (logical suffixes under `/cs` and `/en`). */
export const NAV_SECTIONS = [
  { key: 'home', href: '/' },
  { key: 'news', href: '/news' },
  { key: 'clan', href: '/clan' },
  { key: 'members', href: '/members' },
  { key: 'matches', href: '/matches' },
] as const;

export type NavSection = (typeof NAV_SECTIONS)[number]['key'];

/** Removes a leading `/cs` or `/en` segment; always returns a path starting with `/`. */
export function stripLocale(pathname: string): string {
  const clean = pathname.split(/[?#]/)[0] || '/';
  const segments = clean.split('/').filter(Boolean);
  if (segments[0] && (routing.locales as readonly string[]).includes(segments[0])) segments.shift();
  return `/${segments.join('/')}`;
}

/** Home gets the open scene, `/admin/**` the quiet static backdrop, everything else the darker public scrim. */
export function getRouteMode(pathname: string): RouteMode {
  const path = stripLocale(pathname);
  if (path === '/') return 'home';
  const first = path.split('/')[1];
  return first === 'admin' ? 'admin' : 'public';
}

/** Current primary section by path prefix (`/news/some-article` → `news`); `null` outside the nav. */
export function getCurrentSection(pathname: string): NavSection | null {
  const path = stripLocale(pathname);
  if (path === '/') return 'home';
  const first = path.split('/')[1];
  const match = NAV_SECTIONS.find((section) => section.href !== '/' && section.href === `/${first}`);
  return match ? match.key : null;
}
