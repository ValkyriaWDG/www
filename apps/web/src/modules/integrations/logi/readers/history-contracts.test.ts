import { describe, expect, it } from 'vitest';
import {
  compareHistoryRevisions, HISTORY_CURSOR_MAX_LENGTH, HISTORY_PAGE_SIZE, HISTORY_REVISION_PATTERN, HISTORY_SOURCE_ID_PATTERN, historyFiltersSchema, historyPageEnvelopeSchema, historyPageSchema,
  historyRecordEnvelopeSchema, historyRecordSchema, historyWarconSchema, type HistoryRecord,
} from './history-contracts';
import { SYNTHETIC_HISTORY_REVISION, syntheticHistoryPages } from './synthetic';

const now = new Date('2026-10-03T12:00:00.000Z');
const pages = syntheticHistoryPages(now);
const record = (): HistoryRecord => structuredClone(pages[0]!.items[0]!);

describe('closed server-game-history contract (producer 72946e3)', () => {
  it('accepts the synthetic pages and single-record envelope and keeps the producer constants', () => {
    for (const page of pages) expect(historyPageEnvelopeSchema.safeParse({ data: page }).success).toBe(true);
    expect(historyRecordEnvelopeSchema.safeParse({ data: record() }).success).toBe(true);
    expect(pages.map((page) => [page.items.length, page.nextCursor])).toEqual([[20, 'synthetic-history-cursor-2'], [0, 'synthetic-history-cursor-3'], [4, null]]);
    expect(HISTORY_PAGE_SIZE).toBe(20);
    expect(HISTORY_CURSOR_MAX_LENGTH).toBe(8192);
    expect(Object.keys(historyRecordSchema.shape).sort()).toEqual(['collectedAt', 'gameId', 'guildId', 'id', 'provider', 'revision', 'schemaVersion', 'serverName', 'session', 'sourceId', 'updatedAt']);
    expect(Object.keys(historyPageSchema.shape).sort()).toEqual(['items', 'lastCollectedAt', 'nextCursor', 'revision']);
    expect(Object.keys(historyWarconSchema.shape).sort()).toEqual(['factions', 'hasFeed', 'lighting', 'mode', 'outcome', 'schemaVersion', 'winner']);
  });

  it('rejects unknown keys anywhere, foreign games and providers, and unbounded values', () => {
    const base = record();
    const invalid = (value: unknown) => expect(historyRecordSchema.safeParse(value).success).toBe(false);
    invalid({ ...base, apiToken: 'never' });
    invalid({ ...base, session: { ...base.session, raw: {} } });
    invalid({ ...base, session: { ...base.session, warcon: { ...base.session.warcon, panelId: 'x' } } });
    invalid({ ...base, session: { ...base.session, players: [{ ...base.session.players[0]!, steamId: '1' }] } });
    invalid({ ...base, session: { ...base.session, participants: [{ ...base.session.participants[0]!, extra: 1 }] } });
    invalid({ ...base, gameId: 'hell_let_loose' });
    invalid({ ...base, provider: 'hll_crcon' });
    invalid({ ...base, schemaVersion: 2 });
    invalid({ ...base, sourceId: 'not-hex' });
    invalid({ ...base, sourceId: base.sourceId.toUpperCase() });
    invalid({ ...base, serverName: 'x'.repeat(201) });
    invalid({ ...base, session: { ...base.session, complete: false } });
    invalid({ ...base, session: { ...base.session, startedAt: null } });
    invalid({ ...base, session: { ...base.session, sourceDigest: 'abc' } });
    invalid({ ...base, session: { ...base.session, players: Array.from({ length: 301 }, (_, i) => ({ platform: 'steam', platformId: `p${i}`, metrics: {} })) } });
    invalid({ ...base, session: { ...base.session, warcon: { ...base.session.warcon, outcome: 'won' } } });
    invalid({ ...base, session: { ...base.session, warcon: { ...base.session.warcon, factions: [{ name: 'Alpha', colorHex: 'red' }] } } });
    invalid({ ...base, session: { ...base.session, players: [{ ...base.session.players[0]!, platform: 'psn' }] } });
    invalid({ ...base, session: { ...base.session, players: [{ ...base.session.players[0]!, metrics: { kills: 'many' } }] } });
    invalid({ ...base, session: { ...base.session, players: [{ ...base.session.players[0]!, metrics: { kills: Number.POSITIVE_INFINITY } }] } });
    expect(historyPageEnvelopeSchema.safeParse({ data: pages[0], meta: {} }).success).toBe(false);
    expect(historyPageEnvelopeSchema.safeParse({ error: { code: 'insufficient_scope' } }).success).toBe(false);
    expect(historyPageSchema.safeParse({ ...pages[0], items: Array.from({ length: 21 }, () => record()) }).success).toBe(false);
    expect(historyPageSchema.safeParse({ ...pages[0], nextCursor: '' }).success).toBe(false);
    expect(historyPageSchema.safeParse({ ...pages[0], nextCursor: 'c'.repeat(HISTORY_CURSOR_MAX_LENGTH + 1) }).success).toBe(false);
    expect(historyPageSchema.safeParse({ ...pages[0], lastCollectedAt: 'yesterday' }).success).toBe(false);
    expect(historyPageSchema.safeParse({ items: pages[0]!.items, revision: SYNTHETIC_HISTORY_REVISION }).success).toBe(false);
  });

  it('applies the retained-session refinements: duplicate factions, duplicate players, winner outside the participants, end before start', () => {
    const base = record();
    const session = base.session;
    const winner = session.warcon.factions.find((faction) => faction.name === session.warcon.winner)!;
    expect(historyRecordSchema.safeParse({ ...base, session: { ...session, warcon: { ...session.warcon, factions: [...session.warcon.factions, { ...winner }] } } }).success).toBe(false);
    expect(historyWarconSchema.safeParse({ ...session.warcon, factions: [...session.warcon.factions, { ...winner }] }).error?.issues[0]?.message).toBe('Duplicate Warcon faction.');
    expect(historyRecordSchema.safeParse({ ...base, session: { ...session, players: [session.players[0]!, { ...session.players[0]!, name: 'Other nickname' }] } }).success).toBe(false);
    expect(historyRecordSchema.safeParse({ ...base, session: { ...session, participants: [session.participants[0]!, { ...session.participants[0]!, label: 'twice' }] } }).success).toBe(false);
    expect(historyRecordSchema.safeParse({ ...base, session: { ...session, warcon: { ...session.warcon, winner: 'Delta' } } }).success).toBe(false);
    // A winner without any retained scoreboard is allowed; so is a winner that is not among the factions.
    expect(historyRecordSchema.safeParse({ ...base, session: { ...session, participants: [], warcon: { ...session.warcon, winner: 'Delta' } } }).success).toBe(true);
    expect(historyRecordSchema.safeParse({ ...base, session: { ...session, participants: [{ id: 'Delta', label: 'Delta', score: 1 }], warcon: { ...session.warcon, winner: 'Delta' } } }).success).toBe(true);
    expect(historyRecordSchema.safeParse({ ...base, session: { ...session, endedAt: new Date(Date.parse(session.startedAt) - 1000).toISOString() } }).success).toBe(false);
    expect(historyRecordSchema.safeParse({ ...base, session: { ...session, endedAt: session.startedAt } }).success).toBe(true);
    // Optional player fields and null results stay as retained; nothing becomes a loss or a zero.
    expect(historyRecordSchema.safeParse({ ...base, session: { ...session, players: [{ platform: 'unknown', platformId: 'anon', metrics: {} }] } }).success).toBe(true);
    expect(historyRecordSchema.safeParse({ ...base, session: { ...session, players: [{ platform: 'xbox', platformId: 'x', name: null, faction: null, result: null, metrics: { kills: null } }] } }).success).toBe(true);
  });

  it('models revisions as decimal strings beyond the Number range and compares them exactly', () => {
    const huge = '9'.repeat(40);
    expect(HISTORY_REVISION_PATTERN.test(huge)).toBe(true);
    expect(historyRecordSchema.safeParse({ ...record(), revision: huge }).success).toBe(true);
    expect(historyPageSchema.safeParse({ ...pages[2], revision: huge }).success).toBe(true);
    for (const value of ['', '01', '-1', '1.5', '1e3', ' 1', '1'.repeat(129)]) expect(HISTORY_REVISION_PATTERN.test(value), value).toBe(false);
    expect(compareHistoryRevisions('9007199254740993', '9007199254740992')).toBe(1);
    expect(compareHistoryRevisions('10', '9')).toBe(1);
    expect(compareHistoryRevisions('9', '10')).toBe(-1);
    expect(compareHistoryRevisions(huge, huge)).toBe(0);
    expect(HISTORY_SOURCE_ID_PATTERN.test('0123456789abcdef'.repeat(4))).toBe(true);
    expect(HISTORY_SOURCE_ID_PATTERN.test('0123456789ABCDEF'.repeat(4))).toBe(false);
  });

  it('validates the producer filters: optional exact map and source, canonical instants, from before until', () => {
    const parsed = historyFiltersSchema.parse({ sourceId: 'ab'.repeat(32), map: 'Synthetic Harbour', from: '2026-09-01T00:00:00Z', until: '2026-10-01T00:00:00.000Z' });
    expect(parsed).toEqual({ sourceId: 'ab'.repeat(32), map: 'Synthetic Harbour', from: '2026-09-01T00:00:00.000Z', until: '2026-10-01T00:00:00.000Z' });
    expect(historyFiltersSchema.safeParse({}).success).toBe(true);
    expect(historyFiltersSchema.safeParse({ from: '2026-10-01T00:00:00Z', until: '2026-09-01T00:00:00Z' }).success).toBe(false);
    expect(historyFiltersSchema.safeParse({ from: '2026-10-01T00:00:00Z', until: '2026-10-01T00:00:00Z' }).success).toBe(false);
    expect(historyFiltersSchema.safeParse({ from: 'yesterday' }).success).toBe(false);
    expect(historyFiltersSchema.safeParse({ map: '' }).success).toBe(false);
    expect(historyFiltersSchema.safeParse({ sourceId: 'short' }).success).toBe(false);
    expect(historyFiltersSchema.safeParse({ limit: '50' }).success).toBe(false);
    expect(historyFiltersSchema.safeParse({ minMinutes: 60 }).success).toBe(false);
  });
});
