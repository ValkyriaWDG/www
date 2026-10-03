import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetServerEnvForTests } from '@/lib/env';
import { startDiscordSignIn, startLogiSignIn } from './actions';
import { callAuthEndpoint } from './forward';

vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); } }));
vi.mock('./forward', () => ({ callAuthEndpoint: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_URL', 'https://website.example.test');
  vi.stubEnv('BETTER_AUTH_SECRET', 'synthetic-auth-secret-at-least-thirty-two-characters');
  vi.stubEnv('DISCORD_CLIENT_ID', 'synthetic-discord-client');
  vi.stubEnv('DISCORD_CLIENT_SECRET', 'synthetic-discord-secret');
  vi.stubEnv('LOGI_SSO_ENABLED', 'false');
  vi.stubEnv('LOGI_DISCORD_FALLBACK_ENABLED', 'false');
  vi.stubEnv('LOGI_ALLOW_LOOPBACK_HTTP', 'false');
  vi.stubEnv('LOGI_ISSUER_URL', 'https://identity.example.test');
  vi.stubEnv('LOGI_CLIENT_ID', 'synthetic-logi-client');
  vi.stubEnv('LOGI_CLIENT_SECRET', 'synthetic-logi-secret');
  vi.stubEnv('LOGI_GUILD_ID', '100000000000000001');
  resetServerEnvForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetServerEnvForTests();
});

function form(locale: 'cs' | 'en') {
  const result = new FormData();
  result.set('locale', locale);
  result.set('returnTo', `/${locale}/admin`);
  return result;
}

describe('provider readiness is enforced by sign-in actions', () => {
  it.each(['cs', 'en'] as const)('rejects a direct disabled-Logi submission in %s before OAuth starts', async (locale) => {
    await expect(startLogiSignIn(form(locale))).rejects.toThrow(`NEXT_REDIRECT:/${locale}/login?returnTo=%2F${locale}%2Fadmin&error=provider_unavailable`);
    expect(callAuthEndpoint).not.toHaveBeenCalled();
  });

  it('rejects enabled Logi with incomplete credentials before OAuth starts', async () => {
    vi.stubEnv('LOGI_SSO_ENABLED', 'true');
    vi.stubEnv('LOGI_CLIENT_SECRET', '');
    await expect(startLogiSignIn(form('cs'))).rejects.toThrow('error=provider_unavailable');
    expect(callAuthEndpoint).not.toHaveBeenCalled();
  });

  it('cannot use a direct Discord submission to bypass the disabled fallback', async () => {
    vi.stubEnv('LOGI_SSO_ENABLED', 'true');
    vi.stubEnv('LOGI_CLIENT_SECRET', '');
    await expect(startDiscordSignIn(form('en'))).rejects.toThrow('error=provider_unavailable');
    expect(callAuthEndpoint).not.toHaveBeenCalled();
  });

  it('starts configured Logi only through the maintained endpoint and trusted authorize URL', async () => {
    vi.stubEnv('LOGI_SSO_ENABLED', 'true');
    const url = 'https://identity.example.test/api/sso/authorize?state=synthetic';
    vi.mocked(callAuthEndpoint).mockResolvedValue({ status: 200, code: null, body: { url } });
    await expect(startLogiSignIn(form('en'))).rejects.toThrow(`NEXT_REDIRECT:${url}`);
    expect(callAuthEndpoint).toHaveBeenCalledWith('/sign-in/social', {
      provider: 'logi', callbackURL: '/en/admin', errorCallbackURL: '/en/login?returnTo=%2Fen%2Fadmin', disableRedirect: true,
    });
  });
});
