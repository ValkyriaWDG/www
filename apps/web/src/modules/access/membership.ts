import { guildMembership, type Executor, type MembershipSource, type MembershipState } from '@valkyria/db';
import { and, eq, sql } from 'drizzle-orm';
import { fetchGuildMember, type DiscordClientConfig, type DiscordClientDeps, type GuildMemberFailureCode } from './discord-client';
import { isSnowflake } from './snowflake';

export type MembershipSnapshot = {
  guildId: string;
  discordUserId: string;
  userId: string | null;
  state: MembershipState;
  roleIds: string[];
  observedAt: Date;
  receivedAt: Date;
  source: MembershipSource;
  sequence: number;
  authorizationGeneration: bigint;
  lastRefreshAttemptAt: Date | null;
  lastRefreshError: string | null;
};

export type MembershipObservation = {
  guildId: string;
  discordUserId: string;
  userId: string | null;
  state: MembershipState;
  roleIds: readonly string[];
  observedAt: Date;
  receivedAt?: Date;
  source: MembershipSource;
  /** Event ordering within equal observation times (REST refreshes use 0). */
  sequence?: number;
  /** Captured before REST I/O. A role event during the request invalidates this write. */
  expectedGeneration?: bigint;
};

/** Reads the snapshot for exactly the configured guild; other guilds are never consulted. */
export async function readMembership(db: Executor, guildId: string, discordUserId: string): Promise<MembershipSnapshot | null> {
  const [row] = await db
    .select()
    .from(guildMembership)
    .where(and(eq(guildMembership.guildId, guildId), eq(guildMembership.discordUserId, discordUserId)))
    .limit(1);
  if (!row) return null;
  return {
    guildId: row.guildId,
    discordUserId: row.discordUserId,
    userId: row.userId,
    state: row.state,
    roleIds: [...row.roleIds],
    observedAt: row.observedAt,
    receivedAt: row.receivedAt,
    source: row.source,
    sequence: row.sequence,
    authorizationGeneration: row.authorizationGeneration,
    lastRefreshAttemptAt: row.lastRefreshAttemptAt,
    lastRefreshError: row.lastRefreshError,
  };
}

/**
 * Upserts a REST observation or an internal invalidation (role-sync input cannot grant).
 * REST observations are ordered by time; a captured generation lets a newly started REST
 * request replace an invalidation independently of the bot clock/sequence. The HTTP
 * receiver has its own durable producer/member ordering and must use acceptEnvelope.
 * Returns whether the observation was applied.
 */
export async function recordMembershipObservation(db: Executor, observation: MembershipObservation): Promise<boolean> {
  if (!isSnowflake(observation.guildId) || !isSnowflake(observation.discordUserId)) return false;
  if (!observation.roleIds.every(isSnowflake)) return false;
  const receivedAt = observation.receivedAt ?? new Date();
  const sequence = observation.sequence ?? 0;
  // An event can invalidate authority, never supply a positive REST observation.
  const state = observation.source === 'role_sync' && observation.state === 'present' ? 'unknown' : observation.state;
  const roleIds = state === 'present' ? [...new Set(observation.roleIds)] : [];
  const generationFence = observation.expectedGeneration === undefined ? sql`true` : sql`${guildMembership.authorizationGeneration} = ${observation.expectedGeneration}`;
  const replacesInvalidation = observation.expectedGeneration === undefined ? sql`false` : sql`${guildMembership.source} = 'role_sync'`;
  const rows = await db
    .insert(guildMembership)
    .values({
      guildId: observation.guildId,
      discordUserId: observation.discordUserId,
      userId: observation.userId,
      state,
      roleIds,
      observedAt: observation.observedAt,
      receivedAt,
      source: observation.source,
      sequence,
      authorizationGeneration: observation.source === 'role_sync' ? 1n : 0n,
      lastRefreshAttemptAt: observation.source === 'role_sync' ? null : receivedAt,
      lastRefreshError: null,
      updatedAt: receivedAt,
    })
    .onConflictDoUpdate({
      target: [guildMembership.guildId, guildMembership.discordUserId],
      set: {
        userId: sql`coalesce(excluded.user_id, ${guildMembership.userId})`,
        state: sql`excluded.state`,
        roleIds: sql`excluded.role_ids`,
        observedAt: sql`excluded.observed_at`,
        receivedAt: sql`excluded.received_at`,
        source: sql`excluded.source`,
        sequence: sql`excluded.sequence`,
        authorizationGeneration: observation.source === 'role_sync' ? sql`${guildMembership.authorizationGeneration} + 1` : guildMembership.authorizationGeneration,
        lastRefreshAttemptAt: sql`coalesce(excluded.last_refresh_attempt_at, ${guildMembership.lastRefreshAttemptAt})`,
        lastRefreshError: sql`null`,
        updatedAt: sql`excluded.updated_at`,
      },
      setWhere: sql`${generationFence} and (${replacesInvalidation} or excluded.observed_at > ${guildMembership.observedAt}
        or (excluded.observed_at = ${guildMembership.observedAt} and excluded.sequence >= ${guildMembership.sequence}))`,
    })
    .returning({ id: guildMembership.id });
  return rows.length > 0;
}

/** Records a failed refresh attempt without changing the last authoritative observation. */
export async function recordRefreshFailure(
  db: Executor,
  guildId: string,
  discordUserId: string,
  code: GuildMemberFailureCode,
  at: Date,
): Promise<void> {
  await db
    .update(guildMembership)
    .set({ lastRefreshAttemptAt: at, lastRefreshError: code, updatedAt: at })
    .where(and(eq(guildMembership.guildId, guildId), eq(guildMembership.discordUserId, discordUserId)));
}

export type RefreshResult =
  | { ok: true; snapshot: MembershipSnapshot }
  | { ok: false; code: GuildMemberFailureCode | 'invalidated'; snapshot: MembershipSnapshot | null };

const inflightByDatabase = new WeakMap<Executor, Map<string, Promise<RefreshResult>>>();

/**
 * Fetches the member from Discord REST and stores the observation. Concurrent refreshes
 * for the same member share one request (per process). Failures leave the previous
 * snapshot untouched apart from the sanitized `lastRefreshError`.
 */
export function refreshMembership(
  db: Executor,
  config: DiscordClientConfig,
  input: { discordUserId: string; userId: string | null; source: Extract<MembershipSource, 'oauth_login' | 'rest_refresh'> },
  deps: DiscordClientDeps = {},
): Promise<RefreshResult> {
  const guildId = config.guildId ?? '';
  let inflight = inflightByDatabase.get(db);
  if (!inflight) { inflight = new Map(); inflightByDatabase.set(db, inflight); }
  const key = `${guildId}:${input.discordUserId}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  const task = (async (): Promise<RefreshResult> => {
    const now = deps.now ?? (() => new Date());
    // Establish a durable generation even for a first login before starting network I/O.
    if (isSnowflake(guildId) && isSnowflake(input.discordUserId)) {
      await db.insert(guildMembership).values({ guildId, discordUserId: input.discordUserId, userId: input.userId,
        state: 'unknown', roleIds: [], observedAt: new Date(0), source: 'rest_refresh' })
        .onConflictDoNothing({ target: [guildMembership.guildId, guildMembership.discordUserId] });
    }
    const before = await readMembership(db, guildId, input.discordUserId);
    const lookup = await fetchGuildMember(config, input.discordUserId, deps);
    if (lookup.kind === 'failure') {
      if (config.guildId && isSnowflake(config.guildId)) {
        await recordRefreshFailure(db, config.guildId, input.discordUserId, lookup.code, now());
        return { ok: false, code: lookup.code, snapshot: await readMembership(db, config.guildId, input.discordUserId) };
      }
      return { ok: false, code: lookup.code, snapshot: null };
    }
    const applied = await recordMembershipObservation(db, {
      guildId,
      discordUserId: input.discordUserId,
      userId: input.userId,
      state: lookup.kind === 'member' ? 'present' : 'left',
      roleIds: lookup.kind === 'member' ? lookup.roleIds : [],
      observedAt: lookup.observedAt,
      receivedAt: now(),
      source: input.source,
      sequence: 0,
      expectedGeneration: before?.authorizationGeneration ?? 0n,
    });
    const snapshot = await readMembership(db, guildId, input.discordUserId);
    if (!applied || snapshot?.authorizationGeneration !== before?.authorizationGeneration || snapshot?.source === 'role_sync') {
      return { ok: false, code: 'invalidated', snapshot };
    }
    if (!snapshot) return { ok: false, code: 'unavailable', snapshot: null };
    return { ok: true, snapshot };
  })().finally(() => inflight!.delete(key));
  inflight.set(key, task);
  return task;
}

/** Age of the authoritative observation, never negative (future timestamps count as received time). */
export function snapshotAgeMs(snapshot: MembershipSnapshot, now: Date): number {
  const reference = Math.min(snapshot.observedAt.getTime(), snapshot.receivedAt.getTime());
  return Math.max(0, now.getTime() - reference);
}
