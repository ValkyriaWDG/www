import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, tz, updatedAt } from './common.ts';
import { authUser } from './auth.ts';
import { memberProfile } from './community.ts';

/** Separate from Discord REST snapshots: an allowlisted game projection is not a guild-wide role list. */
export const logiMembership = pgTable('logi_membership', {
  id: uuid('id').primaryKey().defaultRandom(),
  scopeKey: text('scope_key').notNull(),
  sourceInstanceId: text('source_instance_id').notNull(),
  guildId: text('guild_id').notNull(),
  gameId: text('game_id').notNull(),
  subject: text('subject').notNull(),
  revision: text('revision').notNull(),
  epoch: text('epoch').notNull(),
  state: text('state').notNull(),
  roleIds: text('role_ids').array().notNull(),
  observedAt: tz('observed_at'),
  receivedAt: tz('received_at').notNull(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('logi_membership_scope_subject_uq').on(t.scopeKey, t.subject),
  index('logi_membership_subject_idx').on(t.subject),
  check('logi_membership_revision_ck', sql`${t.revision} ~ '^(0|[1-9][0-9]{0,127})$'`),
  check('logi_membership_epoch_ck', sql`${t.epoch} ~ '^(0|[1-9][0-9]{0,127})$'`),
  check('logi_membership_state_ck', sql`${t.state} in ('present', 'left', 'unknown')`),
]);

/** A lease and checkpoint are committed in the same transaction as each projection page. */
export const logiSyncScope = pgTable('logi_sync_scope', {
  scopeKey: text('scope_key').primaryKey(),
  sourceInstanceId: text('source_instance_id').notNull(),
  guildId: text('guild_id').notNull(),
  gameId: text('game_id').notNull(),
  checkpoint: jsonb('checkpoint').$type<Record<string, unknown> | null>(),
  version: integer('version').notNull().default(0),
  activeGeneration: text('active_generation'),
  leaseToken: text('lease_token'),
  leaseExpiresAt: tz('lease_expires_at'),
  lastSuccessAt: tz('last_success_at'),
  lastAttemptAt: tz('last_attempt_at'),
  nextAttemptAt: tz('next_attempt_at'),
  errorCode: text('error_code'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Only validated safe resource DTOs, never raw provider records or membership. */
export const logiProjection = pgTable('logi_projection', {
  scopeKey: text('scope_key').notNull().references(() => logiSyncScope.scopeKey, { onDelete: 'cascade' }),
  generation: text('generation').notNull(),
  resource: text('resource').notNull(),
  externalId: text('external_id').notNull(),
  revision: text('revision').notNull(),
  operation: text('operation').notNull(),
  data: jsonb('data').$type<Record<string, unknown> | null>(),
  observedAt: tz('observed_at').notNull(),
}, (t) => [
  primaryKey({ columns: [t.scopeKey, t.generation, t.resource, t.externalId] }),
  check('logi_projection_revision_ck', sql`${t.revision} ~ '^(0|[1-9][0-9]{0,127})$'`),
  check('logi_projection_operation_ck', sql`${t.operation} in ('upsert', 'remove')`),
  check('logi_projection_data_ck', sql`(${t.operation} = 'upsert' and ${t.data} is not null) or (${t.operation} = 'remove' and ${t.data} is null)`),
]);

/** Webhook bodies are invalidation hints; no payload is copied into public records. */
export const logiInbox = pgTable('logi_inbox', {
  sourceInstanceId: text('source_instance_id').notNull(),
  guildId: text('guild_id').notNull(),
  deliveryId: text('delivery_id').notNull(),
  receivedAt: tz('received_at').notNull(),
  eventType: text('event_type').notNull(),
  bodyHash: text('body_hash').notNull(),
  processedAt: tz('processed_at'),
}, (t) => [primaryKey({ columns: [t.sourceInstanceId, t.guildId, t.deliveryId] }), index('logi_inbox_pending_idx').on(t.sourceInstanceId, t.guildId, t.receivedAt).where(sql`${t.processedAt} is null`)]);

/** Durable request/receipt journal. Credentials and actor bearer tokens never enter it. */
export const logiCommand = pgTable('logi_command', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  scopeKey: text('scope_key').notNull(),
  sourceInstanceId: text('source_instance_id').notNull(),
  guildId: text('guild_id').notNull(),
  gameId: text('game_id').notNull(),
  bodyHash: text('body_hash').notNull(),
  body: jsonb('body').$type<Record<string, unknown>>().notNull(),
  state: text('state').notNull().default('pending'),
  receipt: jsonb('receipt').$type<Record<string, unknown> | null>(),
  nextAttemptAt: tz('next_attempt_at'),
  errorCode: text('error_code'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index('logi_command_user_idx').on(t.userId, t.createdAt),
  check('logi_command_state_ck', sql`${t.state} in ('pending', 'confirmed', 'rejected')`),
]);

/** Explicit publication association; it never grants membership or login authority. */
export const logiMemberLink = pgTable('logi_member_link', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id').notNull().references(() => memberProfile.id, { onDelete: 'cascade' }),
  scopeKey: text('scope_key').notNull(),
  sourceInstanceId: text('source_instance_id').notNull(),
  guildId: text('guild_id').notNull(),
  gameId: text('game_id').notNull(),
  memberId: text('member_id').notNull(),
  // Bind the immutable source user record as well as its assignment. Reassignment is not the same person.
  identityId: text('identity_id').notNull(),
  allowStats: boolean('allow_stats').notNull().default(false),
  allowRoster: boolean('allow_roster').notNull().default(false),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('logi_member_link_source_member_uq').on(t.sourceInstanceId, t.guildId, t.gameId, t.memberId),
  uniqueIndex('logi_member_link_profile_game_uq').on(t.profileId, t.gameId),
  check('logi_member_link_game_ck', sql`${t.gameId} in ('hell_let_loose', 'wardogs')`),
  check('logi_member_link_version_ck', sql`${t.version} > 0`),
]);
