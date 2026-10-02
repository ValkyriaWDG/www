import { authAccount, GAMES, localAdminGrant, LOCAL_GRANT_ROLES, type Executor, type Game, type LocalGrantRole } from '@valkyria/db';
import { eq } from 'drizzle-orm';

/** Better Auth provider ID of email/password (credential) accounts. */
export const CREDENTIAL_PROVIDER_ID = 'credential';
export const DISCORD_PROVIDER_ID = 'discord';

export type LocalGrant = {
  id: string;
  userId: string;
  roles: LocalGrantRole[];
  /** `null` = explicit platform-wide grant; otherwise only these games. */
  games: Game[] | null;
  version: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export type AccountSummary = {
  hasCredential: boolean;
  /** Provider IDs of every non-credential (social) account. */
  socialProviders: string[];
  discordAccountId: string | null;
  logiAccountId: string | null;
};

export async function findLocalGrant(db: Executor, userId: string): Promise<LocalGrant | null> {
  const [row] = await db.select().from(localAdminGrant).where(eq(localAdminGrant.userId, userId)).limit(1);
  return row ? toGrant(row) : null;
}

export async function findLocalGrantById(db: Executor, grantId: string): Promise<LocalGrant | null> {
  const [row] = await db.select().from(localAdminGrant).where(eq(localAdminGrant.id, grantId)).limit(1);
  return row ? toGrant(row) : null;
}

function toGrant(row: typeof localAdminGrant.$inferSelect): LocalGrant {
  const roles = row.roles.filter((role): role is LocalGrantRole => (LOCAL_GRANT_ROLES as readonly string[]).includes(role));
  // Unknown stored games are dropped; an emptied scoped list grants nothing (fail closed).
  const games = row.games === null ? null : row.games.filter((game): game is Game => (GAMES as readonly string[]).includes(game));
  return { id: row.id, userId: row.userId, roles, games, version: row.version, expiresAt: row.expiresAt, revokedAt: row.revokedAt };
}

/** A grant is usable only when neither revoked nor expired at `now`. */
export function isGrantActive(grant: LocalGrant, now: Date): boolean {
  if (grant.revokedAt) return false;
  if (grant.expiresAt && grant.expiresAt.getTime() <= now.getTime()) return false;
  return grant.roles.length > 0 && (grant.games === null || grant.games.length > 0);
}

export async function summarizeAccounts(db: Executor, userId: string): Promise<AccountSummary> {
  const rows = await db
    .select({ providerId: authAccount.providerId, accountId: authAccount.accountId })
    .from(authAccount)
    .where(eq(authAccount.userId, userId));
  const discord = rows.find((row) => row.providerId === DISCORD_PROVIDER_ID);
  return {
    hasCredential: rows.some((row) => row.providerId === CREDENTIAL_PROVIDER_ID),
    socialProviders: rows.filter((row) => row.providerId !== CREDENTIAL_PROVIDER_ID).map((row) => row.providerId),
    discordAccountId: discord?.accountId ?? null,
    logiAccountId: rows.find((row) => row.providerId === 'logi')?.accountId ?? null,
  };
}

/** True for provisioned local recovery accounts (credential account or any grant row). */
export async function isLocalAccountUser(db: Executor, userId: string): Promise<boolean> {
  const [accounts, grant] = await Promise.all([summarizeAccounts(db, userId), findLocalGrant(db, userId)]);
  return accounts.hasCredential || grant !== null;
}
