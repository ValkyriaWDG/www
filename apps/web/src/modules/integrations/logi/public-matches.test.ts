import { describe, expect, it } from 'vitest';
import type { PublicLogiEvent } from './mapping';
import { getNextPublicLogiMatch, logiEventHref, publicLogiMatchTime, publicLogiMatchView, queryPublicLogiMatches } from './public-matches';

const now = new Date('2026-10-05T12:00:00Z');
const event = (id: string, fields: Partial<PublicLogiEvent> = {}): PublicLogiEvent => ({
  ref: { source: 'logi', sourceInstanceId: 'synthetic-source', guildId: 'synthetic-guild', game: 'hll', kind: 'match', externalId: id },
  title: `Synthetic ${id}`, kind: 'match', status: null, startsAt: null, endsAt: '2026-10-05T18:00:00Z',
  sourceUpdatedAt: null, observedAt: now.toISOString(), teams: [],
  result: { state: 'unknown', version: null, reviewedAt: null, endedAt: null, participants: [], provenance: null },
  ...fields,
});

describe('one public Logi match query for lists and home pages', () => {
  it('classifies a passed end, a supplied result or concluded event as history without changing source status', () => {
    const old = event('old', { endsAt: '2026-10-04T18:00:00Z' });
    const scored = event('scored', { result: { ...old.result, state: 'provisional', participants: [{ id: 'a', label: 'A', score: 0 }, { id: 'b', label: 'B', score: 5 }] } });
    for (const row of [old, scored, event('concluded', { status: 'concluded' }), event('boundary', { endsAt: now.toISOString() })]) expect(publicLogiMatchView(row, now)).toBe('results');
    expect(publicLogiMatchView(event('future'), now)).toBe('upcoming');
    expect(old.status).toBeNull();
    expect(old.result.state).toBe('unknown');
  });

  it('uses an explicitly labelled end only when the start is missing, preferring the supplied imported end', () => {
    const old = event('old', { result: { ...event('base').result, endedAt: '2026-10-04T19:00:00Z' } });
    expect(publicLogiMatchTime(old)).toEqual({ at: '2026-10-04T19:00:00Z', kind: 'end' });
    expect(publicLogiMatchTime(event('end'))).toEqual({ at: '2026-10-05T18:00:00Z', kind: 'end' });
    expect(publicLogiMatchTime({ ...old, startsAt: '2026-10-04T17:00:00Z' })).toEqual({ at: '2026-10-04T17:00:00Z', kind: 'start' });
    expect(old.startsAt).toBeNull();
  });

  it('orders history newest first and upcoming soonest first by instants rather than ISO string order', () => {
    const rows = [event('utc-earlier', { startsAt: '2026-10-04T19:00:00Z', endsAt: '2026-10-04T23:00:00Z' }), event('offset-later', { startsAt: '2026-10-04T18:30:00-01:00', endsAt: '2026-10-04T23:00:00Z' })];
    expect(queryPublicLogiMatches(rows, { view: 'results', now }).items.map((row) => row.ref.externalId)).toEqual(['offset-later', 'utc-earlier']);
    expect(queryPublicLogiMatches(rows.map((row) => ({ ...row, endsAt: '2026-10-06T23:00:00Z' })), { view: 'upcoming', now }).items.map((row) => row.ref.externalId)).toEqual(['utc-earlier', 'offset-later']);
    expect(rows[0]?.ref.externalId).toBe('utc-earlier');
  });

  it('searches supplied team names and codes, keeps game scope and pages after sorting', () => {
    const rows = Array.from({ length: 12 }, (_, index) => event(`row-${index}`, { startsAt: `2026-10-05T${String(13 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}:00Z`, teams: [{ id: 'team', slot: 'a', side: null, name: 'Žlutý tým', shortCode: 'ZLT' }] }));
    const page = queryPublicLogiMatches(rows, { view: 'upcoming', q: 'zluty', now, page: 2 });
    expect(page).toMatchObject({ total: 12, page: 2, pageCount: 2 });
    expect(page.items.map((row) => row.ref.externalId)).toEqual(['row-10', 'row-11']);
    expect(queryPublicLogiMatches(rows, { view: 'upcoming', q: 'zlt', now }).total).toBe(12);
    expect(queryPublicLogiMatches(rows, { view: 'results', q: 'zlt', now }).total).toBe(0);
  });

  it('uses stable scoped identities for equal-time ordering and safe detail links', () => {
    const a = event('a');
    const b = event('b');
    expect(queryPublicLogiMatches([b, a], { view: 'upcoming', now }).items.map((row) => row.ref.externalId)).toEqual(['a', 'b']);
    expect(logiEventHref(a)).toBe('/hll/matches/logi/a');
  });

  it('keeps the explicitly associated archive opponent and competition searchable without changing the Logi title', () => {
    const linked = event('map-and-source-id', { title: 'Synthetic Map #123', archive: { slug: 'explicit-archive', opponentName: 'Žlutí soupeři', opponentShortCode: 'ZLS', competitionName: 'Synthetic Cup' } });
    for (const q of ['zluti', 'zls', 'synthetic cup', 'map #123']) {
      expect(queryPublicLogiMatches([linked], { view: 'upcoming', now, q }).items).toEqual([linked]);
    }
    expect(linked.title).toBe('Synthetic Map #123');
  });

  it('only advertises an actual known upcoming start on home and applies the existing three-hour grace', () => {
    const rows = [event('unscheduled'), event('missed', { startsAt: '2026-10-05T08:00:00Z' }), event('just-started', { startsAt: '2026-10-05T11:00:00Z' }), event('next', { startsAt: '2026-10-05T17:00:00Z' })];
    expect(getNextPublicLogiMatch(rows, now)?.ref.externalId).toBe('just-started');
    expect(getNextPublicLogiMatch([rows[0]!, rows[1]!], now)).toBeNull();
    expect(getNextPublicLogiMatch([event('training', { kind: 'training', startsAt: '2026-10-05T13:00:00Z' })], now)).toBeNull();
  });
});
