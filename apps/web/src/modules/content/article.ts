import { asset, contentTranslation, type AssetVariants, type Executor, type Locale } from '@valkyria/db';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { parseRichTextDocument, emptyDocument } from './rich-text/schema';
import type { DocumentRow, RevisionRow, TranslationRow } from './store';
import type { ArticleDTO, CounterpartSlugs } from './types';
import { publishedEditorialArchives } from '@/modules/legacy/editorial-public';

/** Dimensions of the delivered `full` variant for renderable (ready, not deleted) assets. */
export async function loadAssetDimensions(db: Executor, ids: readonly string[]): Promise<Map<string, { width: number; height: number }>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: asset.id, variants: asset.variants })
    .from(asset)
    .where(and(inArray(asset.id, unique), isNull(asset.deletedAt), eq(asset.state, 'ready')));
  const result = new Map<string, { width: number; height: number }>();
  for (const row of rows) {
    const full = (row.variants as AssetVariants | null)?.full;
    if (full && full.width > 0 && full.height > 0) result.set(row.id, { width: full.width, height: full.height });
  }
  return result;
}

/** Published live slugs of every locale variant of a document (never drafts). */
export async function publishedCounterparts(db: Executor, documentId: string): Promise<CounterpartSlugs> {
  const rows = await db
    .select({ locale: contentTranslation.locale, liveSlug: contentTranslation.liveSlug })
    .from(contentTranslation)
    .where(
      and(
        eq(contentTranslation.documentId, documentId),
        isNotNull(contentTranslation.publishedRevisionId),
        isNotNull(contentTranslation.liveSlug),
        isNull(contentTranslation.archivedAt),
      ),
    );
  const result: CounterpartSlugs = {};
  for (const row of rows) if (row.liveSlug) result[row.locale as Locale] = row.liveSlug;
  return result;
}

/**
 * Builds the article DTO from one immutable revision snapshot (published or, for a
 * preview, a draft). Title/slug/cover/SEO/taxonomy labels come from the snapshot only.
 */
export async function buildArticle(
  db: Executor,
  params: { document: DocumentRow; translation: TranslationRow; revision: RevisionRow; isPreview: boolean; counterparts?: CounterpartSlugs },
): Promise<ArticleDTO> {
  const { document, translation, revision, isPreview } = params;
  const parsed = parseRichTextDocument(revision.body);
  const body = parsed.ok ? parsed.doc : emptyDocument();
  const bodyAssets = parsed.ok ? parsed.assetIds : [];
  const assets = await loadAssetDimensions(db, [...bodyAssets, ...(revision.cover ? [revision.cover.assetId] : [])]);
  const coverAsset = revision.cover ? assets.get(revision.cover.assetId) : undefined;
  const taxonomy = revision.taxonomy ?? { category: null, tags: [] };
  return {
    archiveEditorial: isPreview ? null : (await publishedEditorialArchives(db, { kind: 'translation', ids: [translation.id] }, translation.locale)).get(translation.id) ?? null,
    documentId: document.id,
    translationId: translation.id,
    revisionId: revision.id,
    kind: document.kind,
    pageKey: document.pageKey,
    locale: translation.locale,
    slug: isPreview ? revision.slug : (translation.liveSlug ?? revision.slug),
    title: revision.title,
    excerpt: revision.excerpt,
    body,
    cover:
      revision.cover && coverAsset
        ? {
            assetId: revision.cover.assetId,
            alt: revision.cover.decorative ? '' : revision.cover.alt,
            caption: revision.cover.caption,
            decorative: revision.cover.decorative,
            width: coverAsset.width,
            height: coverAsset.height,
          }
        : null,
    authorLabel: revision.authorLabel,
    seoTitle: revision.seoTitle,
    seoDescription: revision.seoDescription,
    publishedAt: translation.firstPublishedAt ?? translation.publishedAt,
    updatedAt: translation.publishedAt,
    category: taxonomy.category ?? null,
    tags: taxonomy.tags ?? [],
    game: taxonomy.game ?? null,
    assets,
    counterparts: params.counterparts ?? (await publishedCounterparts(db, document.id)),
    isPreview,
  };
}
