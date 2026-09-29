import { sql } from 'drizzle-orm';
import { check, date, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, tz } from './common.ts';
import { contentTranslation } from './content.ts';
import { match, tournament, type MatchStatisticsPlayer, type MatchStatisticsTeam, type StatisticsSide } from './community.ts';
import { asset } from './media.ts';

/** Stable import identity. Private source exports never belong in Git or a public DTO. */
export const legacyImport = pgTable('legacy_import', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceOrigin: text('source_origin').notNull(),
  sourceKind: text('source_kind').notNull(),
  sourceKey: text('source_key').notNull(),
  locale: text('locale').notNull().default('cs'),
  sourceUrl: text('source_url').notNull(),
  sourceSha256: text('source_sha256').notNull(),
  sourcePublishedOn: date('source_published_on', { mode: 'string' }),
  sourceLanguage: text('source_language').notNull().default('cs'),
  credits: text('credits').notNull().default(''),
  /** Selected public provenance only: dates, repairs and association warnings, never raw exports. */
  sourceMetadata: jsonb('source_metadata').$type<Record<string, unknown>>().notNull().default({}),
  translationId: uuid('translation_id').references(() => contentTranslation.id, { onDelete: 'cascade' }),
  matchId: uuid('match_id').references(() => match.id, { onDelete: 'cascade' }),
  tournamentId: uuid('tournament_id').references(() => tournament.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id').references(() => asset.id, { onDelete: 'cascade' }),
  /** Target version at import; later editorial changes are never overwritten by a rerun. */
  importedVersion: integer('imported_version').notNull().default(1),
  observedAt: tz('observed_at').notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('legacy_import_identity_uq').on(t.sourceOrigin, t.sourceKind, t.sourceKey, t.locale),
  check('legacy_import_target_ck', sql`num_nonnulls(${t.translationId}, ${t.matchId}, ${t.tournamentId}, ${t.assetId}) = 1`),
  check('legacy_import_kind_ck', sql`${t.sourceKind} in ('news', 'manual', 'page', 'match', 'tournament', 'media')`),
  check('legacy_import_locale_ck', sql`${t.locale} in ('cs', 'en')`),
  check('legacy_import_hash_ck', sql`${t.sourceSha256} ~ '^[a-f0-9]{64}$'`),
  check('legacy_import_language_ck', sql`${t.sourceLanguage} in ('cs', 'sk', 'en')`),
  check('legacy_import_metadata_ck', sql`jsonb_typeof(${t.sourceMetadata}) = 'object'`),
]);

/** Allowlisted historical round; never contains platform IDs or raw CRCON responses. */
export type LegacyScoreboardSnapshot = {
  externalGameId: string | null;
  sourceGameUrl: string | null;
  mapName: string | null;
  mode: string | null;
  gameStartedAt: string | null;
  gameEndedAt: string | null;
  result: { allied: number; axis: number } | null;
  valkyriaSide: StatisticsSide | null;
  teams: Record<StatisticsSide, MatchStatisticsTeam>;
  players: MatchStatisticsPlayer[];
  observedAt: string;
};

/** Additional rounds from a legacy multi-map match; primary round uses match_statistics. */
export const legacyMatchScoreboard = pgTable('legacy_match_scoreboard', {
  matchId: uuid('match_id').notNull().references(() => match.id, { onDelete: 'cascade' }),
  ordinal: integer('ordinal').notNull(),
  snapshot: jsonb('snapshot').$type<LegacyScoreboardSnapshot>().notNull(),
}, (t) => [
  primaryKey({ columns: [t.matchId, t.ordinal] }),
  check('legacy_match_scoreboard_ordinal_ck', sql`${t.ordinal} between 2 and 50`),
  check('legacy_match_scoreboard_snapshot_ck', sql`jsonb_typeof(${t.snapshot}) = 'object' and jsonb_typeof(${t.snapshot}->'players') = 'array' and jsonb_array_length(${t.snapshot}->'players') <= 200`),
]);
