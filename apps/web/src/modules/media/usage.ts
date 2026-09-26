import type { Executor, Locale } from '@valkyria/db';
import { sql, type SQL } from 'drizzle-orm';

/**
 * Asset reference rules shared by the library (usage/deletion) and delivery.
 * `id` is an SQL expression yielding the asset UUID (a column or a bound parameter).
 * Content/prose revisions reference an asset through `asset_ids` or their cover JSON.
 */

const revisionRefs = (alias: string, id: SQL) =>
  sql`(${sql.raw(alias)}.asset_ids @> array[${id}]::uuid[] or ${sql.raw(alias)}.cover->>'assetId' = (${id})::text)`;

/**
 * True when at least one CURRENTLY PUBLISHED reference permits anonymous delivery:
 * a live content translation of a non-archived document; a published prose revision
 * whose owner is public (published match, or published member with consent); a
 * published member's avatar; a published match's opponent logo or cover.
 */
export function publishedReferenceSql(id: SQL): SQL {
  return sql`(
    exists (
      select 1 from content_translation t
      join content_document d on d.id = t.document_id
      join content_revision r on r.id = t.published_revision_id and r.translation_id = t.id
      where d.archived_at is null and t.archived_at is null and t.live_slug is not null and ${revisionRefs('r', id)}
    )
    or exists (
      select 1 from prose_translation p
      join prose_revision pr on pr.id = p.published_revision_id and pr.prose_translation_id = p.id
      left join "match" m on m.id = p.match_id
      left join member_profile mp on mp.id = p.member_profile_id
      where ${revisionRefs('pr', id)}
        and ((p.match_id is not null and m.publication = 'published')
          or (p.member_profile_id is not null and mp.state = 'published' and mp.consent_confirmed_at is not null))
    )
    or exists (
      select 1 from member_profile mp
      where mp.avatar_asset_id = ${id} and mp.state = 'published' and mp.consent_confirmed_at is not null
    )
    or exists (
      select 1 from "match" m
      where (m.opponent_logo_asset_id = ${id} or m.cover_asset_id = ${id}) and m.publication = 'published'
    )
  )`;
}

/**
 * Number of entities referencing the asset in a way that blocks deletion: content
 * translations (draft/published pointer or active schedule target), prose translations
 * (draft/published pointer), member avatars and match logos/covers (any state).
 */
export function usageCountSql(id: SQL): SQL<number> {
  return sql<number>`(
    (select count(*) from content_translation t
      where exists (
        select 1 from content_revision r
        where r.translation_id = t.id
          and (r.id = t.draft_revision_id or r.id = t.published_revision_id
            or r.id in (select s.revision_id from publication_schedule s
                        where s.translation_id = t.id and s.state in ('pending', 'claimed', 'blocked', 'failed')))
          and ${revisionRefs('r', id)}))
    + (select count(*) from prose_translation p
      where exists (
        select 1 from prose_revision pr
        where pr.prose_translation_id = p.id
          and (pr.id = p.draft_revision_id or pr.id = p.published_revision_id)
          and ${revisionRefs('pr', id)}))
    + (select count(*) from member_profile mp where mp.avatar_asset_id = ${id})
    + (select count(*) from "match" m where m.opponent_logo_asset_id = ${id} or m.cover_asset_id = ${id})
  )::int`;
}

export async function hasPublishedReference(db: Executor, assetId: string): Promise<boolean> {
  const result = await db.execute<{ published: boolean }>(sql`select ${publishedReferenceSql(sql`${assetId}::uuid`)} as published`);
  return result.rows[0]?.published === true;
}

export async function usageCount(db: Executor, assetId: string): Promise<number> {
  const result = await db.execute<{ count: number }>(sql`select ${usageCountSql(sql`${assetId}::uuid`)} as count`);
  return Number(result.rows[0]?.count ?? 0);
}

export type AssetReference = {
  kind: 'content' | 'prose' | 'member_avatar' | 'match';
  /** Content document, prose owner (match/member), member profile or match ID. */
  entityId: string;
  translationId: string | null;
  locale: Locale | null;
  published: boolean;
};

/** Detailed usage list for the media library (admin only). */
export async function listAssetReferences(db: Executor, assetId: string): Promise<AssetReference[]> {
  const id = sql`${assetId}::uuid`;
  const result = await db.execute<{ kind: AssetReference['kind']; entity_id: string; translation_id: string | null; locale: Locale | null; published: boolean }>(sql`
    select 'content' as kind, t.document_id as entity_id, t.id as translation_id, t.locale,
      bool_or(r.id = t.published_revision_id and d.archived_at is null and t.live_slug is not null) as published
    from content_translation t
    join content_document d on d.id = t.document_id
    join content_revision r on r.translation_id = t.id
    where (r.id = t.draft_revision_id or r.id = t.published_revision_id
        or r.id in (select s.revision_id from publication_schedule s where s.translation_id = t.id and s.state in ('pending', 'claimed', 'blocked', 'failed')))
      and ${revisionRefs('r', id)}
    group by t.document_id, t.id, t.locale
    union all
    select 'prose', coalesce(p.match_id, p.member_profile_id), p.id, p.locale,
      bool_or(pr.id = p.published_revision_id)
    from prose_translation p
    join prose_revision pr on pr.prose_translation_id = p.id
    where (pr.id = p.draft_revision_id or pr.id = p.published_revision_id) and ${revisionRefs('pr', id)}
    group by p.match_id, p.member_profile_id, p.id, p.locale
    union all
    select 'member_avatar', mp.id, null, null, (mp.state = 'published' and mp.consent_confirmed_at is not null)
    from member_profile mp where mp.avatar_asset_id = ${id}
    union all
    select 'match', m.id, null, null, m.publication = 'published'
    from "match" m where m.opponent_logo_asset_id = ${id} or m.cover_asset_id = ${id}
    limit 200
  `);
  return result.rows.map((row) => ({
    kind: row.kind,
    entityId: row.entity_id,
    translationId: row.translation_id,
    locale: row.locale,
    published: row.published === true,
  }));
}
