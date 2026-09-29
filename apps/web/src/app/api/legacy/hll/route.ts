import { getDb } from '@/lib/db';
import { canonicalOrigin } from '@/lib/legacy-hosts';
import { resolveLegacyHllPath } from '@/modules/legacy/hll';
import { resolvePublishedLegacyHllUrl } from '@/modules/legacy/resolve-public-url';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' };

/** Internal legacy-host rewrite target; also usable as a safe public source alias. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const pathname = params.get('path');
  const locale = params.get('locale') ?? 'cs';
  if ([...params.keys()].some((key) => key !== 'path' && key !== 'locale') || params.getAll('path').length !== 1 || params.getAll('locale').length > 1 || !pathname || !['cs', 'en'].includes(locale) || resolveLegacyHllPath(pathname)?.kind !== 'lookup') {
    return new Response('Not found', { status: 404, headers });
  }
  const origin = canonicalOrigin(process.env.APP_URL);
  if (!origin) return new Response('Temporarily unavailable', { status: 503, headers });
  try {
    const target = await resolvePublishedLegacyHllUrl(getDb(), pathname, locale);
    if (!target) return new Response('Not found', { status: 404, headers });
    const destination = new URL(target, origin);
    if (!target.startsWith(`/${locale}/`) || destination.origin !== origin) return new Response('Not found', { status: 404, headers });
    // Do not permanently cache a mutable publication decision or a renamed target.
    return new Response(null, { status: 307, headers: { ...headers, Location: destination.toString() } });
  } catch {
    // No storage diagnostics, target IDs or unpublished paths cross this public boundary.
    return new Response('Temporarily unavailable', { status: 503, headers });
  }
}
