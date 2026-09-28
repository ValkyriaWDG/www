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

/** `manual` is a game-scoped Field Manual article (always has a game). */
export const DOCUMENT_KINDS = ['news', 'page', 'manual'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Fixed keys for core static pages rendered at `/clan`, `/community`, `/privacy`. */
export const PAGE_KEYS = ['clan', 'community', 'privacy'] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

export const REVISION_KINDS = ['autosave', 'save', 'restore', 'seed'] as const;
export type RevisionKind = (typeof REVISION_KINDS)[number];

export const SCHEDULE_STATES = ['pending', 'claimed', 'blocked', 'completed', 'cancelled', 'failed'] as const;
export type ScheduleState = (typeof SCHEDULE_STATES)[number];

export const TAXONOMY_KINDS = ['category', 'tag'] as const;
export type TaxonomyKind = (typeof TAXONOMY_KINDS)[number];

/** Schema-versioned Tiptap/ProseMirror JSON; validated server-side before storage/rendering. */
export type RichTextDocument = { type: 'doc'; content?: unknown[] };

/** Cover presentation snapshot. Alt/caption are revision-local, never read from the library. */
export type CoverSnapshot = { assetId: string; alt: string; caption: string; decorative: boolean };

/** Effective localized taxonomy labels snapshotted into an immutable revision. */
export type TaxonomySnapshot = {
  category: { key: string; label: string } | null;
  tags: { key: string; label: string }[];
  /** Game context at save time; public listings filter on the published snapshot. */
  game?: Game | null;
};

/** One news post or core page; translated presentation lives in content_translation. */
export const contentDocument = pgTable(
  'content_document',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<DocumentKind>().notNull(),
    pageKey: text('page_key').$type<PageKey>(),
    game: text('game').$type<Game>(),
    categoryKey: text('category_key'),
    tagKeys: text('tag_keys').array().notNull().default(sql`'{}'::text[]`),
    /** Synthetic development/test record; the production seed never creates these. */
    isFixture: boolean('is_fixture').notNull().default(false),
    createdBy: uuid('created_by').references(() => authUser.id, { onDelete: 'set null' }),
    archivedAt: tz('archived_at'),
    /** Optimistic concurrency for shared (non-translated) document fields. */
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('content_document_page_key_uq').on(t.pageKey).where(sql`${t.pageKey} is not null`),
    check('content_document_kind_ck', sql`${t.kind} in (${sqlList(DOCUMENT_KINDS)})`),
    check(
      'content_document_page_key_ck',
      sql`(${t.kind} = 'page' and ${t.pageKey} in (${sqlList(PAGE_KEYS)})) or (${t.kind} in ('news', 'manual') and ${t.pageKey} is null)`,
    ),
    check('content_document_game_ck', sql`${t.game} is null or ${t.game} in (${sqlList(GAMES)})`),
    check('content_document_manual_game_ck', sql`${t.kind} <> 'manual' or ${t.game} is not null`),
  ],
);

/**
 * One locale variant of a document. Draft and live revision pointers are independent;
 * composite foreign keys guarantee they reference revisions of this exact translation.
 * `liveSlug` comes from the published revision and is the only public route slug.
 */
export const contentTranslation = pgTable(
  'content_translation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => contentDocument.id, { onDelete: 'cascade' }),
    locale: text('locale').$type<Locale>().notNull(),
    /** Route namespace copied from the document kind (`news` / `page`). */
    namespace: text('namespace').$type<DocumentKind>().notNull(),
    draftSlug: text('draft_slug').notNull(),
    liveSlug: text('live_slug'),
    draftRevisionId: uuid('draft_revision_id'),
    publishedRevisionId: uuid('published_revision_id'),
    firstPublishedAt: tz('first_published_at'),
    publishedAt: tz('published_at'),
    archivedAt: tz('archived_at'),
    /** Optimistic concurrency per translation. */
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex('content_translation_document_locale_uq').on(t.documentId, t.locale),
    unique('content_translation_id_locale_uq').on(t.id, t.locale),
    uniqueIndex('content_translation_draft_slug_uq').on(t.namespace, t.locale, t.draftSlug),
    uniqueIndex('content_translation_live_slug_uq')
      .on(t.namespace, t.locale, t.liveSlug)
      .where(sql`${t.liveSlug} is not null`),
    check('content_translation_locale_ck', sql`${t.locale} in (${sqlList(LOCALES)})`),
    check('content_translation_namespace_ck', sql`${t.namespace} in (${sqlList(DOCUMENT_KINDS)})`),
    check('content_translation_slug_ck', sql`${t.draftSlug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(${t.draftSlug}) <= 120`),
    check(
      'content_translation_live_state_ck',
      sql`(${t.publishedRevisionId} is null and ${t.liveSlug} is null) or (${t.publishedRevisionId} is not null and ${t.liveSlug} is not null and ${t.publishedAt} is not null)`,
    ),
    foreignKey({
      name: 'content_translation_draft_revision_fk',
      columns: [t.draftRevisionId, t.id],
      foreignColumns: [contentRevision.id, contentRevision.translationId],
    }),
    foreignKey({
      name: 'content_translation_published_revision_fk',
      columns: [t.publishedRevisionId, t.id],
      foreignColumns: [contentRevision.id, contentRevision.translationId],
    }),
  ],
);

/** Immutable snapshot of one translation. Public output reads only published snapshots. */
export const contentRevision = pgTable(
  'content_revision',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    translationId: uuid('translation_id').notNull(),
    locale: text('locale').$type<Locale>().notNull(),
    kind: text('kind').$type<RevisionKind>().notNull(),
    restoredFromRevisionId: uuid('restored_from_revision_id'),
    schemaVersion: integer('schema_version').notNull(),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    excerpt: text('excerpt').notNull().default(''),
    body: jsonb('body').$type<RichTextDocument>().notNull(),
    cover: jsonb('cover').$type<CoverSnapshot | null>(),
    taxonomy: jsonb('taxonomy').$type<TaxonomySnapshot>().notNull(),
    authorLabel: text('author_label').notNull().default(''),
    seoTitle: text('seo_title').notNull().default(''),
    seoDescription: text('seo_description').notNull().default(''),
    /** Asset IDs referenced by cover/body, extracted server-side for usage checks. */
    assetIds: uuid('asset_ids').array().notNull().default(sql`'{}'::uuid[]`),
    createdBy: uuid('created_by').references(() => authUser.id, { onDelete: 'set null' }),
    createdByLabel: text('created_by_label').notNull().default(''),
    createdAt: createdAt(),
  },
  (t): PgTableExtraConfigValue[] => [
    unique('content_revision_id_translation_uq').on(t.id, t.translationId),
    index('content_revision_translation_idx').on(t.translationId, t.createdAt),
    index('content_revision_assets_idx').using('gin', t.assetIds),
    check('content_revision_locale_ck', sql`${t.locale} in (${sqlList(LOCALES)})`),
    check('content_revision_kind_ck', sql`${t.kind} in (${sqlList(REVISION_KINDS)})`),
    foreignKey({
      name: 'content_revision_translation_locale_fk',
      columns: [t.translationId, t.locale],
      foreignColumns: [contentTranslation.id, contentTranslation.locale],
    }).onDelete('cascade'),
  ],
);

/** Previous published slug of a translation → stable translation identity (same locale/namespace). */
export const slugRedirect = pgTable(
  'slug_redirect',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    namespace: text('namespace').$type<DocumentKind>().notNull(),
    locale: text('locale').$type<Locale>().notNull(),
    sourceSlug: text('source_slug').notNull(),
    translationId: uuid('translation_id')
      .notNull()
      .references(() => contentTranslation.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('slug_redirect_source_uq').on(t.namespace, t.locale, t.sourceSlug),
    check('slug_redirect_locale_ck', sql`${t.locale} in (${sqlList(LOCALES)})`),
  ],
);

/**
 * Durable intent to publish one immutable revision of one translation at `dueAt`.
 * `blocked` means the issuer's authority is revoked/stale/unknown and needs fresh
 * approval; background retries never reactivate it.
 */
export const publicationSchedule = pgTable(
  'publication_schedule',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    translationId: uuid('translation_id').notNull(),
    locale: text('locale').$type<Locale>().notNull(),
    revisionId: uuid('revision_id').notNull(),
    dueAt: tz('due_at').notNull(),
    /** IANA zone the author used to express `dueAt`; the instant is authoritative. */
    timeZone: text('time_zone').notNull().default('Europe/Prague'),
    state: text('state').$type<ScheduleState>().notNull().default('pending'),
    issuerUserId: uuid('issuer_user_id').references(() => authUser.id, { onDelete: 'set null' }),
    issuerKind: text('issuer_kind').$type<'discord' | 'local_admin'>().notNull(),
    issuerLabel: text('issuer_label').notNull(),
    /** Local-admin delegation: grant identity/version recorded at creation, re-checked at execution. */
    issuerGrantId: uuid('issuer_grant_id'),
    issuerGrantVersion: integer('issuer_grant_version'),
    /** Assurance of the creating session (`discord` / `mfa`), audit metadata only. */
    issuerAssurance: text('issuer_assurance').notNull(),
    capability: text('capability').notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    attempts: integer('attempts').notNull().default(0),
    claimedAt: tz('claimed_at'),
    claimExpiresAt: tz('claim_expires_at'),
    lastError: text('last_error'),
    completedAt: tz('completed_at'),
    cancelledAt: tz('cancelled_at'),
    cancelledBy: uuid('cancelled_by').references(() => authUser.id, { onDelete: 'set null' }),
    /** Reapproval link to a previous blocked/failed intent. */
    previousScheduleId: uuid('previous_schedule_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('publication_schedule_active_uq')
      .on(t.translationId)
      .where(sql`${t.state} in ('pending', 'claimed', 'blocked', 'failed')`),
    index('publication_schedule_due_idx').on(t.state, t.dueAt),
    check('publication_schedule_state_ck', sql`${t.state} in (${sqlList(SCHEDULE_STATES)})`),
    check('publication_schedule_locale_ck', sql`${t.locale} in (${sqlList(LOCALES)})`),
    check('publication_schedule_issuer_kind_ck', sql`${t.issuerKind} in ('discord', 'local_admin')`),
    check(
      'publication_schedule_delegation_ck',
      sql`${t.issuerKind} <> 'local_admin' or (${t.issuerGrantId} is not null and ${t.issuerGrantVersion} is not null)`,
    ),
    foreignKey({
      name: 'publication_schedule_translation_locale_fk',
      columns: [t.translationId, t.locale],
      foreignColumns: [contentTranslation.id, contentTranslation.locale],
    }).onDelete('cascade'),
    foreignKey({
      name: 'publication_schedule_revision_fk',
      columns: [t.revisionId, t.translationId],
      foreignColumns: [contentRevision.id, contentRevision.translationId],
    }),
  ],
);

/** Shared category/tag key with localized labels; revisions snapshot the effective labels. */
export const taxonomyTerm = pgTable(
  'taxonomy_term',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<TaxonomyKind>().notNull(),
    key: text('key').notNull(),
    labelCs: text('label_cs').notNull(),
    labelEn: text('label_en').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('taxonomy_term_kind_key_uq').on(t.kind, t.key),
    check('taxonomy_term_kind_ck', sql`${t.kind} in (${sqlList(TAXONOMY_KINDS)})`),
    check('taxonomy_term_key_ck', sql`${t.key} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);
