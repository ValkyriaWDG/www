import { authAccount, authSession, discordRoleSyncMember, discordRoleSyncNonce, discordRoleSyncReceipt, guildMembership, type Database } from '@valkyria/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { ENVELOPE_WINDOW_MS, NONCE_RETENTION_MS, type VerifiedEnvelope } from './protocol';

export type ReceiptOutcome = 'APPLIED' | 'DUPLICATE_EVENT' | 'STALE_EVENT' | 'EVENT_CONFLICT' | 'REPLAYED_REQUEST' | 'EXPIRED_REQUEST';

/** All durable policy changes and receipts commit together; no network call occurs inside. */
export async function acceptEnvelope(db: Database, envelope: VerifiedEnvelope, now: () => Date): Promise<ReceiptOutcome> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local lock_timeout = '2s'`);
    await tx.execute(sql`set local statement_timeout = '5s'`);
    // One configured producer sends a bounded stream. This lock also serializes nonce/event
    // collisions across different member IDs and across signing keys/processes.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`discord-role-sync:${envelope.producer}`}, 0))`);
    const receivedAt = now();
    if (Math.abs(receivedAt.getTime() - envelope.timestamp) > ENVELOPE_WINDOW_MS) return 'EXPIRED_REQUEST';
    const { producer, event, digest, nonce } = envelope;
    const [seenNonce] = await tx.select().from(discordRoleSyncNonce).where(and(eq(discordRoleSyncNonce.producer, producer), eq(discordRoleSyncNonce.nonce, nonce))).limit(1);
    if (seenNonce) return 'REPLAYED_REQUEST';
    await tx.insert(discordRoleSyncNonce).values({ producer, nonce, expiresAt: new Date(receivedAt.getTime() + NONCE_RETENTION_MS) });
    const [receipt] = await tx.select().from(discordRoleSyncReceipt).where(and(eq(discordRoleSyncReceipt.producer, producer), eq(discordRoleSyncReceipt.eventId, event.eventId))).limit(1);
    if (receipt) return receipt.bodyDigest === digest ? 'DUPLICATE_EVENT' : 'EVENT_CONFLICT';

    const scope = and(eq(discordRoleSyncMember.producer, producer), eq(discordRoleSyncMember.guildId, event.guildId), eq(discordRoleSyncMember.discordUserId, event.userId));
    const [previous] = await tx.select().from(discordRoleSyncMember).where(scope).limit(1);
    const observedAt = new Date(event.observedAt);
    const stale = previous !== undefined && (BigInt(event.sequence) <= BigInt(previous.sequence) || observedAt < previous.observedAt);
    await tx.insert(discordRoleSyncReceipt).values({ producer, eventId: event.eventId, bodyDigest: digest, receivedAt, outcome: stale ? 'stale' : 'applied' });
    if (stale) {
      // A clock-regressed message cannot change state, but its higher sequence is still fenced.
      if (BigInt(event.sequence) > BigInt(previous.sequence)) await tx.update(discordRoleSyncMember).set({ sequence: event.sequence }).where(scope);
      return 'STALE_EVENT';
    }
    const membershipScope = and(eq(guildMembership.guildId, event.guildId), eq(guildMembership.discordUserId, event.userId));
    const [snapshot] = await tx.select().from(guildMembership).where(membershipScope).for('update');
    const [account] = await tx.select({ userId: authAccount.userId }).from(authAccount).where(and(eq(authAccount.providerId, 'discord'), eq(authAccount.accountId, event.userId))).limit(1);
    const removed = [...(snapshot?.roleIds ?? []), ...(previous?.roleIds ?? [])].some((role) => !event.roleIds.includes(role));
    await tx.insert(guildMembership).values({
      guildId: event.guildId, discordUserId: event.userId, userId: account?.userId ?? null,
      state: event.membershipState === 'left' ? 'left' : 'unknown', roleIds: [],
      source: 'role_sync', sequence: 0, authorizationGeneration: 1n, observedAt, receivedAt, updatedAt: receivedAt,
    }).onConflictDoUpdate({ target: [guildMembership.guildId, guildMembership.discordUserId], set: {
      state: event.membershipState === 'left' ? 'left' : 'unknown', roleIds: [], source: 'role_sync', sequence: 0,
      userId: account?.userId ?? null, observedAt, receivedAt, updatedAt: receivedAt,
      authorizationGeneration: sql`${guildMembership.authorizationGeneration} + 1`, lastRefreshError: null,
    } });
    await tx.insert(discordRoleSyncMember).values({ producer, guildId: event.guildId, discordUserId: event.userId, sequence: event.sequence, observedAt, state: event.membershipState, roleIds: event.roleIds })
      .onConflictDoUpdate({ target: [discordRoleSyncMember.producer, discordRoleSyncMember.guildId, discordRoleSyncMember.discordUserId], set: { sequence: event.sequence, observedAt, state: event.membershipState, roleIds: event.roleIds } });
    if (event.membershipState === 'left' || removed) {
      // Identity stays account-ID based. Never remove local password/MFA recovery sessions.
      const linkedUsers = tx.select({ userId: authAccount.userId }).from(authAccount)
        .where(and(eq(authAccount.providerId, 'discord'), eq(authAccount.accountId, event.userId)));
      await tx.delete(authSession).where(and(eq(authSession.assurance, 'discord'), inArray(authSession.userId, linkedUsers)));
    }
    return 'APPLIED';
  });
}
