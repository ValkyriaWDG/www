import type { ReactNode } from 'react';
import { createTranslator } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import cs from '@/i18n/messages/cs/members.json';
import en from '@/i18n/messages/en/members.json';
import { PublicPlayerDirectoryNotice } from './public-player-directory-notice';

vi.mock('next-intl/server', () => ({ getTranslations: async ({ locale }: { locale: 'cs' | 'en' }) => createTranslator({ locale, messages: locale === 'cs' ? cs.list : en.list }) }));
vi.mock('@/components/ui', () => ({
  FeedbackNotice: ({ title, children, action }: { title: ReactNode; children: ReactNode; action: ReactNode }) => <div role="status">{title}{children}{action}</div>,
  GameButton: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

describe('public player directory availability copy', () => {
  it.each(['cs', 'en'] as const)('explains unavailable and partial %s data without claiming zero players, preserving a scoped retry', async (locale) => {
    for (const state of ['unavailable', 'partial'] as const) {
      const html = renderToStaticMarkup(await PublicPlayerDirectoryNotice({ locale, availability: { state, enabledGames: ['wardogs', 'hell-let-loose'], currentGames: state === 'partial' ? ['wardogs'] : [] }, retryHref: '/hll/members?q=Alpha&page=2' }));
      expect(html).toContain(`data-public-player-availability="${state}"`);
      expect(html.toLowerCase()).toContain(locale === 'cs' ? 'synchronizace' : 'synchronization');
      expect(html).toContain(locale === 'cs' ? 'profily' : 'profiles');
      expect(html).toContain('href="/hll/members?q=Alpha&amp;page=2"');
      expect(html).not.toContain(locale === 'cs' ? cs.list.emptyTitle : en.list.emptyTitle);
    }
  });
  it.each(['complete', 'disabled'] as const)('does not announce an outage for %s publication', async (state) => {
    expect(await PublicPlayerDirectoryNotice({ locale: 'en', availability: { state, enabledGames: [], currentGames: [] }, retryHref: '/members' })).toBeNull();
  });
});
