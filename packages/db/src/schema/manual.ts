import { sql } from 'drizzle-orm';
import { check, date, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { GAMES, createdAt, sqlList, tz, updatedAt, type Game } from './common.ts';
import { contentDocument } from './content.ts';

/**
 * Field Manual category of one game (ordered, localized labels). Articles are content
 * documents of kind `manual`; their `category_key` names a category of the same game.
 */
export const manualCategory = pgTable(
  'manual_category',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    game: text('game').$type<Game>().notNull(),
    key: text('key').notNull(),
    sortOrder: integer('sort_order').notNull().default(100),
    labelCs: text('label_cs').notNull(),
    labelEn: text('label_en').notNull(),
    descriptionCs: text('description_cs').notNull().default(''),
    descriptionEn: text('description_en').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('manual_category_game_key_uq').on(t.game, t.key),
    check('manual_category_game_ck', sql`${t.game} in (${sqlList(GAMES)})`),
    check('manual_category_key_ck', sql`${t.key} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(${t.key}) <= 64`),
    check('manual_category_label_ck', sql`length(btrim(${t.labelCs})) between 1 and 80 and length(btrim(${t.labelEn})) between 1 and 80`),
  ],
);

/**
 * Shared (non-translated) Field Manual metadata of one manual document: ordering and the
 * provenance of imported mechanics (source URL/date/language, credits, last review).
 */
export const manualArticle = pgTable(
  'manual_article',
  {
    documentId: uuid('document_id')
      .primaryKey()
      .references(() => contentDocument.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(100),
    sourceUrl: text('source_url'),
    sourcePublishedOn: date('source_published_on', { mode: 'string' }),
    sourceLanguage: text('source_language'),
    /** Public attribution line as supplied by the source (not member profiles). */
    credits: text('credits').notNull().default(''),
    reviewedAt: tz('reviewed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('manual_article_source_url_ck', sql`${t.sourceUrl} is null or ${t.sourceUrl} ~ '^https://'`),
    check('manual_article_source_language_ck', sql`${t.sourceLanguage} is null or ${t.sourceLanguage} in ('cs', 'sk', 'en')`),
    check('manual_article_credits_ck', sql`length(${t.credits}) <= 500`),
  ],
);
