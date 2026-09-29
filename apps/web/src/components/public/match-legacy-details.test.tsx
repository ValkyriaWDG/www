import { createTranslator } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import cs from '@/i18n/messages/cs/matches.json';
import en from '@/i18n/messages/en/matches.json';
import type { LegacyMatchDetails } from '@/modules/legacy/match-details';
import type { PublicMatchSummary } from '@/modules/matches/types';
import { MatchLegacyDetails } from './match-legacy-details';
import { MatchTeams } from './match-parts';

vi.mock('@/modules/content/rich-text/render', () => ({ mediaUrl: (id: string) => `/api/media/${id}` }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => createTranslator({ locale: 'en', messages: en }) }));
vi.mock('@/i18n/navigation', () => ({ Link: ({ children, href }: { children: ReactNode; href: string }) => createElement('a', { href }, children) }));

const detail = (): LegacyMatchDetails => ({
  version: 1, homeTeamName: 'VLK + Synthetic Ally', awayTeamName: 'Synthetic Opponent', homeCountry: 'CZ', awayCountry: 'US',
  homeSide: 'allies', awaySide: 'axis', capturePoint: 'Synthetic Capture Point', legacyPoint: 'Synthetic Point',
  homeSideLabel: 'allies', awaySideLabel: 'axis',
  points: ['3', '2'], durationMinutes: 90, firstCapture: 'allies', legacyFirstCaptured: 'axis', firstCaptureConflict: true,
  sourceDate: '12/05/2024 19:00', separateTime: '20:00', timeConflict: true, clock: 'legacy-fixed-offset',
  sourceLinks: [{ url: 'https://example.org/synthetic-recording', title: 'Synthetic recording', description: 'Synthetic original description', author: 'Synthetic credit', date: '12/05/2024', type: 'youtube' }],
});

function render(details: LegacyMatchDetails, locale: 'cs' | 'en' = 'en') {
  const t = createTranslator({ locale, messages: locale === 'cs' ? cs : en });
  return renderToStaticMarkup(<MatchLegacyDetails details={details} t={t} titleId="test" externalLabel={locale === 'cs' ? '(externí odkaz)' : '(external link)'} />);
}

describe('public historical match facts', () => {
  it.each(['cs', 'en'] as const)('renders safe source facts in %s independently of the recap', (locale) => {
    const html = render(detail(), locale);
    for (const value of ['VLK + Synthetic Ally', 'Synthetic Opponent', 'Synthetic Capture Point', 'Synthetic Point', '3 · 2', '12/05/2024 19:00', '20:00']) expect(html).toContain(value);
    expect(html).toContain(locale === 'cs' ? '90 minut' : '90 minutes');
    expect(html).toContain('data-legacy-time-conflict=""');
    expect(html).toContain('data-legacy-capture-conflict=""');
    expect(html).toContain('UTC+01:00');
    expect(html).toContain(locale === 'cs' ? 'Původní domácí tým' : 'Original home team');
    expect(html).toContain(locale === 'cs' ? 'První obsazení' : 'First capture');
    expect(html).not.toContain('data-match-recap');
  });

  it('preserves recording credits, descriptions and source dates without embedding a third party player', () => {
    const html = render(detail());
    for (const value of ['Synthetic recording', 'Synthetic original description', 'Synthetic credit', '12/05/2024', 'youtube']) expect(html).toContain(value);
    expect(html).toContain('href="https://example.org/synthetic-recording"');
    expect(html).toContain('original language');
    expect(html).not.toMatch(/<iframe|target=/);
  });

  it('keeps unverified strings as text and ignores unsafe links at the rendering boundary', () => {
    const details = detail();
    details.capturePoint = '<script>alert(1)</script>';
    details.sourceLinks = [{ ...details.sourceLinks[0]!, url: 'javascript:alert(1)' }];
    const html = render(details);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toMatch(/<script|javascript:|data-legacy-source-links/);
  });

  it('does not invent missing values or show a conflict after the source fields agree', () => {
    const details = detail();
    Object.assign(details, {
      homeCountry: null, awayCountry: null, homeSide: null, awaySide: null, capturePoint: null, legacyPoint: null, points: [], durationMinutes: null,
      firstCapture: 'allies', legacyFirstCaptured: 'allies', firstCaptureConflict: false, separateTime: '19:00', timeConflict: false, sourceLinks: [],
    });
    const html = render(details);
    for (const key of ['duration', 'capturePoint', 'legacyPoint', 'points', 'legacyFirstCaptured', 'separateTime']) expect(html).not.toContain(`data-legacy-fact="${key}"`);
    expect(html).not.toMatch(/data-legacy-time-conflict|data-legacy-capture-conflict|data-match-country|0 minutes/);
    expect(html).toContain('data-legacy-fact="firstCapture"');
  });

  it('shows a recorded zero duration rather than dropping it as missing', () => {
    expect(render({ ...detail(), durationMinutes: 0 })).toContain('0 minutes');
  });

  it('preserves nonstandard source side labels without inventing a statistical side', () => {
    const html = render({ ...detail(), homeSide: null, awaySide: null, homeSideLabel: 'both', awaySideLabel: 'TS allies' });
    expect(html).toContain('both');
    expect(html).toContain('TS allies');
  });

  it('gives untitled recordings a localized accessible link name', () => {
    const details = detail();
    details.sourceLinks[0]!.title = ' ';
    expect(render(details)).toContain('Source link 1');
    expect(render(details, 'cs')).toContain('Zdrojový odkaz 1');
  });
});

describe('opponent country ownership', () => {
  const match = (): PublicMatchSummary => ({
    slug: 'synthetic', game: 'hell-let-loose', opponentName: 'Synthetic Opponent', opponentShortCode: 'SYN', opponentLogo: null,
    competitionType: 'friendly', competitionName: null, startsAt: '2024-05-12T18:00:00Z', timeZone: 'Europe/Prague',
    originalStartsAt: null, status: 'completed', result: null, legacyDetails: detail(),
  });
  const renderTeams = (value: PublicMatchSummary) => renderToStaticMarkup(<MatchTeams match={value} t={createTranslator({ locale: 'en', messages: en })} />);

  it('shows flags and source coalition name for the matching imported opponent', () => {
    const html = renderTeams(match());
    expect(html).toContain('VLK + Synthetic Ally');
    expect(html).toContain('data-match-country="CZ"');
    expect(html).toContain('data-match-country="US"');
    expect(html).toContain('aria-label="United States"');
  });

  it('does not attach the historical flag to an opponent changed by an editor', () => {
    const html = renderTeams({ ...match(), opponentName: 'New Synthetic Opponent' });
    expect(html).toContain('New Synthetic Opponent');
    expect(html).not.toContain('data-match-country="US"');
  });

  it('does not invent flags for a normal match without archive metadata', () => {
    expect(renderTeams({ ...match(), legacyDetails: null })).not.toContain('data-match-country');
  });
});
