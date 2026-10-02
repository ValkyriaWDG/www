import { describe, expect, it } from 'vitest';
import { assuranceForEndpoint, guardSessionUpdate } from './assurance';
import { createHashedBackupCodeStore, isHashedBackupCodeList } from './backup-codes';
import { discordAliasEmail, discordDisplayName, mapDiscordProfileToUser } from './discord-profile';
import { isAllowedAuthRequest, isValidSocialSignInBody } from './endpoint-policy';
import { loginErrorKey } from './login-errors';
import { createAuth, isDiscordSignInConfigured } from './auth';
import type { Database } from '@valkyria/db';
import { isLogiSignInConfigured, logiProviderConfigFromEnv, resolveLogiConfig } from './logi-provider';

describe('Discord profile mapping', () => {
  it('produces an unverified, non-deliverable alias when Discord supplies no e-mail', () => {
    expect(mapDiscordProfileToUser({ id: '300000000000000001', username: 'synthetic_user', global_name: 'Synthetic User' })).toEqual({
      email: 'discord-300000000000000001@accounts.invalid',
      emailVerified: false,
      name: 'Synthetic User',
      image: undefined,
    });
  });

  it('ignores any provider e-mail and falls back from global_name to username', () => {
    const mapped = mapDiscordProfileToUser({ id: '300000000000000002', username: 'fallback_name', global_name: null, email: 'real@example.test' });
    expect(mapped.email).toBe('discord-300000000000000002@accounts.invalid');
    expect(mapped.name).toBe('fallback_name');
    expect(discordDisplayName({ id: '1', username: '  ', global_name: '\u0000' })).toBe('Discord user');
  });

  it('refuses non-snowflake subjects', () => {
    expect(() => discordAliasEmail('../../x')).toThrow();
  });
});

describe('session assurance', () => {
  it('derives assurance from the creating endpoint', () => {
    expect(assuranceForEndpoint({ path: '/callback/:id', params: { id: 'discord' } })).toBe('discord');
    expect(assuranceForEndpoint({ path: '/callback/:id', params: { id: 'logi' } })).toBe('logi');
    expect(assuranceForEndpoint({ path: '/callback/:id', params: { id: 'github' } })).toBe('unknown');
    expect(assuranceForEndpoint({ path: '/sign-in/email' })).toBe('password');
    expect(assuranceForEndpoint({ path: '/two-factor/verify-totp', context: { session: null } })).toBe('mfa');
    expect(assuranceForEndpoint({ path: '/two-factor/verify-backup-code', context: {} })).toBe('mfa');
    // Verification inside an existing (setup) session never upgrades it to MFA.
    expect(assuranceForEndpoint({ path: '/two-factor/verify-totp', context: { session: { session: { id: 'x' } } } })).toBe('password');
    expect(assuranceForEndpoint({ path: '/two-factor/disable' })).toBe('unknown');
    expect(assuranceForEndpoint(null)).toBe('unknown');
  });
});

describe('Logi sign-in configuration and HTTP surface', () => {
  const logi = { enabled: true, issuerUrl: 'https://logi.example.test', clientId: 'website', clientSecret: 'synthetic-client-secret', guildId: '100000000000000001' };
  const flags = { discordEnabled: false, logiEnabled: true, localAdminLoginEnabled: true };
  const base = 'https://valkyria.cz/api/auth';

  it('is disabled until explicitly configured and never silently enables a fallback', () => {
    expect(isLogiSignInConfigured(undefined)).toBe(false);
    expect(isLogiSignInConfigured({ ...logi, enabled: false })).toBe(false);
    expect(isLogiSignInConfigured({ ...logi, clientSecret: undefined })).toBe(false);
    expect(isLogiSignInConfigured(logi)).toBe(true);
    const credentials = { discordClientId: 'discord', discordClientSecret: 'secret', logi };
    expect(isDiscordSignInConfigured(credentials)).toBe(false);
    expect(isDiscordSignInConfigured({ ...credentials, logi: { ...logi, discordFallbackEnabled: true } })).toBe(true);
    expect(logiProviderConfigFromEnv({}).enabled).toBe(false);
  });

  it.each([undefined, '', 'short-secret'])('requires a stable website secret before initializing Logi SSO (%s)', (secret) => {
    expect(() => createAuth({} as Database, {
      nodeEnv: 'development', appUrl: 'http://localhost:3000', secret, logi,
      access: { DISCORD_API_BASE_URL: 'https://discord.com/api/v10', DISCORD_ROLE_MAPPING_JSON: '{}', LOCAL_ADMIN_LOGIN_ENABLED: false },
    })).toThrow('BETTER_AUTH_SECRET must be at least 32 characters when Logi SSO is enabled.');
  });

  it.each(['http://logi.example.test', 'https://user:pass@logi.example.test', 'https://logi.example.test/path', 'https://logi.example.test/?x=1', 'https://logi.example.test/#x'])('rejects unsafe issuer %s', (issuerUrl) => {
    expect(resolveLogiConfig({ ...logi, issuerUrl, allowLoopbackHttp: true })).toBeNull();
  });

  it('accepts plain HTTP only with an explicit loopback test option', () => {
    expect(resolveLogiConfig({ ...logi, issuerUrl: 'http://127.0.0.1:3001' })).toBeNull();
    expect(resolveLogiConfig({ ...logi, issuerUrl: 'http://127.0.0.1:3001', allowLoopbackHttp: true })?.issuer).toBe('http://127.0.0.1:3001');
  });

  it('allows the enabled Logi callback without enabling other providers or token shortcuts', () => {
    expect(isAllowedAuthRequest('GET', `${base}/callback/logi?code=x`, flags)).toBe(true);
    expect(isAllowedAuthRequest('GET', `${base}/callback/discord`, flags)).toBe(false);
    expect(isAllowedAuthRequest('POST', `${base}/callback/logi`, flags)).toBe(false);
    expect(isAllowedAuthRequest('POST', `${base}/sign-in/social`, flags)).toBe(true);
    const body = { provider: 'logi', callbackURL: '/en/admin', errorCallbackURL: '/en/login', disableRedirect: true };
    expect(isValidSocialSignInBody(body, flags)).toBe(true);
    expect(isValidSocialSignInBody({ ...body, provider: 'discord' }, flags)).toBe(false);
    expect(isValidSocialSignInBody({ ...body, idToken: { token: 'untrusted' } }, flags)).toBe(false);
    expect(isValidSocialSignInBody({ ...body, additionalParams: { nonce: 'untrusted' } }, flags)).toBe(false);
    expect(isValidSocialSignInBody({ ...body, callbackURL: 'https://foreign.example/' }, flags)).toBe(false);
  });
});

describe('hashed backup codes', () => {
  it('stores only keyed hashes and matches hashed input', async () => {
    const store = createHashedBackupCodeStore('unit-test-secret-value-0123456789');
    const encoded = await store.storeBackupCodes.encrypt(JSON.stringify(['abcde-fghij', 'klmno-pqrst']));
    expect(encoded).not.toContain('abcde');
    expect(isHashedBackupCodeList(encoded)).toBe(true);
    const decoded = JSON.parse(await store.storeBackupCodes.decrypt(encoded)) as string[];
    expect(decoded).toContain(store.hashCode('abcde-fghij'));
    expect(decoded).toContain(store.hashCode(' abcde-fghij '));
    // Re-encoding the remaining hashes after consumption does not double-hash them.
    const remaining = await store.storeBackupCodes.encrypt(JSON.stringify(decoded.slice(1)));
    expect(JSON.parse(remaining)).toEqual(decoded.slice(1));
    expect(createHashedBackupCodeStore('another-secret-value-0123456789ab').hashCode('abcde-fghij')).not.toBe(store.hashCode('abcde-fghij'));
  });
});

describe('Better Auth HTTP allowlist', () => {
  const both = { discordEnabled: true, localAdminLoginEnabled: true };
  const discordOnly = { discordEnabled: true, localAdminLoginEnabled: false };
  const base = 'https://valkyriawdg.cz/api/auth';

  it('serves only the documented endpoints', () => {
    expect(isAllowedAuthRequest('POST', `${base}/sign-in/social`, discordOnly)).toBe(true);
    expect(isAllowedAuthRequest('GET', `${base}/callback/discord?code=a&state=b`, discordOnly)).toBe(true);
    expect(isAllowedAuthRequest('GET', `${base}/get-session`, discordOnly)).toBe(true);
    expect(isAllowedAuthRequest('POST', `${base}/sign-out`, discordOnly)).toBe(true);
    expect(isAllowedAuthRequest('POST', `${base}/sign-in/email`, both)).toBe(true);
    expect(isAllowedAuthRequest('POST', `${base}/two-factor/verify-totp`, both)).toBe(true);
  });

  it.each([
    ['POST', '/sign-up/email'],
    ['POST', '/link-social'],
    ['POST', '/unlink-account'],
    ['POST', '/update-session'],
    ['POST', '/update-user'],
    ['POST', '/change-password'],
    ['POST', '/reset-password'],
    ['POST', '/two-factor/disable'],
    ['GET', '/callback/github'],
    ['POST', '/callback/discord'],
    ['GET', '/sign-in/social'],
    ['GET', '/sign-out'],
    ['GET', '/error'],
    ['GET', '/ok'],
  ])('denies %s %s', (method, path) => {
    expect(isAllowedAuthRequest(method, `${base}${path}`, both)).toBe(false);
  });

  it('hides local recovery and Discord endpoints when not configured', () => {
    expect(isAllowedAuthRequest('POST', `${base}/sign-in/email`, discordOnly)).toBe(false);
    expect(isAllowedAuthRequest('POST', `${base}/two-factor/enable`, discordOnly)).toBe(false);
    expect(isAllowedAuthRequest('POST', `${base}/sign-in/social`, { discordEnabled: false, localAdminLoginEnabled: true })).toBe(false);
    expect(isAllowedAuthRequest('POST', 'https://valkyriawdg.cz/other/sign-in/social', both)).toBe(false);
  });

  it('validates the Discord initiation body strictly', () => {
    expect(isValidSocialSignInBody({ provider: 'discord', callbackURL: '/cs/account', errorCallbackURL: '/cs/login', disableRedirect: true })).toBe(true);
    expect(isValidSocialSignInBody({ provider: 'discord', callbackURL: '/cs/account', errorCallbackURL: '/cs/login', additionalData: { link: {} } })).toBe(
      false,
    );
    expect(isValidSocialSignInBody({ provider: 'discord', callbackURL: '/cs/account', errorCallbackURL: '/cs/login', requestSignUp: true })).toBe(false);
    expect(isValidSocialSignInBody(null)).toBe(false);
  });
});

describe('login error mapping', () => {
  it.each([
    ['access_denied', 'cancelled'],
    ['state_mismatch', 'invalid'],
    ['please_restart_the_process', 'invalid'],
    ['account_not_linked', 'restricted'],
    ['unable_to_create_session', 'restricted'],
    ['rate_limited', 'rateLimited'],
    ['unable_to_get_user_info', 'unavailable'],
    ['<script>alert(1)</script>', 'generic'],
  ] as const)('maps %s to %s', (code, key) => {
    expect(loginErrorKey(code)).toBe(key);
  });

  it('ignores empty values', () => {
    expect(loginErrorKey(undefined)).toBeNull();
    expect(loginErrorKey('')).toBeNull();
    expect(loginErrorKey(['access_denied'])).toBe('cancelled');
  });
});

describe('session update guard', () => {
  const signedIn = new Date('2026-10-02T13:00:00Z');
  const refreshed = new Date('2026-10-09T12:00:00Z');
  const ctx = (session: Record<string, unknown> | null) => ({ context: { session: session ? { session } : null } });

  it('rejects changes to assurance and the upstream binding', () => {
    expect(guardSessionUpdate({ assurance: 'mfa' }, ctx(null))).toBe(false);
    expect(guardSessionUpdate({ logiSubject: '300000000000000001' }, ctx(null))).toBe(false);
  });
  it('keeps the sign-in expiry of a Logi session when Better Auth refreshes it', () => {
    expect(guardSessionUpdate({ expiresAt: refreshed, updatedAt: refreshed }, ctx({ assurance: 'logi', expiresAt: signedIn }))).toEqual({ data: { expiresAt: signedIn, updatedAt: refreshed } });
    expect(guardSessionUpdate({ expiresAt: refreshed }, ctx({ assurance: 'logi', expiresAt: signedIn.toISOString() }))).toEqual({ data: { expiresAt: signedIn } });
    // An earlier expiry (sign-out style shortening) stays possible.
    const earlier = new Date('2026-10-02T12:30:00Z');
    expect(guardSessionUpdate({ expiresAt: earlier }, ctx({ assurance: 'logi', expiresAt: signedIn }))).toEqual({ data: { expiresAt: earlier } });
  });
  it('drops an unbounded extension when the original expiry is unknown', () => {
    expect(guardSessionUpdate({ expiresAt: refreshed, updatedAt: refreshed }, ctx({ assurance: 'logi' }))).toEqual({ data: { updatedAt: refreshed } });
  });
  it('leaves other sessions and non-expiry updates to Better Auth', () => {
    expect(guardSessionUpdate({ expiresAt: refreshed }, ctx({ assurance: 'discord', expiresAt: signedIn }))).toBeUndefined();
    expect(guardSessionUpdate({ updatedAt: refreshed }, ctx({ assurance: 'logi', expiresAt: signedIn }))).toBeUndefined();
    expect(guardSessionUpdate({ expiresAt: refreshed }, null)).toBeUndefined();
  });
});
