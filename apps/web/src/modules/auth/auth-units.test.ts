import { describe, expect, it } from 'vitest';
import { assuranceForEndpoint } from './assurance';
import { createHashedBackupCodeStore, isHashedBackupCodeList } from './backup-codes';
import { discordAliasEmail, discordDisplayName, mapDiscordProfileToUser } from './discord-profile';
import { isAllowedAuthRequest, isValidSocialSignInBody } from './endpoint-policy';
import { loginErrorKey } from './login-errors';

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
