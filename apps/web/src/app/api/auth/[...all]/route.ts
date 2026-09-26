import { getAuth } from '@/modules/auth/auth';

export const dynamic = 'force-dynamic';

/**
 * Better Auth HTTP surface (`/api/auth/*`, unprefixed; Discord callback
 * `/api/auth/callback/discord`). Only an explicit allowlist of endpoints is served (see
 * `modules/auth/endpoint-policy.ts`); responses are never cacheable.
 */
async function handle(request: Request): Promise<Response> {
  let response: Response;
  try {
    response = await getAuth().handler(request);
  } catch (error) {
    console.error(`[auth] handler failure: ${error instanceof Error ? error.name : 'unknown'}`);
    return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export { handle as GET, handle as POST };
