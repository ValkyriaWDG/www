import 'server-only';
import { parseSetCookieHeader, toCookieOptions } from 'better-auth/cookies';
import { cookies, headers } from 'next/headers';
import { getServerEnv } from '@/lib/env';
import { getAuth } from './auth';
import { AUTH_BASE_PATH } from './endpoint-policy';

export type AuthCallResult = {
  status: number;
  /** Parsed JSON body (or `null`); never shown to users verbatim. */
  body: unknown;
  /** Stable library error code when present (e.g. `INVALID_EMAIL_OR_PASSWORD`). */
  code: string | null;
};

/**
 * Runs a Better Auth endpoint through its full HTTP pipeline (endpoint allowlist, durable
 * rate limiting, origin/CSRF checks, hooks) on behalf of a server action, then copies the
 * resulting Set-Cookie headers into the Next.js response. Calling `auth.api.*` directly
 * would bypass the router-level rate limiter, so sign-in flows use this instead.
 */
export async function callAuthEndpoint(
  path: `/${string}`,
  body: Record<string, unknown>,
  options: { withSession?: boolean } = {},
): Promise<AuthCallResult> {
  const incoming = await headers();
  const env = getServerEnv();
  const origin = new URL(env.BETTER_AUTH_URL ?? env.APP_URL).origin;
  const forwarded = new Headers({ 'content-type': 'application/json', accept: 'application/json' });
  const clientIp = incoming.get('x-forwarded-for');
  if (clientIp) forwarded.set('x-forwarded-for', clientIp);
  const userAgent = incoming.get('user-agent');
  if (userAgent) forwarded.set('user-agent', userAgent.slice(0, 512));
  if (options.withSession) {
    // Session-bound endpoints validate the browser's Origin against trusted origins.
    const cookie = incoming.get('cookie');
    if (cookie) forwarded.set('cookie', cookie);
    const requestOrigin = incoming.get('origin');
    if (requestOrigin) forwarded.set('origin', requestOrigin);
  }

  const response = await getAuth().handler(
    new Request(`${origin}${AUTH_BASE_PATH}${path}`, {
      method: 'POST',
      headers: forwarded,
      body: JSON.stringify(body),
      redirect: 'manual',
    }),
  );

  const store = await cookies();
  for (const line of response.headers.getSetCookie()) {
    parseSetCookieHeader(line).forEach((attributes, name) => {
      if (!name) return;
      store.set(name, attributes.value, toCookieOptions(attributes));
    });
  }

  let parsed: unknown = null;
  try {
    const text = await response.text();
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  const code =
    parsed && typeof parsed === 'object' && 'code' in parsed && typeof (parsed as { code: unknown }).code === 'string'
      ? (parsed as { code: string }).code
      : null;
  return { status: response.status, body: parsed, code };
}
