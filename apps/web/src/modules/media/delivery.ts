import { asset, type AssetVariants, type Executor } from '@valkyria/db';
import { eq } from 'drizzle-orm';
import { can } from '@/modules/access/policy';
import type { Actor } from '@/modules/access/types';
import { scopeCapability } from './scope';
import { isAssetId, isMediaVariant, readVariant } from './storage';
import { hasPublishedReference } from './usage';

/**
 * Publication-aware delivery for `GET /api/media/<assetId>/<full|thumb>`.
 * - Anonymous (public, cacheable for 5 minutes with revalidation) ONLY while at least
 *   one currently published reference exists (see `publishedReferenceSql`).
 * - Otherwise only an authorized actor (`content.read_private` or the asset scope's
 *   media capability) receives the bytes, `private, no-store`.
 * - Everything else is an indistinguishable 404: existence is never revealed.
 * Only bytes are served; no alt/caption or other metadata leaves this endpoint.
 */

export type DeliveryDeps = {
  db: Executor;
  mediaRoot: string;
  /** Resolves the request actor (session → capabilities); anonymous when unavailable. */
  resolveActor: () => Promise<Actor>;
};

export const PUBLIC_MEDIA_CACHE_CONTROL = 'public, max-age=300, must-revalidate';
export const PRIVATE_MEDIA_CACHE_CONTROL = 'private, no-store';

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'Cross-Origin-Resource-Policy': 'same-origin',
} as const;

export function notFoundResponse(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { ...BASE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(',').some((value) => {
    const candidate = value.trim();
    return candidate === '*' || candidate === etag || candidate === `W/${etag}`;
  });
}

async function resolveActorSafely(resolve: () => Promise<Actor>): Promise<Actor> {
  try {
    return await resolve();
  } catch {
    return { kind: 'anonymous' };
  }
}

export async function deliverMedia(request: Request, params: { assetId: string; variant: string }, deps: DeliveryDeps): Promise<Response> {
  const { assetId, variant } = params;
  if (!isAssetId(assetId) || !isMediaVariant(variant)) return notFoundResponse();
  try {
    const [row] = await deps.db
      .select({ id: asset.id, scope: asset.scope, state: asset.state, deletedAt: asset.deletedAt, sha256: asset.sha256, variants: asset.variants })
      .from(asset)
      .where(eq(asset.id, assetId));
    const variants = row?.variants as AssetVariants | null | undefined;
    if (!row || row.deletedAt || row.state !== 'ready' || !variants?.[variant]) return notFoundResponse();

    const isPublic = await hasPublishedReference(deps.db, row.id);
    if (!isPublic) {
      const actor = await resolveActorSafely(deps.resolveActor);
      if (!can(actor, 'content.read_private') && !can(actor, scopeCapability(row.scope))) return notFoundResponse();
    }

    const etag = `"${row.sha256.slice(0, 32)}-${variant}"`;
    const headers: Record<string, string> = {
      ...BASE_HEADERS,
      'Content-Type': 'image/webp',
      'Content-Disposition': 'inline',
      'Cache-Control': isPublic ? PUBLIC_MEDIA_CACHE_CONTROL : PRIVATE_MEDIA_CACHE_CONTROL,
      ETag: etag,
    };
    if (isPublic && etagMatches(request.headers.get('if-none-match'), etag)) {
      return new Response(null, { status: 304, headers });
    }
    const bytes = await readVariant(deps.mediaRoot, row.id, variant);
    if (!bytes) return notFoundResponse();
    headers['Content-Length'] = String(bytes.length);
    return new Response(new Uint8Array(bytes), { status: 200, headers });
  } catch {
    return new Response('Service unavailable', {
      status: 503,
      headers: { ...BASE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '30' },
    });
  }
}
