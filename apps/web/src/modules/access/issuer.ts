import { authUser, guildMembership, localAdminGrant, type Executor } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { capabilitiesForRoles, type Capability } from './capabilities';
import { accessEnvFromProcess, discordClientConfig, isDiscordMembershipConfigured, WRITE_SNAPSHOT_MAX_AGE_MS, type AccessEnv } from './config';
import type { DiscordClientDeps } from './discord-client';
import { findLocalGrantById, isGrantActive, summarizeAccounts } from './local-grant';
import { readMembership, refreshMembership, snapshotAgeMs } from './membership';
import { loadRoleMapping, rolesForRoleIds } from './role-mapping';
import { isSnowflake } from './snowflake';

export type IssuerCheck = {
  issuerKind: 'discord' | 'local_admin';
  issuerUserId: string | null;
  /** Local-admin delegation identity/version recorded when the schedule was created. */
  grantId: string | null;
  grantVersion: number | null;
  capability: Capability;
};

/**
 * `authorized`: the issuer currently holds the capability (fresh Discord snapshot or the
 * unchanged, active local grant). `revoked`: authority is definitely gone/changed.
 * `unknown`: authority could not be verified (e.g. Discord unavailable). Callers treat
 * anything but `authorized` as blocked — never as permission.
 */
export type IssuerVerdict = 'authorized' | 'revoked' | 'unknown';

/** Server-only proof captured from the exact observation that granted authority. */
export type IssuerFence =
  | { kind: 'discord'; guildId: string; discordUserId: string; generation: bigint; observedAt: Date; roleIds: readonly string[] }
  | { kind: 'local_admin'; userId: string; grantId: string; grantVersion: number; capability: Capability };
export type IssuerAuthorization =
  | { verdict: 'authorized'; fence: IssuerFence }
  | { verdict: 'revoked' | 'unknown' };

export type IssuerDeps = {
  now?: () => Date;
  fetchImpl?: typeof fetch;
  /** Runtime configuration; defaults to the validated server environment. */
  env?: AccessEnv;
  /** Discord adapter tuning (sleep/timeouts) for tests. */
  discord?: Omit<DiscordClientDeps, 'fetchImpl' | 'now'>;
};

/**
 * Re-verifies a scheduled publication issuer's authority at execution time without any
 * stored/replayed session or MFA credential.
 * - `discord`: forces a Discord REST snapshot no older than 60 s and applies the current
 *   role mapping. Discord failure → `unknown`; departed/removed role/unknown user → `revoked`.
 * - `local_admin`: the recorded grant ID and version must be unchanged, active, still grant
 *   the capability, belong to an existing user without any linked social account.
 *   Discord availability is irrelevant and no Discord snapshot is fabricated.
 */
export async function authorizeIssuer(db: Executor, input: IssuerCheck, deps: IssuerDeps = {}): Promise<IssuerAuthorization> {
  const now = deps.now ?? (() => new Date());
  if (!input.issuerUserId) return { verdict: 'revoked' };
  const [user] = await db.select({ id: authUser.id }).from(authUser).where(eq(authUser.id, input.issuerUserId)).limit(1);
  if (!user) return { verdict: 'revoked' };
  const accounts = await summarizeAccounts(db, user.id);

  if (input.issuerKind === 'local_admin') {
    if (!input.grantId || input.grantVersion === null) return { verdict: 'revoked' };
    const grant = await findLocalGrantById(db, input.grantId);
    if (!grant || grant.userId !== user.id || grant.version !== input.grantVersion) return { verdict: 'revoked' };
    if (!isGrantActive(grant, now())) return { verdict: 'revoked' };
    if (!accounts.hasCredential || accounts.socialProviders.length > 0) return { verdict: 'revoked' };
    return capabilitiesForRoles(grant.roles).has(input.capability)
      ? { verdict: 'authorized', fence: { kind: 'local_admin', userId: user.id, grantId: grant.id, grantVersion: grant.version, capability: input.capability } }
      : { verdict: 'revoked' };
  }

  // Discord issuer: a local recovery account can never act as a Discord issuer.
  if (accounts.hasCredential) return { verdict: 'revoked' };
  const discordUserId = accounts.discordAccountId;
  if (!discordUserId || !isSnowflake(discordUserId)) return { verdict: 'revoked' };
  const env = deps.env ?? accessEnvFromProcess();
  if (!isDiscordMembershipConfigured(env) || !isSnowflake(env.DISCORD_GUILD_ID)) return { verdict: 'unknown' };

  let snapshot = await readMembership(db, env.DISCORD_GUILD_ID, discordUserId);
  if (!snapshot || snapshot.source === 'role_sync' || snapshotAgeMs(snapshot, now()) > WRITE_SNAPSHOT_MAX_AGE_MS) {
    const result = await refreshMembership(
      db,
      discordClientConfig(env),
      { discordUserId, userId: user.id, source: 'rest_refresh' },
      { ...deps.discord, fetchImpl: deps.fetchImpl, now },
    );
    if (!result.ok) return { verdict: 'unknown' };
    snapshot = result.snapshot;
    if (snapshotAgeMs(snapshot, now()) > WRITE_SNAPSHOT_MAX_AGE_MS) return { verdict: 'unknown' };
  }
  if (snapshot.source === 'role_sync' || snapshot.state !== 'present') return { verdict: 'revoked' };
  const mapping = loadRoleMapping(env.DISCORD_ROLE_MAPPING_JSON);
  if (!mapping.ok) return { verdict: 'unknown' };
  return capabilitiesForRoles(rolesForRoleIds(mapping.mapping, snapshot.roleIds)).has(input.capability)
    ? { verdict: 'authorized', fence: { kind: 'discord', guildId: env.DISCORD_GUILD_ID, discordUserId, generation: snapshot.authorizationGeneration, observedAt: snapshot.observedAt, roleIds: [...snapshot.roleIds] } }
    : { verdict: 'revoked' };
}

/** Compatibility verdict for callers that do not commit a later mutation. */
export async function verifyIssuerAuthority(db: Executor, input: IssuerCheck, deps: IssuerDeps = {}): Promise<IssuerVerdict> {
  return (await authorizeIssuer(db, input, deps)).verdict;
}

/**
 * Call inside the publication transaction after its content locks and before the
 * write. The shared row lock stays held until commit: an invalidation either won
 * first and blocks this publication, or waits until this publication commits.
 * No provider I/O or new grant is allowed while holding these locks.
 */
export async function revalidateIssuerFence(tx: Executor, fence: IssuerFence, now: () => Date): Promise<IssuerVerdict> {
  if (fence.kind === 'local_admin') {
    const [grant] = await tx.select().from(localAdminGrant).where(eq(localAdminGrant.id, fence.grantId)).for('share');
    if (!grant || grant.userId !== fence.userId || grant.version !== fence.grantVersion) return 'revoked';
    const accounts = await summarizeAccounts(tx, fence.userId);
    return isGrantActive(grant, now()) && accounts.hasCredential && accounts.socialProviders.length === 0 && capabilitiesForRoles(grant.roles).has(fence.capability) ? 'authorized' : 'revoked';
  }
  const [membership] = await tx.select().from(guildMembership)
    .where(and(eq(guildMembership.guildId, fence.guildId), eq(guildMembership.discordUserId, fence.discordUserId))).for('share');
  if (!membership || membership.authorizationGeneration !== fence.generation || membership.source === 'role_sync' || membership.state !== 'present') return 'revoked';
  // An independent REST refresh can alter roles without an event generation. Do
  // not reuse the earlier decision if that observation changed during lock waits.
  if (membership.observedAt.getTime() !== fence.observedAt.getTime() || JSON.stringify([...membership.roleIds].sort()) !== JSON.stringify([...fence.roleIds].sort())) return 'revoked';
  return snapshotAgeMs(membership, now()) <= WRITE_SNAPSHOT_MAX_AGE_MS ? 'authorized' : 'unknown';
}
