import { describe, expect, it } from 'vitest';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { mergePublicMatchWindow, publicMatchRowKey, publicMatchWindow } from './public-browser';
import type { PublicMatchSummary } from './types';

const at = (minute: number) => new Date(Date.UTC(2026, 9, 5, 12, minute)).toISOString();
const website = (id: number, minute: number): PublicMatchSummary => ({ slug: `web-${id}`, startsAt: at(minute), game: 'hell-let-loose', opponentName: `Synthetic ${id}`, opponentShortCode: null, opponentLogo: null, competitionType: 'friendly', competitionName: null, timeZone: 'Europe/Prague', originalStartsAt: null, status: 'completed', result: null });
const connected = (id: number, minute: number): PublicLogiEvent => ({ ref: { source: 'logi', sourceInstanceId: 'synthetic', guildId: 'synthetic', game: 'hll', kind: 'match', externalId: `event-${id}` }, kind: 'match', title: `Synthetic ${id}`, startsAt: null, endsAt: at(minute), status: 'concluded', observedAt: at(minute), sourceUpdatedAt: null, teams: [], result: { state: 'unknown', version: null, reviewedAt: null, endedAt: null, participants: [], provenance: null } });

describe('global match pagination across storage origins', () => {
  it.each(['upcoming', 'results'] as const)('%s pages equal a complete ordered list even across overlapping timestamps and deep page boundaries', (view) => {
    for (const connectedCount of [0, 1, 7, 30]) {
      const sign = view === 'upcoming' ? 1 : -1;
      const web = Array.from({ length: 48 }, (_, i) => website(i, i * 2)).sort((a, b) => sign * (Date.parse(a.startsAt) - Date.parse(b.startsAt)));
      const events = Array.from({ length: connectedCount }, (_, i) => connected(i, i * 3 - 5)).sort((a, b) => sign * (Date.parse(a.endsAt) - Date.parse(b.endsAt)));
      // Independent complete-list oracle; website wins an equal timestamp across origins.
      const oracle = [...web.map((row) => ({ key: `website:${row.slug}`, time: row.startsAt })), ...events.map((row) => ({ key: `connected:hll:${row.ref.externalId}`, time: row.endsAt }))].sort((a, b) => sign * (Date.parse(a.time) - Date.parse(b.time))).map((row) => row.key);
      const actual: string[] = [];
      for (let page = 1; page <= Math.ceil(oracle.length / 5) + 1; page++) {
        const window = publicMatchWindow(page, 5, events.length);
        const items = mergePublicMatchWindow(web.slice(window.websiteOffset, window.websiteOffset + window.websiteLimit), events, view, window.skip, 5).map(publicMatchRowKey);
        expect(items).toEqual(oracle.slice((page - 1) * 5, page * 5));
        actual.push(...items);
      }
      expect(actual).toEqual(oracle);
      expect(new Set(actual).size).toBe(actual.length);
    }
  });
});
