import { createTranslator } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import csMatches from '@/i18n/messages/cs/matches.json';
import enMatches from '@/i18n/messages/en/matches.json';
import type { LeagueFixturePublic } from '@/modules/integrations/logi/readers/public';
import { LeagueMatchStatus } from './league-match-parts';

vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: 'cs' | 'en'; namespace: 'matches.detail.league' | 'matches.list.leagueFixtures' }) => createTranslator({ locale, namespace, messages: { matches: locale === 'cs' ? csMatches : enMatches } }),
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: { children: ReactNode; href: string }) => createElement('a', { ...props, href }, children),
  getPathname: ({ href, locale }: { href: string; locale: string }) => `/${locale}${href}`,
}));

const fixture = (fields: Partial<LeagueFixturePublic> = {}): LeagueFixturePublic => ({
  id: 'synthetic-match', sourceUrl: 'https://wardogsleague.net/matches/synthetic-match', eventId: null, tracking: 'tracked', state: 'fresh',
  observedAt: '2026-10-24T12:00:00Z', title: '[SYNTHETIC] Match', fixtureNumber: null, type: null, status: null, scheduledAt: null, teams: [], map: null, hosting: null,
  ...fields,
});

describe('League row status and freshness', () => {
  it.each(['cs', 'en'] as const)('keeps an absent %s status unknown instead of inventing Scheduled', async (locale) => {
    const item = fixture();
    const html = renderToStaticMarkup(await LeagueMatchStatus({ fixture: item, locale }));
    expect(html).toContain('—');
    expect(html).not.toMatch(/Naplánováno|Scheduled|Neaktuální|Stale/);
    expect(item.status).toBeNull();
    expect(item.scheduledAt).toBeNull();
  });

  it.each(['cs', 'en'] as const)('marks every stale %s row independently of whether a preview is selected', async (locale) => {
    const item = fixture({ status: 'Scheduled', state: 'stale' });
    const html = renderToStaticMarkup(await LeagueMatchStatus({ fixture: item, locale }));
    expect(html).toContain(locale === 'cs' ? 'Naplánováno' : 'Scheduled');
    expect(html).toContain(locale === 'cs' ? 'Neaktuální' : 'Stale');
    expect(html).toContain('data-kind="warning"');
    expect(item).toMatchObject({ status: 'Scheduled', state: 'stale' });
  });

  it.each(['cs', 'en'] as const)('keeps the %s unknown marker and stale warning together', async (locale) => {
    const html = renderToStaticMarkup(await LeagueMatchStatus({ fixture: fixture({ state: 'stale' }), locale }));
    expect(html).toContain('—');
    expect(html).toContain(locale === 'cs' ? 'Neaktuální' : 'Stale');
    expect(html).not.toMatch(/Naplánováno|Scheduled/);
  });

  it.each(['Confirmed', 'Set by admin', 'Future published status'])('preserves the actual source wording %s without score or winner inference', async (status) => {
    const item = fixture({ status });
    for (const locale of ['cs', 'en'] as const) {
      const html = renderToStaticMarkup(await LeagueMatchStatus({ fixture: item, locale }));
      expect(html).toContain(status);
      expect(html).not.toMatch(/data-kind="warning"|winner|score|Valkyria/);
    }
    expect(item.status).toBe(status);
  });
});
