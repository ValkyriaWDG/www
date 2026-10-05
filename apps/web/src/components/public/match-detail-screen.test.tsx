import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { MatchDetailScreen } from './match-detail-screen';

const state = vi.hoisted(() => ({ events: [] as PublicLogiEvent[] }));
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }));
vi.mock('@/modules/matches/queries', () => ({ getPublicMatch: async () => ({ slug: 'synthetic-original', game: 'hell-let-loose', opponentName: 'Synthetic opponent', status: 'scheduled' }) }));
vi.mock('@/modules/integrations/logi-public', () => ({ getPublicLogiEvents: async () => state.events }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/components/games/switch-notice', () => ({ GameSwitchNotice: () => null }));
vi.mock('@/components/shell/page-main', () => ({ PageMain: ({ children }: { children: ReactNode }) => createElement('main', {}, children) }));
vi.mock('@/components/ui/panels', () => ({ PageHeader: ({ back }: { back: { href: string } }) => createElement('a', { href: back.href }, 'Back') }));
vi.mock('./logi-matches', () => ({ LogiMatches: () => null }));
vi.mock('@/components/public/matches-screen', () => ({ MatchesScreen: ({ filters, events }: { filters: { view: string }; events: PublicLogiEvent[] }) => createElement('div', { 'data-view': filters.view, 'data-event-count': events.length }) }));

describe('linked original detail retains the unified list context', () => {
  it('returns a concluded connected match to Results even while its original status remains scheduled', async () => {
    state.events = [{ ref: { source: 'logi', sourceInstanceId: 'synthetic', guildId: 'synthetic', game: 'hll', kind: 'match', externalId: 'synthetic' }, kind: 'match', title: 'Synthetic', status: 'concluded', startsAt: null, endsAt: '2020-10-01T20:00:00Z', observedAt: '2020-10-01T20:00:00Z', sourceUpdatedAt: null, teams: [], result: { state: 'unknown', version: null, reviewedAt: null, endedAt: null, participants: [], provenance: null }, archive: { slug: 'synthetic-original' } }];
    const html = renderToStaticMarkup(await MatchDetailScreen({ locale: 'en', slug: 'synthetic-original', game: 'hll', query: { page: '2', q: 'Synthetic' } }));
    expect(html).toContain('href="/hll/matches?view=results&amp;q=Synthetic&amp;page=2"');
    expect(html).toContain('data-view="results"');
    expect(html).toContain('data-event-count="1"');
  });

  it('uses the published original status when the connected projection is unavailable', async () => {
    state.events = [];
    const html = renderToStaticMarkup(await MatchDetailScreen({ locale: 'en', slug: 'synthetic-original', game: 'hll', query: {} }));
    expect(html).toContain('href="/hll/matches"');
    expect(html).toContain('data-view="upcoming"');
    expect(html).toContain('data-event-count="0"');
  });
});
