import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { authUser } from './auth.ts';
import { createdAt, sqlList, tz, updatedAt } from './common.ts';

/** Application roles that a configured Discord guild role ID may map to. */
export const MAPPABLE_ROLES = ['member', 'editor', 'match_manager', 'administrator'] as const;
/** Roles a provisioned local grant may carry. `owner` is only ever operator-provisioned. */
export const LOCAL_GRANT_ROLES = ['editor', 'match_manager', 'administrator', 'owner'] as const;
export type MappableRole = (typeof MAPPABLE_ROLES)[number];
export type LocalGrantRole = (typeof LOCAL_GRANT_ROLES)[number];
export type AppRole = MappableRole | LocalGrantRole;

export const MEMBERSHIP_STATES = ['present', 'left', 'unknown'] as const;
export type MembershipState = (typeof MEMBERSHIP_STATES)[number];

export const MEMBERSHIP_SOURCES = ['oauth_login', 'rest_refresh', 'role_sync'] as const;
export type MembershipSource = (typeof MEMBERSHIP_SOURCES)[number];

/**
 * Last authoritative observation of a Discord user's membership in the configured
 * guild. Discord snowflakes are text. Browser input never writes this table.
 */
export const guildMembership = pgTable(
  'guild_membership',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: text('guild_id').notNull(),
    discordUserId: text('discord_user_id').notNull(),
    userId: uuid('user_id').references(() => authUser.id, { onDelete: 'set null' }),
    state: text('state').$type<MembershipState>().notNull(),
    roleIds: text('role_ids').array().notNull().default(sql`'{}'::text[]`),
    /** When Discord reported this state (event time or REST response time). */
    observedAt: tz('observed_at').notNull(),
    /** When this server stored the observation. */
    receivedAt: tz('received_at').notNull().defaultNow(),
    source: text('source').$type<MembershipSource>().notNull(),
    /** Monotonic ordering for event sources; an older snapshot never overwrites a newer one. */
    sequence: bigint('sequence', { mode: 'number' }).notNull().default(0),
    /** Incremented on invalidation; REST may commit only against its captured generation. */
    authorizationGeneration: bigint('authorization_generation', { mode: 'bigint' }).notNull().default(sql`0`),
    lastRefreshAttemptAt: tz('last_refresh_attempt_at'),
    /** Sanitized machine code of the last failed refresh (e.g. `rate_limited`, `unavailable`). */
    lastRefreshError: text('last_refresh_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('guild_membership_guild_user_uq').on(t.guildId, t.discordUserId),
    index('guild_membership_user_idx').on(t.userId),
    check('guild_membership_state_ck', sql`${t.state} in (${sqlList(MEMBERSHIP_STATES)})`),
    check('guild_membership_source_ck', sql`${t.source} in (${sqlList(MEMBERSHIP_SOURCES)})`),
    check('guild_membership_guild_snowflake_ck', sql`${t.guildId} ~ '^[0-9]{1,25}$'`),
    check('guild_membership_user_snowflake_ck', sql`${t.discordUserId} ~ '^[0-9]{1,25}$'`),
  ],
);

/**
 * Versioned record of the explicit guild-role → application-role mapping supplied by
 * operator configuration. A changed digest creates a new version and audit event.
 */
export const roleMappingVersion = pgTable(
  'role_mapping_version',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    version: integer('version').notNull().unique(),
    digest: text('digest').notNull().unique(),
    guildId: text('guild_id'),
    mapping: jsonb('mapping').$type<Record<string, MappableRole[]>>().notNull(),
    createdAt: createdAt(),
  },
);

/**
 * Operator-provisioned grant for a local (credential + MFA) recovery account. Independent
 * of Discord mapping; usable only from a session with `mfa` assurance.
 */
export const localAdminGrant = pgTable(
  'local_admin_grant',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    roles: text('roles').array().$type<LocalGrantRole[]>().notNull(),
    /** Incremented on every change; delegated schedules record and re-check it. */
    version: integer('version').notNull().default(1),
    provisionedBy: text('provisioned_by').notNull(),
    expiresAt: tz('expires_at'),
    revokedAt: tz('revoked_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('local_admin_grant_user_uq').on(t.userId),
    check('local_admin_grant_roles_ck', sql`cardinality(${t.roles}) > 0 and ${t.roles} <@ array[${sqlList(LOCAL_GRANT_ROLES)}]::text[]`),
  ],
);
