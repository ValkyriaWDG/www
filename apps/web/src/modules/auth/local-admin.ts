import { randomUUID } from 'node:crypto';
import {
  auditEvent,
  authAccount,
  authSession,
  authTwoFactor,
  authUser,
  authVerification,
  LOCAL_GRANT_ROLES,
  localAdminGrant,
  type Database,
  type Executor,
  type LocalGrantRole,
} from '@valkyria/db';
import { hashPassword } from 'better-auth/crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { redactSummary } from '../audit/redact';

/**
 * Operator provisioning of local recovery administrators (used by
 * `src/cli/provision-local-admin.ts`). There is no web sign-up path: this module is the
 * only way to create a credential account. It deliberately avoids `server-only` imports
 * so the CLI runs under tsx as well as in the bundled image.
 */

export const MIN_PASSWORD_LENGTH = 16;
export const MAX_PASSWORD_LENGTH = 256;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;
const OPERATOR = /^[A-Za-z0-9._ -]{1,64}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

export class ProvisioningError extends Error {
  constructor(
    readonly code:
      | 'invalid_email'
      | 'invalid_name'
      | 'invalid_roles'
      | 'invalid_operator'
      | 'weak_password'
      | 'user_exists'
      | 'not_found'
      | 'not_local_account'
      | 'already_revoked'
      | 'invalid_expiry',
    message: string,
  ) {
    super(message);
    this.name = 'ProvisioningError';
  }
}

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!EMAIL.test(email) || email.endsWith('@accounts.invalid')) throw new ProvisioningError('invalid_email', 'A valid e-mail address is required.');
  return email;
}

/** The approved display label shown in UI/audit; never an e-mail address. */
export function validateLabel(value: string): string {
  const label = value.trim();
  if (label.length < 1 || label.length > 80 || CONTROL.test(label) || label.includes('@')) {
    throw new ProvisioningError('invalid_name', 'The display label must be 1–80 printable characters without "@".');
  }
  return label;
}

export function parseRoles(value: string): LocalGrantRole[] {
  const roles = [...new Set(value.split(',').map((role) => role.trim()).filter(Boolean))];
  if (roles.length === 0 || !roles.every((role) => (LOCAL_GRANT_ROLES as readonly string[]).includes(role))) {
    throw new ProvisioningError('invalid_roles', `Roles must be a comma-separated subset of: ${LOCAL_GRANT_ROLES.join(', ')}.`);
  }
  return roles as LocalGrantRole[];
}

export function validateOperator(value: string): string {
  const operator = value.trim();
  if (!OPERATOR.test(operator)) throw new ProvisioningError('invalid_operator', 'The operator label must be 1–64 characters [A-Za-z0-9._ -].');
  return operator;
}

/** Returns a reason when the password is not acceptable for a privileged recovery account. */
export function passwordProblem(password: string, context: { email?: string; name?: string } = {}): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password.length > MAX_PASSWORD_LENGTH) return `must be at most ${MAX_PASSWORD_LENGTH} characters`;
  if (new Set(password).size < 6) return 'must contain more distinct characters';
  if (/^\d+$/.test(password)) return 'must not consist of digits only';
  const lowered = password.toLowerCase();
  const localPart = context.email?.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && lowered.includes(localPart)) return 'must not contain the e-mail name';
  const name = context.name?.toLowerCase();
  if (name && name.length >= 4 && lowered.includes(name)) return 'must not contain the display label';
  return null;
}

function assertStrongPassword(password: string, context: { email?: string; name?: string }) {
  const problem = passwordProblem(password, context);
  if (problem) throw new ProvisioningError('weak_password', `The password ${problem}.`);
}

async function recordOperatorAudit(
  db: Executor,
  input: { operator: string; action: string; entityId: string; userId: string; summary: Record<string, unknown> },
) {
  await db.insert(auditEvent).values({
    actorUserId: null,
    actorKind: 'operator',
    actorLabel: `operator:${input.operator}`,
    capability: 'access.manage',
    action: input.action,
    entityType: 'local_admin_grant',
    entityId: input.entityId,
    outcome: 'success',
    summary: (redactSummary({ ...input.summary, subjectUserId: input.userId }) as Record<string, unknown>) ?? {},
  });
}

async function findLocalUserByEmail(db: Executor, email: string) {
  const [user] = await db.select().from(authUser).where(eq(authUser.email, normalizeEmail(email))).limit(1);
  if (!user) throw new ProvisioningError('not_found', 'No account with this e-mail exists.');
  const [credential] = await db
    .select({ id: authAccount.id })
    .from(authAccount)
    .where(and(eq(authAccount.userId, user.id), eq(authAccount.providerId, 'credential')))
    .limit(1);
  const [grant] = await db.select().from(localAdminGrant).where(eq(localAdminGrant.userId, user.id)).limit(1);
  if (!credential || !grant) throw new ProvisioningError('not_local_account', 'This account is not a provisioned local administrator.');
  return { user, credentialId: credential.id, grant };
}

async function revokeAllSessions(db: Executor, userId: string): Promise<number> {
  const deleted = await db.delete(authSession).where(eq(authSession.userId, userId)).returning({ id: authSession.id });
  // Pending two-factor challenges and trusted-device records reference the user ID.
  await db.delete(authVerification).where(eq(authVerification.value, userId));
  return deleted.length;
}

export type CreateLocalAdminInput = {
  email: string;
  name: string;
  roles: LocalGrantRole[];
  password: string;
  operator: string;
  expiresAt?: Date | null;
};

/** Creates user + credential account + grant (version 1) + audit event in one transaction. */
export async function createLocalAdmin(db: Database, input: CreateLocalAdminInput): Promise<{ userId: string; grantId: string }> {
  const email = normalizeEmail(input.email);
  const name = validateLabel(input.name);
  const operator = validateOperator(input.operator);
  if (input.roles.length === 0 || !input.roles.every((role) => (LOCAL_GRANT_ROLES as readonly string[]).includes(role))) {
    throw new ProvisioningError('invalid_roles', 'At least one valid role is required.');
  }
  if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) throw new ProvisioningError('invalid_expiry', 'The expiry must be in the future.');
  assertStrongPassword(input.password, { email, name });
  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: authUser.id }).from(authUser).where(eq(authUser.email, email)).limit(1);
    if (existing.length > 0) throw new ProvisioningError('user_exists', 'An account with this e-mail already exists.');
    const userId = randomUUID();
    const now = new Date();
    await tx.insert(authUser).values({ id: userId, name, email, emailVerified: false, twoFactorEnabled: false, createdAt: now, updatedAt: now });
    await tx.insert(authAccount).values({
      id: randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    });
    const [grant] = await tx
      .insert(localAdminGrant)
      .values({ userId, roles: [...new Set(input.roles)], version: 1, provisionedBy: operator, expiresAt: input.expiresAt ?? null })
      .returning({ id: localAdminGrant.id });
    await recordOperatorAudit(tx, {
      operator,
      action: 'access.local_grant_created',
      entityId: grant!.id,
      userId,
      summary: { roles: [...new Set(input.roles)], version: 1, expiresAt: input.expiresAt?.toISOString() ?? null },
    });
    return { userId, grantId: grant!.id };
  });
}

/** Revokes the grant (version + 1), ends every session of the account and audits it. */
export async function revokeLocalAdmin(db: Database, input: { email: string; operator: string }) {
  const operator = validateOperator(input.operator);
  return db.transaction(async (tx) => {
    const { user, grant } = await findLocalUserByEmail(tx, input.email);
    if (grant.revokedAt) throw new ProvisioningError('already_revoked', 'The grant is already revoked.');
    const now = new Date();
    const [updated] = await tx
      .update(localAdminGrant)
      .set({ revokedAt: now, version: sql`${localAdminGrant.version} + 1`, updatedAt: now })
      .where(eq(localAdminGrant.id, grant.id))
      .returning({ version: localAdminGrant.version });
    const sessionsRevoked = await revokeAllSessions(tx, user.id);
    await recordOperatorAudit(tx, {
      operator,
      action: 'access.local_grant_revoked',
      entityId: grant.id,
      userId: user.id,
      summary: { version: updated!.version, endedSignIns: sessionsRevoked },
    });
    return { grantId: grant.id, version: updated!.version, sessionsRevoked };
  });
}

/**
 * Operator password reset (e.g. lost credentials). Safer documented behaviour: the new
 * password replaces the hash, the second factor is removed so the owner must re-enroll
 * TOTP from a restricted setup session, every session and pending challenge is revoked,
 * and the grant version is incremented so delegated schedules require re-approval.
 */
export async function resetLocalAdminPassword(db: Database, input: { email: string; password: string; operator: string }) {
  const operator = validateOperator(input.operator);
  const email = normalizeEmail(input.email);
  const passwordHash = await (async () => {
    const [user] = await db.select({ name: authUser.name }).from(authUser).where(eq(authUser.email, email)).limit(1);
    assertStrongPassword(input.password, { email, name: user?.name });
    return hashPassword(input.password);
  })();
  return db.transaction(async (tx) => {
    const { user, credentialId, grant } = await findLocalUserByEmail(tx, email);
    const now = new Date();
    await tx.update(authAccount).set({ password: passwordHash, updatedAt: now }).where(eq(authAccount.id, credentialId));
    await tx.delete(authTwoFactor).where(eq(authTwoFactor.userId, user.id));
    await tx.update(authUser).set({ twoFactorEnabled: false, updatedAt: now }).where(eq(authUser.id, user.id));
    const [updated] = await tx
      .update(localAdminGrant)
      .set({ version: sql`${localAdminGrant.version} + 1`, updatedAt: now })
      .where(eq(localAdminGrant.id, grant.id))
      .returning({ version: localAdminGrant.version });
    const sessionsRevoked = await revokeAllSessions(tx, user.id);
    await recordOperatorAudit(tx, {
      operator,
      action: 'access.local_password_reset',
      entityId: grant.id,
      userId: user.id,
      summary: { version: updated!.version, endedSignIns: sessionsRevoked, secondFactorReset: true },
    });
    return { grantId: grant.id, version: updated!.version, sessionsRevoked };
  });
}

export type LocalAdminListing = {
  userId: string;
  label: string;
  email: string;
  roles: string[];
  grantVersion: number;
  status: 'active' | 'revoked' | 'expired';
  twoFactorEnabled: boolean;
  provisionedBy: string;
  createdAt: Date;
  expiresAt: Date | null;
};

/** Lists provisioned local administrators without any secret material. */
export async function listLocalAdmins(db: Executor): Promise<LocalAdminListing[]> {
  const rows = await db
    .select({
      userId: authUser.id,
      label: authUser.name,
      email: authUser.email,
      twoFactorEnabled: authUser.twoFactorEnabled,
      roles: localAdminGrant.roles,
      version: localAdminGrant.version,
      provisionedBy: localAdminGrant.provisionedBy,
      createdAt: localAdminGrant.createdAt,
      expiresAt: localAdminGrant.expiresAt,
      revokedAt: localAdminGrant.revokedAt,
    })
    .from(localAdminGrant)
    .innerJoin(authUser, eq(authUser.id, localAdminGrant.userId))
    .orderBy(asc(localAdminGrant.createdAt));
  const now = Date.now();
  return rows.map((row) => ({
    userId: row.userId,
    label: row.label,
    email: row.email,
    roles: [...row.roles],
    grantVersion: row.version,
    status: row.revokedAt ? 'revoked' : row.expiresAt && row.expiresAt.getTime() <= now ? 'expired' : 'active',
    twoFactorEnabled: row.twoFactorEnabled === true,
    provisionedBy: row.provisionedBy,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  }));
}
