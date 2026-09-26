import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
  type PgTableExtraConfigValue,
} from 'drizzle-orm/pg-core';
import { authUser } from './auth.ts';
import { GAMES, LOCALES, createdAt, sqlList, tz, updatedAt, type Game, type Locale } from './common.ts';
import type { CoverSnapshot, RevisionKind, RichTextDocument } from './content.ts';
import { asset } from './media.ts';

export const PROFILE_STATES = ['draft', 'published', 'hidden'] as const;
export type ProfileState = (typeof PROFILE_STATES)[number];

/** Curated public role label keys (localized in UI dictionaries). Never Discord roles or capabilities. */
export const PUBLIC_ROLE_KEYS = ['leader', 'officer', 'member', 'recruit', 'veteran', 'content-creator'] as const;
export type PublicRoleKey = (typeof PUBLIC_ROLE_KEYS)[number];

/**
 * Public member profile projection, distinct from any auth identity. Publication requires
 * recorded consent. Display names are shared across locales and keep diacritics.
 */
export const memberProfile = pgTable(
  'member_profile',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    displayName: text('display_name').notNull(),
    userId: uuid('user_id').references(() => authUser.id, { onDelete: 'set null' }),
    avatarAssetId: uuid('avatar_asset_id').references(() => asset.id, { onDelete: 'set null' }),
    games: text('games').array().$type<Game[]>().notNull().default(sql`'{}'::text[]`),
    publicRoleKeys: text('public_role_keys').array().$type<PublicRoleKey[]>().notNull().default(sql`'{}'::text[]`),
    state: text('state').$type<ProfileState>().notNull().default('draft'),
    consentConfirmedAt: tz('consent_confirmed_at'),
    publishedAt: tz('published_at'),
    sortOrder: integer('sort_order').notNull().default(100),
    isFixture: boolean('is_fixture').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('member_profile_user_uq').on(t.userId).where(sql`${t.userId} is not null`),
    index('member_profile_state_idx').on(t.state, t.sortOrder),
    check('member_profile_state_ck', sql`${t.state} in (${sqlList(PROFILE_STATES)})`),
    check('member_profile_slug_ck', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(${t.slug}) <= 80`),
    check('member_profile_name_ck', sql`length(btrim(${t.displayName})) between 1 and 80`),
    check('member_profile_games_ck', sql`${t.games} <@ array[${sqlList(GAMES)}]::text[]`),
    check('member_profile_roles_ck', sql`${t.publicRoleKeys} <@ array[${sqlList(PUBLIC_ROLE_KEYS)}]::text[]`),
    check(
      'member_profile_consent_ck',
      sql`${t.state} <> 'published' or (${t.consentConfirmedAt} is not null and ${t.publishedAt} is not null)`,
    ),
  ],
);

export const MATCH_STATUSES = ['scheduled', 'live', 'completed', 'postponed', 'cancelled'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const COMPETITION_TYPES = ['league', 'tournament', 'cup', 'friendly', 'scrim', 'other'] as const;
export type CompetitionType = (typeof COMPETITION_TYPES)[number];

export const MATCH_OUTCOMES = ['win', 'loss', 'draw', 'unknown'] as const;
export type MatchOutcome = (typeof MATCH_OUTCOMES)[number];

export const RESULT_VERIFICATION = ['provisional', 'verified'] as const;
export type ResultVerification = (typeof RESULT_VERIFICATION)[number];

export type ExternalLink = { url: string; label: string };

/**
 * One shared fixture. Facts (opponent, instant, status, result) are never duplicated
 * per locale. `publication` is the global public gate, independent of match status.
 */
export const match = pgTable(
  'match',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    game: text('game').$type<Game>().notNull(),
    opponentName: text('opponent_name').notNull(),
    opponentShortCode: text('opponent_short_code'),
    opponentLogoAssetId: uuid('opponent_logo_asset_id').references(() => asset.id, { onDelete: 'set null' }),
    competitionType: text('competition_type').$type<CompetitionType>().notNull(),
    competitionName: text('competition_name'),
    season: text('season'),
    format: text('format'),
    bestOf: integer('best_of'),
    teamSize: integer('team_size'),
    startsAt: tz('starts_at').notNull(),
    /** Display zone for the fixture; the stored instant is authoritative. */
    timeZone: text('time_zone').notNull().default('Europe/Prague'),
    /** Original start instant when the fixture was postponed. */
    originalStartsAt: tz('original_starts_at'),
    status: text('status').$type<MatchStatus>().notNull().default('scheduled'),
    publication: text('publication').$type<'draft' | 'published'>().notNull().default('draft'),
    publishedAt: tz('published_at'),
    eventUrl: text('event_url'),
    vodLinks: jsonb('vod_links').$type<ExternalLink[]>().notNull().default(sql`'[]'::jsonb`),
    coverAssetId: uuid('cover_asset_id').references(() => asset.id, { onDelete: 'set null' }),
    /** Private administration only; never selected into public DTOs. */
    internalNotes: text('internal_notes').notNull().default(''),
    isFixture: boolean('is_fixture').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdBy: uuid('created_by').references(() => authUser.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('match_public_idx').on(t.publication, t.startsAt),
    check('match_game_ck', sql`${t.game} in (${sqlList(GAMES)})`),
    check('match_status_ck', sql`${t.status} in (${sqlList(MATCH_STATUSES)})`),
    check('match_publication_ck', sql`${t.publication} in ('draft', 'published')`),
    check('match_published_at_ck', sql`${t.publication} <> 'published' or ${t.publishedAt} is not null`),
    check('match_competition_ck', sql`${t.competitionType} in (${sqlList(COMPETITION_TYPES)})`),
    check('match_slug_ck', sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(${t.slug}) <= 120`),
    check('match_opponent_ck', sql`length(btrim(${t.opponentName})) between 1 and 120`),
    check('match_best_of_ck', sql`${t.bestOf} is null or ${t.bestOf} between 1 and 99`),
    check('match_team_size_ck', sql`${t.teamSize} is null or ${t.teamSize} between 1 and 200`),
  ],
);

/**
 * Structured result. Null scores mean unknown/unpublished and are never rendered as 0.
 * Scores are either both known or both unknown.
 */
export const matchResult = pgTable(
  'match_result',
  {
    matchId: uuid('match_id')
      .primaryKey()
      .references(() => match.id, { onDelete: 'cascade' }),
    scoreValkyria: integer('score_valkyria'),
    scoreOpponent: integer('score_opponent'),
    outcome: text('outcome').$type<MatchOutcome>().notNull().default('unknown'),
    verification: text('verification').$type<ResultVerification>().notNull().default('provisional'),
    source: text('source').notNull().default(''),
    recordedBy: uuid('recorded_by').references(() => authUser.id, { onDelete: 'set null' }),
    recordedAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('match_result_outcome_ck', sql`${t.outcome} in (${sqlList(MATCH_OUTCOMES)})`),
    check('match_result_verification_ck', sql`${t.verification} in (${sqlList(RESULT_VERIFICATION)})`),
    check(
      'match_result_scores_ck',
      sql`(${t.scoreValkyria} is null and ${t.scoreOpponent} is null) or (${t.scoreValkyria} is not null and ${t.scoreOpponent} is not null and ${t.scoreValkyria} >= 0 and ${t.scoreOpponent} >= 0)`,
    ),
  ],
);

/** Optional ordered rounds/maps. No hardcoded game scoring model. */
export const matchRound = pgTable(
  'match_round',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => match.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    mapName: text('map_name'),
    mode: text('mode'),
    side: text('side'),
    scoreValkyria: integer('score_valkyria'),
    scoreOpponent: integer('score_opponent'),
    outcome: text('outcome').$type<MatchOutcome>(),
  },
  (t) => [
    uniqueIndex('match_round_order_uq').on(t.matchId, t.ordinal),
    check('match_round_ordinal_ck', sql`${t.ordinal} between 1 and 50`),
    check('match_round_outcome_ck', sql`${t.outcome} is null or ${t.outcome} in (${sqlList(MATCH_OUTCOMES)})`),
    check(
      'match_round_scores_ck',
      sql`(${t.scoreValkyria} is null or ${t.scoreValkyria} >= 0) and (${t.scoreOpponent} is null or ${t.scoreOpponent} >= 0)`,
    ),
  ],
);

/**
 * Optional localized prose owned by exactly one member profile (biography) or match
 * (preview/recap). Independent draft/live revisions per locale; always subject to the
 * owner's global publication/consent gate.
 */
export const proseTranslation = pgTable(
  'prose_translation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memberProfileId: uuid('member_profile_id').references(() => memberProfile.id, { onDelete: 'cascade' }),
    matchId: uuid('match_id').references(() => match.id, { onDelete: 'cascade' }),
    locale: text('locale').$type<Locale>().notNull(),
    draftRevisionId: uuid('draft_revision_id'),
    publishedRevisionId: uuid('published_revision_id'),
    publishedAt: tz('published_at'),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t): PgTableExtraConfigValue[] => [
    unique('prose_translation_id_locale_uq').on(t.id, t.locale),
    uniqueIndex('prose_translation_member_locale_uq')
      .on(t.memberProfileId, t.locale)
      .where(sql`${t.memberProfileId} is not null`),
    uniqueIndex('prose_translation_match_locale_uq').on(t.matchId, t.locale).where(sql`${t.matchId} is not null`),
    check('prose_translation_locale_ck', sql`${t.locale} in (${sqlList(LOCALES)})`),
    check('prose_translation_owner_ck', sql`num_nonnulls(${t.memberProfileId}, ${t.matchId}) = 1`),
    check(
      'prose_translation_live_ck',
      sql`(${t.publishedRevisionId} is null) = (${t.publishedAt} is null)`,
    ),
    foreignKey({
      name: 'prose_translation_draft_revision_fk',
      columns: [t.draftRevisionId, t.id],
      foreignColumns: [proseRevision.id, proseRevision.proseTranslationId],
    }),
    foreignKey({
      name: 'prose_translation_published_revision_fk',
      columns: [t.publishedRevisionId, t.id],
      foreignColumns: [proseRevision.id, proseRevision.proseTranslationId],
    }),
  ],
);

export const proseRevision = pgTable(
  'prose_revision',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    proseTranslationId: uuid('prose_translation_id').notNull(),
    locale: text('locale').$type<Locale>().notNull(),
    kind: text('kind').$type<RevisionKind>().notNull(),
    schemaVersion: integer('schema_version').notNull(),
    body: jsonb('body').$type<RichTextDocument>().notNull(),
    cover: jsonb('cover').$type<CoverSnapshot | null>(),
    assetIds: uuid('asset_ids').array().notNull().default(sql`'{}'::uuid[]`),
    createdBy: uuid('created_by').references(() => authUser.id, { onDelete: 'set null' }),
    createdByLabel: text('created_by_label').notNull().default(''),
    createdAt: createdAt(),
  },
  (t): PgTableExtraConfigValue[] => [
    unique('prose_revision_id_translation_uq').on(t.id, t.proseTranslationId),
    index('prose_revision_translation_idx').on(t.proseTranslationId, t.createdAt),
    index('prose_revision_assets_idx').using('gin', t.assetIds),
    check('prose_revision_locale_ck', sql`${t.locale} in (${sqlList(LOCALES)})`),
    foreignKey({
      name: 'prose_revision_translation_locale_fk',
      columns: [t.proseTranslationId, t.locale],
      foreignColumns: [proseTranslation.id, proseTranslation.locale],
    }).onDelete('cascade'),
  ],
);

/** Allowlisted public site configuration (validated by the settings module). */
export const siteSetting = pgTable('site_setting', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  version: integer('version').notNull().default(1),
  updatedBy: uuid('updated_by').references(() => authUser.id, { onDelete: 'set null' }),
  updatedAt: updatedAt(),
});
