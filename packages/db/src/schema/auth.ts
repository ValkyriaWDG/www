import { bigint, boolean, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, tz, updatedAt } from './common.ts';

/*
 * Better Auth managed tables. Property names must match the library's field names
 * (checked against better-auth 1.7.6 core + two-factor plugin schema); database
 * column names are snake_case. IDs are UUIDs generated in application code
 * (`advanced.database.generateId: () => randomUUID()`); the columns have no DB default.
 */

export const authUser = pgTable('auth_user', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  // Discord may not supply an email. The auth module stores a non-deliverable,
  // unverified `discord-<subject>@accounts.invalid` alias; never a contact/linking key.
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  twoFactorEnabled: boolean('two_factor_enabled').default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const authSession = pgTable(
  'auth_session',
  {
    id: uuid('id').primaryKey(),
    expiresAt: tz('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    /**
     * How this session was established: `discord` (OAuth callback), `password`
     * (credential login without completed MFA), `mfa` (credential + verified second
     * factor) or `unknown`. Local administrator grants require `mfa`.
     */
    assurance: text('assurance').notNull().default('unknown'),
  },
  (t) => [index('auth_session_user_idx').on(t.userId)],
);

export const authAccount = pgTable(
  'auth_account',
  {
    id: uuid('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: tz('access_token_expires_at'),
    refreshTokenExpiresAt: tz('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('auth_account_user_idx').on(t.userId),
    uniqueIndex('auth_account_provider_subject_uq').on(t.providerId, t.accountId),
  ],
);

export const authVerification = pgTable(
  'auth_verification',
  {
    id: uuid('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: tz('expires_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('auth_verification_identifier_idx').on(t.identifier)],
);

export const authTwoFactor = pgTable(
  'auth_two_factor',
  {
    id: uuid('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    verified: boolean('verified').default(true),
    failedVerificationCount: integer('failed_verification_count').default(0),
    lockedUntil: tz('locked_until'),
  },
  (t) => [index('auth_two_factor_user_idx').on(t.userId), index('auth_two_factor_secret_idx').on(t.secret)],
);

/** Durable rate-limit state (Better Auth `rateLimit.storage: 'database'`). */
export const authRateLimit = pgTable('auth_rate_limit', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});
