import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PublicMatchDetail } from '@/modules/matches/types';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { MatchDetailPane } from './match-detail';
import type * as MatchParts from './match-parts';

vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/i18n/navigation', () => ({ Link: ({ children, href }: { children: ReactNode; href: string }) => createElement('a', { href }, children) }));
vi.mock('./localized-prose', () => ({ LocalizedProseView: () => null }));
vi.mock('./match-parts', async (original) => ({ ...await original<typeof MatchParts>(), MatchBanner: () => null }));

const match = {
  slug: 'synthetic-archive', game: 'hell-let-loose', opponentName: 'Synthetic opponent', competitionType: 'friendly', competitionName: 'Original cup',
  startsAt: '2020-01-01T18:00:00Z', originalStartsAt: '2019-12-31T18:00:00Z', status: 'completed', format: null, bestOf: null, teamSize: null,
  result: { scoreValkyria: 3, scoreOpponent: 2, outcome: 'win', verification: 'verified' }, rounds: [], vodLinks: [],
} as unknown as PublicMatchDetail;
const connected: PublicLogiEvent = {
  ref: { source: 'logi', sourceInstanceId: 'synthetic', guildId: 'synthetic', game: 'hll', kind: 'match', externalId: 'synthetic-event' },
  kind: 'match', title: 'Synthetic', status: null, startsAt: null, endsAt: '2020-01-02T20:00:00Z', observedAt: '2020-01-02T20:01:00Z', sourceUpdatedAt: null, teams: [],
  archive: { slug: match.slug },
  result: { state: 'corrected', version: 2, reviewedAt: null, endedAt: null, participants: [{ id: 'a', label: 'Axis', score: 0 }, { id: 'b', label: 'Allies', score: 5 }], provenance: { kind: 'reviewed_result', origin: 'manual' } },
};
const render = async (event?: PublicLogiEvent) => renderToStaticMarkup(await MatchDetailPane({ match, connected: event, mode: 'detail', locale: 'en', titleId: 'overview' }));

describe('one primary result on an explicitly connected match detail', () => {
  it('uses all current facts together without inferring a Valkyria score or retaining an obsolete start', async () => {
    const html = await render(connected);
    expect(html).toContain('Axis: <strong>0</strong>');
    expect(html).toContain('Allies: <strong>5</strong>');
    expect(html).toContain('corrected');
    expect(html).toContain('endTime');
    expect(html).toContain('data-match-time="end"');
    expect(html).toContain('2020-01-02T20:00:00Z');
    expect(html).not.toContain('2020-01-01T18:00:00Z');
    expect(html).not.toContain('data-result="score"');
    expect(html).not.toContain('data-original-start');
    expect(html).toContain('Original cup');
  });

  it('keeps an unknown current result unknown, even with a verified archive score', async () => {
    const html = await render({ ...connected, result: { ...connected.result, state: 'unknown', participants: [], provenance: null } });
    expect(html).toContain('aria-label="unknown"');
    expect(html).not.toContain('data-result="score"');
    expect(html).not.toContain('verified');
  });

  it('preserves null versus zero and imported provenance without borrowing a result side', async () => {
    const html = await render({ ...connected, result: { ...connected.result, state: 'provisional', participants: [{ id: 'a', label: 'Side A', score: 0 }, { id: 'b', label: 'Side B', score: null }], provenance: { kind: 'event_result_import', importedAt: connected.observedAt } } });
    expect(html).toContain('Side A: <strong>0</strong>');
    expect(html).toContain('Side B: <strong>—</strong>');
    expect(html).toContain('importedProvisional');
    expect(html).toContain('importedOn');
    expect(html).not.toContain('data-result="score"');
  });

  it('uses the complete original presentation when the public projection is unavailable', async () => {
    const html = await render();
    expect(html).toContain('2020-01-01T18:00:00Z');
    expect(html).toContain('data-match-time="start"');
    expect(html).toContain('data-result="score"');
    expect(html).not.toContain('data-connected-result');
  });
});
