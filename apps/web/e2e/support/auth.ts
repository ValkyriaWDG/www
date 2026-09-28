import { createHmac, randomInt, randomUUID } from 'node:crypto';
import type { BrowserContext } from '@playwright/test';
import pg from 'pg';
import { e2eDatabaseUrl } from './database-url';

/**
 * Browser-test identities. Everything here is synthetic and talks only to the disposable
 * e2e database and the local Discord mock. The application contains no login bypass: a
 * seeded session is an ordinary Better Auth session row plus the cookie Better Auth itself
 * would set (`better-auth.session_token` = `<token>.<base64 HMAC-SHA256(secret, token)>`,
 * URL-encoded; `__Secure-` prefix only for https origins — see better-call `signCookieValue`
 * and better-auth `createCookieGetter`).
 */

const port = Number(process.env.E2E_PORT ?? 3100);
export const E2E_BASE_URL = `http://127.0.0.1:${port}`;
/** Must equal the secret passed to the web server in playwright.config.ts. */
export const E2E_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || 'e2e-only-ephemeral-secret-not-for-production-000';
const MOCK_PORT = Number(process.env.E2E_DISCORD_MOCK_PORT ?? port + 1000);
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;

/** Synthetic role IDs mapped in playwright.config.ts `DISCORD_ROLE_MAPPING_JSON`. */
export const E2E_ROLE_IDS = {
  member: '200000000000000001',
  editor: '200000000000000002',
  match_manager: '200000000000000003',
  administrator: '200000000000000004',
  /** Editor scoped to Hell Let Loose (`{ roles: ['editor'], games: ['hell-let-loose'] }`). */
  hll_editor: '200000000000000005',
} as const;
export type E2ERole = keyof typeof E2E_ROLE_IDS;

let pool: pg.Pool | undefined;
function db(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: e2eDatabaseUrl(), max: 2, allowExitOnIdle: true });
  return pool;
}

export function syntheticSnowflake(): string {
  let digits = '9';
  while (digits.length < 18) digits += String(randomInt(0, 10));
  return digits;
}

export function sessionCookieName(baseURL: string = E2E_BASE_URL): string {
  return `${new URL(baseURL).protocol === 'https:' ? '__Secure-' : ''}better-auth.session_token`;
}

export function signedSessionCookieValue(token: string, secret: string = E2E_AUTH_SECRET): string {
  const signature = createHmac('sha256', secret).update(token).digest('base64');
  return encodeURIComponent(`${token}.${signature}`);
}

async function control(path: string, body: unknown): Promise<void> {
  const response = await fetch(`${MOCK_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Discord mock control ${path} failed with ${response.status}`);
}

/** Sets the Discord guild membership the mock reports for a synthetic user. */
export async function setDiscordMember(
  discordUserId: string,
  member: { roles?: E2ERole[]; status?: 'present' | 'absent' | 'rate_limited' | 'error' },
): Promise<void> {
  await control('/__control/members', {
    userId: discordUserId,
    roles: (member.roles ?? []).map((role) => E2E_ROLE_IDS[role]),
    status: member.status ?? 'present',
  });
}

/** Simulates a Discord outage (HTTP 503) for one user, or globally without `discordUserId`. */
export async function setDiscordOutage(enabled: boolean, discordUserId?: string): Promise<void> {
  await control('/__control/outage', discordUserId ? { enabled, userId: discordUserId } : { enabled });
}

export type SignedInIdentity = { userId: string; discordUserId: string; sessionToken: string; name: string };

/**
 * Seeds a synthetic Discord-authenticated user (user + Discord account + session with
 * `discord` assurance), registers its guild membership in the mock, and puts the signed
 * session cookie into the browser context. Roles are never stored by this helper: the
 * application derives them server-side from the mock via the configured role mapping.
 */
export async function signInAs(
  context: BrowserContext,
  options: { roles?: E2ERole[]; name?: string; membership?: 'present' | 'absent' | 'outage' } = {},
): Promise<SignedInIdentity> {
  const userId = randomUUID();
  const discordUserId = syntheticSnowflake();
  const name = options.name ?? `Synthetic ${options.roles?.join('+') || 'visitor'}`;
  const sessionToken = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '').slice(0, 8);
  const client = db();
  await client.query(
    `insert into auth_user (id, name, email, email_verified, two_factor_enabled) values ($1, $2, $3, false, false)`,
    [userId, name, `discord-${discordUserId}@accounts.invalid`],
  );
  await client.query(`insert into auth_account (id, account_id, provider_id, user_id) values ($1, $2, 'discord', $3)`, [
    randomUUID(),
    discordUserId,
    userId,
  ]);
  await client.query(
    `insert into auth_session (id, token, user_id, expires_at, assurance, ip_address, user_agent)
     values ($1, $2, $3, now() + interval '1 day', 'discord', '', 'playwright')`,
    [randomUUID(), sessionToken, userId],
  );

  const membership = options.membership ?? 'present';
  if (membership === 'absent') await setDiscordMember(discordUserId, { status: 'absent' });
  else await setDiscordMember(discordUserId, { roles: options.roles ?? [], status: 'present' });
  if (membership === 'outage') await setDiscordOutage(true, discordUserId);

  const url = new URL(E2E_BASE_URL);
  await context.addCookies([
    {
      name: sessionCookieName(),
      value: signedSessionCookieValue(sessionToken),
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      secure: url.protocol === 'https:',
      sameSite: 'Lax',
    },
  ]);
  return { userId, discordUserId, sessionToken, name };
}

/**
 * Makes the stored membership observation (and last refresh attempt) `seconds` old, as if
 * that much time had passed since Discord was last asked. Test-only DB manipulation.
 */
export async function ageMembershipSnapshot(discordUserId: string, seconds: number): Promise<void> {
  const result = await db().query(
    `update guild_membership
        set observed_at = now() - make_interval(secs => $2),
            received_at = now() - make_interval(secs => $2),
            last_refresh_attempt_at = now() - make_interval(secs => $2)
      where discord_user_id = $1`,
    [discordUserId, seconds],
  );
  if (result.rowCount !== 1) throw new Error('No membership snapshot to age.');
}

/** Number of stored sessions for a user (e.g. to assert sign-out revoked it). */
export async function countSessions(userId: string): Promise<number> {
  const result = await db().query<{ count: string }>('select count(*)::text as count from auth_session where user_id = $1', [userId]);
  return Number(result.rows[0]?.count ?? 0);
}
