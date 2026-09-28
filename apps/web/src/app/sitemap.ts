import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getSiteOrigin } from '@/lib/site';
import { listPublishedNewsForSitemap, listPublishedPagesForSitemap } from '@/modules/content/public';
import { listPublishedManualForSitemap } from '@/modules/field-manual/public';
import { GAME_REGISTRY, GAME_ROUTES } from '@/modules/games/registry';
import { canonicalMatchPath, gamePath } from '@/modules/games/routes';
import { listPublicMatchesForSitemap } from '@/modules/matches/queries';
import { listPublicMembersForSitemap } from '@/modules/members/queries';

// Rendered per request from published data only; never cached across publication changes.
export const dynamic = 'force-dynamic';

type Entry = MetadataRoute.Sitemap[number];

/** Shared collection routes that exist in both locales regardless of content. */
const COLLECTIONS = ['', '/news', '/members', '/matches'] as const;

/** Every game landing and section route of the registry (both locales). */
const GAME_COLLECTIONS: string[] = GAME_ROUTES.flatMap((game) => [gamePath(game), ...GAME_REGISTRY[game].sections.map((section) => gamePath(game, section))]);

function localizedPair(origin: string, suffix: string, lastModified?: Date): Entry[] {
  const languages = Object.fromEntries(routing.locales.map((locale) => [locale, `${origin}/${locale}${suffix}`]));
  return routing.locales.map((locale) => ({
    url: `${origin}/${locale}${suffix}`,
    ...(lastModified ? { lastModified } : {}),
    alternates: { languages: { ...languages, 'x-default': `${origin}/cs${suffix}` } },
  }));
}

/**
 * Published public URLs only, each at its canonical address. CMS alternates list a locale
 * only when that translation is published; shared entities (matches, members) exist
 * identically in both locales.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getSiteOrigin();
  const db = getDb();
  const [news, pages, manual, matches, members] = await Promise.all([
    listPublishedNewsForSitemap(db),
    listPublishedPagesForSitemap(db),
    listPublishedManualForSitemap(db),
    listPublicMatchesForSitemap(db),
    listPublicMembersForSitemap(db),
  ]);

  const cms: Entry[] = [...pages, ...news, ...manual].map((entry) => {
    const languages: Record<string, string> = Object.fromEntries(
      Object.entries(entry.alternates).map(([locale, path]) => [locale, `${origin}${path}`]),
    );
    if (languages.cs) languages['x-default'] = languages.cs;
    return { url: `${origin}${entry.path}`, lastModified: entry.lastModified, alternates: { languages } };
  });

  return [
    ...COLLECTIONS.flatMap((suffix) => localizedPair(origin, suffix)),
    ...GAME_COLLECTIONS.flatMap((suffix) => localizedPair(origin, suffix)),
    ...cms,
    ...matches.flatMap((row) => localizedPair(origin, canonicalMatchPath(row.game, row.slug), row.updatedAt)),
    ...members.flatMap((row) => localizedPair(origin, `/members/${row.slug}`, row.updatedAt)),
  ];
}
