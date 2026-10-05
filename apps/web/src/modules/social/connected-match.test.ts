import { describe, expect, it } from 'vitest';
import type { PublicMatchDetail } from '@/modules/matches/types';
import type { PublicLogiEvent } from '@/modules/integrations/logi/mapping';
import { matchCard } from './model';

const match = {
  slug: 'synthetic-archive', game: 'hell-let-loose', opponentName: 'Synthetic opponent', startsAt: '2020-01-01T18:00:00Z', timeZone: 'Europe/Prague', status: 'completed',
  result: { scoreValkyria: 3, scoreOpponent: 2, outcome: 'win', verification: 'verified' }, rounds: [],
} as unknown as PublicMatchDetail;
const event: PublicLogiEvent = {
  ref: { source: 'logi', sourceInstanceId: 'synthetic', guildId: 'synthetic', game: 'hll', kind: 'match', externalId: 'synthetic-event' },
  kind: 'match', title: 'Synthetic', status: null, startsAt: null, endsAt: '2020-01-02T20:00:00Z', observedAt: '2020-01-02T20:01:00Z', sourceUpdatedAt: null, teams: [], archive: { slug: match.slug },
  result: { state: 'corrected', version: 2, reviewedAt: null, endedAt: null, participants: [{ id: 'a', label: 'Axis', score: 0 }, { id: 'b', label: 'Allies', score: null }], provenance: { kind: 'reviewed_result', origin: 'manual' } },
};

describe('linked match sharing follows the same result authority as the page', () => {
  it('keeps provider participant labels, zero and unknown distinct, and labels an end time', () => {
    const card = matchCard(match, 'en', event);
    expect(card).toMatchObject({ score: null, status: 'Corrected result', participantScores: [{ label: 'Axis', value: '0' }, { label: 'Allies', value: '—' }] });
    expect(card.detail).toContain('End time:');
    expect(card.detail).not.toContain('2020-01-01');
    expect(matchCard(match, 'cs', event).detail).toContain('Čas konce:');
  });

  it('never substitutes the old score for an unknown current result', () => {
    expect(matchCard(match, 'en', { ...event, result: { ...event.result, state: 'unknown', participants: [] } })).toMatchObject({ score: null, participantScores: [], status: 'Not available' });
  });

  it('keeps a bounded card for more than three labelled participants', () => {
    const card = matchCard(match, 'en', { ...event, result: { ...event.result, participants: Array.from({ length: 16 }, (_, index) => ({ id: String(index), label: `Synthetic participant ${index}`, score: index })) } });
    expect(card.participantScores).toHaveLength(3);
    expect(card.moreParticipants).toBe('+13 more participants in match details');
    expect(card.score).toBeNull();
  });

  it('requires the explicit same-game association and preserves the full original fallback', () => {
    for (const unlinked of [null, { ...event, archive: undefined }, { ...event, ref: { ...event.ref, game: 'wardogs' as const } }]) {
      expect(matchCard(match, 'en', unlinked)).toMatchObject({ score: '3 : 2', status: 'Completed · Verified result' });
      expect(matchCard(match, 'en', unlinked).participantScores).toBeUndefined();
    }
  });
});
