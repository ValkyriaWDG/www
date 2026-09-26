import { asset, type AssetScope, type AssetVariants, type Executor } from '@valkyria/db';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DomainError } from '@/lib/result';

/** Public image reference: delivery dimensions of the `full` derivative. */
export type PublicImage = { assetId: string; width: number; height: number };

export type AssetRef = { field: string; id: string | null | undefined };

/**
 * Verifies that referenced assets exist, finished processing, are not deleted and belong
 * to an allowed media scope. A failure is a validation error on the referencing field.
 */
export async function assertUsableAssets(db: Executor, refs: AssetRef[], scopes: readonly AssetScope[]): Promise<void> {
  const wanted = refs.filter((ref): ref is { field: string; id: string } => typeof ref.id === 'string');
  if (wanted.length === 0) return;
  const ids = [...new Set(wanted.map((ref) => ref.id.toLowerCase()))];
  const rows = await db
    .select({ id: asset.id })
    .from(asset)
    .where(and(inArray(asset.id, ids), eq(asset.state, 'ready'), isNull(asset.deletedAt), inArray(asset.scope, [...scopes])));
  const usable = new Set(rows.map((row) => row.id.toLowerCase()));
  const fieldErrors: Record<string, string> = {};
  for (const ref of wanted) if (!usable.has(ref.id.toLowerCase())) fieldErrors[ref.field] = 'asset_unavailable';
  if (Object.keys(fieldErrors).length > 0) throw new DomainError('validation', 'Referenced media is unavailable.', fieldErrors);
}

function dimensions(row: { width: number; height: number; variants: AssetVariants | null }) {
  const full = row.variants?.full;
  return full ? { width: full.width, height: full.height } : { width: row.width, height: row.height };
}

/** Loads delivery metadata for ready, non-deleted assets; unknown IDs are omitted. */
export async function loadPublicImages(db: Executor, ids: readonly (string | null | undefined)[]): Promise<Map<string, PublicImage>> {
  const unique = [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
  const result = new Map<string, PublicImage>();
  if (unique.length === 0) return result;
  const rows = await db
    .select({ id: asset.id, width: asset.width, height: asset.height, variants: asset.variants })
    .from(asset)
    .where(and(inArray(asset.id, unique), eq(asset.state, 'ready'), isNull(asset.deletedAt)));
  for (const row of rows) result.set(row.id, { assetId: row.id, ...dimensions(row) });
  return result;
}

export async function loadAssetDefaults(db: Executor, id: string) {
  const [row] = await db
    .select({ altCs: asset.defaultAltCs, altEn: asset.defaultAltEn })
    .from(asset)
    .where(eq(asset.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * True when an asset is referenced by currently public community data: a published
 * match (opponent logo/cover), a published consented member avatar, or the published
 * recap/biography revision of such a public owner. Media delivery combines this with
 * the content module's own published references; draft-only references never count.
 */
export async function communityAssetIsPublic(db: Executor, assetId: string): Promise<boolean> {
  const result = await db.execute<{ public: boolean }>(sql`
    select (
      exists (
        select 1 from match m
        where m.publication = 'published'
          and (m.opponent_logo_asset_id = ${assetId}::uuid or m.cover_asset_id = ${assetId}::uuid)
      )
      or exists (
        select 1 from member_profile p
        where p.state = 'published' and p.consent_confirmed_at is not null and p.avatar_asset_id = ${assetId}::uuid
      )
      or exists (
        select 1
        from prose_translation t
        join prose_revision r on r.id = t.published_revision_id and r.prose_translation_id = t.id
        left join match m on m.id = t.match_id
        left join member_profile p on p.id = t.member_profile_id
        where r.asset_ids @> array[${assetId}::uuid]
          and (
            (m.id is not null and m.publication = 'published')
            or (p.id is not null and p.state = 'published' and p.consent_confirmed_at is not null)
          )
      )
    ) as public
  `);
  return Boolean(result.rows[0]?.public);
}
