import createIntlMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import { canonicalOrigin, isLegacyHost, legacyHostLookup, legacyHostRedirect, parseLegacyHosts } from './lib/legacy-hosts';
import { buildContentSecurityPolicy } from './lib/security-headers';
import { resolveUnprefixedRedirect } from './lib/locale-redirect';

const intlMiddleware = createIntlMiddleware(routing);
/** Empty unless a release explicitly routes the legacy HLL host here (see lib/legacy-hosts.ts). */
const LEGACY_REDIRECTS = { hosts: parseLegacyHosts(process.env.LEGACY_HLL_HOSTS), origin: canonicalOrigin(process.env.APP_URL) };

const PRIVATE_SEGMENTS = new Set(['admin', 'account', 'login']);

/**
 * Request boundary for UI routes (APIs, auth callbacks, health, static files and
 * metadata routes are excluded by the matcher and stay unprefixed):
 * - `/` → 307 `/cs` regardless of browser language or cookies;
 * - unprefixed known UI suffix → 307 to the Czech route, keeping only safe filters;
 * - `/cs/*` and `/en/*` → next-intl (URL is the only locale source);
 * - anything else continues to Next.js routing and receives its 404;
 * - on an explicitly configured legacy HLL host, reviewed legacy paths → 308 canonical.
 * Also issues a per-request CSP nonce and request ID. Proxy is not authorization:
 * every private read/mutation is authorized again on the server.
 */
export default function proxy(request: NextRequest) {
  const requestId = sanitizeRequestId(request.headers.get('x-request-id')) ?? crypto.randomUUID();
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildContentSecurityPolicy(nonce);

  const { pathname } = request.nextUrl;
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0];

  if (LEGACY_REDIRECTS.hosts.size > 0) {
    const legacyRequest = { hostname: request.nextUrl.hostname, pathname, searchParams: request.nextUrl.searchParams };
    const legacy = legacyHostRedirect(legacyRequest, LEGACY_REDIRECTS);
    if (legacy) return withHeaders(NextResponse.redirect(legacy, 308), { requestId });
    const lookup = legacyHostLookup(legacyRequest, LEGACY_REDIRECTS);
    if (lookup) return withHeaders(NextResponse.rewrite(new URL(lookup, request.url)), { requestId });
    if (isLegacyHost(legacyRequest, LEGACY_REDIRECTS)) return withHeaders(new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } }), { requestId });
  }

  if (!first || !(routing.locales as readonly string[]).includes(first)) {
    const target = resolveUnprefixedRedirect(pathname, request.nextUrl.searchParams);
    if (target) {
      const url = new URL(target, request.url);
      return withHeaders(NextResponse.redirect(url, 307), { requestId });
    }
    const headers = new Headers(request.headers);
    headers.set('x-request-id', requestId);
    headers.set('x-nonce', nonce);
    headers.set('Content-Security-Policy', csp);
    return withHeaders(NextResponse.next({ request: { headers } }), { requestId, csp });
  }

  const headers = new Headers(request.headers);
  headers.set('x-request-id', requestId);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  // next-intl copies `request.headers` into the forwarded request, so the nonce and
  // request ID reach server components. Only URL/headers are read here; the original
  // body is still delivered by Next.js.
  const response = intlMiddleware(new NextRequest(request.url, { headers, method: request.method }));
  const isPrivate = segments[1] !== undefined && PRIVATE_SEGMENTS.has(segments[1]);
  return withHeaders(response, { requestId, csp, isPrivate });
}

function withHeaders(
  response: NextResponse,
  options: { requestId: string; csp?: string; isPrivate?: boolean },
): NextResponse {
  response.headers.set('x-request-id', options.requestId);
  if (options.csp) response.headers.set('Content-Security-Policy', options.csp);
  if (options.isPrivate) response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

function sanitizeRequestId(value: string | null): string | undefined {
  return value && /^[A-Za-z0-9-]{8,64}$/.test(value) ? value : undefined;
}

export const config = {
  matcher: [
    '/((?!api/|_next/|_vercel|brand/|fonts/|media/|favicon\\.ico|icon\\.png|apple-icon\\.png|robots\\.txt|sitemap\\.xml|.*\\.[a-zA-Z0-9]{2,5}$).*)',
  ],
};
