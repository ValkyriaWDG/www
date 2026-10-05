import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import cs from '@/i18n/messages/cs/logi.json';
import en from '@/i18n/messages/en/logi.json';
import csCommon from '@/i18n/messages/cs/common.json';
import enCommon from '@/i18n/messages/en/common.json';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { LogiMatchBrowser, LogiMatches } from './logi-matches';

vi.mock('next-intl/server', () => ({ getTranslations: async ({ locale }: { locale: 'cs' | 'en' }) => createTranslator({ locale, messages: locale === 'cs' ? cs : en }) }));
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

describe('connected match public rendering', () => {
  it.each(['cs', 'en'] as const)('renders %s imported results, captured teams and an explicitly labelled end time', async (locale) => {
    const html = render(await LogiMatches({ locale, events: [imported], selected: imported, now }), locale);
    expect(html).toMatch(/datetime="2026-10-04T19:30:00Z"/i);
    expect(html).toContain(locale === 'cs' ? 'Čas konce' : 'End time');
    expect(html).toContain(locale === 'cs' ? 'Importovaný předběžný výsledek' : 'Imported provisional result');
    expect(html).toContain('Synthetic Alpha');
    expect(html).toContain('ALP');
    expect(html).toContain('Synthetic Bravo');
    expect(html).toContain('axis: 0');
    expect(html).toContain('allies: 5');
    expect(html).toContain('href="/hll/matches/synthetic-archive"');
    expect(html).toContain(locale === 'cs' ? 'Archivní detail zápasu' : 'Archived match details');
    for (const privateField of ['private-source-instance', 'private-guild', 'logoUrl', 'teamRevision', 'capturedAt']) expect(html).not.toContain(privateField);
    expect(html).not.toContain(locale === 'cs' ? 'Ukončený' : 'Concluded');
  });

  it('preserves unknown scores and all three supplied participants without relabelling them as teams', async () => {
    const selected: PublicLogiEvent = { ...imported, result: { ...imported.result, state: 'corrected', version: 2, reviewedAt: now.toISOString(), endedAt: null, provenance: { kind: 'reviewed_result', origin: 'manual' }, participants: [{ id: 'c', label: 'Faction C', score: null }, { id: 'a', label: 'Faction A', score: 0 }, { id: 'b', label: 'Faction B', score: 7 }] } };
    const html = render(await LogiMatches({ locale: 'en', events: [selected], selected, now }), 'en');
    expect(html).toContain('Faction C: —');
    expect(html).toContain('Faction A: 0');
    expect(html).toContain('Faction B: 7');
    expect(html).toContain('Corrected result');
    expect(html).not.toContain('Imported provisional result');
  });

  it.each(['cs', 'en'] as const)('keeps the %s archive identity beside the original Logi title and archive link', async (locale) => {
    const linked = { ...imported, archive: { slug: 'synthetic-archive', opponentName: 'Synthetic Archive Opponent', competitionName: 'Synthetic Archive Cup' } };
    const html = render(await LogiMatches({ locale, events: [linked], selected: linked, now }), locale);
    expect(html).toContain('[SYNTHETIC] Historical match');
    expect(html).toContain('Valkyria vs. Synthetic Archive Opponent');
    expect(html).toContain('Synthetic Archive Cup');
    expect(html).toContain('href="/hll/matches/synthetic-archive"');
    expect(html).toContain('axis: 0');
  });

  it('paginates connected history independently from the archive page and counts the same historical rows', async () => {
    const events = Array.from({ length: 12 }, (_, index) => ({ ...imported, ref: { ...imported.ref, externalId: `history-${index}` }, title: `[SYNTHETIC] History ${index}`, endsAt: `2026-09-${String(index + 1).padStart(2, '0')}T20:00:00Z`, result: { ...imported.result, endedAt: null } }));
    const html = render(await LogiMatchBrowser({ locale: 'en', events, game: 'hll', filters: { view: 'results', page: 7, logiPage: 2 }, now }), 'en');
    expect(html).toContain('[SYNTHETIC] History 1');
    expect(html).toContain('[SYNTHETIC] History 0');
    expect(html).not.toContain('[SYNTHETIC] History 11');
    expect(html).toContain('page=7&amp;logiPage=2');
    expect(html).not.toContain('page=2&amp;logiPage=');
    expect(html).toContain('id="logi-match-search"');
  });
});
