import 'server-only';
import { getCurrentAuthEndpointContext } from '@better-auth/core/context';
import { authAccount, authSession, authUser, type Executor } from '@valkyria/db';
import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { and, eq, exists, ne, notExists, or } from 'drizzle-orm';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import { z } from 'zod';

export const LOGI_PROVIDER_ID = 'logi';
const MAX_SESSION_MS = 60 * 60 * 1000;
const MAX_USERINFO_BYTES = 16 * 1024;
const TIMEOUT_MS = 4000;
const snowflake = z.string().regex(/^\d{5,25}$/);
const sid = z.string().min(16).max(200).regex(/^[A-Za-z0-9_-]+$/);

export type LogiProviderConfig = {
  enabled: boolean;
  issuerUrl?: string | undefined;
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  guildId?: string | undefined;
  discordFallbackEnabled?: boolean | undefined;
  /** Explicit isolated harness option. Only a literal loopback host can use HTTP. */
  allowLoopbackHttp?: boolean | undefined;
};

type ReadyConfig = { issuer: string; clientId: string; clientSecret: string; guildId: string };
export type LogiProviderDeps = { fetchImpl?: typeof fetch; now?: () => Date };

export function logiProviderConfigFromEnv(env: {
  LOGI_SSO_ENABLED?: boolean;
  LOGI_ISSUER_URL?: string;
  LOGI_CLIENT_ID?: string;
  LOGI_CLIENT_SECRET?: string;
  LOGI_GUILD_ID?: string;
  LOGI_DISCORD_FALLBACK_ENABLED?: boolean;
  LOGI_ALLOW_LOOPBACK_HTTP?: boolean;
}): LogiProviderConfig {
  return {
    enabled: env.LOGI_SSO_ENABLED === true,
    issuerUrl: env.LOGI_ISSUER_URL,
    clientId: env.LOGI_CLIENT_ID,
    clientSecret: env.LOGI_CLIENT_SECRET,
    guildId: env.LOGI_GUILD_ID,
    discordFallbackEnabled: env.LOGI_DISCORD_FALLBACK_ENABLED,
    allowLoopbackHttp: env.LOGI_ALLOW_LOOPBACK_HTTP,
  };
}

export function resolveLogiConfig(config: LogiProviderConfig | undefined): ReadyConfig | null {
  if (!config?.enabled || !config.issuerUrl || !config.clientId || !config.clientSecret || !config.guildId) return null;
  if (!snowflake.safeParse(config.guildId).success || config.clientId.length > 200 || config.clientSecret.length < 16) return null;
  try {
    const url = new URL(config.issuerUrl);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(config.allowLoopbackHttp && loopback && url.protocol === 'http:')) return null;
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return { issuer: url.origin, clientId: config.clientId, clientSecret: config.clientSecret, guildId: config.guildId };
  } catch {
    return null;
  }
}

export function isLogiSignInConfigured(config: LogiProviderConfig | undefined): boolean {
  return resolveLogiConfig(config) !== null;
}

const userInfoSchema = z.object({
  sub: snowflake,
  name: z.string().trim().min(1).max(100),
  picture: z.string().max(1000).nullable().optional(),
  guild_id: snowflake,
  sid,
}).strict();
type LogiUserInfo = z.infer<typeof userInfoSchema>;

function safePicture(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function safeName(value: string): string {
  const name = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, 80);
  return name && !name.includes('@') ? name : 'Logi user';
}

type UserInfoResult = { ok: true; value: LogiUserInfo } | { ok: false; reason: 'revoked' | 'unavailable' | 'invalid_response' };

/** Fixed trusted endpoint; no redirects, raw provider errors or unbounded bodies. */
async function fetchUserInfo(config: ReadyConfig, token: string, deps: LogiProviderDeps): Promise<UserInfoResult> {
  let response: Response;
  try {
    response = await (deps.fetchImpl ?? fetch)(`${config.issuer}/api/sso/userinfo`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      return { ok: false, reason: 'revoked' };
    }
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, reason: 'unavailable' };
    }
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) {
      await response.body?.cancel();
      return { ok: false, reason: 'invalid_response' };
    }
    const reader = response.body.getReader();
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_USERINFO_BYTES) return { ok: false, reason: 'invalid_response' };
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    const result = userInfoSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!result.success || result.data.guild_id !== config.guildId) return { ok: false, reason: 'invalid_response' };
    return { ok: true, value: result.data };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export type LogiSessionBinding = {
  logiIssuer: string;
  logiClientId: string;
  logiSubject: string;
  logiSid: string;
  logiGuildId: string;
  logiAccessTokenCiphertext: string;
  logiAccessTokenExpiresAt: Date;
};

// Better Auth's request context comes from its maintained AsyncLocalStorage boundary.
// A WeakMap carries validated material only from this callback to this session hook;
// it cannot cross concurrent callbacks and cannot enter a client/session DTO.
const bindings = new WeakMap<object, LogiSessionBinding>();

export function takeLogiCallbackBinding(context: unknown): LogiSessionBinding | null {
  if (context === null || typeof context !== 'object') return null;
  const binding = bindings.get(context) ?? null;
  bindings.delete(context);
  return binding;
}

/** The maintained plugin owns state, PKCE, nonce binding and JWT signature checks. */
export function createLogiProvider(config: LogiProviderConfig | undefined, encryptionSecret: string, deps: LogiProviderDeps = {}) {
  const ready = resolveLogiConfig(config);
  if (!ready) return null;
  return genericOAuth({
    config: [{
      providerId: LOGI_PROVIDER_ID,
      clientId: ready.clientId,
      clientSecret: ready.clientSecret,
      discoveryUrl: `${ready.issuer}/.well-known/openid-configuration`,
      requireIdTokenVerification: true,
      pkce: true,
      scopes: ['openid', 'profile'],
      tokenEndpointAuth: { method: 'client_secret_post' },
      async getUserInfo(tokens) {
        // genericOAuth verified the signature, nonce and discovered issuer/audience
        // before invoking this hook. Explicit requirements also reject a missing
        // id_token and prevent discovery changes from silently switching authority.
        if (!tokens.idToken || !tokens.accessToken || tokens.accessToken.length > 4096) return null;
        const now = (deps.now ?? (() => new Date()))();
        let claims;
        try {
          if (decodeProtectedHeader(tokens.idToken).alg !== 'RS256') return null;
          claims = decodeJwt(tokens.idToken);
        } catch {
          return null;
        }
        if (claims.iss !== ready.issuer || claims.aud !== ready.clientId || !snowflake.safeParse(claims.sub).success || !sid.safeParse(claims.sid).success || claims.guild_id !== ready.guildId) return null;
        if (typeof claims.exp !== 'number' || typeof claims.iat !== 'number' || claims.exp * 1000 <= now.getTime() || claims.iat * 1000 > now.getTime() + 30_000 || claims.exp <= claims.iat) return null;
        const expiry = tokens.accessTokenExpiresAt;
        if (!(expiry instanceof Date) || !Number.isFinite(expiry.getTime()) || expiry <= now) return null;
        const result = await fetchUserInfo(ready, tokens.accessToken, deps);
        if (!result.ok || result.value.sub !== claims.sub || result.value.sid !== claims.sid) return null;
        const context = getCurrentAuthEndpointContext();
        if (context.path !== '/callback/:id' || context.params?.id !== LOGI_PROVIDER_ID) return null;
        bindings.set(context, {
          logiIssuer: ready.issuer,
          logiClientId: ready.clientId,
          logiSubject: result.value.sub,
          logiSid: result.value.sid,
          logiGuildId: result.value.guild_id,
          logiAccessTokenCiphertext: await symmetricEncrypt({ key: encryptionSecret, data: tokens.accessToken }),
          logiAccessTokenExpiresAt: new Date(Math.min(expiry.getTime(), claims.exp * 1000, now.getTime() + MAX_SESSION_MS)),
        });
        return {
          sub: result.value.sub,
          name: safeName(result.value.name),
          email: `logi-${result.value.sub}@accounts.invalid`,
          emailVerified: false,
          image: safePicture(result.value.picture),
        };
      },
    }],
  });
}

export type LogiSessionValidation =
  | { ok: true; subject: string; guildId: string; sid: string; validatedAt: Date }
  | { ok: false; reason: 'not_configured' | 'revoked' | 'unavailable' | 'invalid_binding' };

/** Central logout is checked on every protected request; no cross-request cache. */
export async function validateLogiSession(
  db: Executor,
  sessionId: string,
  userId: string,
  config: LogiProviderConfig | undefined,
  encryptionSecret: string,
  deps: LogiProviderDeps = {},
): Promise<LogiSessionValidation> {
  const ready = resolveLogiConfig(config);
  if (!ready) return { ok: false, reason: 'not_configured' };
  const now = deps.now ?? (() => new Date());
  const where = and(eq(authSession.id, sessionId), eq(authSession.userId, userId), eq(authSession.assurance, 'logi'));
  const [session] = await db.select().from(authSession).where(where).limit(1);
  if (!session || session.expiresAt <= now()) return { ok: false, reason: 'revoked' };
  if (session.logiIssuer !== ready.issuer || session.logiClientId !== ready.clientId || session.logiGuildId !== ready.guildId || !session.logiSubject || !session.logiSid || !session.logiAccessTokenCiphertext || !session.logiAccessTokenExpiresAt) return { ok: false, reason: 'invalid_binding' };
  const revoke = async (): Promise<LogiSessionValidation> => {
    await db.delete(authSession).where(and(where, eq(authSession.logiAccessTokenCiphertext, session.logiAccessTokenCiphertext!)));
    return { ok: false, reason: 'revoked' };
  };
  if (session.logiAccessTokenExpiresAt <= now()) return revoke();
  let token: string;
  try {
    token = await symmetricDecrypt({ key: encryptionSecret, data: session.logiAccessTokenCiphertext });
  } catch {
    return { ok: false, reason: 'invalid_binding' };
  }
  const result = await fetchUserInfo(ready, token, deps);
  if (!result.ok) return result.reason === 'revoked' ? revoke() : { ok: false, reason: result.reason === 'invalid_response' ? 'invalid_binding' : 'unavailable' };
  if (result.value.sub !== session.logiSubject || result.value.sid !== session.logiSid) return revoke();
  const [current] = await db.select().from(authSession).where(where).limit(1);
  const checkedAt = now();
  if (!current || current.expiresAt <= checkedAt || !current.logiAccessTokenExpiresAt || current.logiAccessTokenExpiresAt <= checkedAt || current.logiIssuer !== session.logiIssuer || current.logiClientId !== session.logiClientId || current.logiSubject !== session.logiSubject || current.logiGuildId !== session.logiGuildId || current.logiSid !== session.logiSid || current.logiAccessTokenCiphertext !== session.logiAccessTokenCiphertext) return { ok: false, reason: 'revoked' };
  return { ok: true, subject: session.logiSubject, guildId: session.logiGuildId, sid: session.logiSid, validatedAt: checkedAt };
}

/**
 * Server-side delegation only. Authorize the game capability before calling this
 * helper and never serialize its result into a response, action result or log.
 */
export async function readLogiActorToken(
  db: Executor,
  sessionId: string,
  userId: string,
  config: LogiProviderConfig | undefined,
  encryptionSecret: string,
  deps: LogiProviderDeps = {},
): Promise<{ subject: string; guildId: string; sid: string; token: string } | null> {
  const ready = resolveLogiConfig(config);
  if (!ready || encryptionSecret.length < 32) return null;
  const where = and(eq(authSession.id, sessionId), eq(authSession.userId, userId), eq(authSession.assurance, 'logi'));
  const [binding] = await db.select().from(authSession).where(where).limit(1);
  if (!binding?.logiAccessTokenCiphertext || !binding.logiAccessTokenExpiresAt) return null;

  const validated = await validateLogiSession(db, sessionId, userId, config, encryptionSecret, deps);
  if (!validated.ok || validated.subject !== binding.logiSubject || validated.guildId !== binding.logiGuildId || validated.sid !== binding.logiSid) return null;
  let token: string;
  try {
    token = await symmetricDecrypt({ key: encryptionSecret, data: binding.logiAccessTokenCiphertext });
  } catch {
    return null;
  }

  // Re-read after all asynchronous central validation and decryption. A concurrent
  // logout, rebinding or expiry must not release the previously captured token.
  const [current] = await db.select().from(authSession).where(and(
    where,
    exists(db.select({ id: authUser.id }).from(authUser).where(eq(authUser.id, userId))),
    exists(db.select({ id: authAccount.id }).from(authAccount).where(and(
      eq(authAccount.userId, userId), eq(authAccount.providerId, LOGI_PROVIDER_ID), eq(authAccount.accountId, validated.subject),
    ))),
    notExists(db.select({ id: authAccount.id }).from(authAccount).where(and(
      eq(authAccount.userId, userId), or(ne(authAccount.providerId, LOGI_PROVIDER_ID), ne(authAccount.accountId, validated.subject)),
    ))),
  )).limit(1);
  const checkedAt = (deps.now ?? (() => new Date()))();
  if (!current || current.expiresAt <= checkedAt || current.expiresAt.getTime() !== binding.expiresAt.getTime()
    || current.logiIssuer !== ready.issuer || current.logiIssuer !== binding.logiIssuer
    || current.logiClientId !== ready.clientId || current.logiClientId !== binding.logiClientId
    || current.logiSubject !== validated.subject || current.logiGuildId !== ready.guildId || current.logiGuildId !== validated.guildId
    || current.logiSid !== validated.sid || current.logiAccessTokenCiphertext !== binding.logiAccessTokenCiphertext
    || !current.logiAccessTokenExpiresAt || current.logiAccessTokenExpiresAt <= checkedAt
    || current.logiAccessTokenExpiresAt.getTime() !== binding.logiAccessTokenExpiresAt.getTime()) return null;
  return { subject: validated.subject, guildId: validated.guildId, sid: validated.sid, token };
}
