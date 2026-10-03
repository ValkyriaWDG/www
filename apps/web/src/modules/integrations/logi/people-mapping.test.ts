import { describe, expect, it } from 'vitest';
import { logiMemberSummarySchema, logiPlayerStatSummarySchema } from './people-contracts';
import { currentPlayerSessions, currentReferencedMember, summarizePlayerSessions } from './people-mapping';
import fixture from './fixtures/v0.14-people.json';

const at = new Date('2026-10-03T10:01:00Z');
const member = logiMemberSummarySchema.parse(fixture.member);
const session = logiPlayerStatSummarySchema.parse(fixture.statistics);

describe('verified session statistics mapping', () => {
  it('sums counters, keeps unsupported metrics null and uses maximum for distances/streaks', () => {
    const first = structuredClone(session);
    first.players[0]!.metrics = { ...first.players[0]!.metrics, longestM: 120, killStreak: 4 };
    const second = structuredClone(first);
    second.id = 'other-session'; second.externalSessionId = 'other-round'; second.complete = false;
    second.players[0]!.metrics = { ...second.players[0]!.metrics, kills: 0, deaths: null, cashDelta: 75, longestM: 95, killStreak: 6 };
    const result = summarizePlayerSessions([first, second], member)!;
    expect(result).toMatchObject({ sessions: 2, completeSessions: 1 });
    const metrics = Object.fromEntries(result.metrics.map((metric) => [metric.key, metric]));
    expect(metrics.kills).toMatchObject({ value: 8, sessionsWithValue: 2 });
    expect(metrics.deaths).toMatchObject({ value: 3, sessionsWithValue: 1 });
    expect(metrics.combat).toMatchObject({ value: null, sessionsWithValue: 0 });
    expect(metrics.cashDelta?.value).toBe(-50);
    expect(metrics.longestM?.value).toBe(120);
    expect(metrics.killStreak?.value).toBe(6);
  });
  it('never joins a recycled assignment, changed identity, nickname or unresolved row', () => {
    expect(summarizePlayerSessions([session], { ...member, identityId: 'different-user' })).toBeNull();
    expect(summarizePlayerSessions([session], { ...member, identityState: 'unresolved' })).toBeNull();
    expect(currentReferencedMember(new Map([[member.id, member]]), { memberId: member.id, identityId: 'different-user', identityState: 'resolved' })).toBeNull();
  });
  it('requires independent recent attribution and omits conflicting or duplicate sessions', () => {
    expect(currentPlayerSessions([session], at)).toHaveLength(1);
    expect(currentPlayerSessions([session], new Date('2026-10-03T10:06:00Z'))).toEqual([]);
    expect(currentPlayerSessions([session, { ...session, id: 'duplicate' }], at)).toHaveLength(1);
    expect(currentPlayerSessions([session, { ...session, id: 'conflict', sourceDigest: 'b'.repeat(64) }], at)).toEqual([]);
    expect(currentPlayerSessions([session, { ...session, id: 'corrected', fetchedAt: '2026-10-03T10:00:03.000Z', sourceDigest: 'b'.repeat(64) }], at)).toMatchObject([{ id: 'corrected' }]);
  });
});
