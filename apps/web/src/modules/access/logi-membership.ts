import { authSession, logiMembership, type Executor, type Game } from '@valkyria/db';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { configuredLogiSources, type ConfiguredLogiSource } from '@/modules/integrations/logi-config';
import { createLogiClient } from '@/modules/integrations/logi/client';
import type { LogiMembership } from '@/modules/integrations/logi/contracts';
import type { AccessEnv } from './config';
import { grantsFromLogiMembership } from './logi-grants';
import type { RoleMapping } from './role-mapping';

export const logiMembershipVersion = sql<string>`${logiMembership}.xmin::text || ':' || ${logiMembership}.ctid::text`;
export type LogiMembershipEvidence = typeof logiMembership.$inferSelect & { rowVersion: string; game: Game };

function stillFresh(row: Pick<LogiMembershipEvidence, 'observedAt' | 'receivedAt' | 'state'>, now: Date, maxAgeMs: number): boolean {
  if (row.state !== 'present' || !row.observedAt) return false;
  const observed = row.observedAt.getTime();
  return observed <= now.getTime() + 5_000 && now.getTime() - Math.min(observed, row.receivedAt.getTime()) <= maxAgeMs;
}

async function persist(db: Executor, source: ConfiguredLogiSource, value: LogiMembership, at: Date): Promise<LogiMembershipEvidence> {
  await db.insert(logiMembership).values({
    scopeKey: source.scopeKey, sourceInstanceId: source.sourceInstanceId, guildId: source.guildId, gameId: source.gameId,
    subject: value.discordUserId, revision: value.revision, epoch: value.epoch, state: value.state,
    roleIds: value.state === 'present' && value.completeness === 'verified_member' ? value.roleIds : [],
    observedAt: value.observedAt ? new Date(value.observedAt) : null, receivedAt: at,
  }).onConflictDoUpdate({
    target: [logiMembership.scopeKey, logiMembership.subject],
    set: { revision: sql`excluded.revision`, epoch: sql`excluded.epoch`, state: sql`excluded.state`, roleIds: sql`excluded.role_ids`, observedAt: sql`excluded.observed_at`, receivedAt: at, updatedAt: at },
    setWhere: sql`excluded.revision::numeric >= ${logiMembership.revision}::numeric and excluded.epoch::numeric >= ${logiMembership.epoch}::numeric`,
  });
  const [row] = await db.select({ data: logiMembership, rowVersion: logiMembershipVersion }).from(logiMembership)
    .where(and(eq(logiMembership.scopeKey, source.scopeKey), eq(logiMembership.subject, value.discordUserId))).limit(1);
  if (!row) throw new Error('Logi membership persistence unavailable.');
  return { ...row.data, rowVersion: row.rowVersion, game: source.gameId === 'wardogs' ? 'wardogs' : 'hell-let-loose' };
}

/** Every decision rechecks the service grant at Logi; an old cache never bypasses revocation. */
export async function loadLogiMembershipEvidence(db: Executor, input: { env: AccessEnv; subject: string; maxAgeMs: number; now?: () => Date; fetchImpl?: typeof fetch }): Promise<LogiMembershipEvidence[] | null> {
  const now = input.now ?? (() => new Date());
  try {
    const sources = configuredLogiSources(input.env, 'membership');
    if (sources.length === 0 || sources.some((source) => source.guildId !== (input.env.LOGI_GUILD_ID ?? input.env.DISCORD_GUILD_ID))) return null;
    const rows = await Promise.all(sources.map(async (source) => {
      const client = createLogiClient({ ...source, resources: ['membership-summaries'], timeoutMs: 4_000 }, { fetchImpl: input.fetchImpl, now: () => now().getTime() });
      const value = await client.membership(input.subject, input.maxAgeMs);
      return persist(db, source, value, now());
    }));
    return rows.every((row) => stillFresh(row, now(), input.maxAgeMs)) ? rows : null;
  } catch {
    return null;
  }
}

/** Re-read after provider awaits. A later departure/policy refresh must defeat earlier evidence. */
export async function revalidateLogiMembership(db: Executor, evidence: readonly LogiMembershipEvidence[], maxAgeMs: number, now: () => Date, session?: { id: string; userId: string; assurance: string }): Promise<boolean> {
  if (!evidence.length) return false;
  const ids = evidence.map((entry) => entry.id);
  const rows = session
    ? await db.select({ data: logiMembership, rowVersion: logiMembershipVersion, expiresAt: authSession.expiresAt }).from(logiMembership)
      .innerJoin(authSession, and(eq(authSession.id, session.id), eq(authSession.userId, session.userId), eq(authSession.assurance, session.assurance), gt(authSession.expiresAt, now())))
      .where(inArray(logiMembership.id, ids)).for('share')
    : await db.select({ data: logiMembership, rowVersion: logiMembershipVersion }).from(logiMembership).where(inArray(logiMembership.id, ids)).for('share');
  const at = now();
  return rows.length === evidence.length && rows.every((row) => row.rowVersion === evidence.find((entry) => entry.id === row.data.id)?.rowVersion
    && stillFresh(row.data, at, maxAgeMs) && (!('expiresAt' in row) || (row.expiresAt instanceof Date && row.expiresAt > at)));
}

export function logiEvidenceGrants(mapping: RoleMapping, evidence: readonly LogiMembershipEvidence[]) {
  return grantsFromLogiMembership(mapping, evidence.map((row) => ({ game: row.game, roleIds: row.roleIds })));
}
