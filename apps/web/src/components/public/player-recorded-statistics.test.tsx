import { createTranslator } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import cs from '@/i18n/messages/cs/members.json';
import en from '@/i18n/messages/en/members.json';
import csPeople from '@/i18n/messages/cs/logiPeople.json';
import enPeople from '@/i18n/messages/en/logiPeople.json';
import type { PublicPlayerStatistics } from '@/modules/integrations/logi-public-player-statistics';
import { PlayerRecordedStatistics } from './player-recorded-statistics';

vi.mock('next-intl/server', () => ({ getTranslations: async ({ locale, namespace }: { locale: 'cs' | 'en'; namespace: 'members.player' | 'logiPeople' }) => createTranslator({ locale, messages: namespace === 'members.player' ? locale === 'cs' ? cs.player : en.player : locale === 'cs' ? csPeople : enPeople }) }));
const stats: PublicPlayerStatistics = { game: 'wardogs', matches: 123, kills: 9123, deaths: 3456, kd: 2.64, cashDelta: null, recentLimit: 30, observedAt: '2026-10-25T00:00:00Z', recentMatches: [{ title: 'Synthetic public match', endedAt: '2026-10-24T20:00:00Z', mapName: 'Synthetic Map', kills: 10, deaths: 2, kd: 5, offense: null, defense: null, support: null, cashDelta: -100 }] };

describe('recorded public player statistics coverage', () => {
  it.each(['cs', 'en'] as const)('keeps all-match %s totals distinct from the latest-match subset and preserves missing money', async (locale) => {
    const html = renderToStaticMarkup(await PlayerRecordedStatistics({ locale, stats }));
    expect(html).toContain('123');
    expect(html).toContain(locale === 'cs' ? 'napříč všemi týmy' : 'across all teams');
    expect(html).toContain('30');
    expect(html).toContain('Synthetic public match');
    expect(html).toContain('Synthetic Map');
    expect(html).toContain('—');
    expect(html).toContain('-100');
    expect(html).not.toMatch(/Discord|Steam|verified member|ověřený člen|connectionId|identityId/);
    expect(stats.kills).toBe(9123);
    expect(html).toContain(new Intl.NumberFormat(locale).format(stats.kills));
  });
  it('shows actual HLL offense/defense/support and does not expose unsupported Wardogs money as zero', async () => {
    const hll = { ...stats, game: 'hell-let-loose' as const, recentMatches: [{ ...stats.recentMatches[0]!, offense: 0, defense: 5, support: 20 }] };
    const html = renderToStaticMarkup(await PlayerRecordedStatistics({ locale: 'en', stats: hll }));
    expect(html).toContain('Offense: 0');
    expect(html).toContain('Defense: 5');
    expect(html).toContain('Support: 20');
    expect(html).not.toContain('Cash');
  });
  it('keeps five recent matches visible and all remaining records available in a closed disclosure', async () => {
    const recentMatches = Array.from({ length: 30 }, (_, index) => ({ ...stats.recentMatches[0]!, title: `Synthetic match ${index + 1}` }));
    const html = renderToStaticMarkup(await PlayerRecordedStatistics({ locale: 'en', stats: { ...stats, recentMatches } }));
    const [visible, older] = html.split('<details');
    expect(visible).toContain('Synthetic match 5');
    expect(visible).not.toContain('Synthetic match 6');
    expect(older).toContain('25 more matches');
    expect(older).toContain('Synthetic match 30');
    expect(older).not.toMatch(/\bopen(?:=|>)/);
    expect((html.match(/<li>/g) ?? [])).toHaveLength(30);
  });
});
