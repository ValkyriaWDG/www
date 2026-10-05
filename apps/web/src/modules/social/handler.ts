import 'server-only';
import type { Executor } from '@valkyria/db';
import type { AppLocale } from '@/i18n/routing';
import { getPublishedNewsBySlug } from '@/modules/content/public';
import { getPublicMatch } from '@/modules/matches/queries';
import { deliverMedia } from '@/modules/media/delivery';
import { articleCard, matchCard, parseSocialTarget, siteCard, type SocialCard } from './model';
import { gameRouteFromDb, isGameRoute, type GameRoute } from '@/modules/games/registry';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { linkedPublicLogiMatch } from '@/modules/integrations/logi/public-matches';

export type SocialDeps = {
  /** Lazy: the generic website card works without a database or auth configuration. */
  db: () => Executor;
  /** Same fresh/public projection gate as the match page, called before cache lookup. */
  matchEvents: (game: GameRoute) => Promise<PublicLogiEvent[]>;
  mediaRoot: string;
  siteOrigin: string;
  render: (card: SocialCard, cover: Buffer | null, host: string) => Promise<Uint8Array>;
};

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex', 'Content-Security-Policy': "default-src 'none'; sandbox" };
const missing = () => new Response('Not found', { status: 404, headers });
// Bound process memory/CPU under concurrent crawler traffic. Public lookup happens
// before every render, including cache hits: unpublication cannot bypass that gate.
let activeRenders = 0;
const cache = new Map<string, { png: Uint8Array; expires: number }>();

export async function socialImageResponse(request: Request, params: { locale: string; kind: string; slug?: string[] }, deps: SocialDeps): Promise<Response> {
  const target = parseSocialTarget(params.locale, params.kind, params.slug);
  if (!target) return missing();
  try {
    const requestedGame = new URL(request.url).searchParams.get('game');
    if (requestedGame !== null && !isGameRoute(requestedGame)) return missing();
    // Generic artwork is selectable; entity scope always comes from its published DTO.
    let card = siteCard(target.locale, target.kind, requestedGame && isGameRoute(requestedGame) ? requestedGame : undefined);
    if (target.slug && target.kind === 'news') {
      const result = await getPublishedNewsBySlug(target.locale, target.slug, deps.db());
      if (!result) return missing();
      if (result.kind === 'redirect') {
        return new Response(null, { status: 308, headers: { ...headers, Location: `/api/social/${target.locale}/news/${result.slug}` } });
      }
      card = articleCard(result.article);
    } else if (target.slug && target.kind === 'matches') {
      const result = await getPublicMatch(deps.db(), target.slug, target.locale as AppLocale);
      if (!result) return missing();
      const events = await deps.matchEvents(gameRouteFromDb(result.game));
      card = matchCard(result, target.locale, linkedPublicLogiMatch(events, result));
    }
    let cover: Buffer | null = null;
    if (card.coverId) {
      // Reuse the existing public-delivery decision. An authenticated request to this
      // route can NEVER turn a draft cover into a public image: actor is anonymous.
      // A crawler's image revalidation headers describe this PNG, not its cover.
      // Never forward them and accidentally render a 304 response as a missing cover.
      const response = await deliverMedia(new Request(request.url), { assetId: card.coverId, variant: 'full' }, {
        db: deps.db(), mediaRoot: deps.mediaRoot, resolveActor: async () => ({ kind: 'anonymous' }),
      });
      if (response.status === 503) throw new Error('Media unavailable');
      if (response.ok) cover = Buffer.from(await response.arrayBuffer());
    }
    const host = new URL(deps.siteOrigin).host;
    const key = JSON.stringify([card, host, Boolean(cover)]);
    let cached = cache.get(key);
    if (!cached || cached.expires < Date.now()) {
      if (activeRenders >= 2) return new Response('Service unavailable', { status: 503, headers: { ...headers, 'Retry-After': '5' } });
      activeRenders++;
      try {
        const png = await deps.render(card, cover, host);
        cached = { png, expires: Date.now() + 30_000 };
        if (cache.size >= 32) cache.delete(cache.keys().next().value!);
        cache.set(key, cached);
      } finally { activeRenders--; }
    }
    return new Response(new Uint8Array(cached.png), {
      headers: { ...headers, 'Content-Type': 'image/png', 'Content-Length': String(cached.png.byteLength), 'Content-Disposition': 'inline; filename="valkyria-sharing.png"' },
    });
  } catch {
    return new Response('Service unavailable', { status: 503, headers: { ...headers, 'Retry-After': '30' } });
  }
}
