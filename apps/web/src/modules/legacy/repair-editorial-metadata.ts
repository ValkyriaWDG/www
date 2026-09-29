import 'server-only';
import { asset, contentDocument, contentTranslation, legacyImport, tournament, type Executor } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '@/modules/audit/audit';
import { archiveEditorialSchema, type EditorialSupplement } from './editorial-details';
import { sourceHash, type ImportDocument, type ImportMedia } from './import-contract';
import { findIdentity, IMPORT_ACTOR, type ImportContext, type ImportReportItem } from './import-shared';

/** Resolve only an unchanged, ready media import; never trust a raw placeholder as a target ID. */
async function importedAsset(tx: Executor, context: ImportContext, descriptor: ImportMedia | undefined, supplemental: boolean): Promise<string | null> {
  if (!descriptor) return null;
  const [entry] = await tx.select().from(legacyImport).where(and(
    eq(legacyImport.sourceOrigin, context.bundle.sourceOrigin), eq(legacyImport.sourceKind, 'media'),
    eq(legacyImport.sourceKey, descriptor.id), eq(legacyImport.locale, 'cs'),
  ));
  if (!entry && supplemental && !context.options.apply) return descriptor.id;
  if (!entry || entry.sourceSha256 !== sourceHash(descriptor) || entry.sourceUrl !== descriptor.sourceUrl || !entry.assetId) throw new Error('Editorial source media identity mismatch');
  const [image] = await tx.select().from(asset).where(eq(asset.id, entry.assetId));
  if (!image || image.state !== 'ready' || image.deletedAt) throw new Error('Editorial source media unavailable');
  return image.id;
}

/** Add missing source facts without mutating current editorial content, publication or the original hash. */
export async function repairEditorialMetadata(db: Executor, context: ImportContext, document: ImportDocument, supplement?: EditorialSupplement): Promise<ImportReportItem> {
  const base = { kind: document.kind, key: document.legacyId };
  if (supplement && (supplement.bundleSha256 !== sourceHash(context.bundle) || supplement.sourceRevision !== context.bundle.sourceRevision)) return { ...base, action: 'conflict', reason: 'editorial_supplement_bundle_mismatch' };
  const extra = supplement?.documents.find((item) => item.kind === document.kind && item.legacyId === document.legacyId);
  return db.transaction(async (tx) => {
    const entry = await findIdentity(tx, context, { kind: document.kind, key: document.legacyId, hash: sourceHash(document), sourceUrl: document.sourceUrl });
    if (!entry || entry.sourceSha256 !== sourceHash(document) || entry.sourceUrl !== document.sourceUrl) return { ...base, action: 'conflict', reason: 'editorial_source_identity_mismatch' };
    if (document.kind === 'tournament') {
      const [target] = entry.tournamentId ? await tx.select().from(tournament).where(eq(tournament.id, entry.tournamentId)).for('update') : [];
      if (!target || target.game !== document.game) return { ...base, action: 'conflict', reason: 'editorial_target_missing_or_mismatched' };
    } else {
      const [target] = entry.translationId ? await tx.select({ kind: contentDocument.kind, locale: contentTranslation.locale }).from(contentTranslation)
        .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId)).where(eq(contentTranslation.id, entry.translationId)) : [];
      if (!target || target.kind !== document.kind || target.locale !== document.locale) return { ...base, action: 'conflict', reason: 'editorial_target_missing_or_mismatched' };
    }
    const logo = context.bundle.media.find((item) => item.id === document.metadata.logoAssetId);
    if (document.metadata.logoAssetId && !logo) return { ...base, action: 'conflict', reason: 'editorial_logo_media_missing' };
    const authorImage = extra?.authorImageSourceUrl ? supplement?.media.find((item) => item.sourceUrl === extra.authorImageSourceUrl) : undefined;
    if (extra?.authorImageSourceUrl && !authorImage) return { ...base, action: 'conflict', reason: 'editorial_author_media_missing' };
    const details = archiveEditorialSchema.parse({
      schemaVersion: 1, kind: document.kind, sourceUrl: document.sourceUrl, sourceLanguage: document.sourceLanguage,
      sourcePublishedOn: document.sourcePublishedOn, sourceModifiedOn: document.sourceModifiedOn,
      sourceAuthorLabel: document.authorLabel || document.credits.slice(0, 120), excerpt: document.excerpt,
      tag: document.metadata.tag ?? '', series: document.metadata.series ?? '',
      logoAssetId: await importedAsset(tx, context, logo, false), authorImageAssetId: await importedAsset(tx, context, authorImage, true),
      coverSourceUrl: !document.coverAssetId ? extra?.coverSourceUrl ?? null : null,
      thumbnailSourceUrl: extra?.thumbnailSourceUrl ?? null, sourceIndex: extra?.sourceIndex ?? null,
      warnings: document.sourceModifiedOn && document.sourcePublishedOn && document.sourceModifiedOn < document.sourcePublishedOn ? ['modified_before_published'] : [],
    });
    const hash = sourceHash(details);
    if (entry.sourceMetadata.archiveEditorial !== undefined || entry.sourceMetadata.archiveEditorialSha256 !== undefined) {
      return entry.sourceMetadata.archiveEditorialSha256 === hash && sourceHash(entry.sourceMetadata.archiveEditorial) === hash
        ? { ...base, action: 'unchanged', targetId: entry.tournamentId ?? entry.translationId! }
        : { ...base, action: 'conflict', reason: 'editorial_metadata_already_differs' };
    }
    if (context.options.apply) {
      await tx.update(legacyImport).set({ sourceMetadata: { ...entry.sourceMetadata, archiveEditorial: details, archiveEditorialSha256: hash } }).where(eq(legacyImport.id, entry.id));
      await recordAudit(tx, { actor: IMPORT_ACTOR, action: 'legacy.editorial.metadata_repair', outcome: 'success', entityType: 'legacy_import', entityId: entry.id, summary: { sourceKind: document.kind, sourceKey: document.legacyId, detailsSha256: hash } });
    }
    return { ...base, action: 'repair', targetId: entry.tournamentId ?? entry.translationId! };
  });
}
