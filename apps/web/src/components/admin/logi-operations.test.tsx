import { renderToStaticMarkup } from 'react-dom/server';
import { createTranslator } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import cs from '@/i18n/messages/cs/admin.json';
import en from '@/i18n/messages/en/admin.json';
import { testPrincipal } from '@/modules/access/testing';
import { LogiOperations } from './logi-operations';

const mocks = vi.hoisted(() => ({ env: vi.fn() }));
vi.mock('@/lib/env', () => ({ getServerEnv: mocks.env }));
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: 'cs' | 'en'; namespace: 'admin.operations' }) =>
    createTranslator({ locale, namespace, messages: { admin: locale === 'cs' ? cs : en } }),
}));
vi.mock('@/i18n/navigation', () => ({ Link: 'a' }));

beforeEach(() => {
  mocks.env.mockReturnValue({ NODE_ENV: 'test', LOGI_SOURCES_JSON: JSON.stringify([
    { sourceInstanceId: 'synthetic', origin: 'https://logi.example.test', guildId: '100000000000000001', gameId: 'hell_let_loose' },
    { sourceInstanceId: 'synthetic', origin: 'https://logi.example.test', guildId: '100000000000000001', gameId: 'wardogs' },
  ]) });
});

describe('administration operational handoff', () => {
  it.each(['cs', 'en'] as const)('renders one accessible configured Logi link for both games in %s', async (locale) => {
    const html = renderToStaticMarkup(await LogiOperations({ locale, actor: testPrincipal(['administrator']) }));
    const messages = locale === 'cs' ? cs : en;
    expect(html).toContain(messages.operations.title);
    expect(html).toContain(messages.operations.open);
    expect(html).toContain(messages.operations.external);
    expect(html.match(/href="https:\/\/logi.example.test"/g)).toHaveLength(1);
    expect(html).toContain('Hell Let Loose / Wardogs');
    expect(html).not.toContain('100000000000000001');
  });

  it.each(['cs', 'en'] as const)('shows an honest unavailable state instead of a fabricated provider link in %s', async (locale) => {
    mocks.env.mockReturnValue({ LOGI_SOURCES_JSON: '[]' });
    const html = renderToStaticMarkup(await LogiOperations({ locale, actor: testPrincipal(['administrator']) }));
    expect(html).toContain((locale === 'cs' ? cs : en).operations.unavailable);
    expect(html).not.toContain('<a');
  });

  it('does not offer the other game from a scoped administrator’s entry link', async () => {
    const html = renderToStaticMarkup(await LogiOperations({ locale: 'en', actor: testPrincipal(['match_manager'], { games: ['wardogs'] }) }));
    const label = html.match(/<a[^>]+>[\s\S]*?<\/a>/)?.[0];
    expect(label).toContain('Wardogs');
    expect(label).not.toContain('Hell Let Loose');
  });
});
