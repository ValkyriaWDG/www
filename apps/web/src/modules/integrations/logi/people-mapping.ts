import type { PlayerStatisticsSummary } from '../logi-people-types';
import { logiPlayerMetricsSchema, type LogiMemberReference, type LogiMemberSummary, type LogiPlayerMetrics, type LogiPlayerStatSummary } from './people-contracts';

export const PEOPLE_FRESH_MS = 5 * 60_000;
export const PEOPLE_STALE_MS = 15 * 60_000;
const FUTURE_SKEW_MS = 5_000;

export function isRecentPeopleInstant(value: string | null | undefined, now: Date, ageMs = PEOPLE_FRESH_MS): boolean {
  if (!value) return false;
  const at = Date.parse(value);
  return Number.isFinite(at) && at <= now.getTime() + FUTURE_SKEW_MS && now.getTime() - at <= ageMs;
}

/** A display name, Discord role or reused assignment alone never identifies a player. */
export function currentReferencedMember(members: ReadonlyMap<string, LogiMemberSummary>, reference: LogiMemberReference): LogiMemberSummary | null {
  if (reference.identityState !== 'resolved' || !reference.memberId || !reference.identityId) return null;
  const member = members.get(reference.memberId);
  return member?.identityState === 'resolved' && member.identityId === reference.identityId ? member : null;
}

/** Deduplicate the same connection/session; contradictory equally fresh facts are omitted. */
export function currentPlayerSessions(sessions: readonly LogiPlayerStatSummary[], now: Date): LogiPlayerStatSummary[] {
  const unique = new Map<string, LogiPlayerStatSummary | null>();
  const timestamps = new Map<string, number>();
  for (const session of sessions) {
    if (!isRecentPeopleInstant(session.attributionCheckedAt, now)
      || Date.parse(session.fetchedAt) > now.getTime() + FUTURE_SKEW_MS) continue;
    const key = JSON.stringify([session.guildId, session.gameId, session.connectionId, session.provider, session.externalSessionId]);
    const timestamp = Date.parse(session.fetchedAt);
    const previous = unique.get(key);
    const previousAt = timestamps.get(key);
    if (previousAt === undefined || timestamp > previousAt) {
      unique.set(key, session);
      timestamps.set(key, timestamp);
    } else if (timestamp === previousAt && (previous === null || previous?.sourceDigest !== session.sourceDigest)) {
      unique.set(key, null);
    }
  }
  return [...unique.values()].filter((session): session is LogiPlayerStatSummary => session !== null);
}

const maximumMetrics = new Set<keyof LogiPlayerMetrics>(['longestM', 'killStreak', 'deathStreak']);

/** Unsupported counters remain null; record distances and streaks use max, not sum. */
export function summarizePlayerSessions(sessions: readonly LogiPlayerStatSummary[], member: Pick<LogiMemberSummary, 'id' | 'identityId' | 'identityState'>): PlayerStatisticsSummary | null {
  if (member.identityState !== 'resolved' || !member.identityId) return null;
  const facts = sessions.flatMap((session) => {
    const player = session.players.find((row) => row.memberId === member.id && row.identityId === member.identityId);
    return player && Date.parse(player.verifiedAt) <= Date.parse(session.attributionCheckedAt) + FUTURE_SKEW_MS ? [{ session, player }] : [];
  });
  if (!facts.length) return null;
  const starts = facts.map(({ session }) => session.startedAt).filter((value): value is string => value !== null).sort();
  const ends = facts.map(({ session }) => session.endedAt).filter((value): value is string => value !== null).sort();
  const metrics = (Object.keys(logiPlayerMetricsSchema.shape) as (keyof LogiPlayerMetrics)[]).map((key) => {
    const values = facts.map(({ player }) => player.metrics[key]).filter((value): value is number => value !== null);
    const value = values.length ? maximumMetrics.has(key) ? Math.max(...values) : values.reduce((total, next) => total + next, 0) : null;
    return { key, value: value === null || !Number.isFinite(value) ? null : value, sessionsWithValue: values.length };
  });
  return { sessions: facts.length, completeSessions: facts.filter(({ session }) => session.complete).length, firstStartedAt: starts[0] ?? null, lastEndedAt: ends.at(-1) ?? null, metrics };
}
