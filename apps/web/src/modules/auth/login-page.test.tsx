import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTranslator } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '@/app/[locale]/(platform)/login/page';
import cs from '@/i18n/messages/cs/auth.json';
import en from '@/i18n/messages/en/auth.json';
import type { AppLocale } from '@/i18n/routing';
import { resetServerEnvForTests } from '@/lib/env';

vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: AppLocale; namespace: 'auth.login' | 'auth.meta' }) =>
    createTranslator({ locale, namespace, messages: { auth: locale === 'cs' ? cs : en } }),
  setRequestLocale: vi.fn(),
}));
vi.mock('next/image', () => ({ default: () => createElement('span', { 'aria-hidden': true }) }));
vi.mock('@/modules/auth/actions', () => ({ startDiscordSignIn: vi.fn(), startLogiSignIn: vi.fn() }));
vi.mock('@/modules/auth/session', () => ({ getRequestSession: async () => null }));

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_URL', 'https://website.example.test');
  vi.stubEnv('BETTER_AUTH_SECRET', 'synthetic-auth-secret-at-least-thirty-two-characters');
  for (const key of ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'LOGI_ISSUER_URL', 'LOGI_CLIENT_ID', 'LOGI_CLIENT_SECRET', 'LOGI_GUILD_ID']) vi.stubEnv(key, '');
  for (const key of ['LOGI_SSO_ENABLED', 'LOGI_DISCORD_FALLBACK_ENABLED', 'LOGI_ALLOW_LOOPBACK_HTTP', 'LOCAL_ADMIN_LOGIN_ENABLED']) vi.stubEnv(key, 'false');
  resetServerEnvForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetServerEnvForTests();
});

function configureDiscord() {
  vi.stubEnv('DISCORD_CLIENT_ID', 'synthetic-discord-client');
  vi.stubEnv('DISCORD_CLIENT_SECRET', 'synthetic-discord-secret');
}

function configureLogi(enabled = true) {
  vi.stubEnv('LOGI_SSO_ENABLED', String(enabled));
  vi.stubEnv('LOGI_ISSUER_URL', 'https://identity.example.test');
  vi.stubEnv('LOGI_CLIENT_ID', 'synthetic-logi-client');
  vi.stubEnv('LOGI_CLIENT_SECRET', 'synthetic-logi-secret');
  vi.stubEnv('LOGI_GUILD_ID', '100000000000000001');
}

async function render(locale: AppLocale = 'cs', returnTo?: string) {
  return renderToStaticMarkup(await LoginPage({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({ returnTo }) }));
}

function button(html: string, provider: 'logi' | 'discord') {
  return html.match(new RegExp(`<button[^>]*data-testid="login-${provider}"[^>]*>`))?.[0] ?? null;
}

describe('login provider availability at the page boundary', () => {
  it.each(['cs', 'en'] as const)('keeps unconfigured Logi visible and honestly unavailable in %s', async (locale) => {
    const html = await render(locale);
    const messages = locale === 'cs' ? cs : en;
    expect(button(html, 'logi')).toContain('disabled=""');
    expect(html).toContain(messages.login.continueLogi);
    expect(html).toContain(messages.login.logiUnavailable);
    expect(html).toContain(messages.login.signInPurpose);
    expect(button(html, 'discord')).toBeNull();
  });

  it('does not activate Logi merely because credentials are present while its flag is off', async () => {
    configureLogi(false);
    configureDiscord();
    const html = await render();
    // The working Discord action comes first; the Logi notice follows without a disabled button.
    expect(button(html, 'logi')).toBeNull();
    expect(button(html, 'discord')).not.toBeNull();
    expect(button(html, 'discord')).not.toContain('disabled=""');
    expect(html).toContain(cs.login.logiUnavailable);
    expect(html.indexOf('data-testid="login-discord"')).toBeLessThan(html.indexOf('data-testid="login-provider-unavailable"'));
    expect(html).not.toContain('synthetic-logi-secret');
    expect(html).not.toContain('synthetic-discord-secret');
  });

  it('keeps incomplete Logi unavailable without silently enabling a configured Discord fallback', async () => {
    configureLogi();
    configureDiscord();
    vi.stubEnv('LOGI_CLIENT_SECRET', '');
    const html = await render();
    expect(button(html, 'logi')).toContain('disabled=""');
    expect(html).toContain(cs.login.logiUnavailable);
    expect(button(html, 'discord')).toBeNull();
  });

  it('explains unavailable Logi after the explicit Discord fallback when that can be used', async () => {
    configureLogi();
    configureDiscord();
    vi.stubEnv('LOGI_CLIENT_SECRET', '');
    vi.stubEnv('LOGI_DISCORD_FALLBACK_ENABLED', 'true');
    const html = await render('en');
    expect(button(html, 'logi')).toBeNull();
    expect(html).not.toContain(en.login.continueLogi);
    expect(button(html, 'discord')).not.toBeNull();
    expect(button(html, 'discord')).not.toContain('disabled=""');
    expect(html).toContain(en.login.logiUnavailable);
    expect(html.indexOf('data-testid="login-discord"')).toBeLessThan(html.indexOf('data-testid="login-provider-unavailable"'));
  });

  it('enables configured Logi and suppresses unapproved direct Discord', async () => {
    configureLogi();
    configureDiscord();
    const html = await render();
    expect(button(html, 'logi')).not.toBeNull();
    expect(button(html, 'logi')).not.toContain('disabled=""');
    expect(html).not.toContain(cs.login.logiUnavailable);
    expect(button(html, 'discord')).toBeNull();
  });

  it('keeps Logi first when it works beside the approved Discord fallback', async () => {
    configureLogi();
    configureDiscord();
    vi.stubEnv('LOGI_DISCORD_FALLBACK_ENABLED', 'true');
    const html = await render();
    expect(button(html, 'logi')).not.toContain('disabled=""');
    expect(button(html, 'discord')).not.toBeNull();
    expect(html.indexOf('data-testid="login-logi"')).toBeLessThan(html.indexOf('data-testid="login-discord"'));
    expect(html).not.toContain('data-testid="login-provider-unavailable"');
  });

  it('explains the separate Discord steps only while Discord is the available action', async () => {
    configureDiscord();
    expect(await render()).toContain(cs.login.separate);

    vi.stubEnv('DISCORD_CLIENT_ID', '');
    resetServerEnvForTests();
    const neither = await render();
    expect(neither).toContain(cs.login.logiSeparate);
    expect(neither).not.toContain(cs.login.separate);

    configureLogi();
    configureDiscord();
    vi.stubEnv('LOGI_DISCORD_FALLBACK_ENABLED', 'true');
    resetServerEnvForTests();
    const both = await render();
    expect(button(both, 'logi')).not.toContain('disabled=""');
    expect(button(both, 'discord')).not.toBeNull();
    expect(both).toContain(cs.login.logiSeparate);
    expect(both).not.toContain(cs.login.separate);
  });

  it('keeps both approved provider return paths localized and sanitized', async () => {
    configureLogi();
    configureDiscord();
    vi.stubEnv('LOGI_DISCORD_FALLBACK_ENABLED', 'true');
    const html = await render('en', 'https://untrusted.example.test/admin');
    expect(button(html, 'logi')).not.toContain('disabled=""');
    expect(button(html, 'discord')).not.toBeNull();
    expect(button(html, 'discord')).not.toContain('disabled=""');
    expect(html.match(/name="returnTo" value="\/en\/account"/g)).toHaveLength(2);
    expect(html).not.toContain('untrusted.example.test');
  });
});
