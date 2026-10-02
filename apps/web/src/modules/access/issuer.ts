import { authAccount, authUser, guildMembership, localAdminGrant, type Executor, type Game } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { scopesForGrants, type Capability, type RoleGrant } from './capabilities';
import { accessEnvFromProcess, discordClientConfig, isDiscordMembershipConfigured, WRITE_SNAPSHOT_MAX_AGE_MS, type AccessEnv } from './config';
import type { DiscordClientDeps } from './discord-client';
import { findLocalGrantById, isGrantActive, summarizeAccounts } from './local-grant';
import { membershipRowVersion, readMembership, refreshMembership, snapshotAgeMs } from './membership';
import { grantsForRoleIds, loadRoleMapping } from './role-mapping';
import { isSnowflake } from './snowflake';
import { loadLogiMembershipEvidence, logiEvidenceGrants, revalidateLogiMembership, type LogiMembershipEvidence } from './logi-membership';

export type IssuerCheck = {
  issuerKind: 'discord' | 'local_admin';
  issuerUserId: string | null;
  /** Local-admin delegation identity/version recorded when the schedule was created. */
  grantId: string | null;
  grantVersion: number | null;
  capability: Capability;
  /** Game of the resource at execution time (`null` = community): authority is game-scoped. */
  game: Game | null;
};

/** Role grants of a local admin grant (`games: null` = platform-wide). */
function localGrants(grant: { roles: readonly RoleGrant['role'][]; games: Game[] | null }): RoleGrant[] {
  return grant.roles.map((role) => ({ role, games: grant.games ?? 'all' }));
}

/** Whether role grants carry `capability` for a resource of `game` (community needs `all`). */
function grantsCover(grants: readonly RoleGrant[], capability: Capability, game: Game | null): boolean {
  const scope = scopesForGrants(grants).gameScopes.get(capability);
  if (!scope) return false;
  if (scope === 'all') return true;
  return game !== null && scope.has(game);
}

/**
 * `authorized`: the issuer currently holds the capability (fresh Discord snapshot or the
 * unchanged, active local grant). `revoked`: authority is definitely gone/changed.
 * `unknown`: authority could not be verified (e.g. Discord unavailable). Callers treat
 * anything but `authorized` as blocked — never as permission.
 */
export type IssuerVerdict = 'authorized' | 'revoked' | 'unknown';

/** Server-only proof captured from the exact observation that granted authority. */
export type IssuerFence =
  | { kind: 'logi'; evidence: LogiMembershipEvidence[]; game: Game | null; userId: string; providerId: string; subject: string }
  | { kind: 'discord'; guildId: string; discordUserId: string; rowVersion: string; game: Game | null }
  | { kind: 'local_admin'; userId: string; grantId: string; grantVersion: number; capability: Capability; game: Game | null };
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
 * - Either way the capability must cover the resource's current game (a scoped grant
 *   never covers another game or community content).
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
    return grantsCover(localGrants(grant), input.capability, input.game)
      ? { verdict: 'authorized', fence: { kind: 'local_admin', userId: user.id, grantId: grant.id, grantVersion: grant.version, capability: input.capability, game: input.game } }
      : { verdict: 'revoked' };
  }

  // Discord issuer: a local recovery account can never act as a Discord issuer.
  if (accounts.hasCredential) return { verdict: 'revoked' };
  const env = deps.env ?? accessEnvFromProcess();
  if (accounts.socialProviders.length !== 1 || (env.LOGI_SSO_ENABLED && !env.LOGI_DISCORD_FALLBACK_ENABLED && accounts.socialProviders[0] !== 'logi')) return { verdict: 'revoked' };
  const discordUserId = env.LOGI_MEMBERSHIP_SOURCE === 'logi' ? (accounts.logiAccountId ?? accounts.discordAccountId) : accounts.discordAccountId;
  if (!discordUserId || !isSnowflake(discordUserId)) return { verdict: 'revoked' };
  if (env.LOGI_MEMBERSHIP_SOURCE === 'logi') {
    const evidence = await loadLogiMembershipEvidence(db, { env, subject: discordUserId, maxAgeMs: WRITE_SNAPSHOT_MAX_AGE_MS, now, fetchImpl: deps.fetchImpl });
    if (!evidence) return { verdict: 'unknown' };
    const mapping = loadRoleMapping(env.DISCORD_ROLE_MAPPING_JSON);
    if (!mapping.ok) return { verdict: 'unknown' };
    return grantsCover(logiEvidenceGrants(mapping.mapping, evidence), input.capability, input.game)
      ? { verdict: 'authorized', fence: { kind: 'logi', evidence, game: input.game, userId: user.id, providerId: accounts.socialProviders[0]!, subject: discordUserId } }
      : { verdict: 'revoked' };
  }
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
  return grantsCover(grantsForRoleIds(mapping.mapping, snapshot.roleIds), input.capability, input.game)
    ? { verdict: 'authorized', fence: { kind: 'discord', guildId: env.DISCORD_GUILD_ID, discordUserId, rowVersion: snapshot.rowVersion, game: input.game } }
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
 * No provider I/O or new grant is allowed while holding these locks. The caller also
 * confirms that the locked resource still belongs to `fence.game`.
 */
export async function revalidateIssuerFence(tx: Executor, fence: IssuerFence, now: () => Date): Promise<IssuerVerdict> {
  if (fence.kind === 'logi') {
    // Bind scheduled authority to the still-existing website identity as well as roles.
    const accounts = await tx.select({ providerId: authAccount.providerId, subject: authAccount.accountId }).from(authAccount)
      .innerJoin(authUser, eq(authUser.id, authAccount.userId)).where(eq(authUser.id, fence.userId)).for('share');
    if (accounts.length !== 1 || accounts[0]!.providerId !== fence.providerId || accounts[0]!.subject !== fence.subject) return 'revoked';
    return await revalidateLogiMembership(tx, fence.evidence, WRITE_SNAPSHOT_MAX_AGE_MS, now) ? 'authorized' : 'revoked';
  }
  if (fence.kind === 'local_admin') {
    const [grant] = await tx.select().from(localAdminGrant).where(eq(localAdminGrant.id, fence.grantId)).for('share');
    if (!grant || grant.userId !== fence.userId || grant.version !== fence.grantVersion) return 'revoked';
    const accounts = await summarizeAccounts(tx, fence.userId);
    return isGrantActive(grant, now()) && accounts.hasCredential && accounts.socialProviders.length === 0 && grantsCover(localGrants(grant), fence.capability, fence.game) ? 'authorized' : 'revoked';
  }
  const [record] = await tx.select({ membership: guildMembership, rowVersion: membershipRowVersion }).from(guildMembership)
    .where(and(eq(guildMembership.guildId, fence.guildId), eq(guildMembership.discordUserId, fence.discordUserId))).for('share');
  if (!record || record.rowVersion !== fence.rowVersion) return 'revoked';
  const membership = record.membership;
  if (membership.source === 'role_sync' || membership.state !== 'present') return 'revoked';
  return snapshotAgeMs(membership, now()) <= WRITE_SNAPSHOT_MAX_AGE_MS ? 'authorized' : 'unknown';
}
