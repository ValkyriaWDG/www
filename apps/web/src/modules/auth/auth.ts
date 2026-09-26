import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { authAccount, authRateLimit, authSession, authTwoFactor, authUser, authVerification, type Database } from '@valkyria/db';
import { betterAuth, type BetterAuthPlugin } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware, isAPIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { eq } from 'drizzle-orm';
import { discordClientConfig, isDiscordMembershipConfigured, type AccessEnv } from '@/modules/access/config';
import type { DiscordClientDeps } from '@/modules/access/discord-client';
import { isLocalAccountUser, summarizeAccounts } from '@/modules/access/local-grant';
import { refreshMembership } from '@/modules/access/membership';
import { isSnowflake } from '@/modules/access/snowflake';
import { getDb } from '@/lib/db';
import { getServerEnv, type ServerEnv } from '@/lib/env';
import { assuranceForEndpoint, DISCORD_CALLBACK_PATH, SECOND_FACTOR_PATHS, type AssuranceContext } from './assurance';
import { auditActor, auditAuthEvent, safeCode } from './auth-audit';
import { createHashedBackupCodeStore } from './backup-codes';
import { mapDiscordProfileToUser } from './discord-profile';
import { AUTH_BASE_PATH, createEndpointPolicyHook, isAllowedAuthRequest, type EndpointPolicyFlags } from './endpoint-policy';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SESSION_REFRESH_AGE_SECONDS = 60 * 60 * 24;

export type AuthConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  /** Canonical site origin (`APP_URL`), without locale. */
  appUrl: string;
  /** Better Auth origin (`BETTER_AUTH_URL`), defaults to `appUrl`. */
  authUrl?: string | undefined;
  secret: string | undefined;
  discordClientId?: string | undefined;
  discordClientSecret?: string | undefined;
  access: AccessEnv;
};

export type AuthDeps = {
  /** Discord REST adapter overrides (tests); production uses global fetch. */
  fetchImpl?: typeof fetch;
  discord?: Omit<DiscordClientDeps, 'fetchImpl'>;
};

export function authConfigFromEnv(env: ServerEnv): AuthConfig {
  return {
    nodeEnv: env.NODE_ENV,
    appUrl: env.APP_URL,
    authUrl: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    discordClientId: env.DISCORD_CLIENT_ID,
    discordClientSecret: env.DISCORD_CLIENT_SECRET,
    access: env,
  };
}

export function isDiscordSignInConfigured(config: Pick<AuthConfig, 'discordClientId' | 'discordClientSecret'>): boolean {
  return Boolean(config.discordClientId && config.discordClientSecret);
}

let ephemeralSecret: string | undefined;

function resolveSecret(config: AuthConfig): string {
  if (config.secret) return config.secret;
  if (config.nodeEnv === 'production') throw new Error('BETTER_AUTH_SECRET is required in production.');
  ephemeralSecret ??= randomBytes(32).toString('base64url');
  console.warn('[auth] BETTER_AUTH_SECRET is not set; using an ephemeral development secret (sessions end on restart).');
  return ephemeralSecret;
}

function resolveOrigins(config: AuthConfig) {
  const appOrigin = new URL(config.appUrl).origin;
  const authOrigin = new URL(config.authUrl ?? config.appUrl).origin;
  if (config.nodeEnv === 'production' && !authOrigin.startsWith('https://')) {
    const host = new URL(authOrigin).hostname;
    // Plain HTTP is tolerated only for loopback production builds (browser test harness).
    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') throw new Error('BETTER_AUTH_URL must use https in production.');
  }
  return { appOrigin, authOrigin };
}

/** Rejects every path outside the HTTP allowlist before Better Auth dispatches it. */
function endpointAllowlistPlugin(flags: EndpointPolicyFlags) {
  return {
    id: 'valkyria-endpoint-allowlist',
    onRequest: async (request: Request) => {
      if (isAllowedAuthRequest(request.method, request.url, flags)) return;
      return { response: new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } }) };
    },
  } satisfies BetterAuthPlugin;
}

function redirectLocation(value: unknown): string | null {
  if (!isAPIError(value) || value.status !== 'FOUND') return null;
  try {
    return new Headers(value.headers).get('location');
  } catch {
    return null;
  }
}

/**
 * Builds the Better Auth instance. Security-relevant decisions (verified against
 * better-auth 1.7.6 sources):
 * - DB-backed sessions only (no cookie cache); `assurance` is written by the session
 *   create hook from the endpoint path and can never be set by clients (`input: false`).
 * - Discord with `identify` scope only; alias e-mail; OAuth tokens are not retained.
 * - No sign-up, no account linking, no password reset; local credentials are provisioned
 *   by the operator CLI only and require TOTP. `/sign-in/email` for a 2FA user returns a
 *   challenge and deletes the provisional session (two-factor plugin after-hook).
 * - Durable PostgreSQL rate limiting with stricter rules for sign-in, 2FA and OAuth.
 */
export function createAuth(db: Database, config: AuthConfig, deps: AuthDeps = {}) {
  const secret = resolveSecret(config);
  const { appOrigin, authOrigin } = resolveOrigins(config);
  const discordEnabled = isDiscordSignInConfigured(config);
  const flags: EndpointPolicyFlags = { discordEnabled, localAdminLoginEnabled: config.access.LOCAL_ADMIN_LOGIN_ENABLED };
  const backupCodes = createHashedBackupCodeStore(secret);
  const tokenFields = { accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null };

  const refreshAfterLogin = async (userId: string): Promise<'verified' | 'refresh_failed' | 'not_configured'> => {
    if (!isDiscordMembershipConfigured(config.access)) return 'not_configured';
    const accounts = await summarizeAccounts(db, userId);
    if (!accounts.discordAccountId || !isSnowflake(accounts.discordAccountId)) return 'refresh_failed';
    const result = await refreshMembership(
      db,
      discordClientConfig(config.access),
      { discordUserId: accounts.discordAccountId, userId, source: 'oauth_login' },
      { totalBudgetMs: 3_000, ...deps.discord, fetchImpl: deps.fetchImpl },
    );
    return result.ok ? 'verified' : 'refresh_failed';
  };

  const auditAfter = createAuthMiddleware(async (ctx) => {
    const returned: unknown = ctx.context.returned;
    if (ctx.path === '/sign-in/email' && isAPIError(returned)) {
      await auditAuthEvent(db, {
        actor: { kind: 'anonymous' },
        action: 'auth.sign_in',
        outcome: 'failure',
        summary: { method: 'password', code: safeCode(returned.body?.code) },
      });
    } else if (ctx.path === '/two-factor/verify-totp' && !isAPIError(returned) && ctx.context.session?.session && ctx.context.newSession) {
      // Verification inside an existing session with a new session issued = first enrollment.
      const user = ctx.context.newSession.user;
      await auditAuthEvent(db, {
        actor: auditActor({ userId: user.id, name: user.name, source: 'local_admin', assurance: 'password' }),
        action: 'auth.second_factor_enrolled',
        outcome: 'success',
        summary: { method: 'totp' },
      });
    } else if (ctx.path && SECOND_FACTOR_PATHS.has(ctx.path) && isAPIError(returned)) {
      await auditAuthEvent(db, {
        actor: { kind: 'anonymous' },
        action: 'auth.second_factor',
        outcome: 'failure',
        summary: { method: ctx.path.endsWith('backup-code') ? 'backup_code' : 'totp', code: safeCode(returned.body?.code) },
      });
    } else if (ctx.path === DISCORD_CALLBACK_PATH) {
      const location = redirectLocation(returned);
      if (location && /[?&]error=/.test(location)) {
        const code = new URL(location, appOrigin).searchParams.get('error');
        await auditAuthEvent(db, {
          actor: { kind: 'anonymous' },
          action: 'auth.sign_in',
          outcome: 'failure',
          summary: { method: 'discord', code: safeCode(code) },
        });
      }
    }
  });

  return betterAuth({
    appName: 'Valkyria',
    baseURL: authOrigin,
    basePath: AUTH_BASE_PATH,
    secret,
    trustedOrigins: [...new Set([appOrigin, authOrigin])],
    telemetry: { enabled: false },
    logger: {
      level: config.nodeEnv === 'test' ? 'error' : 'warn',
      // Only the library's message is logged; structured arguments may carry request data.
      log: (level, message) => {
        const line = `[auth] ${message}`;
        if (level === 'error') console.error(line);
        else console.warn(line);
      },
    },
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: authUser,
        session: authSession,
        account: authAccount,
        verification: authVerification,
        twoFactor: authTwoFactor,
        rateLimit: authRateLimit,
      },
    }),
    advanced: {
      // UUIDs generated in the application: with `generateId: 'uuid'` the pg adapter omits
      // the ID and expects a database default, which the auth tables deliberately lack.
      database: { generateId: () => randomUUID() },
      useSecureCookies: authOrigin.startsWith('https://'),
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true, path: '/' },
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    },
    session: {
      expiresIn: SESSION_TTL_SECONDS,
      updateAge: SESSION_REFRESH_AGE_SECONDS,
      freshAge: 60 * 15,
      cookieCache: { enabled: false },
      additionalFields: {
        assurance: { type: 'string', required: false, input: false, returned: true },
      },
    },
    account: {
      accountLinking: { enabled: false, disableImplicitLinking: true, allowDifferentEmails: false },
      updateAccountOnSignIn: false,
      encryptOAuthTokens: true,
      storeStateStrategy: 'database',
    },
    verification: { storeIdentifier: 'hashed' },
    user: {
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },
    emailAndPassword: {
      enabled: config.access.LOCAL_ADMIN_LOGIN_ENABLED,
      disableSignUp: true,
      autoSignIn: false,
      requireEmailVerification: false,
      minPasswordLength: 16,
      maxPasswordLength: 256,
      revokeSessionsOnPasswordReset: true,
    },
    socialProviders: discordEnabled
      ? {
          discord: {
            clientId: config.discordClientId!,
            clientSecret: config.discordClientSecret!,
            disableDefaultScope: true,
            scope: ['identify'],
            mapProfileToUser: (profile) => mapDiscordProfileToUser(profile),
          },
        }
      : {},
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 120,
      customRules: {
        '/sign-in/email': { window: 900, max: 10 },
        '/sign-in/social': { window: 60, max: 10 },
        '/callback/*': { window: 60, max: 20 },
        '/two-factor/*': { window: 300, max: 10 },
      },
    },
    onAPIError: { errorURL: `${appOrigin}/cs/login` },
    databaseHooks: {
      user: {
        create: {
          // Users are created only by the Discord OAuth callback (local admins via the CLI).
          before: async (_user, ctx) => {
            const context = ctx as AssuranceContext;
            if (context?.path !== DISCORD_CALLBACK_PATH || context.params?.id !== 'discord') return false;
            return undefined;
          },
        },
      },
      account: {
        create: {
          before: async (account) => {
            // Credential accounts are operator-provisioned; social accounts only for Discord.
            if (account.providerId !== 'discord') return false;
            // A local recovery account can never gain a social identity (even via stale rows).
            if (await isLocalAccountUser(db, account.userId)) return false;
            return { data: { ...tokenFields, scope: 'identify' } };
          },
        },
        update: {
          before: async (account) => {
            if (account.providerId !== undefined && account.providerId !== 'discord') return false;
            return { data: tokenFields };
          },
        },
      },
      session: {
        create: {
          before: async (session, ctx) => {
            const assurance = assuranceForEndpoint(ctx as AssuranceContext);
            // A Discord callback must never produce a session for a local recovery account.
            if (assurance === 'discord' && (await isLocalAccountUser(db, session.userId))) return false;
            return { data: { assurance } };
          },
          after: async (session) => {
            const assurance = (session as { assurance?: string }).assurance;
            const [user] = await db
              .select({ id: authUser.id, name: authUser.name, twoFactorEnabled: authUser.twoFactorEnabled })
              .from(authUser)
              .where(eq(authUser.id, session.userId))
              .limit(1);
            if (!user) return;
            if (assurance === 'discord') {
              const membership = await refreshAfterLogin(user.id).catch(() => 'refresh_failed' as const);
              await auditAuthEvent(db, {
                actor: auditActor({ userId: user.id, name: user.name, source: 'discord', assurance: 'discord' }),
                action: 'auth.sign_in',
                outcome: 'success',
                summary: { method: 'discord', membership },
              });
            } else if (assurance === 'mfa') {
              await auditAuthEvent(db, {
                actor: auditActor({ userId: user.id, name: user.name, source: 'local_admin', assurance: 'mfa' }),
                action: 'auth.sign_in',
                outcome: 'success',
                summary: { method: 'password_and_second_factor' },
              });
            } else if (assurance === 'password' && !user.twoFactorEnabled) {
              // Restricted setup session (second factor not enrolled yet); cannot use any grant.
              await auditAuthEvent(db, {
                actor: auditActor({ userId: user.id, name: user.name, source: 'local_admin', assurance: 'password' }),
                action: 'auth.sign_in',
                outcome: 'success',
                summary: { method: 'password', restricted: true },
              });
            }
          },
        },
        update: {
          // Assurance is immutable after creation.
          before: async (data) => ('assurance' in data ? false : undefined),
        },
      },
    },
    hooks: {
      before: createEndpointPolicyHook({ db, flags, hashBackupCode: backupCodes.hashCode }),
      after: auditAfter,
    },
    plugins: [
      endpointAllowlistPlugin(flags),
      twoFactor({
        issuer: 'Valkyria',
        skipVerificationOnEnable: false,
        totpOptions: { digits: 6, period: 30 },
        backupCodeOptions: { amount: 10, length: 12, storeBackupCodes: backupCodes.storeBackupCodes },
        twoFactorCookieMaxAge: 600,
        trustDeviceMaxAge: 60,
        accountLockout: { enabled: true, maxFailedAttempts: 10, durationSeconds: 900 },
      }),
      // Must stay last: forwards Set-Cookie from auth.api calls in server actions.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as typeof globalThis & { __valkyriaAuth?: Auth };

/** Process-wide instance, created lazily because configuration is read at runtime. */
export function getAuth(): Auth {
  globalForAuth.__valkyriaAuth ??= createAuth(getDb(), authConfigFromEnv(getServerEnv()));
  return globalForAuth.__valkyriaAuth;
}

/** Test helper: forget the process-wide instance. */
export function resetAuthForTests(): void {
  globalForAuth.__valkyriaAuth = undefined;
}
