import 'server-only';
import { asset, contentDocument, contentTranslation, legacyImport, tournament, type AssetVariants, type Executor, type Locale } from '@valkyria/db';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { readArchiveEditorial, type PublicArchiveEditorial } from './editorial-details';
import { LEGACY_HLL_ORIGIN } from './hll';

/** Historical Czech/Slovak source facts; never an implicit English translation or draft leak. */
export async function publishedEditorialArchives(db: Executor, owner: { kind: 'translation' | 'tournament'; ids: string[] }, locale: Locale): Promise<Map<string, PublicArchiveEditorial>> {
  const output = new Map<string, PublicArchiveEditorial>();
  if (locale !== 'cs' || !owner.ids.length) return output;
  const source = and(eq(legacyImport.sourceOrigin, LEGACY_HLL_ORIGIN), eq(legacyImport.locale, 'cs'));
  const rows = owner.kind === 'translation'
    ? await db.select({ id: contentTranslation.id, metadata: legacyImport.sourceMetadata, sourceKind: legacyImport.sourceKind, sourceUrl: legacyImport.sourceUrl, targetKind: contentDocument.kind }).from(legacyImport)
      .innerJoin(contentTranslation, eq(contentTranslation.id, legacyImport.translationId))
      .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
      .where(and(source, inArray(contentTranslation.id, owner.ids), eq(contentTranslation.locale, 'cs'),
        inArray(legacyImport.sourceKind, ['news', 'manual', 'page']),
        isNull(contentDocument.archivedAt), isNull(contentTranslation.archivedAt),
        isNotNull(contentTranslation.publishedRevisionId), isNotNull(contentTranslation.liveSlug)))
    : await db.select({ id: tournament.id, metadata: legacyImport.sourceMetadata, sourceKind: legacyImport.sourceKind, sourceUrl: legacyImport.sourceUrl }).from(legacyImport)
      .innerJoin(tournament, eq(tournament.id, legacyImport.tournamentId))
      .where(and(source, inArray(tournament.id, owner.ids), eq(legacyImport.sourceKind, 'tournament'), eq(tournament.publication, 'published')));
  const parsed = rows.flatMap((row) => {
    const details = readArchiveEditorial(row.metadata);
    return details && details.kind === row.sourceKind && details.sourceUrl === row.sourceUrl
      && (!('targetKind' in row) || details.kind === row.targetKind) ? [{ id: row.id, details }] : [];
  });
  const imageIds = [...new Set(parsed.flatMap(({ details }) => [details.logoAssetId, details.authorImageAssetId].filter((id): id is string => Boolean(id))))];
  const images = imageIds.length ? await db.select({ id: asset.id, variants: asset.variants }).from(asset)
    .where(and(inArray(asset.id, imageIds), isNull(asset.deletedAt), eq(asset.state, 'ready'))) : [];
  const byId = new Map(images.map((image) => [image.id, (image.variants as AssetVariants).full]));
  const image = (id: string | null) => { const full = id ? byId.get(id) : null; return id && full ? { assetId: id, width: full.width, height: full.height } : null; };
  for (const row of parsed) output.set(row.id, { ...row.details, logo: image(row.details.logoAssetId), authorImage: image(row.details.authorImageAssetId) });
  return output;
}
