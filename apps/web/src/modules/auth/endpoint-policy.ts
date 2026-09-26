import type { Executor } from '@valkyria/db';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { isSafeLoginErrorPath, isSafeReturnPath } from '@/modules/access/return-path';
import { consumeAccountAttempt } from './account-throttle';

export const AUTH_BASE_PATH = '/api/auth';

export type EndpointPolicyFlags = {
  /** Discord social sign-in is configured (client ID and secret present). */
  discordEnabled: boolean;
  /** Local administrator recovery (credential + TOTP) is enabled by the operator. */
  localAdminLoginEnabled: boolean;
};

type HttpRule = { methods: readonly string[]; requires?: 'discord' | 'local' };

/**
 * The complete public HTTP surface of `/api/auth/*`. Everything else — sign-up, account
 * linking/unlinking, password reset/change, e-mail flows, session/user updates, token
 * access, 2FA disable/OTP — answers 404 before reaching Better Auth's handlers.
 */
const HTTP_ALLOWLIST: Readonly<Record<string, HttpRule>> = {
  '/get-session': { methods: ['GET'] },
  '/sign-out': { methods: ['POST'] },
  '/sign-in/social': { methods: ['POST'], requires: 'discord' },
  '/callback/discord': { methods: ['GET'], requires: 'discord' },
  '/sign-in/email': { methods: ['POST'], requires: 'local' },
  '/two-factor/enable': { methods: ['POST'], requires: 'local' },
  '/two-factor/verify-totp': { methods: ['POST'], requires: 'local' },
  '/two-factor/verify-backup-code': { methods: ['POST'], requires: 'local' },
};

/** Endpoint route patterns that may run at all (HTTP or `auth.api`). */
const ENDPOINT_ALLOWLIST: Readonly<Record<string, HttpRule['requires'] | null>> = {
  '/get-session': null,
  '/sign-out': null,
  '/sign-in/social': 'discord',
  '/callback/:id': 'discord',
  '/sign-in/email': 'local',
  '/two-factor/enable': 'local',
  '/two-factor/verify-totp': 'local',
  '/two-factor/verify-backup-code': 'local',
};

function flagAllows(requires: HttpRule['requires'] | null | undefined, flags: EndpointPolicyFlags): boolean {
  if (requires === 'discord') return flags.discordEnabled;
  if (requires === 'local') return flags.localAdminLoginEnabled;
  return true;
}

/** Path relative to the auth base path, or `null` for anything outside it. */
export function relativeAuthPath(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  if (!pathname.startsWith(`${AUTH_BASE_PATH}/`)) return null;
  return pathname.slice(AUTH_BASE_PATH.length);
}

export function isAllowedAuthRequest(method: string, url: string, flags: EndpointPolicyFlags): boolean {
  const path = relativeAuthPath(url);
  if (!path) return false;
  const rule = Object.hasOwn(HTTP_ALLOWLIST, path) ? HTTP_ALLOWLIST[path] : undefined;
  if (!rule || !rule.methods.includes(method.toUpperCase())) return false;
  return flagAllows(rule.requires, flags);
}

const notFound = () => new APIError('NOT_FOUND', { message: 'Not found.', code: 'NOT_FOUND' });
const badRequest = () => new APIError('BAD_REQUEST', { message: 'Invalid request.', code: 'INVALID_REQUEST' });

type Body = Record<string, unknown>;

function asBody(value: unknown): Body | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Body) : null;
}

function onlyKeys(body: Body, allowed: readonly string[]): boolean {
  return Object.keys(body).every((key) => allowed.includes(key));
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

/** Validates the Discord sign-in initiation body: only localized same-origin return paths. */
export function isValidSocialSignInBody(value: unknown): boolean {
  const body = asBody(value);
  if (!body || !onlyKeys(body, ['provider', 'callbackURL', 'errorCallbackURL', 'disableRedirect'])) return false;
  if (body.provider !== 'discord') return false;
  if (body.disableRedirect !== undefined && typeof body.disableRedirect !== 'boolean') return false;
  return isSafeReturnPath(body.callbackURL) && isSafeLoginErrorPath(body.errorCallbackURL);
}

export type EndpointPolicyDeps = {
  db: Executor;
  flags: EndpointPolicyFlags;
  hashBackupCode: (code: string) => string;
};

/**
 * `hooks.before` for every dispatched endpoint (HTTP router and `auth.api.*`): denies
 * anything outside the endpoint allowlist regardless of library configuration, validates
 * bodies, applies the per-account credential throttle and hashes submitted backup codes.
 */
export function createEndpointPolicyHook({ db, flags, hashBackupCode }: EndpointPolicyDeps) {
  return createAuthMiddleware(async (ctx) => {
    const path = ctx.path;
    // Server-only endpoints (no HTTP route) are callable only from trusted server code.
    if (path === undefined || path === '/:virtual') return;
    if (!Object.hasOwn(ENDPOINT_ALLOWLIST, path)) throw notFound();
    if (!flagAllows(ENDPOINT_ALLOWLIST[path], flags)) throw notFound();

    switch (path) {
      case '/callback/:id': {
        if (ctx.params?.id !== 'discord') throw notFound();
        return;
      }
      case '/sign-in/social': {
        if (!isValidSocialSignInBody(ctx.body)) throw badRequest();
        return;
      }
      case '/sign-in/email': {
        const body = asBody(ctx.body);
        if (!body || !onlyKeys(body, ['email', 'password', 'rememberMe'])) throw badRequest();
        if (!boundedString(body.email, 254) || !boundedString(body.password, 256)) throw badRequest();
        if (body.rememberMe !== undefined && typeof body.rememberMe !== 'boolean') throw badRequest();
        const verdict = await consumeAccountAttempt(db, body.email);
        if (!verdict.allowed) {
          throw new APIError('TOO_MANY_REQUESTS', { message: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' }, {
            'X-Retry-After': String(verdict.retryAfterSeconds),
          });
        }
        return;
      }
      case '/two-factor/enable': {
        const body = asBody(ctx.body);
        if (!body || !onlyKeys(body, ['password', 'method']) || !boundedString(body.password, 256)) throw badRequest();
        if (body.method !== undefined && body.method !== 'totp') throw badRequest();
        return;
      }
      case '/two-factor/verify-totp': {
        const body = asBody(ctx.body);
        if (!body || !onlyKeys(body, ['code', 'trustDevice']) || !boundedString(body.code, 16)) throw badRequest();
        // Trusted devices would let a later password-only sign-in skip the second factor.
        if (body.trustDevice === true) throw badRequest();
        return;
      }
      case '/two-factor/verify-backup-code': {
        const body = asBody(ctx.body);
        if (!body || !onlyKeys(body, ['code', 'trustDevice', 'disableSession']) || !boundedString(body.code, 64)) throw badRequest();
        if (body.trustDevice === true || body.disableSession === true) throw badRequest();
        return { context: { body: { ...body, code: hashBackupCode(body.code) } } };
      }
      default:
        return;
    }
  });
}
