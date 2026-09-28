import { authSession, guildMembership, type AppRole, type Executor } from '@valkyria/db';
import { and, eq, gt } from 'drizzle-orm';
import { scopesForGrants, type Capability, type GameScope } from './capabilities';
import {
  discordClientConfig,
  isDiscordMembershipConfigured,
  MANUAL_REFRESH_MIN_INTERVAL_MS,
  READ_SNAPSHOT_MAX_AGE_MS,
  WRITE_SNAPSHOT_MAX_AGE_MS,
  type AccessEnv,
} from './config';
import type { DiscordClientDeps } from './discord-client';
import { findLocalGrant, isGrantActive, summarizeAccounts } from './local-grant';
import { membershipRowVersion, readMembership, refreshMembership, snapshotAgeMs, type MembershipSnapshot } from './membership';
import { ensureRoleMappingVersion, grantsForRoleIds, loadRoleMapping, rolesForRoleIds } from './role-mapping';
import { isSnowflake } from './snowflake';
import type { AccessIntent, Actor, AuthorizationStatus, Principal, SessionAssurance } from './types';

/** The minimal session/user shape resolved from Better Auth (never from browser input). */
export type ActorSession = { id: string; userId: string; assurance?: string | null; expiresAt: Date };
export type ActorUser = { id: string; name: string; twoFactorEnabled?: boolean | null };

export type ResolveActorInput = {
  session: ActorSession | null;
  user: ActorUser | null;
  intent: AccessIntent;
  env: AccessEnv;
  now?: Date;
  fetchImpl?: typeof fetch;
  /** Discord adapter tuning (sleep/timeouts/clock) for tests. */
  discord?: Omit<DiscordClientDeps, 'fetchImpl'>;
  /** User-requested refresh: bypass snapshot freshness (throttled per member). */
  forceRefresh?: boolean;
};

const ANONYMOUS: Actor = { kind: 'anonymous' };
const NO_CAPABILITIES: ReadonlySet<Capability> = new Set();
const NO_SCOPES: ReadonlyMap<Capability, GameScope> = new Map();
const ASSURANCES: readonly SessionAssurance[] = ['discord', 'password', 'mfa', 'unknown'];
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

export function normalizeAssurance(value: unknown): SessionAssurance {
  return typeof value === 'string' && (ASSURANCES as readonly string[]).includes(value) ? (value as SessionAssurance) : 'unknown';
}

/** Approved display label for UI/audit: trimmed, bounded, never an e-mail address. */
export function displayLabel(name: string | null | undefined, source: Principal['source']): string {
  const cleaned = (name ?? '').replace(CONTROL, '').trim().slice(0, 80);
  if (!cleaned || cleaned.includes('@')) return source === 'local_admin' ? 'Local administrator' : 'Discord user';
  return cleaned;
}

/**
 * Testable core of `getActor`: session → user → (Discord membership snapshot with
 * intent-dependent freshness and server-side refresh) or (local-admin grant usable only
 * from an MFA-assured credential session) → roles → capabilities. Everything that is
 * not explicitly verified resolves to a principal without capabilities.
 */
export async function resolveActor(db: Executor, input: ResolveActorInput): Promise<Actor> {
  const { session, user } = input;
  if (!session || !user || session.userId !== user.id) return ANONYMOUS;
  const now = input.now ?? new Date();
  if (session.expiresAt.getTime() <= now.getTime()) return ANONYMOUS;

  const [accounts, grant] = await Promise.all([summarizeAccounts(db, user.id), findLocalGrant(db, user.id)]);
  const assurance = normalizeAssurance(session.assurance);
  const base = { kind: 'principal' as const, userId: user.id, sessionId: session.id, assurance, intent: input.intent };

  if (accounts.hasCredential || grant) {
    const label = displayLabel(user.name, 'local_admin');
    const deny = (status: AuthorizationStatus): Principal => ({
      ...base,
      source: 'local_admin',
      label,
      status,
      roles: [],
      capabilities: NO_CAPABILITIES,
      gameScopes: NO_SCOPES,
      localGrant: null,
      verifiedAt: null,
    });
    if (!input.env.LOCAL_ADMIN_LOGIN_ENABLED) return deny('unavailable');
    // A recovery account must never be reachable through a social identity (fail closed).
    if (accounts.socialProviders.length > 0 || !accounts.hasCredential) return deny('verified');
    if (!grant || !isGrantActive(grant, now)) return deny('verified');
    if (assurance !== 'mfa' || user.twoFactorEnabled !== true) return deny('mfa_required');
    const roles: AppRole[] = [...grant.roles];
    const scoped = scopesForGrants(roles.map((role) => ({ role, games: grant.games ?? 'all' })));
    return {
      ...base,
      source: 'local_admin',
      label,
      status: 'verified',
      roles,
      capabilities: scoped.capabilities,
      gameScopes: scoped.gameScopes,
      localGrant: { id: grant.id, version: grant.version },
      verifiedAt: now,
    };
  }

  const label = displayLabel(user.name, 'discord');
  const deny = (status: AuthorizationStatus): Principal => ({
    ...base,
    source: 'discord',
    label,
    status,
    roles: [],
    capabilities: NO_CAPABILITIES,
    gameScopes: NO_SCOPES,
    localGrant: null,
    verifiedAt: null,
  });
  const discordUserId = accounts.discordAccountId;
  if (!discordUserId || !isSnowflake(discordUserId)) return deny('not_member');
  if (assurance !== 'discord') return deny('unavailable');
  if (!isDiscordMembershipConfigured(input.env) || !isSnowflake(input.env.DISCORD_GUILD_ID)) return deny('unavailable');
  const guildId = input.env.DISCORD_GUILD_ID;

  const maxAge = input.intent === 'write' ? WRITE_SNAPSHOT_MAX_AGE_MS : READ_SNAPSHOT_MAX_AGE_MS;
  let snapshot: MembershipSnapshot | null = await readMembership(db, guildId, discordUserId);
  const recentlyAttempted =
    snapshot?.lastRefreshAttemptAt != null && now.getTime() - snapshot.lastRefreshAttemptAt.getTime() < MANUAL_REFRESH_MIN_INTERVAL_MS;
  const forced = input.forceRefresh === true && !recentlyAttempted;
  const fresh = snapshot !== null && snapshot.source !== 'role_sync' && snapshotAgeMs(snapshot, now) <= maxAge;

  if (forced || !fresh) {
    const result = await refreshMembership(
      db,
      discordClientConfig(input.env),
      { discordUserId, userId: user.id, source: 'rest_refresh' },
      { ...input.discord, fetchImpl: input.fetchImpl, now: input.discord?.now ?? (input.now ? () => now : undefined) },
    );
    if (!result.ok) return deny(result.code === 'not_configured' || result.code === 'forbidden' ? 'unavailable' : 'stale');
    snapshot = result.snapshot;
    if (snapshotAgeMs(snapshot, now) > maxAge) return deny('stale');
  }
  if (!snapshot || snapshot.source === 'role_sync' || snapshot.state !== 'present') return deny('not_member');

  const mapping = loadRoleMapping(input.env.DISCORD_ROLE_MAPPING_JSON);
  await ensureRoleMappingVersion(db, mapping, guildId).catch((error: unknown) => {
    console.error(`[access] could not record role mapping version: ${error instanceof Error ? error.name : 'unknown'}`);
  });
  // Mapping persistence can await a database lock. Re-read the durable session and
  // membership together after that work so a changed row cannot return the
  // capabilities from the earlier cached observation. This is a final read
  // fence, not a session cache; subsequent requests always resolve again.
  const finalNow = input.now ?? new Date();
  const [current] = await db
    .select({ membership: guildMembership, rowVersion: membershipRowVersion, sessionExpiresAt: authSession.expiresAt })
    .from(guildMembership)
    .innerJoin(authSession, and(eq(authSession.id, session.id), eq(authSession.userId, user.id), eq(authSession.assurance, 'discord'), gt(authSession.expiresAt, finalNow)))
    .where(and(eq(guildMembership.guildId, guildId), eq(guildMembership.discordUserId, discordUserId)))
    .limit(1);
  if (!current || current.rowVersion !== snapshot.rowVersion) return deny('stale');
  if (current.membership.source === 'role_sync' || current.membership.state !== 'present') return deny('not_member');
  const resolvedAt = input.now ?? new Date();
  if (current.sessionExpiresAt <= resolvedAt || snapshotAgeMs(current.membership, resolvedAt) > maxAge) return deny('stale');
  const roles: AppRole[] = rolesForRoleIds(mapping.mapping, current.membership.roleIds);
  const scoped = scopesForGrants(grantsForRoleIds(mapping.mapping, current.membership.roleIds));
  return {
    ...base,
    source: 'discord',
    label,
    status: 'verified',
    roles,
    capabilities: scoped.capabilities,
    gameScopes: scoped.gameScopes,
    localGrant: null,
    verifiedAt: current.membership.observedAt,
  };
}
