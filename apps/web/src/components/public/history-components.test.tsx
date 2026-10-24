import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import cs from '@/i18n/messages/cs/history.json';
import en from '@/i18n/messages/en/history.json';
import csCommon from '@/i18n/messages/cs/common.json';
import enCommon from '@/i18n/messages/en/common.json';
import { aggregateHistory, listHistoryMaps } from '@/modules/integrations/logi/readers/history-report';
import { DEFAULT_HISTORY_PUBLIC_FILTERS, toHistoryGamesPublic, toHistoryReportPublic } from '@/modules/integrations/logi/readers/history-public';
import { syntheticHllHistoryPages, syntheticHistoryPages } from '@/modules/integrations/logi/readers/synthetic';
import { GameHistoryList } from './history-games';
import { PlayerRankings } from './history-players';
import { parseHistoryQuery } from './history-query';

vi.mock('next-intl/server', () => ({ getTranslations: async ({ locale, namespace }: { locale: 'cs' | 'en'; namespace: string }) => {
  const messages = locale === 'cs' ? cs : en;
  return createTranslator({ locale, messages: namespace === 'history.players' ? messages.players : namespace === 'history.games' ? messages.games : (locale === 'cs' ? csCommon : enCommon).a11y });
} }));
vi.mock('@/i18n/navigation', () => ({ Link: ({ children, href, ...props }: { children: ReactNode; href: string }) => createElement('a', { ...props, href }, children) }));

const now = new Date('2026-10-25T00:00:00Z');
const context = { publicId: 'synthetic-history', state: 'fresh' as const, synthetic: true, coverage: { kind: 'all' as const, from: null }, refreshedAt: now.toISOString(), lastCollectedAt: now.toISOString(), publishPlayers: true, playerKey: () => 'opaque-player-key' };
const render = (node: ReactNode, locale: 'cs' | 'en') => renderToStaticMarkup(<NextIntlClientProvider locale={locale} timeZone="Europe/Prague" messages={{ common: locale === 'cs' ? csCommon : enCommon }}>{node}</NextIntlClientProvider>);

describe('shared history presentation', () => {
  it.each(['cs', 'en'] as const)('renders actual HLL score metrics and unknown coverage in %s without Wardogs result columns', async (locale) => {
    const records = syntheticHllHistoryPages(now).flatMap((page) => page.items);
    const filters = { ...DEFAULT_HISTORY_PUBLIC_FILTERS, minMinutes: 0 };
    const report = toHistoryReportPublic(context, filters, aggregateHistory(records, 0), listHistoryMaps(records));
    const games = toHistoryGamesPublic(context, filters, records, 1);
    const query = parseHistoryQuery(undefined, [context.publicId], 'hll');
    const ranking = render(await PlayerRankings({ report, locale, query, base: '/hll/history', game: 'hll' }), locale);
    const list = render(await GameHistoryList({ games, locale, query, base: '/hll/history', game: 'hll' }), locale);
    for (const label of locale === 'cs' ? ['Boj', 'Útok', 'Obrana', 'Podpora'] : ['Combat', 'Offensive', 'Defensive', 'Support']) {
      expect(ranking).toContain(label);
      expect(list).toContain(label);
    }
    expect(ranking).toMatch(/data-history-metric="offense">0<\/td>/);
    expect(ranking).toContain('data-history-coverage="combat"');
    expect(ranking).toContain('data-history-sort="combat"');
    expect(ranking).not.toContain('data-history-sort="seconds"');
    expect(ranking).not.toContain('data-history-sort="winRate"');
    expect(list).toContain(locale === 'cs' ? 'Neznámý výsledek' : 'Unknown result');
    expect(list).not.toContain(locale === 'cs' ? 'bez bojového feedu' : 'no combat feed');
    for (const html of [ranking, list]) expect(html).not.toMatch(/platformId|sourceDigest|private-synthetic|HLL History Server|scoreTimeline|history\./);
  });

  it('retains Wardogs faction results, playtime and cash columns', async () => {
    const records = syntheticHistoryPages(now).flatMap((page) => page.items);
    const report = toHistoryReportPublic(context, DEFAULT_HISTORY_PUBLIC_FILTERS, aggregateHistory(records), []);
    const query = parseHistoryQuery(undefined, [context.publicId]);
    const html = render(await PlayerRankings({ report, locale: 'en', query, base: '/wardogs/history' }), 'en');
    expect(html).toContain('data-history-sort="winRate"');
    expect(html).toContain('data-history-sort="seconds"');
    expect(html).toContain('data-history-cash=""');
    expect(html).not.toContain('data-history-sort="combat"');
  });
});
