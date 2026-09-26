import { describe, expect, it } from 'vitest';
import { createMatchSchema, recordResultSchema, roundsInputSchema, updateMatchSchema } from './schemas';

const target = { id: '6f1a2b3c-4d5e-4f60-8a1b-2c3d4e5f6a7b', expectedVersion: 1 };

function issues(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? [] : result.error!.issues.map((issue) => issue.message);
}

describe('result input validation', () => {
  it('derives the outcome from known scores and keeps unknown scores null', () => {
    const known = recordResultSchema.parse({ ...target, scoreValkyria: 2, scoreOpponent: 3, verification: 'verified' });
    expect(known.outcome).toBe('loss');
    const unknown = recordResultSchema.parse({ ...target, scoreValkyria: null, scoreOpponent: null, verification: 'provisional' });
    expect(unknown).toMatchObject({ scoreValkyria: null, scoreOpponent: null, outcome: 'unknown' });
  });

  it('rejects half-known scores, inconsistent outcomes and unsupported verified results', () => {
    expect(issues(recordResultSchema.safeParse({ ...target, scoreValkyria: 1, scoreOpponent: null, verification: 'provisional' }))).toContain(
      'scores_both_or_neither',
    );
    expect(issues(recordResultSchema.safeParse({ ...target, scoreValkyria: 1, scoreOpponent: 0, outcome: 'loss', verification: 'provisional' }))).toContain(
      'outcome_inconsistent',
    );
    expect(issues(recordResultSchema.safeParse({ ...target, scoreValkyria: null, scoreOpponent: null, verification: 'verified' }))).toContain(
      'verified_requires_result',
    );
    // A verified forfeit without scores is allowed with an explicit outcome.
    expect(recordResultSchema.safeParse({ ...target, scoreValkyria: null, scoreOpponent: null, outcome: 'win', verification: 'verified' }).success).toBe(true);
    expect(recordResultSchema.safeParse({ ...target, scoreValkyria: -1, scoreOpponent: 0, verification: 'provisional' }).success).toBe(false);
  });

  it('validates rounds generically without game-specific scoring', () => {
    const rounds = roundsInputSchema.parse([{ mapName: 'Map A', scoreValkyria: 5, scoreOpponent: 0 }, { mode: 'Mode B' }]);
    expect(rounds.map((round) => round.ordinal)).toEqual([1, 2]);
    expect(rounds[1]).toMatchObject({ scoreValkyria: null, scoreOpponent: null, outcome: null });
    expect(roundsInputSchema.safeParse([{ ordinal: 1 }, { ordinal: 1 }]).success).toBe(false);
    expect(roundsInputSchema.safeParse([{ scoreValkyria: 0, scoreOpponent: 1, outcome: 'win' }]).success).toBe(false);
  });
});

describe('match fact validation', () => {
  const base = { game: 'wardogs', opponentName: 'Synthetic Opponent', competitionType: 'friendly', startsAt: '2026-10-10T17:00:00Z' };

  it('accepts HTTPS links only and at most five labelled VOD links', () => {
    expect(createMatchSchema.safeParse({ ...base, eventUrl: 'https://example.org/event' }).success).toBe(true);
    expect(createMatchSchema.safeParse({ ...base, eventUrl: 'http://example.org/event' }).success).toBe(false);
    expect(createMatchSchema.safeParse({ ...base, eventUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(createMatchSchema.safeParse({ ...base, eventUrl: 'https://user:pw@example.org/' }).success).toBe(false);
    const link = { url: 'https://example.org/vod', label: 'VOD' };
    expect(createMatchSchema.safeParse({ ...base, vodLinks: Array(5).fill(link) }).success).toBe(true);
    expect(createMatchSchema.safeParse({ ...base, vodLinks: Array(6).fill(link) }).success).toBe(false);
    expect(createMatchSchema.safeParse({ ...base, vodLinks: [{ url: 'https://example.org/vod', label: '' }] }).success).toBe(false);
  });

  it('rejects unknown enums, blank opponents and invalid slugs', () => {
    expect(createMatchSchema.safeParse({ ...base, game: 'hll-vietnam' }).success).toBe(false);
    expect(createMatchSchema.safeParse({ ...base, opponentName: '   ' }).success).toBe(false);
    expect(createMatchSchema.safeParse({ ...base, slug: 'Not A Slug' }).success).toBe(false);
    expect(createMatchSchema.safeParse({ ...base, startsAt: '2026-10-10T17:00' }).success).toBe(false);
    expect(createMatchSchema.safeParse({ ...base, startsAt: { localDateTime: '2026-10-10T19:00', timeZone: 'Europe/Prague' } }).success).toBe(true);
  });

  it('treats omitted update fields as unchanged and empty text as cleared', () => {
    const parsed = updateMatchSchema.parse({ ...target, competitionName: '', eventUrl: '' });
    expect(parsed.competitionName).toBeNull();
    expect(parsed.eventUrl).toBeNull();
    expect(parsed.opponentName).toBeUndefined();
    expect(parsed.season).toBeUndefined();
  });
});
