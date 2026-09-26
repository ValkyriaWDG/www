import { auditEvent, authAccount, authSession, authTwoFactor, authUser, localAdminGrant } from '@valkyria/db';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyIssuerAuthority } from '@/modules/access/issuer';
import { recordMembershipObservation } from '@/modules/access/membership';
import { can, denialCode } from '@/modules/access/policy';
import { resolveActor } from '@/modules/access/resolve-actor';
import type { Actor, Principal } from '@/modules/access/types';
import {
  createLocalAdmin,
  listLocalAdmins,
  type CreateLocalAdminInput,
  ProvisioningError,
  resetLocalAdminPassword,
  revokeLocalAdmin,
} from '@/modules/auth/local-admin';
import {
  CookieJar,
  createDiscordFetch,
  createHarness,
  GUILD_ID,
  insertDiscordUser,
  insertLocalAdmin,
  insertSession,
  ROLE,
  sessionCount,
  syntheticSnowflake,
  testAccessEnv,
  type Harness,
} from './auth-harness';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});

afterAll(async () => {
  await h.close();
});

const failingFetch = (async () => {
  throw new Error('Discord must not be contacted for local grants');
}) as typeof fetch;

function principal(actor: Actor): Principal {
  if (actor.kind !== 'principal') throw new Error(`expected principal, got ${actor.kind}`);
  return actor;
}

async function resolveLocal(userId: string, assurance: string, env = testAccessEnv()) {
  const [user] = await h.db.select().from(authUser).where(eq(authUser.id, userId));
  const session = await insertSession(h.db, userId, assurance);
  return principal(await resolveActor(h.db, { session, user: user!, intent: 'write', env, fetchImpl: failingFetch }));
}

describe('local administrator grants', () => {
  it('requires MFA assurance: a password-only session is mfa_required', async () => {
    const admin = await insertLocalAdmin(h.db, { twoFactorEnabled: true, roles: ['administrator'] });
    const actor = await resolveLocal(admin.userId, 'password');
    expect(actor).toMatchObject({ source: 'local_admin', status: 'mfa_required', roles: [] });
    expect(denialCode(actor, 'admin.access')).toBe('mfa_required');
  });

  it('grants the provisioned roles from an MFA session, independent of Discord', async () => {
    const admin = await insertLocalAdmin(h.db, { twoFactorEnabled: true, roles: ['editor'] });
    const actor = await resolveLocal(admin.userId, 'mfa');
    expect(actor).toMatchObject({ status: 'verified', roles: ['editor'], localGrant: { id: admin.grantId, version: 1 } });
    expect(can(actor, 'content.publish')).toBe(true);
    expect(can(actor, 'settings.manage')).toBe(false);
    expect(actor.label).toBe('Recovery Operator');
  });

  it('keeps an MFA session powerless when two-factor was disabled afterwards', async () => {
    const admin = await insertLocalAdmin(h.db, { twoFactorEnabled: false, roles: ['administrator'] });
    expect((await resolveLocal(admin.userId, 'mfa')).status).toBe('mfa_required');
  });

  it('denies revoked and expired grants', async () => {
    const revoked = await insertLocalAdmin(h.db, { twoFactorEnabled: true });
    await h.db.update(localAdminGrant).set({ revokedAt: new Date() }).where(eq(localAdminGrant.id, revoked.grantId));
    const revokedActor = await resolveLocal(revoked.userId, 'mfa');
    expect(revokedActor.capabilities.size).toBe(0);
    expect(denialCode(revokedActor, 'admin.access')).toBe('forbidden');

    const expired = await insertLocalAdmin(h.db, { twoFactorEnabled: true });
    await h.db.update(localAdminGrant).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(localAdminGrant.id, expired.grantId));
    expect(denialCode(await resolveLocal(expired.userId, 'mfa'), 'admin.access')).toBe('forbidden');
  });

  it('denies the grant when the local account has any social account (fail closed)', async () => {
    const admin = await insertLocalAdmin(h.db, { twoFactorEnabled: true });
    await h.db.insert(authAccount).values({ id: crypto.randomUUID(), accountId: syntheticSnowflake(), providerId: 'discord', userId: admin.userId });
    const viaMfa = await resolveLocal(admin.userId, 'mfa');
    expect(viaMfa.capabilities.size).toBe(0);
    const viaDiscord = await resolveLocal(admin.userId, 'discord');
    expect(viaDiscord.capabilities.size).toBe(0);
  });

  it('is unavailable while local administrator login is disabled', async () => {
    const admin = await insertLocalAdmin(h.db, { twoFactorEnabled: true });
    const actor = await resolveLocal(admin.userId, 'mfa', testAccessEnv({ LOCAL_ADMIN_LOGIN_ENABLED: false }));
    expect(actor.status).toBe('unavailable');
  });
});

describe('scheduled issuer verification', () => {
  it('authorizes an unchanged local grant during a Discord outage without a Discord snapshot', async () => {
    const admin = await insertLocalAdmin(h.db, { twoFactorEnabled: true, roles: ['editor'] });
    const verdict = await verifyIssuerAuthority(
      h.db,
      { issuerKind: 'local_admin', issuerUserId: admin.userId, grantId: admin.grantId, grantVersion: 1, capability: 'content.publish' },
      { fetchImpl: failingFetch, env: testAccessEnv({ DISCORD_API_BASE_URL: 'https://discord.invalid/api/v10' }) },
    );
    expect(verdict).toBe('authorized');
  });

  it('revokes delegated authority when the grant changes, is revoked or lacks the capability', async () => {
    const admin = await insertLocalAdmin(h.db, { twoFactorEnabled: true, roles: ['editor'] });
    const check = { issuerKind: 'local_admin' as const, issuerUserId: admin.userId, grantId: admin.grantId, grantVersion: 1, capability: 'content.publish' as const };
    expect(await verifyIssuerAuthority(h.db, { ...check, capability: 'matches.publish' }, { fetchImpl: failingFetch })).toBe('revoked');
    expect(await verifyIssuerAuthority(h.db, { ...check, grantId: null }, { fetchImpl: failingFetch })).toBe('revoked');

    await h.db.update(localAdminGrant).set({ version: 2 }).where(eq(localAdminGrant.id, admin.grantId));
    expect(await verifyIssuerAuthority(h.db, check, { fetchImpl: failingFetch })).toBe('revoked');
    expect(await verifyIssuerAuthority(h.db, { ...check, grantVersion: 2 }, { fetchImpl: failingFetch })).toBe('authorized');

    await h.db.update(localAdminGrant).set({ revokedAt: new Date() }).where(eq(localAdminGrant.id, admin.grantId));
    expect(await verifyIssuerAuthority(h.db, { ...check, grantVersion: 2 }, { fetchImpl: failingFetch })).toBe('revoked');
  });

  it('revokes a local issuer that gained a social account or whose grant belongs to someone else', async () => {
    const admin = await insertLocalAdmin(h.db, { twoFactorEnabled: true });
    const other = await insertLocalAdmin(h.db, { twoFactorEnabled: true });
    const check = { issuerKind: 'local_admin' as const, issuerUserId: admin.userId, grantId: other.grantId, grantVersion: 1, capability: 'content.publish' as const };
    expect(await verifyIssuerAuthority(h.db, check, { fetchImpl: failingFetch })).toBe('revoked');
    await h.db.insert(authAccount).values({ id: crypto.randomUUID(), accountId: syntheticSnowflake(), providerId: 'discord', userId: admin.userId });
    expect(await verifyIssuerAuthority(h.db, { ...check, grantId: admin.grantId }, { fetchImpl: failingFetch })).toBe('revoked');
  });

  it('re-verifies a Discord issuer against a fresh snapshot and the current mapping', async () => {
    const issuer = await insertDiscordUser(h.db);
    const check = { issuerKind: 'discord' as const, issuerUserId: issuer.userId, grantId: null, grantVersion: null, capability: 'content.publish' as const };
    const deps = { fetchImpl: createDiscordFetch(h.members, h.discordCalls), env: testAccessEnv() };
    const ageSnapshot = () =>
      h.db.execute(
        sql`update guild_membership set observed_at = now() - interval '2 minutes', received_at = now() - interval '2 minutes' where discord_user_id = ${issuer.discordUserId}`,
      );

    h.members.set(issuer.discordUserId, { status: 'present', roles: [ROLE.editor] });
    expect(await verifyIssuerAuthority(h.db, check, deps)).toBe('authorized');

    // Snapshot older than 60 s is refreshed: role removed → revoked.
    await ageSnapshot();
    h.members.set(issuer.discordUserId, { status: 'present', roles: [ROLE.member] });
    expect(await verifyIssuerAuthority(h.db, check, deps)).toBe('revoked');

    // Outage with a stale snapshot → unknown (never authorized).
    await ageSnapshot();
    h.members.set(issuer.discordUserId, { status: 'error', httpStatus: 503 });
    expect(await verifyIssuerAuthority(h.db, check, deps)).toBe('unknown');

    // Departure → revoked.
    h.members.set(issuer.discordUserId, { status: 'absent' });
    expect(await verifyIssuerAuthority(h.db, check, deps)).toBe('revoked');
  });

  it('uses a snapshot observed within 60 seconds without contacting Discord', async () => {
    const issuer = await insertDiscordUser(h.db);
    await recordMembershipObservation(h.db, {
      guildId: GUILD_ID,
      discordUserId: issuer.discordUserId,
      userId: issuer.userId,
      state: 'present',
      roleIds: [ROLE.matchManager],
      observedAt: new Date(Date.now() - 20_000),
      source: 'rest_refresh',
    });
    const verdict = await verifyIssuerAuthority(
      h.db,
      { issuerKind: 'discord', issuerUserId: issuer.userId, grantId: null, grantVersion: null, capability: 'matches.publish' },
      { fetchImpl: failingFetch, env: testAccessEnv() },
    );
    expect(verdict).toBe('authorized');
  });

  it('treats unknown issuers and unconfigured Discord correctly', async () => {
    expect(
      await verifyIssuerAuthority(h.db, { issuerKind: 'discord', issuerUserId: crypto.randomUUID(), grantId: null, grantVersion: null, capability: 'content.publish' }),
    ).toBe('revoked');
    const issuer = await insertDiscordUser(h.db);
    expect(
      await verifyIssuerAuthority(
        h.db,
        { issuerKind: 'discord', issuerUserId: issuer.userId, grantId: null, grantVersion: null, capability: 'content.publish' },
        { fetchImpl: failingFetch, env: testAccessEnv({ DISCORD_GUILD_ID: undefined }) },
      ),
    ).toBe('unknown');
  });
});

describe('operator provisioning (CLI core)', () => {
  const password = 'Operator-provisioned passphrase 2026!';

  it('creates a credential account with grant version 1 and an operator audit event without secrets', async () => {
    const email = `ops-${Date.now()}@example.test`;
    const result = await createLocalAdmin(h.db, { email, name: 'Recovery Admin', roles: ['administrator', 'owner'], password, operator: 'test-operator' });
    const [account] = await h.db.select().from(authAccount).where(eq(authAccount.userId, result.userId));
    expect(account).toMatchObject({ providerId: 'credential', accountId: result.userId });
    expect(account!.password).not.toContain(password);
    const [grant] = await h.db.select().from(localAdminGrant).where(eq(localAdminGrant.userId, result.userId));
    expect(grant).toMatchObject({ version: 1, provisionedBy: 'test-operator', roles: ['administrator', 'owner'] });
    const [audit] = await h.db.select().from(auditEvent).where(eq(auditEvent.entityId, result.grantId));
    expect(audit).toMatchObject({ action: 'access.local_grant_created', actorKind: 'operator', actorLabel: 'operator:test-operator' });
    expect(JSON.stringify(audit)).not.toContain(email);
    expect(JSON.stringify(audit)).not.toContain(password);

    // The provisioned account signs in through Better Auth (restricted until TOTP enrollment).
    const jar = new CookieJar();
    const signIn = await h.request('/sign-in/email', { body: { email, password }, cookies: jar, ip: '198.51.100.200' });
    expect(signIn.status).toBe(200);
    const listing = await listLocalAdmins(h.db);
    const row = listing.find((entry) => entry.userId === result.userId);
    expect(row).toMatchObject({ status: 'active', grantVersion: 1, twoFactorEnabled: false });
    expect(JSON.stringify(listing)).not.toMatch(/scrypt|\$|password/i);
  });

  it.each<[Partial<CreateLocalAdminInput>, string]>([
    [{ password: 'short-password' }, 'weak_password'],
    [{ password: '1111111111111111111' }, 'weak_password'],
    [{ name: 'someone@example.test' }, 'invalid_name'],
    [{ email: 'not-an-email' }, 'invalid_email'],
    [{ email: 'discord-1234567@accounts.invalid' }, 'invalid_email'],
    [{ roles: [] }, 'invalid_roles'],
  ])('rejects invalid provisioning input %j', async (override, code) => {
    await expect(
      createLocalAdmin(h.db, { email: `x-${crypto.randomUUID()}@example.test`, name: 'Label', roles: ['administrator'], password, operator: 'op', ...override }),
    ).rejects.toMatchObject({ code });
  });

  it('refuses a duplicate e-mail', async () => {
    const email = `dup-${Date.now()}@example.test`;
    await createLocalAdmin(h.db, { email, name: 'First', roles: ['editor'], password, operator: 'op' });
    await expect(createLocalAdmin(h.db, { email, name: 'Second', roles: ['editor'], password, operator: 'op' })).rejects.toBeInstanceOf(ProvisioningError);
  });

  it('revokes a grant: version+1, sessions ended, audited', async () => {
    const admin = await insertLocalAdmin(h.db, { twoFactorEnabled: true });
    await insertSession(h.db, admin.userId, 'mfa');
    const result = await revokeLocalAdmin(h.db, { email: admin.email, operator: 'op' });
    expect(result).toMatchObject({ version: 2, sessionsRevoked: 1 });
    expect(await sessionCount(h.db, admin.userId)).toBe(0);
    const [grant] = await h.db.select().from(localAdminGrant).where(eq(localAdminGrant.id, admin.grantId));
    expect(grant!.revokedAt).not.toBeNull();
    expect(
      await verifyIssuerAuthority(h.db, { issuerKind: 'local_admin', issuerUserId: admin.userId, grantId: admin.grantId, grantVersion: 1, capability: 'content.publish' }),
    ).toBe('revoked');
    await expect(revokeLocalAdmin(h.db, { email: admin.email, operator: 'op' })).rejects.toMatchObject({ code: 'already_revoked' });
  });

  it('resets a password: new credential works, second factor removed, sessions ended, version bumped', async () => {
    const admin = await insertLocalAdmin(h.db, { twoFactorEnabled: true });
    await h.db.insert(authTwoFactor).values({ id: crypto.randomUUID(), userId: admin.userId, secret: 'x', backupCodes: '[]', verified: true });
    await insertSession(h.db, admin.userId, 'mfa');
    const newPassword = 'A completely new recovery passphrase 77';
    const result = await resetLocalAdminPassword(h.db, { email: admin.email, password: newPassword, operator: 'op' });
    expect(result.version).toBe(2);
    expect(await sessionCount(h.db, admin.userId)).toBe(0);
    expect(await h.db.select().from(authTwoFactor).where(eq(authTwoFactor.userId, admin.userId))).toHaveLength(0);
    const [user] = await h.db.select().from(authUser).where(eq(authUser.id, admin.userId));
    expect(user!.twoFactorEnabled).toBe(false);

    const oldAttempt = await h.request('/sign-in/email', { body: { email: admin.email, password: admin.password }, ip: '198.51.100.201' });
    expect(oldAttempt.status).toBe(401);
    const jar = new CookieJar();
    const newAttempt = await h.request('/sign-in/email', { body: { email: admin.email, password: newPassword }, cookies: jar, ip: '198.51.100.202' });
    expect(newAttempt.status).toBe(200);
    // Without a second factor the new session is restricted.
    const sessions = await h.db.select().from(authSession).where(eq(authSession.userId, admin.userId));
    expect(sessions.map((session) => session.assurance)).toEqual(['password']);
  });

  it('refuses to manage non-local accounts', async () => {
    const discordUser = await insertDiscordUser(h.db);
    const [user] = await h.db.select().from(authUser).where(eq(authUser.id, discordUser.userId));
    await expect(revokeLocalAdmin(h.db, { email: user!.email, operator: 'op' })).rejects.toMatchObject({ code: 'invalid_email' });
  });
});
