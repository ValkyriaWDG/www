import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import cs from '@/i18n/messages/cs/logi.json';
import en from '@/i18n/messages/en/logi.json';
import csCommon from '@/i18n/messages/cs/common.json';
import enCommon from '@/i18n/messages/en/common.json';
import csMatches from '@/i18n/messages/cs/matches.json';
import enMatches from '@/i18n/messages/en/matches.json';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { getOperationalTranslations, OperationalMatchPreview, OperationalMatchResult, OperationalMatchTeams } from './operational-match-parts';

vi.mock('next-intl/server', () => ({ getTranslations: async ({ locale, namespace }: { locale: 'cs' | 'en'; namespace: 'logi' | 'matches' }) => createTranslator({ locale, messages: namespace === 'matches' ? locale === 'cs' ? csMatches : enMatches : locale === 'cs' ? cs : en }) }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: { children: ReactNode; href: string }) => createElement('a', { ...props, href }, children),
  getPathname: ({ href, locale }: { href: string; locale: string }) => `/${locale}${href}`,
}));

const now = new Date('2026-10-05T12:00:00Z');
const imported: PublicLogiEvent = {
  ref: { source: 'logi', sourceInstanceId: 'private-source-instance', guildId: 'private-guild', game: 'hll', kind: 'match', externalId: 'synthetic-history' },
  title: '[SYNTHETIC] Historical match', kind: 'match', status: null, startsAt: null, endsAt: '2026-10-04T20:00:00Z', observedAt: now.toISOString(), sourceUpdatedAt: null,
  teams: [{ id: 'team-alpha', slot: 'a', side: 'Axis', name: 'Synthetic Alpha', shortCode: 'ALP' }, { id: 'team-bravo', slot: 'b', side: null, name: 'Synthetic Bravo', shortCode: null }],
  result: { state: 'provisional', version: null, reviewedAt: null, endedAt: '2026-10-04T19:30:00Z', participants: [{ id: 'sideA', label: 'axis', score: 0 }, { id: 'sideB', label: 'allies', score: 5 }], provenance: { kind: 'event_result_import', importedAt: '2026-10-05T10:00:00Z' } },
  archive: { slug: 'synthetic-archive' },
};

const render = (node: ReactNode, locale: 'cs' | 'en') => renderToStaticMarkup(<NextIntlClientProvider locale={locale} timeZone="Europe/Prague" messages={{ common: locale === 'cs' ? csCommon : enCommon }}>{node}</NextIntlClientProvider>);

function expectPresentationOnly(html: string) {
  for (const oldCopy of ['Matches from Logi', 'Zápasy z Logi', 'Website archive', 'Archiv webu', 'Imported provisional result', 'Importovaný předběžný výsledek', 'Result imported:', 'Výsledek importován:', 'Archived match details', 'Archivní detail zápasu']) expect(html).not.toContain(oldCopy);
  for (const privateField of ['private-source-instance', 'private-guild', 'team-alpha', 'team-bravo', 'logoUrl', 'teamRevision', 'capturedAt', 'event_result_import']) expect(html).not.toContain(privateField);
  expect(html).not.toContain('2026-10-05T10:00:00Z');
  expect(html).not.toContain('<table');
}

describe('shared operational match presentation', () => {
  it.each(['cs', 'en'] as const)('renders %s captured identities, visible scores and a labelled end time in the shared detail', async (locale) => {
    const html = render(await OperationalMatchPreview({ locale, event: imported, mode: 'detail' }), locale);
    expect(html).toMatch(/datetime="2026-10-04T19:30:00Z"/i);
    expect(html).toContain(locale === 'cs' ? 'Čas konce' : 'End time');
    expect(html).toContain(locale === 'cs' ? 'Předběžný výsledek' : 'Provisional result');
    expect(html).toContain(locale === 'cs' ? 'Odehráno' : 'Played');
    expect(html).toContain('Synthetic Alpha');
    expect(html).toContain('ALP');
    expect(html).toContain('Synthetic Bravo');
    expect(html).toContain('[SYNTHETIC] Historical match');
    expect(html).toContain(locale === 'cs' ? 'Osa' : 'Axis');
    expect(html).toContain(locale === 'cs' ? 'Spojenci' : 'Allies');
    expect(html).toMatch(/<strong[^>]*>0<\/strong>/);
    expect(html).toMatch(/<strong[^>]*>5<\/strong>/);
    expect(html).toContain('axis: 0; allies: 5');
    expect(html).toContain('data-operational-match-detail=""');
    expect(html).toContain('data-detail-mode="detail"');
    expect(html).not.toContain('href=');
    expectPresentationOnly(html);
  });

  it('preserves unknown scores and all three supplied participants without relabelling them as teams', async () => {
    const selected: PublicLogiEvent = { ...imported, result: { ...imported.result, state: 'corrected', version: 2, reviewedAt: now.toISOString(), endedAt: null, provenance: { kind: 'reviewed_result', origin: 'manual' }, participants: [{ id: 'c', label: 'Faction C', score: null }, { id: 'a', label: 'Faction A', score: 0 }, { id: 'b', label: 'Faction B', score: 7 }] } };
    const html = render(await OperationalMatchPreview({ locale: 'en', event: selected, mode: 'detail' }), 'en');
    expect(html).toContain('Faction C: —');
    expect(html).toContain('Faction A: 0');
    expect(html).toContain('Faction B: 7');
    expect(html).toMatch(/<strong[^>]*>—<\/strong>/);
    expect(html).toMatch(/<strong[^>]*>0<\/strong>/);
    expect(html).toMatch(/<strong[^>]*>7<\/strong>/);
    expect(html).toContain('Corrected result');
    expectPresentationOnly(html);
  });

  it.each(['cs', 'en'] as const)('uses the reviewed %s opponent identity as the primary teams and the source title as a subtitle', async (locale) => {
    const linked = { ...imported, archive: { slug: 'synthetic-archive', opponentName: 'Synthetic Archive Opponent', competitionName: 'Synthetic Archive Cup' } };
    const html = render(await OperationalMatchPreview({ locale, event: linked, mode: 'detail' }), locale);
    expect(html).toContain('[SYNTHETIC] Historical match');
    expect(html).toMatch(/<strong[^>]*>Valkyria<\/strong>/);
    expect(html).toMatch(/<strong[^>]*>Synthetic Archive Opponent<\/strong>/);
    expect(html).toContain('Synthetic Archive Cup');
    expect(html).toContain('axis: 0');
    expect(html).not.toContain('Synthetic Alpha');
    expect(html).not.toContain('Synthetic Bravo');
    expectPresentationOnly(html);
  });

  it('keeps the preview and detail on the same presentation while only the preview offers navigation', async () => {
    const event = { ...imported, archive: undefined };
    const preview = render(await OperationalMatchPreview({ locale: 'en', event }), 'en');
    const detail = render(await OperationalMatchPreview({ locale: 'en', event, mode: 'detail' }), 'en');
    expect(preview).toContain('data-detail-mode="preview"');
    expect(preview).toContain('href="/hll/matches/logi/synthetic-history"');
    expect(detail).toContain('data-detail-mode="detail"');
    expect(detail).not.toContain('href=');
    for (const html of [preview, detail]) {
      expect(html).toContain('Synthetic Alpha');
      expect(html).toContain('axis: 0; allies: 5');
      expectPresentationOnly(html);
    }
  });

  it('navigates a reviewed preview directly to its canonical match and retains the supplied event end when no result end exists', async () => {
    const event = { ...imported, result: { ...imported.result, endedAt: null } };
    const preview = render(await OperationalMatchPreview({ locale: 'en', event }), 'en');
    expect(preview).toContain('href="/hll/matches/synthetic-archive"');
    expect(preview).not.toContain('/matches/logi/');
    expect(preview).toMatch(/datetime="2026-10-04T20:00:00Z"/i);
    expect(preview).toContain('End time');
    expect(preview).not.toContain('2026-10-05T12:00:00');
    expectPresentationOnly(preview);
  });

  it.each(['cs', 'en'] as const)('keeps three-party %s future lineups distinct and leaves a missing result unknown', async (locale) => {
    const t = await getOperationalTranslations(locale);
    const event: PublicLogiEvent = { ...imported, archive: undefined, status: 'registration', startsAt: '2026-11-01T18:00:00Z', endsAt: '2026-11-01T20:00:00Z', ref: { ...imported.ref, game: 'wardogs' }, teams: [...imported.teams, { id: 'team-charlie', slot: 'c', side: 'Valkyra', name: 'Synthetic Charlie', shortCode: 'CHR' }], result: { state: 'unknown', version: null, reviewedAt: null, endedAt: null, participants: [], provenance: null } };
    const teams = render(<OperationalMatchTeams event={event} t={t} expanded />, locale);
    for (const label of ['Synthetic Alpha', 'ALP', 'Synthetic Bravo', 'Synthetic Charlie', 'CHR', 'Valkyra']) expect(teams).toContain(label);
    const result = render(<OperationalMatchResult event={event} t={t} locale={locale} />, locale);
    expect(result).toContain('—');
    expect(result).toContain(locale === 'cs' ? 'Čeká na výsledek' : 'Awaiting result');
    expect(result).not.toMatch(/0\s*:\s*0/);
    expect(result).not.toMatch(/<strong[^>]*>0<\/strong>/);
    const detail = render(await OperationalMatchPreview({ locale, event, mode: 'detail' }), locale);
    expect(detail).toMatch(/datetime="2026-11-01T18:00:00Z"/i);
    expect(detail).not.toContain(locale === 'cs' ? 'Čas konce' : 'End time');
    expectPresentationOnly(detail);
  });
});
