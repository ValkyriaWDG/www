import { describe, expect, it } from 'vitest';
import leagueFixture from '../fixtures/league-v0.12-stale-http.json';
import warconFixture from '../fixtures/warcon-v0.11.json';
import { leagueReadEnvelopeSchema, leagueReadSchema, warconEnvelopeResponseSchema, warconEnvelopeSchema, warconFreshness, WARCON_CACHE_MS } from './contracts';

describe('closed League read contract (producer v0.12)', () => {
  it('accepts the recorded stale read and the snapshot-less cooldown read', () => {
    const stale = leagueReadSchema.parse(leagueFixture.stale);
    expect(stale.snapshot?.id).toBe('cmuqt8ep605e1lf018w2nlywu');
    expect(stale.snapshot?.results).toBeNull();
    expect(stale).toMatchObject({ stale: true, error: 'rate_limited', ageSeconds: 318 });
    expect(leagueReadSchema.parse(leagueFixture.cooldown)).toMatchObject({ snapshot: null, stale: true, error: 'rate_limited' });
    expect(leagueReadEnvelopeSchema.safeParse({ data: leagueFixture.stale }).success).toBe(true);
  });

  it('rejects unknown fields, a non-null result, a foreign parser version and extra envelope keys', () => {
    const snapshot = leagueFixture.stale.snapshot;
    expect(leagueReadSchema.safeParse({ ...leagueFixture.stale, snapshot: { ...snapshot, adminNote: 'private' } }).success).toBe(false);
    expect(leagueReadSchema.safeParse({ ...leagueFixture.stale, snapshot: { ...snapshot, results: { placements: [] } } }).success).toBe(false);
    expect(leagueReadSchema.safeParse({ ...leagueFixture.stale, snapshot: { ...snapshot, parserVersion: 'wardogs-league-html/2' } }).success).toBe(false);
    expect(leagueReadSchema.safeParse({ ...leagueFixture.stale, error: 'parser_crash' }).success).toBe(false);
    expect(leagueReadEnvelopeSchema.safeParse({ data: leagueFixture.stale, debug: {} }).success).toBe(false);
    expect(leagueReadEnvelopeSchema.safeParse({ error: { code: 'league_unavailable', message: 'x' } }).success).toBe(false);
  });
});

describe('closed Warcon contract (producer v0.11, live and matches views only)', () => {
  it('accepts the assembled live and matches envelopes', () => {
    const live = warconEnvelopeResponseSchema.parse(warconFixture.live).data;
    expect(live.result.view).toBe('live');
    if (live.result.view !== 'live') throw new Error('expected live');
    expect(live.result.data.status?.scores.map((row) => row.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    const matches = warconEnvelopeResponseSchema.parse(warconFixture.matches).data;
    if (matches.result.view !== 'matches') throw new Error('expected matches');
    expect(matches.result.data.matches.map((row) => row.endedAt === null)).toEqual([false, true]);
  });

  it('rejects other views, foreign providers/games, unknown keys and duplicate live players', () => {
    const envelope = warconFixture.live.data;
    const liveData = envelope.result.data;
    expect(warconEnvelopeSchema.safeParse({ ...envelope, result: { view: 'health', data: { ok: true } } }).success).toBe(false);
    expect(warconEnvelopeSchema.safeParse({ ...envelope, result: { view: 'players', data: {} } }).success).toBe(false);
    expect(warconEnvelopeSchema.safeParse({ ...envelope, provider: 'hll_crcon' }).success).toBe(false);
    expect(warconEnvelopeSchema.safeParse({ ...envelope, gameId: 'hell_let_loose' }).success).toBe(false);
    expect(warconEnvelopeSchema.safeParse({ ...envelope, apiToken: 'never' }).success).toBe(false);
    expect(warconEnvelopeSchema.safeParse({ ...envelope, result: { view: 'live', data: { ...liveData, error: '' } } }).success).toBe(false);
    expect(warconEnvelopeSchema.safeParse({ ...envelope, result: { view: 'live', data: { ...liveData, players: [liveData.players[0], liveData.players[0]] } } }).success).toBe(false);
    expect(warconEnvelopeSchema.safeParse({ ...envelope, result: { view: 'live', data: { ...liveData, freshness: 'current' } } }).success).toBe(false);
  });

  it('keeps the producer cache lifetimes and freshness thresholds', () => {
    expect(WARCON_CACHE_MS).toEqual({ live: 10_000, matches: 60_000 });
    const now = Date.parse('2026-10-02T12:00:00.000Z');
    expect(warconFreshness('2026-10-02T11:59:30.000Z', now)).toBe('fresh');
    expect(warconFreshness('2026-10-02T11:59:30.000Z', now, false)).toBe('stale');
    expect(warconFreshness('2026-10-02T11:59:10.000Z', now)).toBe('stale');
    expect(warconFreshness('2026-10-02T11:57:00.000Z', now)).toBe('unavailable');
    expect(warconFreshness('2026-10-02T12:00:01.000Z', now)).toBe('unavailable');
    expect(warconFreshness(null, now)).toBe('unavailable');
    expect(warconFreshness('not a date', now)).toBe('unavailable');
  });
});
