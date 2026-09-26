import { authUser, type Executor } from '@valkyria/db';
import { eq } from 'drizzle-orm';
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
export async function verifyIssuerAuthority(db: Executor, input: IssuerCheck, deps: IssuerDeps = {}): Promise<IssuerVerdict> {
  const now = deps.now ?? (() => new Date());
  if (!input.issuerUserId) return 'revoked';
  const [user] = await db.select({ id: authUser.id }).from(authUser).where(eq(authUser.id, input.issuerUserId)).limit(1);
  if (!user) return 'revoked';
  const accounts = await summarizeAccounts(db, user.id);

  if (input.issuerKind === 'local_admin') {
    if (!input.grantId || input.grantVersion === null) return 'revoked';
    const grant = await findLocalGrantById(db, input.grantId);
    if (!grant || grant.userId !== user.id || grant.version !== input.grantVersion) return 'revoked';
    if (!isGrantActive(grant, now())) return 'revoked';
    if (!accounts.hasCredential || accounts.socialProviders.length > 0) return 'revoked';
    return capabilitiesForRoles(grant.roles).has(input.capability) ? 'authorized' : 'revoked';
  }

  // Discord issuer: a local recovery account can never act as a Discord issuer.
  if (accounts.hasCredential) return 'revoked';
  const discordUserId = accounts.discordAccountId;
  if (!discordUserId || !isSnowflake(discordUserId)) return 'revoked';
  const env = deps.env ?? accessEnvFromProcess();
  if (!isDiscordMembershipConfigured(env) || !isSnowflake(env.DISCORD_GUILD_ID)) return 'unknown';

  let snapshot = await readMembership(db, env.DISCORD_GUILD_ID, discordUserId);
  if (!snapshot || snapshotAgeMs(snapshot, now()) > WRITE_SNAPSHOT_MAX_AGE_MS) {
    const result = await refreshMembership(
      db,
      discordClientConfig(env),
      { discordUserId, userId: user.id, source: 'rest_refresh' },
      { ...deps.discord, fetchImpl: deps.fetchImpl, now },
    );
    if (!result.ok) return 'unknown';
    snapshot = result.snapshot;
    if (snapshotAgeMs(snapshot, now()) > WRITE_SNAPSHOT_MAX_AGE_MS) return 'unknown';
  }
  if (snapshot.state !== 'present') return 'revoked';
  const mapping = loadRoleMapping(env.DISCORD_ROLE_MAPPING_JSON);
  if (!mapping.ok) return 'unknown';
  return capabilitiesForRoles(rolesForRoleIds(mapping.mapping, snapshot.roleIds)).has(input.capability) ? 'authorized' : 'revoked';
}
