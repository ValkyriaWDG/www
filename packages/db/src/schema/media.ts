import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { authUser } from './auth.ts';
import { createdAt, sqlList, tz, updatedAt } from './common.ts';

/** Media domain scope. Match managers may only manage `match` assets. */
export const ASSET_SCOPES = ['editorial', 'match'] as const;
export type AssetScope = (typeof ASSET_SCOPES)[number];

export const ASSET_STATES = ['processing', 'ready', 'failed'] as const;
export type AssetState = (typeof ASSET_STATES)[number];

export type AssetVariant = { key: string; width: number; height: number; bytes: number; mime: 'image/webp' };
export type AssetVariants = { full: AssetVariant; thumb: AssetVariant };

/**
 * Uploaded image. Bytes live in private persistent storage under server-generated keys
 * (`EDITORIAL_MEDIA_ROOT`), never in Git, the image or a public static directory.
 * Anonymous delivery is derived at request time from published references.
 * Library alt/caption values are defaults only; published text is revision-local.
 */
export const asset = pgTable(
  'asset',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: text('scope').$type<AssetScope>().notNull(),
    state: text('state').$type<AssetState>().notNull().default('processing'),
    ownerUserId: uuid('owner_user_id').references(() => authUser.id, { onDelete: 'set null' }),
    /** Sanitized display name of the uploaded file; never used as a storage path. */
    originalFilename: text('original_filename').notNull(),
    /** Decoded source format (jpeg/png/webp) after signature and decoder validation. */
    sourceFormat: text('source_format').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bytes: integer('bytes').notNull(),
    sha256: text('sha256').notNull(),
    variants: jsonb('variants').$type<AssetVariants>(),
    provenance: text('provenance').notNull().default(''),
    rights: text('rights').notNull().default(''),
    defaultAltCs: text('default_alt_cs').notNull().default(''),
    defaultAltEn: text('default_alt_en').notNull().default(''),
    defaultCaptionCs: text('default_caption_cs').notNull().default(''),
    defaultCaptionEn: text('default_caption_en').notNull().default(''),
    deletedAt: tz('deleted_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('asset_scope_idx').on(t.scope, t.createdAt),
    index('asset_sha_idx').on(t.sha256),
    check('asset_scope_ck', sql`${t.scope} in (${sqlList(ASSET_SCOPES)})`),
    check('asset_state_ck', sql`${t.state} in (${sqlList(ASSET_STATES)})`),
    check('asset_source_format_ck', sql`${t.sourceFormat} in ('jpeg', 'png', 'webp')`),
    check('asset_dimensions_ck', sql`${t.width} > 0 and ${t.height} > 0 and ${t.bytes} > 0`),
  ],
);
