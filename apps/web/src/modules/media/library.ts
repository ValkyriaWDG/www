import 'server-only';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ASSET_SCOPES, asset, authUser, type AssetScope, type AssetVariants, type Executor } from '@valkyria/db';
import { and, count, desc, eq, gte, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { DomainError } from '@/lib/result';
import { can } from '@/modules/access/policy';
import { AccessDeniedError, type Actor } from '@/modules/access/types';
import { recordAudit } from '@/modules/audit/audit';
import { authorize } from '@/modules/content/guard';
import { parseInput, uuidSchema } from '@/modules/content/inputs';
import { inTransaction } from '@/modules/content/store';
import { processImage } from './image';
import { scopeCapability } from './scope';
import { removeAssetFiles, resolveMediaRoot, variantKey, writeVariants } from './storage';
import { listAssetReferences, publishedReferenceSql, usageCountSql, type AssetReference } from './usage';

/**
 * Scoped media library. Editors manage `editorial` assets, match managers `match`
 * assets; neither can create or change the other scope. Library alt/caption values are
 * defaults only: published content keeps its own revision-local snapshot.
 */

export const UPLOADS_PER_HOUR = 60;

export type MediaDeps = { mediaRoot?: string; now?: () => Date };

export { scopeCapability };

const CONTROL = /[\u0000-\u001f\u007f]/g;
const text = (max: number) =>
  z
    .string()
    .transform((value) => value.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(max));

const metadataShape = {
  provenance: text(500),
  rights: text(500),
  defaultAltCs: text(300),
  defaultAltEn: text(300),
  defaultCaptionCs: text(500),
  defaultCaptionEn: text(500),
};

export const uploadMetadataSchema = z.object({
  filename: z.string().max(1000).default('image'),
  scope: z.enum(ASSET_SCOPES),
  provenance: metadataShape.provenance.default(''),
  rights: metadataShape.rights.default(''),
  defaultAltCs: metadataShape.defaultAltCs.default(''),
  defaultAltEn: metadataShape.defaultAltEn.default(''),
  defaultCaptionCs: metadataShape.defaultCaptionCs.default(''),
  defaultCaptionEn: metadataShape.defaultCaptionEn.default(''),
});
export type UploadImageInput = z.input<typeof uploadMetadataSchema> & { bytes: Buffer };

export const updateAssetMetadataSchema = z.object({ assetId: uuidSchema, ...metadataShape }).partial({
  provenance: true,
  rights: true,
  defaultAltCs: true,
  defaultAltEn: true,
  defaultCaptionCs: true,
  defaultCaptionEn: true,
});
export type UpdateAssetMetadataInput = z.input<typeof updateAssetMetadataSchema>;

export const listAssetsSchema = z.object({
  scope: z.enum(ASSET_SCOPES).optional(),
  q: text(80).optional(),
  inUse: z.boolean().optional(),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(48).default(24),
});
export type ListAssetsInput = z.input<typeof listAssetsSchema>;

export type AssetDTO = {
  id: string;
  scope: AssetScope;
  originalFilename: string;
  sourceFormat: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  variants: { full: { width: number; height: number; bytes: number }; thumb: { width: number; height: number; bytes: number } } | null;
  urls: { full: string; thumb: string };
  provenance: string;
  rights: string;
  defaultAlt: { cs: string; en: string };
  defaultCaption: { cs: string; en: string };
  owner: { userId: string; name: string } | null;
  usageCount: number;
  publishedUse: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AssetDetailDTO = AssetDTO & { references: AssetReference[] };

type AssetRow = typeof asset.$inferSelect;

function toDTO(row: AssetRow, extra: { ownerName: string | null; usageCount: number; publishedUse: boolean }): AssetDTO {
  const variants = row.variants as AssetVariants | null;
  return {
    id: row.id,
    scope: row.scope,
    originalFilename: row.originalFilename,
    sourceFormat: row.sourceFormat,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    sha256: row.sha256,
    variants: variants
      ? {
          full: { width: variants.full.width, height: variants.full.height, bytes: variants.full.bytes },
          thumb: { width: variants.thumb.width, height: variants.thumb.height, bytes: variants.thumb.bytes },
        }
      : null,
    urls: { full: `/api/media/${row.id}/full`, thumb: `/api/media/${row.id}/thumb` },
    provenance: row.provenance,
    rights: row.rights,
    defaultAlt: { cs: row.defaultAltCs, en: row.defaultAltEn },
    defaultCaption: { cs: row.defaultCaptionCs, en: row.defaultCaptionEn },
    owner: row.ownerUserId ? { userId: row.ownerUserId, name: (extra.ownerName ?? '').slice(0, 120) } : null,
    usageCount: extra.usageCount,
    publishedUse: extra.publishedUse,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Display-only name: basename without control characters, bounded. Never a storage path. */
export function sanitizeFilename(value: string): string {
  const base = path.posix.basename(value.replaceAll('\\', '/')).replace(CONTROL, '').replace(/\s+/g, ' ').trim();
  return (base || 'image').slice(0, 120);
}

/** Validates, re-encodes and stores an image; records the asset and an audit event. */
export async function uploadImage(db: Executor, actor: Actor, rawInput: UploadImageInput, deps: MediaDeps = {}): Promise<AssetDTO> {
  const scopeResult = z.enum(ASSET_SCOPES).safeParse(rawInput?.scope);
  if (!scopeResult.success) throw new DomainError('validation', 'Invalid media scope.', { scope: 'invalid' });
  const capability = scopeCapability(scopeResult.data);
  await authorize(db, actor, capability, 'write', { action: 'media.upload', entityType: 'asset' });
  const { bytes, ...metadata } = rawInput;
  const input = parseInput(uploadMetadataSchema, metadata);
  if (!Buffer.isBuffer(bytes)) throw new DomainError('validation', 'Missing file.', { file: 'required' });
  const now = deps.now?.() ?? new Date();
  const root = deps.mediaRoot ?? resolveMediaRoot();

  if (actor.kind === 'principal') {
    const [recent] = await db
      .select({ total: count() })
      .from(asset)
      .where(and(eq(asset.ownerUserId, actor.userId), gte(asset.createdAt, new Date(now.getTime() - 3_600_000))));
    if ((recent?.total ?? 0) >= UPLOADS_PER_HOUR) throw new DomainError('rate_limited', 'Upload quota exceeded.');
  }

  const image = await processImage(bytes);
  const id = randomUUID();
  await writeVariants(root, id, { full: image.full.buffer, thumb: image.thumb.buffer });
  const variants: AssetVariants = {
    full: { key: variantKey(id, 'full'), width: image.full.width, height: image.full.height, bytes: image.full.bytes, mime: 'image/webp' },
    thumb: { key: variantKey(id, 'thumb'), width: image.thumb.width, height: image.thumb.height, bytes: image.thumb.bytes, mime: 'image/webp' },
  };
  try {
    const row = await inTransaction(db, async (tx) => {
      const [inserted] = await tx
        .insert(asset)
        .values({
          id,
          scope: input.scope,
          state: 'ready',
          ownerUserId: actor.kind === 'principal' ? actor.userId : null,
          originalFilename: sanitizeFilename(input.filename),
          sourceFormat: image.format,
          width: image.width,
          height: image.height,
          bytes: image.bytes,
          sha256: image.sha256,
          variants,
          provenance: input.provenance,
          rights: input.rights,
          defaultAltCs: input.defaultAltCs,
          defaultAltEn: input.defaultAltEn,
          defaultCaptionCs: input.defaultCaptionCs,
          defaultCaptionEn: input.defaultCaptionEn,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await recordAudit(tx, {
        actor,
        action: 'media.upload',
        outcome: 'success',
        capability,
        entityType: 'asset',
        entityId: id,
        summary: { scope: input.scope, format: image.format, width: image.width, height: image.height, bytes: image.bytes },
      });
      return inserted!;
    });
    return toDTO(row, { ownerName: actor.kind === 'principal' ? actor.label : null, usageCount: 0, publishedUse: false });
  } catch (error) {
    await removeAssetFiles(root, id).catch(() => undefined);
    throw error;
  }
}

function allowedScopes(actor: Actor): AssetScope[] {
  return ASSET_SCOPES.filter((scope) => can(actor, scopeCapability(scope)));
}

async function authorizeAnyScope(db: Executor, actor: Actor, action: string): Promise<AssetScope[]> {
  const scopes = allowedScopes(actor);
  if (scopes.length === 0) {
    await authorize(db, actor, 'media.editorial.manage', 'read', { action, entityType: 'asset' });
    throw new AccessDeniedError('forbidden', 'media.editorial.manage');
  }
  return scopes;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Paginated library listing limited to the scopes the actor may manage. */
export async function listAssets(
  db: Executor,
  actor: Actor,
  rawInput: ListAssetsInput = {},
): Promise<{ items: AssetDTO[]; total: number; page: number; pageSize: number; pageCount: number }> {
  const scopes = await authorizeAnyScope(db, actor, 'media.list');
  const input = parseInput(listAssetsSchema, rawInput);
  if (input.scope && !scopes.includes(input.scope)) throw new AccessDeniedError('forbidden', scopeCapability(input.scope));
  const usage = usageCountSql(sql`${asset.id}`);
  const conditions: SQL[] = [isNull(asset.deletedAt), inArray(asset.scope, input.scope ? [input.scope] : scopes)];
  if (input.q) {
    const pattern = `%${escapeLike(input.q)}%`;
    conditions.push(
      or(
        ilike(asset.originalFilename, pattern),
        ilike(asset.provenance, pattern),
        ilike(asset.defaultAltCs, pattern),
        ilike(asset.defaultAltEn, pattern),
        ilike(asset.defaultCaptionCs, pattern),
        ilike(asset.defaultCaptionEn, pattern),
      )!,
    );
  }
  if (input.inUse !== undefined) conditions.push(input.inUse ? sql`${usage} > 0` : sql`${usage} = 0`);
  const where = and(...conditions);
  const [total] = await db.select({ total: count() }).from(asset).where(where);
  const rows = await db
    .select({ asset, ownerName: authUser.name, usageCount: usage, publishedUse: publishedReferenceSql(sql`${asset.id}`).mapWith(Boolean) })
    .from(asset)
    .leftJoin(authUser, eq(authUser.id, asset.ownerUserId))
    .where(where)
    .orderBy(desc(asset.createdAt), desc(asset.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  const totalCount = total?.total ?? 0;
  return {
    items: rows.map((row) => toDTO(row.asset, { ownerName: row.ownerName, usageCount: Number(row.usageCount), publishedUse: Boolean(row.publishedUse) })),
    total: totalCount,
    page: input.page,
    pageSize: input.pageSize,
    pageCount: Math.ceil(totalCount / input.pageSize),
  };
}

async function loadAsset(db: Executor, assetId: string, lock = false): Promise<AssetRow> {
  const query = db.select().from(asset).where(and(eq(asset.id, assetId), isNull(asset.deletedAt)));
  const [row] = lock ? await query.for('update') : await query;
  if (!row) throw new DomainError('not_found', 'Asset not found.');
  return row;
}

/** One asset with its usage references; requires the asset scope's media capability. */
export async function getAsset(db: Executor, actor: Actor, rawInput: { assetId: string }): Promise<AssetDetailDTO> {
  await authorizeAnyScope(db, actor, 'media.read');
  const { assetId } = parseInput(z.object({ assetId: uuidSchema }), rawInput);
  const row = await loadAsset(db, assetId);
  await authorize(db, actor, scopeCapability(row.scope), 'read', { action: 'media.read', entityType: 'asset', entityId: row.id });
  const [owner] = row.ownerUserId ? await db.select({ name: authUser.name }).from(authUser).where(eq(authUser.id, row.ownerUserId)) : [];
  const references = await listAssetReferences(db, row.id);
  return {
    ...toDTO(row, {
      ownerName: owner?.name ?? null,
      usageCount: new Set(references.map((ref) => `${ref.kind}:${ref.translationId ?? ref.entityId}`)).size,
      publishedUse: references.some((ref) => ref.published),
    }),
    references,
  };
}

/** Updates library defaults/provenance. Published revisions keep their own alt/caption snapshots. */
export async function updateAssetMetadata(db: Executor, actor: Actor, rawInput: UpdateAssetMetadataInput, deps: MediaDeps = {}): Promise<AssetDTO> {
  await authorizeAnyScope(db, actor, 'media.update');
  const input = parseInput(updateAssetMetadataSchema, rawInput);
  const now = deps.now?.() ?? new Date();
  return inTransaction(db, async (tx) => {
    const row = await loadAsset(tx, input.assetId, true);
    const capability = scopeCapability(row.scope);
    await authorize(tx, actor, capability, 'write', { action: 'media.update', entityType: 'asset', entityId: row.id });
    const { assetId: _assetId, ...changes } = input;
    const [updated] = await tx
      .update(asset)
      .set({ ...changes, updatedAt: now })
      .where(eq(asset.id, row.id))
      .returning();
    await recordAudit(tx, {
      actor,
      action: 'media.update',
      outcome: 'success',
      capability,
      entityType: 'asset',
      entityId: row.id,
      summary: { fields: Object.keys(changes) },
    });
    const id = sql`${row.id}::uuid`;
    const usage = await tx.execute<{ usage: number; published: boolean }>(
      sql`select ${usageCountSql(id)} as usage, ${publishedReferenceSql(id)} as published`,
    );
    return toDTO(updated!, {
      ownerName: null,
      usageCount: Number(usage.rows[0]?.usage ?? 0),
      publishedUse: usage.rows[0]?.published === true,
    });
  });
}

/**
 * Soft-deletes an unreferenced asset and removes its files. Any reference by a current
 * draft/published revision, active schedule, prose revision, member avatar or match
 * logo/cover → `in_use` (published content can never lose an image).
 */
export async function deleteAsset(db: Executor, actor: Actor, rawInput: { assetId: string }, deps: MediaDeps = {}): Promise<{ assetId: string }> {
  await authorizeAnyScope(db, actor, 'media.delete');
  const { assetId } = parseInput(z.object({ assetId: uuidSchema }), rawInput);
  const now = deps.now?.() ?? new Date();
  const root = deps.mediaRoot ?? resolveMediaRoot();
  await inTransaction(db, async (tx) => {
    const row = await loadAsset(tx, assetId, true);
    const capability = scopeCapability(row.scope);
    await authorize(tx, actor, capability, 'write', { action: 'media.delete', entityType: 'asset', entityId: row.id });
    const result = await tx.execute<{ usage: number }>(sql`select ${usageCountSql(sql`${row.id}::uuid`)} as usage`);
    if (Number(result.rows[0]?.usage ?? 0) > 0) throw new DomainError('in_use', 'The asset is still referenced.');
    await tx.update(asset).set({ deletedAt: now, updatedAt: now }).where(eq(asset.id, row.id));
    await recordAudit(tx, { actor, action: 'media.delete', outcome: 'success', capability, entityType: 'asset', entityId: row.id });
  });
  await removeAssetFiles(root, assetId).catch((error: unknown) => {
    console.warn(`[media] could not remove files of a deleted asset (${error instanceof Error ? error.name : 'unknown'})`);
  });
  return { assetId };
}
