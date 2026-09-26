import { auditEvent, authAccount, authRateLimit, authSession, authTwoFactor, authUser } from '@valkyria/db';
import { and, eq, like } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { resolveActor } from '@/modules/access/resolve-actor';
import { isHashedBackupCodeList } from '@/modules/auth/backup-codes';
import {
  CookieJar,
  createHarness,
  GUILD_ID,
  insertLocalAdmin,
  membershipRow,
  ROLE,
  sessionCount,
  syntheticSnowflake,
  testAccessEnv,
  totp,
  totpKeyFromUri,
  type Harness,
} from './auth-harness';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});

afterAll(async () => {
  await h.close();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const SESSION_COOKIE = 'better-auth.session_token';

async function userSessions(userId: string) {
  return h.db.select().from(authSession).where(eq(authSession.userId, userId));
}

describe('disabled registration and linking surface', () => {
  it('rejects public sign-up over HTTP even with local admin login enabled', async () => {
    const email = `signup-${Date.now()}@example.test`;
    const response = await h.request('/sign-up/email', { body: { email, password: 'a-long-enough-password-123', name: 'Intruder' } });
    expect(response.status).toBe(404);
    const rows = await h.db.select().from(authUser).where(eq(authUser.email, email));
    expect(rows).toHaveLength(0);
  });

  it('rejects sign-up through the server API as well', async () => {
    const email = `signup-api-${Date.now()}@example.test`;
    await expect(h.auth.api.signUpEmail({ body: { email, password: 'a-long-enough-password-123', name: 'Intruder' } })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(await h.db.select().from(authUser).where(eq(authUser.email, email))).toHaveLength(0);
  });

  it.each([
    ['POST', '/link-social', { provider: 'discord', callbackURL: '/cs/account' }],
    ['POST', '/unlink-account', { providerId: 'discord' }],
    ['GET', '/list-accounts', undefined],
    ['POST', '/update-session', { assurance: 'mfa' }],
    ['POST', '/update-user', { name: 'Renamed' }],
    ['POST', '/change-email', { newEmail: 'x@example.test' }],
    ['POST', '/change-password', { currentPassword: 'x', newPassword: 'y' }],
    ['POST', '/request-password-reset', { email: 'x@example.test' }],
    ['POST', '/two-factor/disable', { password: 'x' }],
    ['POST', '/two-factor/send-otp', {}],
    ['GET', '/callback/github?code=x&state=y', undefined],
    ['GET', '/error', undefined],
  ])('answers 404 for %s %s', async (method, path, body) => {
    const response = await h.request(path, { method, body });
    expect(response.status).toBe(404);
  });

  it('rejects account-link and session-update calls through the server API', async () => {
    await expect(h.auth.api.linkSocialAccount({ body: { provider: 'discord', callbackURL: '/cs/account' }, headers: new Headers() })).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(h.auth.api.updateSession({ body: { assurance: 'mfa' }, headers: new Headers() })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('local administrator credential + TOTP flow', () => {
  it('keeps enrollment restricted and grants MFA assurance only after a second-factor sign-in', async () => {
    const admin = await insertLocalAdmin(h.db, { roles: ['administrator'] });

    // 1. Password-only sign-in before enrollment: restricted `password` session.
    const setupJar = new CookieJar();
    const signIn = await h.request('/sign-in/email', { body: { email: admin.email, password: admin.password }, cookies: setupJar });
    expect(signIn.status).toBe(200);
    expect(setupJar.has(SESSION_COOKIE)).toBe(true);
    expect((await userSessions(admin.userId)).map((s) => s.assurance)).toEqual(['password']);

    // 2. Enrollment returns the TOTP URI and backup codes once; codes are stored hashed.
    const enable = await h.request('/two-factor/enable', { body: { password: admin.password }, cookies: setupJar });
    expect(enable.status).toBe(200);
    const enrollment = (await enable.json()) as { totpURI: string; backupCodes: string[] };
    expect(enrollment.backupCodes).toHaveLength(10);
    const [stored] = await h.db.select().from(authTwoFactor).where(eq(authTwoFactor.userId, admin.userId));
    expect(isHashedBackupCodeList(stored!.backupCodes)).toBe(true);
    for (const code of enrollment.backupCodes) expect(stored!.backupCodes).not.toContain(code);
    const key = totpKeyFromUri(enrollment.totpURI);

    // 3. Enrollment verification enables 2FA but the session stays `password`.
    const confirm = await h.request('/two-factor/verify-totp', { body: { code: totp(key) }, cookies: setupJar });
    expect(confirm.status).toBe(200);
    const [enrolled] = await h.db.select().from(authUser).where(eq(authUser.id, admin.userId));
    expect(enrolled!.twoFactorEnabled).toBe(true);
    expect((await userSessions(admin.userId)).map((s) => s.assurance)).toEqual(['password']);

    const restricted = await resolveActor(h.db, {
      session: (await userSessions(admin.userId))[0]!,
      user: { id: admin.userId, name: 'Recovery Operator', twoFactorEnabled: true },
      intent: 'write',
      env: testAccessEnv(),
    });
    expect(restricted).toMatchObject({ kind: 'principal', status: 'mfa_required' });

    // 4. A new credential sign-in with 2FA enabled yields no session, only a challenge.
    const sessionsBefore = await sessionCount(h.db, admin.userId);
    const jar = new CookieJar();
    const challenge = await h.request('/sign-in/email', { body: { email: admin.email, password: admin.password }, cookies: jar });
    expect(challenge.status).toBe(200);
    expect(await challenge.json()).toMatchObject({ twoFactorRedirect: true });
    expect(jar.has(SESSION_COOKIE)).toBe(false);
    expect(await sessionCount(h.db, admin.userId)).toBe(sessionsBefore);
    const pending = await h.request('/get-session', { cookies: jar });
    expect(await pending.json()).toBeNull();

    // 5. Wrong code is rejected; trusting the device is refused.
    const wrong = await h.request('/two-factor/verify-totp', { body: { code: '000000' === totp(key) ? '111111' : '000000' }, cookies: jar });
    expect(wrong.status).toBe(401);
    const trust = await h.request('/two-factor/verify-totp', { body: { code: totp(key), trustDevice: true }, cookies: jar });
    expect(trust.status).toBe(400);

    // 6. Correct TOTP completes the sign-in with `mfa` assurance and the grant applies.
    const verified = await h.request('/two-factor/verify-totp', { body: { code: totp(key) }, cookies: jar });
    expect(verified.status).toBe(200);
    expect(jar.has(SESSION_COOKIE)).toBe(true);
    const mfaSession = (await userSessions(admin.userId)).find((s) => s.assurance === 'mfa');
    expect(mfaSession).toBeDefined();
    const actor = await resolveActor(h.db, {
      session: mfaSession!,
      user: { id: admin.userId, name: 'Recovery Operator', twoFactorEnabled: true },
      intent: 'write',
      env: testAccessEnv(),
    });
    expect(actor).toMatchObject({ kind: 'principal', status: 'verified', source: 'local_admin', localGrant: { id: admin.grantId, version: 1 } });
    if (actor.kind === 'principal') expect(actor.capabilities.has('settings.manage')).toBe(true);

    // 7. Backup codes work exactly once.
    const backupCode = enrollment.backupCodes[0]!;
    const jarA = new CookieJar();
    await h.request('/sign-in/email', { body: { email: admin.email, password: admin.password }, cookies: jarA, ip: '198.51.100.21' });
    const useOnce = await h.request('/two-factor/verify-backup-code', { body: { code: backupCode }, cookies: jarA, ip: '198.51.100.21' });
    expect(useOnce.status).toBe(200);
    const jarB = new CookieJar();
    await h.request('/sign-in/email', { body: { email: admin.email, password: admin.password }, cookies: jarB, ip: '198.51.100.22' });
    const reuse = await h.request('/two-factor/verify-backup-code', { body: { code: backupCode }, cookies: jarB, ip: '198.51.100.22' });
    expect(reuse.status).toBe(401);
    expect(jarB.has(SESSION_COOKIE)).toBe(false);

    const audit = await h.db.select().from(auditEvent).where(eq(auditEvent.actorUserId, admin.userId));
    expect(audit.some((event) => event.action === 'auth.sign_in' && event.summary.method === 'password_and_second_factor')).toBe(true);
    expect(audit.filter((event) => event.action === 'auth.second_factor_enrolled')).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(admin.email);
  });

  it('rejects wrong passwords with a generic error', async () => {
    const admin = await insertLocalAdmin(h.db);
    const response = await h.request('/sign-in/email', { body: { email: admin.email, password: 'definitely-not-the-password' }, ip: '198.51.100.30' });
    expect(response.status).toBe(401);
    const unknown = await h.request('/sign-in/email', { body: { email: 'nobody@example.test', password: 'definitely-not-the-password' }, ip: '198.51.100.30' });
    expect(unknown.status).toBe(401);
    expect((await response.json()).code).toBe((await unknown.json()).code);
  });
});

describe('durable rate limiting', () => {
  it('limits repeated failed sign-ins per IP with state persisted in PostgreSQL', async () => {
    const ip = '203.0.113.77';
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await h.request('/sign-in/email', { body: { email: `probe-${attempt}@example.test`, password: 'wrong-password-value' }, ip });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
    const rows = await h.db.select().from(authRateLimit).where(eq(authRateLimit.key, `${ip}|/sign-in/email`));
    expect(rows[0]?.count).toBe(10);
  });

  it('limits repeated attempts against one account across IPs', async () => {
    const email = `target-${Date.now()}@example.test`;
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await h.request('/sign-in/email', { body: { email, password: 'wrong-password-value' }, ip: `192.0.2.${attempt + 1}` });
      statuses.push(response.status);
    }
    expect(statuses[10]).toBe(429);
    const rows = await h.db.select().from(authRateLimit).where(like(authRateLimit.key, 'account:%'));
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain(email);
  });

  it('limits Discord sign-in initiation', async () => {
    const ip = '203.0.113.88';
    let last = 0;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await h.request('/sign-in/social', {
        body: { provider: 'discord', callbackURL: '/cs/account', errorCallbackURL: '/cs/login', disableRedirect: true },
        ip,
      });
      last = response.status;
    }
    expect(last).toBe(429);
  });
});

describe('Discord sign-in initiation validation', () => {
  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil',
    'javascript:alert(1)',
    '/de/admin',
    '/api/auth/sign-out',
    '/cs/../api/auth/get-session',
  ])('rejects callbackURL %s', async (callbackURL) => {
    const response = await h.request('/sign-in/social', {
      body: { provider: 'discord', callbackURL, errorCallbackURL: '/cs/login', disableRedirect: true },
      ip: '198.51.100.40',
    });
    expect(response.status).toBe(400);
  });

  it('rejects extra scopes, other providers and foreign error URLs', async () => {
    for (const body of [
      { provider: 'discord', callbackURL: '/cs/account', errorCallbackURL: '/cs/login', scopes: ['email', 'guilds'] },
      { provider: 'github', callbackURL: '/cs/account', errorCallbackURL: '/cs/login' },
      { provider: 'discord', callbackURL: '/cs/account', errorCallbackURL: 'https://evil.example/login' },
      { provider: 'discord', callbackURL: '/cs/account', errorCallbackURL: '/cs/admin' },
      { provider: 'discord', callbackURL: '/cs/account' },
    ]) {
      const response = await h.request('/sign-in/social', { body, ip: '198.51.100.41' });
      expect(response.status).toBe(400);
    }
  });

  it('builds an identify-only authorization URL and binds state to a cookie', async () => {
    const jar = new CookieJar();
    const response = await h.request('/sign-in/social', {
      body: { provider: 'discord', callbackURL: '/en/admin', errorCallbackURL: '/en/login?returnTo=%2Fen%2Fadmin', disableRedirect: true },
      cookies: jar,
      ip: '198.51.100.42',
    });
    expect(response.status).toBe(200);
    const { url } = (await response.json()) as { url: string };
    const authorize = new URL(url);
    expect(authorize.origin).toBe('https://discord.com');
    expect(authorize.searchParams.get('scope')).toBe('identify');
    expect(authorize.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/auth/callback/discord');
    expect(jar.has('better-auth.state')).toBe(true);
  });
});

type DiscordProfile = { id: string; username: string; global_name: string | null; avatar: null; discriminator: string; email?: string };

function stubDiscordOAuth(profile: DiscordProfile) {
  const original = globalThis.fetch;
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://discord.com/api/oauth2/token')) {
      return Response.json({ access_token: 'synthetic-access-token', token_type: 'Bearer', expires_in: 604800, refresh_token: 'synthetic-refresh', scope: 'identify' });
    }
    if (/^https:\/\/discord\.com\/api\/users\/(@|%40)me/.test(url)) return Response.json(profile);
    return original(input, init);
  });
}

async function startDiscordFlow(ip: string, callbackURL = '/en/account', errorCallbackURL = '/en/login') {
  const jar = new CookieJar();
  const response = await h.request('/sign-in/social', {
    body: { provider: 'discord', callbackURL, errorCallbackURL, disableRedirect: true },
    cookies: jar,
    ip,
  });
  const { url } = (await response.json()) as { url: string };
  return { jar, state: new URL(url).searchParams.get('state')! };
}

describe('Discord OAuth callback (provider mocked at fetch)', () => {
  it('creates an unverified alias identity without an e-mail scope and a discord-assured session', async () => {
    const discordUserId = syntheticSnowflake('4');
    h.members.set(discordUserId, { status: 'present', roles: [ROLE.editor] });
    stubDiscordOAuth({ id: discordUserId, username: 'synthetic_editor', global_name: 'Synthetic Editor', avatar: null, discriminator: '0' });
    const { jar, state } = await startDiscordFlow('198.51.100.50');

    const callback = await h.request(`/callback/discord?code=synthetic-code&state=${encodeURIComponent(state)}`, { cookies: jar, ip: '198.51.100.50', origin: null });
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('/en/account');
    expect(jar.has(SESSION_COOKIE)).toBe(true);

    const [user] = await h.db.select().from(authUser).where(eq(authUser.email, `discord-${discordUserId}@accounts.invalid`));
    expect(user).toMatchObject({ name: 'Synthetic Editor', emailVerified: false, image: null });
    const [account] = await h.db.select().from(authAccount).where(eq(authAccount.userId, user!.id));
    expect(account).toMatchObject({ providerId: 'discord', accountId: discordUserId, accessToken: null, refreshToken: null });
    const sessions = await userSessions(user!.id);
    expect(sessions.map((s) => s.assurance)).toEqual(['discord']);

    const snapshot = await membershipRow(h.db, discordUserId);
    expect(snapshot).toMatchObject({ guildId: GUILD_ID, state: 'present', source: 'oauth_login', roleIds: [ROLE.editor], userId: user!.id });

    const actor = await resolveActor(h.db, { session: sessions[0]!, user: user!, intent: 'write', env: testAccessEnv() });
    expect(actor).toMatchObject({ status: 'verified', source: 'discord', roles: ['editor'] });
  });

  it('ignores a provider-supplied e-mail address', async () => {
    const discordUserId = syntheticSnowflake('5');
    stubDiscordOAuth({ id: discordUserId, username: 'mail_user', global_name: null, avatar: null, discriminator: '0', email: 'real@example.test' });
    const { jar, state } = await startDiscordFlow('198.51.100.51');
    const callback = await h.request(`/callback/discord?code=c&state=${encodeURIComponent(state)}`, { cookies: jar, ip: '198.51.100.51', origin: null });
    expect(callback.status).toBe(302);
    expect(await h.db.select().from(authUser).where(eq(authUser.email, 'real@example.test'))).toHaveLength(0);
    const [user] = await h.db.select().from(authUser).where(eq(authUser.email, `discord-${discordUserId}@accounts.invalid`));
    expect(user?.name).toBe('mail_user');
  });

  it('never links a Discord identity to an existing user by e-mail equality', async () => {
    const discordUserId = syntheticSnowflake('6');
    // Older inconsistent record: a local account whose e-mail equals the Discord alias.
    const local = await insertLocalAdmin(h.db, { email: `discord-${discordUserId}@accounts.invalid` });
    stubDiscordOAuth({ id: discordUserId, username: 'collider', global_name: null, avatar: null, discriminator: '0' });
    const { jar, state } = await startDiscordFlow('198.51.100.52');
    const callback = await h.request(`/callback/discord?code=c&state=${encodeURIComponent(state)}`, { cookies: jar, ip: '198.51.100.52', origin: null });
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toMatch(/^\/en\/login\?error=/);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
    expect(await h.db.select().from(authAccount).where(and(eq(authAccount.userId, local.userId), eq(authAccount.providerId, 'discord')))).toHaveLength(0);
    expect(await sessionCount(h.db, local.userId)).toBe(0);
  });

  it('refuses a Discord session for a local account even when a stale Discord account row exists', async () => {
    const discordUserId = syntheticSnowflake('7');
    const local = await insertLocalAdmin(h.db);
    await h.db.insert(authAccount).values({ id: crypto.randomUUID(), accountId: discordUserId, providerId: 'discord', userId: local.userId });
    stubDiscordOAuth({ id: discordUserId, username: 'stale_link', global_name: null, avatar: null, discriminator: '0' });
    const { jar, state } = await startDiscordFlow('198.51.100.53');
    const callback = await h.request(`/callback/discord?code=c&state=${encodeURIComponent(state)}`, { cookies: jar, ip: '198.51.100.53', origin: null });
    expect(callback.headers.get('location')).toMatch(/^\/en\/login\?error=/);
    expect(await sessionCount(h.db, local.userId)).toBe(0);
  });

  it('rejects a callback whose state cookie is missing and redirects to the localized error page', async () => {
    const { state } = await startDiscordFlow('198.51.100.54');
    const callback = await h.request(`/callback/discord?code=c&state=${encodeURIComponent(state)}`, { ip: '198.51.100.54', origin: null });
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toMatch(/\/en\/login\?error=state_mismatch/);
    const failures = await h.db.select().from(auditEvent).where(and(eq(auditEvent.action, 'auth.sign_in'), eq(auditEvent.outcome, 'failure')));
    expect(failures.some((event) => event.summary.method === 'discord')).toBe(true);
  });
});
