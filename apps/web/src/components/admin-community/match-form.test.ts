import { describe, expect, it } from 'vitest';
import type { AdminMatch } from '@/modules/matches/types';
import { fieldErrorCode } from './errors';
import {
  allowedTransitions,
  buildCreateInput,
  buildResultInput,
  buildUpdatePatch,
  emptyFacts,
  factsEqual,
  factsFrom,
  mergeFacts,
  mergeFlat,
  parseCount,
  resolveSchedule,
  roundsInput,
  scheduleFrom,
  validateFacts,
  validateResult,
  validateRounds,
} from './match-form';

const baseMatch = {
  id: '00000000-0000-4000-8000-00000000b001',
  slug: '2026-11-05-synthetic-wolves',
  version: 3,
  game: 'wardogs',
  opponentName: 'Synthetic Wolves',
  opponentShortCode: 'SW',
  competitionType: 'league',
  competitionName: 'Synthetic League',
  startsAt: '2026-11-05T18:00:00.000Z',
  timeZone: 'Europe/Prague',
  originalStartsAt: null,
  status: 'scheduled',
  publication: 'draft',
  publishedAt: null,
  result: null,
  recap: { cs: 'none', en: 'none' },
  isFixture: false,
  updatedAt: '2026-09-26T10:00:00.000Z',
  opponentLogoAssetId: null,
  season: null,
  format: null,
  bestOf: 3,
  teamSize: null,
  eventUrl: null,
  vodLinks: [{ url: 'https://example.org/vod', label: 'VOD' }],
  coverAssetId: null,
  internalNotes: 'private',
  rounds: [],
  statistics: null,
  recapDetail: {} as AdminMatch['recapDetail'],
  createdAt: '2026-09-26T10:00:00.000Z',
} as AdminMatch;

describe('match form values', () => {
  it('round-trips an admin record into equal form values (vod keys ignored)', () => {
    const a = factsFrom(baseMatch);
    const b = factsFrom(baseMatch);
    expect(a.vodLinks[0]!.key).not.toBe(b.vodLinks[0]!.key);
    expect(factsEqual(a, b)).toBe(true);
    expect(a.bestOf).toBe('3');
    expect(a.competitionName).toBe('Synthetic League');
  });

  it('shows the stored instant as wall-clock time in its own zone', () => {
    expect(scheduleFrom(baseMatch)).toEqual({ date: '2026-11-05', time: '19:00', timeZone: 'Europe/Prague' });
    expect(scheduleFrom({ startsAt: '2026-07-01T17:30:00.000Z', timeZone: 'Europe/London' })).toEqual({ date: '2026-07-01', time: '18:30', timeZone: 'Europe/London' });
  });

  it('sends only changed facts on update', () => {
    const baseline = factsFrom(baseMatch);
    const edited = { ...baseline, opponentName: 'Synthetic Wolves II', bestOf: '' };
    expect(buildUpdatePatch(edited, baseline)).toEqual({ opponentName: 'Synthetic Wolves II', bestOf: null });
    expect(buildUpdatePatch(baseline, baseline)).toEqual({});
  });

  it('merges a newer server version without reverting fields the user did not touch', () => {
    const oldBase = factsFrom(baseMatch);
    const user = { ...oldBase, competitionName: 'Mine' };
    const fresh = { ...factsFrom(baseMatch), season: 'Theirs', competitionName: 'Theirs too' };
    const merged = mergeFacts(user, oldBase, fresh);
    expect(merged.season).toBe('Theirs');
    expect(merged.competitionName).toBe('Mine');
    expect(mergeFlat({ a: '1', b: 'x' }, { a: '1', b: '2' }, { a: '9', b: '3' })).toEqual({ a: '9', b: 'x' });
  });

  it('builds a create payload with an explicit zone and drops blank VOD rows', () => {
    const facts = { ...emptyFacts(), opponentName: '  Synthetic Ravens ', vodLinks: [{ key: 'a', label: '', url: '' }] };
    const payload = buildCreateInput(facts, { date: '2026-11-05', time: '19:00', timeZone: 'Europe/Prague' }, '2026-11-05T19:00');
    expect(payload).toMatchObject({
      opponentName: 'Synthetic Ravens',
      vodLinks: [],
      startsAt: { localDateTime: '2026-11-05T19:00', timeZone: 'Europe/Prague' },
      timeZone: 'Europe/Prague',
    });
    expect(payload).not.toHaveProperty('slug');
  });
});

describe('client-side checks mirror the server rules', () => {
  it('rejects DST-gap wall-clock times and missing values', () => {
    expect(resolveSchedule({ date: '2026-03-29', time: '02:30', timeZone: 'Europe/Prague' })).toEqual({ ok: false, code: 'nonexistent_local_time' });
    expect(resolveSchedule({ date: '', time: '19:00', timeZone: 'Europe/Prague' })).toEqual({ ok: false, code: 'required' });
    expect(resolveSchedule({ date: '2026-11-05', time: '19:00', timeZone: 'Mars/Base' })).toEqual({ ok: false, code: 'invalid_time_zone' });
    const ok = resolveSchedule({ date: '2026-10-25', time: '02:30', timeZone: 'Europe/Prague' });
    expect(ok.ok && ok.instant.toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });

  it('validates required names, counts and partial VOD rows', () => {
    expect(validateFacts({ ...emptyFacts(), bestOf: 'x', teamSize: '0', vodLinks: [{ key: 'a', label: 'VOD', url: '' }] })).toEqual({
      opponentName: 'required',
      bestOf: 'invalid_number',
      teamSize: 'invalid_number',
      'vodLinks.0.url': 'required',
    });
  });

  it('keeps unknown scores null and requires both-or-neither', () => {
    expect(parseCount('')).toBeNull();
    expect(Number.isNaN(parseCount('1.5'))).toBe(true);
    expect(validateResult({ scoreValkyria: '3', scoreOpponent: '', outcome: '', verification: 'provisional', source: '' })).toEqual({ scoreOpponent: 'scores_both_or_neither' });
    expect(validateResult({ scoreValkyria: '3', scoreOpponent: '1', outcome: 'loss', verification: 'verified', source: '' })).toEqual({ outcome: 'outcome_inconsistent' });
    expect(validateResult({ scoreValkyria: '', scoreOpponent: '', outcome: '', verification: 'verified', source: '' })).toEqual({ verification: 'verified_requires_result' });
    expect(buildResultInput({ scoreValkyria: '', scoreOpponent: '', outcome: '', verification: 'provisional', source: ' ' })).toEqual({
      scoreValkyria: null,
      scoreOpponent: null,
      outcome: 'unknown',
      verification: 'provisional',
      source: '',
    });
    expect(buildResultInput({ scoreValkyria: '3', scoreOpponent: '1', outcome: '', verification: 'verified', source: 'League' })).toEqual({
      scoreValkyria: 3,
      scoreOpponent: 1,
      verification: 'verified',
      source: 'League',
    });
  });

  it('checks round scores and converts rounds to nullable inputs', () => {
    const rounds = [{ key: 'r1', mapName: ' Map A ', mode: '', side: '', scoreValkyria: '2', scoreOpponent: '0', outcome: 'loss' as const }];
    expect(validateRounds(rounds)).toEqual({ 'rounds.0.outcome': 'outcome_inconsistent' });
    expect(roundsInput(rounds)).toEqual([{ mapName: 'Map A', mode: null, side: null, scoreValkyria: 2, scoreOpponent: 0, outcome: 'loss' }]);
  });

  it('offers transitions per status like the service', () => {
    expect(allowedTransitions('scheduled')).toEqual({ postpone: true, reschedule: true, cancel: true, live: true, result: true });
    expect(allowedTransitions('completed')).toEqual({ postpone: false, reschedule: false, cancel: false, live: false, result: true });
    expect(allowedTransitions('cancelled').result).toBe(false);
  });

  it('maps unknown or raw validator messages to a generic localized code', () => {
    expect(fieldErrorCode('scores_both_or_neither')).toBe('scores_both_or_neither');
    expect(fieldErrorCode('content.0: node type is missing')).toBe('invalid');
    expect(fieldErrorCode(undefined)).toBeNull();
  });
});
