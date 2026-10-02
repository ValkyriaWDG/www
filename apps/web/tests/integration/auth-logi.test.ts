import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { authAccount, authSession, authUser } from '@valkyria/db';
import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readLogiActorToken, validateLogiSession, type LogiProviderConfig } from '@/modules/auth/logi-provider';
import { CookieJar, createHarness, GUILD_ID, insertDiscordUser, insertLocalAdmin, TEST_ORIGIN, TEST_SECRET, type Harness } from './auth-harness';

type Fault = 'none' | 'issuer' | 'audience' | 'nonce' | 'missing_nonce' | 'signature' | 'expired' | 'missing_id_token' | 'userinfo_subject' | 'userinfo_sid' | 'guild' | 'extra_roles';
type Grant = { subject: string; sid: string; nonce: string; challenge: string; fault: Fault; used: boolean; token: string };
const grants = new Map<string, Grant>();
const tokens = new Map<string, Grant>();
const revoked = new Set<string>();
let outage = false;
let tokenRequests = 0;
let fixtureServer: ReturnType<typeof createServer>;
let issuer: string;
let h: Harness;
let config: LogiProviderConfig;
let nextIp = 1;

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

beforeAll(async () => {
  const keys = await generateKeyPair('RS256');
  const wrongKeys = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(keys.publicKey), kid: 'synthetic-logi-key', alg: 'RS256', use: 'sig' };
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const path = new URL(request.url!, issuer).pathname;
    if (path === '/.well-known/openid-configuration') return json(response, 200, {
      issuer, authorization_endpoint: `${issuer}/api/sso/authorize`, token_endpoint: `${issuer}/api/sso/token`, userinfo_endpoint: `${issuer}/api/sso/userinfo`,
      jwks_uri: `${issuer}/api/sso/jwks`, response_types_supported: ['code'], grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['client_secret_post'], id_token_signing_alg_values_supported: ['RS256'],
    });
    if (path === '/api/sso/jwks') return json(response, 200, { keys: [jwk] });
    if (path === '/api/sso/token') {
      tokenRequests += 1;
      let body = '';
      for await (const part of request) body += part.toString();
      const form = new URLSearchParams(body);
      const grant = grants.get(form.get('code') ?? '');
      if (!grant || grant.used || form.get('client_id') !== 'valkyria-test-client' || form.get('client_secret') !== 'synthetic-client-secret-for-tests' || form.get('redirect_uri') !== `${TEST_ORIGIN}/api/auth/callback/logi` || form.get('grant_type') !== 'authorization_code' || createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url') !== grant.challenge) return json(response, 400, { error: 'invalid_grant' });
      grant.used = true;
      const now = Math.floor(Date.now() / 1000);
      const idToken = await new SignJWT({
        sub: grant.subject, sid: grant.sid, guild_id: grant.fault === 'guild' ? '100000000000000009' : GUILD_ID,
        ...(grant.fault === 'missing_nonce' ? {} : { nonce: grant.fault === 'nonce' ? 'different-nonce' : grant.nonce }),
      }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
        .setIssuer(grant.fault === 'issuer' ? 'https://different.example.test' : issuer)
        .setAudience(grant.fault === 'audience' ? 'another-client' : 'valkyria-test-client')
        .setIssuedAt(now).setExpirationTime(grant.fault === 'expired' ? now - 1 : now + 3600)
        .sign(grant.fault === 'signature' ? wrongKeys.privateKey : keys.privateKey);
      tokens.set(grant.token, grant);
      return json(response, 200, { token_type: 'Bearer', expires_in: 3600, access_token: grant.token, scope: 'openid profile', ...(grant.fault === 'missing_id_token' ? {} : { id_token: idToken }) });
    }
    if (path === '/api/sso/userinfo') {
      if (outage) return json(response, 503, { error: 'unavailable' });
      const token = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
      const grant = tokens.get(token);
      if (!grant || revoked.has(token)) return json(response, 401, { error: 'invalid_token' });
      return json(response, 200, {
        sub: grant.fault === 'userinfo_subject' ? '300000000000000099' : grant.subject,
        sid: grant.fault === 'userinfo_sid' ? 'another-synthetic-session' : grant.sid,
        guild_id: GUILD_ID, name: 'Synthetic Logi Member', picture: null,
        ...(grant.fault === 'extra_roles' ? { roles: ['administrator'] } : {}),
      });
    }
    return json(response, 404, { error: 'not_found' });
  };
  fixtureServer = createServer((request, response) => { void handle(request, response).catch(() => json(response, 500, { error: 'fixture_failed' })); });
  await new Promise<void>((resolve) => fixtureServer.listen(0, '127.0.0.1', resolve));
  const address = fixtureServer.address();
  if (!address || typeof address === 'string') throw new Error('Expected a loopback TCP address.');
  issuer = `http://127.0.0.1:${address.port}`;
  config = { enabled: true, issuerUrl: issuer, clientId: 'valkyria-test-client', clientSecret: 'synthetic-client-secret-for-tests', guildId: GUILD_ID, allowLoopbackHttp: true };
  h = await createHarness({ config: { logi: config } });
});

afterAll(async () => {
  await h?.close();
  if (fixtureServer) await new Promise<void>((resolve, reject) => fixtureServer.close((error) => error ? reject(error) : resolve()));
});

async function begin(subject = `30000000000000${String(nextIp).padStart(4, '0')}`, fault: Fault = 'none', locale = 'en') {
  const ip = `198.51.100.${nextIp++}`;
  const jar = new CookieJar();
  const response = await h.request('/sign-in/social', {
    body: { provider: 'logi', callbackURL: `/${locale}/account`, errorCallbackURL: `/${locale}/login`, disableRedirect: true }, cookies: jar, ip,
  });
  expect(response.status).toBe(200);
  const authorize = new URL(((await response.json()) as { url: string }).url);
  expect(authorize.origin).toBe(issuer);
  expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
  expect(authorize.searchParams.get('scope')).toBe('openid profile');
  expect(authorize.searchParams.get('nonce')).toBeTruthy();
  const code = randomUUID();
  const grant: Grant = { subject, sid: `synthetic-${randomUUID()}`, nonce: authorize.searchParams.get('nonce')!, challenge: authorize.searchParams.get('code_challenge')!, fault, used: false, token: `opaque-synthetic-${randomUUID()}` };
  grants.set(code, grant);
  const path = `/callback/logi?code=${code}&state=${encodeURIComponent(authorize.searchParams.get('state')!)}&iss=${encodeURIComponent(issuer)}`;
  return { ip, jar, authorize, path, grant };
}

async function complete(flow: Awaited<ReturnType<typeof begin>>, withCookies = true) {
  return h.request(flow.path, { ...(withCookies ? { cookies: flow.jar } : {}), ip: flow.ip, origin: null });
}

async function signIn() {
  const flow = await begin();
  expect((await complete(flow)).headers.get('location')).toBe('/en/account');
  const [user] = await h.db.select().from(authUser).where(eq(authUser.email, `logi-${flow.grant.subject}@accounts.invalid`));
  const [session] = await h.db.select().from(authSession).where(eq(authSession.userId, user!.id));
  return { ...flow, user: user!, session: session! };
}

describe('Logi OIDC through the actual Better Auth HTTP pipeline and PostgreSQL', () => {
  it('creates a session through code/PKCE/nonce/JWKS and keeps encrypted upstream binding out of every public auth DTO', async () => {
    const signed = await signIn();
    expect(signed.session).toMatchObject({ assurance: 'logi', logiIssuer: issuer, logiSubject: signed.grant.subject, logiClientId: 'valkyria-test-client', logiSid: signed.grant.sid, logiGuildId: GUILD_ID });
    expect(signed.session.logiAccessTokenCiphertext).not.toBe(signed.grant.token);
    expect(await symmetricDecrypt({ key: TEST_SECRET, data: signed.session.logiAccessTokenCiphertext! })).toBe(signed.grant.token);
    expect(signed.session.expiresAt.getTime()).toBeLessThanOrEqual(signed.session.logiAccessTokenExpiresAt!.getTime());
    const [account] = await h.db.select().from(authAccount).where(eq(authAccount.userId, signed.user.id));
    expect(account).toMatchObject({ providerId: 'logi', accountId: signed.grant.subject, accessToken: null, refreshToken: null, idToken: null });
    const response = await h.request('/get-session', { cookies: signed.jar });
    const dto = await response.json() as { session: Record<string, unknown> };
    expect(dto.session.assurance).toBe('logi');
    expect(Object.keys(dto.session).some((key) => key.startsWith('logi'))).toBe(false);
    expect(JSON.stringify(dto)).not.toContain(signed.grant.token);
    expect(JSON.stringify(dto)).not.toContain(signed.grant.sid);
  });

  it.each<Fault>(['issuer', 'audience', 'nonce', 'missing_nonce', 'signature', 'expired', 'missing_id_token', 'userinfo_subject', 'userinfo_sid', 'guild', 'extra_roles'])('rejects %s without creating an authenticated account', async (fault) => {
    const flow = await begin(undefined, fault, 'cs');
    const response = await complete(flow);
    expect(response.headers.get('location')).toMatch(/^\/cs\/login\?error=/);
    expect(flow.jar.has('better-auth.session_token')).toBe(false);
    expect(await h.db.select().from(authAccount).where(and(eq(authAccount.providerId, 'logi'), eq(authAccount.accountId, flow.grant.subject)))).toHaveLength(0);
  });

  it('rejects a missing state cookie before token exchange and rejects replay of the consumed callback', async () => {
    const missing = await begin();
    const before = tokenRequests;
    expect((await complete(missing, false)).headers.get('location')).toContain('error=state_mismatch');
    expect(tokenRequests).toBe(before);
    const flow = await begin();
    expect((await complete(flow)).headers.get('location')).toBe('/en/account');
    const replay = await complete(flow);
    expect(replay.headers.get('location')).toContain('error=');
    const [account] = await h.db.select().from(authAccount).where(and(eq(authAccount.providerId, 'logi'), eq(authAccount.accountId, flow.grant.subject)));
    expect(await h.db.select().from(authSession).where(eq(authSession.userId, account!.userId))).toHaveLength(1);
  });

  it('keeps concurrent callbacks bound to their own upstream sessions', async () => {
    const flows = await Promise.all([begin(), begin()]);
    const responses = await Promise.all(flows.map((flow) => complete(flow)));
    for (let i = 0; i < flows.length; i++) {
      expect(responses[i]!.headers.get('location')).toBe('/en/account');
      const [row] = await h.db.select().from(authSession).where(eq(authSession.logiSubject, flows[i]!.grant.subject));
      expect(row?.logiSid).toBe(flows[i]!.grant.sid);
      expect(await symmetricDecrypt({ key: TEST_SECRET, data: row!.logiAccessTokenCiphertext! })).toBe(flows[i]!.grant.token);
    }
  });

  it('does not link an existing Discord identity or local recovery account by subject or alias email', async () => {
    const discord = await insertDiscordUser(h.db);
    const flow = await begin(discord.discordUserId);
    expect((await complete(flow)).headers.get('location')).toBe('/en/account');
    const [logi] = await h.db.select().from(authAccount).where(and(eq(authAccount.providerId, 'logi'), eq(authAccount.accountId, discord.discordUserId)));
    expect(logi?.userId).not.toBe(discord.userId);
    const collision = await begin();
    const recovery = await insertLocalAdmin(h.db, { email: `logi-${collision.grant.subject}@accounts.invalid` });
    expect((await complete(collision)).headers.get('location')).toContain('error=');
    expect(await h.db.select().from(authSession).where(eq(authSession.userId, recovery.userId))).toHaveLength(0);
  });

  it('does not unlock a provisioned recovery account through an inconsistent old Logi account link', async () => {
    const flow = await begin();
    const recovery = await insertLocalAdmin(h.db);
    await h.db.insert(authAccount).values({ id: randomUUID(), providerId: 'logi', accountId: flow.grant.subject, userId: recovery.userId });
    expect((await complete(flow)).headers.get('location')).toContain('error=');
    expect(await h.db.select().from(authSession).where(eq(authSession.userId, recovery.userId))).toHaveLength(0);
  });

  it('keeps direct Discord sign-in disabled unless the operator explicitly enables fallback', async () => {
    expect((await h.request('/callback/discord?code=x&state=y')).status).toBe(404);
    expect((await h.request('/sign-in/social', { body: { provider: 'discord', callbackURL: '/cs/account', errorCallbackURL: '/cs/login' } })).status).toBe(400);
  });
});

describe('central session revalidation', () => {
  it('revalidates userinfo and revokes only the affected website session on central logout', async () => {
    const signed = await signIn();
    expect(await validateLogiSession(h.db, signed.session.id, signed.user.id, config, TEST_SECRET)).toMatchObject({ ok: true, subject: signed.grant.subject, sid: signed.grant.sid, guildId: GUILD_ID });
    revoked.add(signed.grant.token);
    expect(await validateLogiSession(h.db, signed.session.id, signed.user.id, config, TEST_SECRET)).toEqual({ ok: false, reason: 'revoked' });
    expect(await h.db.select().from(authSession).where(eq(authSession.id, signed.session.id))).toHaveLength(0);
  });

  it('fails closed during outage without deleting a recoverable session', async () => {
    const signed = await signIn();
    outage = true;
    try {
      expect(await validateLogiSession(h.db, signed.session.id, signed.user.id, config, TEST_SECRET)).toEqual({ ok: false, reason: 'unavailable' });
    } finally { outage = false; }
    expect(await h.db.select().from(authSession).where(eq(authSession.id, signed.session.id))).toHaveLength(1);
    expect(await validateLogiSession(h.db, signed.session.id, signed.user.id, config, TEST_SECRET)).toMatchObject({ ok: true });
  });

  it('rejects configuration switches and a session deleted during an awaited provider response', async () => {
    const signed = await signIn();
    expect(await validateLogiSession(h.db, signed.session.id, signed.user.id, { ...config, clientId: 'other-client' }, TEST_SECRET)).toEqual({ ok: false, reason: 'invalid_binding' });
    const fetchImpl: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      await h.db.delete(authSession).where(eq(authSession.id, signed.session.id));
      return response;
    };
    expect(await validateLogiSession(h.db, signed.session.id, signed.user.id, config, TEST_SECRET, { fetchImpl })).toEqual({ ok: false, reason: 'revoked' });
  });

  it('rejects a changed upstream subject and encrypted binding corruption', async () => {
    const signed = await signIn();
    await h.db.update(authSession).set({ logiAccessTokenCiphertext: 'not-valid-encrypted-material' }).where(eq(authSession.id, signed.session.id));
    expect(await validateLogiSession(h.db, signed.session.id, signed.user.id, config, TEST_SECRET)).toEqual({ ok: false, reason: 'invalid_binding' });
    const changed = await signIn();
    changed.grant.fault = 'userinfo_subject';
    expect(await validateLogiSession(h.db, changed.session.id, changed.user.id, config, TEST_SECRET)).toEqual({ ok: false, reason: 'revoked' });
  });
});

describe('server-only Logi actor token delegation', () => {
  it('returns the exact centrally validated actor token without changing the public session DTO', async () => {
    const signed = await signIn();
    expect(await readLogiActorToken(h.db, signed.session.id, signed.user.id, config, TEST_SECRET)).toEqual({
      subject: signed.grant.subject, guildId: GUILD_ID, sid: signed.grant.sid, token: signed.grant.token,
    });
    const dto = await (await h.request('/get-session', { cookies: signed.jar })).json();
    expect(JSON.stringify(dto)).not.toContain(signed.grant.token);
    expect(JSON.stringify(dto)).not.toContain(signed.grant.sid);
  });

  it('does not release a token for another user, disabled provider or changed client configuration', async () => {
    const signed = await signIn();
    expect(await readLogiActorToken(h.db, signed.session.id, randomUUID(), config, TEST_SECRET)).toBeNull();
    expect(await readLogiActorToken(h.db, signed.session.id, signed.user.id, { ...config, enabled: false }, TEST_SECRET)).toBeNull();
    expect(await readLogiActorToken(h.db, signed.session.id, signed.user.id, { ...config, clientId: 'other-client' }, TEST_SECRET)).toBeNull();
    expect(await readLogiActorToken(h.db, signed.session.id, signed.user.id, config, 'short-secret')).toBeNull();
  });

  it('fails closed on central outage and removes the binding when the central token is revoked', async () => {
    const signed = await signIn();
    outage = true;
    try {
      expect(await readLogiActorToken(h.db, signed.session.id, signed.user.id, config, TEST_SECRET)).toBeNull();
    } finally { outage = false; }
    expect(await h.db.select().from(authSession).where(eq(authSession.id, signed.session.id))).toHaveLength(1);
    revoked.add(signed.grant.token);
    expect(await readLogiActorToken(h.db, signed.session.id, signed.user.id, config, TEST_SECRET)).toBeNull();
    expect(await h.db.select().from(authSession).where(eq(authSession.id, signed.session.id))).toHaveLength(0);
  });

  it.each(['delete', 'rebind'] as const)('does not release a captured token after concurrent %s during central validation', async (change) => {
    const signed = await signIn();
    const fetchImpl: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (change === 'delete') {
        await h.db.delete(authSession).where(eq(authSession.id, signed.session.id));
      } else {
        const replacement = await symmetricEncrypt({ key: TEST_SECRET, data: signed.grant.token });
        await h.db.update(authSession).set({ logiAccessTokenCiphertext: replacement }).where(eq(authSession.id, signed.session.id));
      }
      return response;
    };
    expect(await readLogiActorToken(h.db, signed.session.id, signed.user.id, config, TEST_SECRET, { fetchImpl })).toBeNull();
  });

  it('does not release a token when the session expires during central validation', async () => {
    const signed = await signIn();
    let now = new Date();
    const fetchImpl: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      now = new Date(signed.session.expiresAt.getTime() + 1);
      return response;
    };
    expect(await readLogiActorToken(h.db, signed.session.id, signed.user.id, config, TEST_SECRET, { fetchImpl, now: () => now })).toBeNull();
  });

  it.each(['delete', 'subject', 'credential', 'discord'] as const)('does not release a token after an account %s change during central validation', async (change) => {
    const signed = await signIn();
    const fetchImpl: typeof fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (change === 'delete') {
        await h.db.delete(authAccount).where(eq(authAccount.userId, signed.user.id));
      } else if (change === 'subject') {
        await h.db.update(authAccount).set({ accountId: `changed-${randomUUID()}` }).where(eq(authAccount.userId, signed.user.id));
      } else {
        await h.db.insert(authAccount).values({ id: randomUUID(), userId: signed.user.id, providerId: change, accountId: randomUUID() });
      }
      return response;
    };
    expect(await readLogiActorToken(h.db, signed.session.id, signed.user.id, config, TEST_SECRET, { fetchImpl })).toBeNull();
  });
});
