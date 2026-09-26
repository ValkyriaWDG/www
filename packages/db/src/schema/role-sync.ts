import { sql } from 'drizzle-orm';
import { check, index, numeric, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { tz } from './common.ts';

/** One namespace survives signing-key rotation. Receipts contain no credential or raw body. */
export const discordRoleSyncReceipt = pgTable('discord_role_sync_receipt', {
  producer: text('producer').notNull(),
  eventId: uuid('event_id').notNull(),
  bodyDigest: text('body_digest').notNull(),
  outcome: text('outcome').$type<'applied' | 'stale'>().notNull(),
  receivedAt: tz('received_at').notNull(),
}, (t) => [primaryKey({ columns: [t.producer, t.eventId] }), index('discord_role_sync_receipt_age_idx').on(t.receivedAt), check('discord_role_sync_receipt_outcome_ck', sql`${t.outcome} in ('applied','stale')`)]);

export const discordRoleSyncNonce = pgTable('discord_role_sync_nonce', {
  producer: text('producer').notNull(),
  nonce: text('nonce').notNull(),
  expiresAt: tz('expires_at').notNull(),
}, (t) => [primaryKey({ columns: [t.producer, t.nonce] }), index('discord_role_sync_nonce_expiry_idx').on(t.expiresAt)]);

/** Persistent high-water mark independent of REST snapshots and receipt pruning. Never expire. */
export const discordRoleSyncMember = pgTable('discord_role_sync_member', {
  producer: text('producer').notNull(),
  guildId: text('guild_id').notNull(),
  discordUserId: text('discord_user_id').notNull(),
  sequence: numeric('sequence', { precision: 30, scale: 0 }).notNull(),
  observedAt: tz('observed_at').notNull(),
  state: text('state').$type<'present' | 'left'>().notNull(),
  roleIds: text('role_ids').array().notNull(),
}, (t) => [primaryKey({ columns: [t.producer, t.guildId, t.discordUserId] }), check('discord_role_sync_member_sequence_ck', sql`${t.sequence} > 0`), check('discord_role_sync_member_state_ck', sql`${t.state} in ('present','left')`)]);
