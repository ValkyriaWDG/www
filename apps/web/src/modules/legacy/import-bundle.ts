import 'server-only';
import { asset, type Executor } from '@valkyria/db';
import { eq } from 'drizzle-orm';
import { processImage } from '@/modules/media/image';
import { uploadImage } from '@/modules/media/library';
import { importContentRecord } from './import-content';
import { importMatchRecord, importTournamentRecord } from './import-community';
import { importBundleSchema, readBundleFile, sourceHash } from './import-contract';
import { parseEditorialSupplement } from './editorial-details';
import { repairEditorialMetadata } from './repair-editorial-metadata';
import { repairMatchMetadata } from './repair-match-metadata';
import { findIdentity, importFailure, IMPORT_ACTOR, recordIdentity, type ImportContext, type ImportOptions, type ImportReportItem } from './import-shared';

/** Operator CLI entrypoint. One atomic transaction per entity; every rerun preserves edits. */
export async function importLegacyBundle(db: Executor, input: unknown, root: string, options: ImportOptions = {}) {
  const bundle = importBundleSchema.parse(input);
  const repairing = Boolean(options.repairMatchMetadata || options.repairEditorialMetadata);
  if (repairing && (options.publish || options.adoptSeed)) throw new Error('Metadata repair cannot publish or adopt seeded content');
  if (options.editorialSupplement !== undefined && !options.repairEditorialMetadata) throw new Error('Editorial supplement requires metadata repair');
  const supplement = options.editorialSupplement === undefined ? undefined : parseEditorialSupplement(options.editorialSupplement);
  // Check the entire supplement before importing even one supplemental media file.
  if (supplement && (supplement.bundleSha256 !== sourceHash(bundle) || supplement.sourceRevision !== bundle.sourceRevision)) throw new Error('Editorial supplement does not match the reviewed bundle');
  if (supplement?.documents.some((extra) => !bundle.documents.some((document) => document.kind === extra.kind && document.legacyId === extra.legacyId))) throw new Error('Editorial supplement references an unknown document');
  if (supplement?.media.some((extra) => bundle.media.some((original) => original.id === extra.id && sourceHash(original) !== sourceHash(extra)))) throw new Error('Editorial supplement changes an original media identity');
  const context: ImportContext = { bundle, root, options, media: new Map(), report: [] };
  const matchIds = bundle.matches.map((row) => row.id);
  if (new Set(matchIds).size !== matchIds.length) throw new Error('Duplicate legacy match identity');
  if (bundle.scoreboardSources.some((source) => !matchIds.includes(source.legacyMatchId))) throw new Error('Scoreboard is not associated with a public legacy match');

  // Repair is additive only: never import ordinary documents, matches or original
  // media as a side effect. Explicit supplemental media uses the same intake gate.
  for (const media of repairing ? supplement?.media ?? [] : bundle.media) {
    const base = { kind: 'media', key: media.id };
    if (media.rightsStatus !== 'legacy-published-owner-migration') {
      context.report.push({ ...base, action: 'skipped', reason: 'external_media_preserved_as_source_link' });
      continue;
    }
    try {
      const bytes = await readBundleFile(repairing ? options.editorialSupplementRoot ?? root : root, { relativeFile: media.relativeFile!, bytes: media.bytes!, sha256: media.sha256! }, 15 * 1024 * 1024);
      const identity = { kind: 'media' as const, key: media.id, hash: sourceHash(media), sourceUrl: media.sourceUrl };
      const result = await db.transaction(async (tx): Promise<ImportReportItem> => {
        const previous = await findIdentity(tx, context, identity);
        if (previous) {
          if (previous.sourceSha256 !== identity.hash) return { ...base, action: 'conflict', reason: 'source_media_changed' };
          const [row] = await tx.select().from(asset).where(eq(asset.id, previous.assetId!));
          if (!row || row.deletedAt || row.state !== 'ready') return { ...base, action: 'conflict', reason: 'imported_media_unavailable' };
          context.media.set(media.id, row.id);
          return { ...base, action: 'unchanged', targetId: row.id };
        }
        if (!options.apply) {
          await processImage(bytes);
          context.media.set(media.id, media.id);
          return { ...base, action: 'create' };
        }
        const uploaded = await uploadImage(tx, IMPORT_ACTOR, {
          bytes, filename: media.relativeFile!, scope: 'editorial', provenance: media.sourceUrl,
          rights: 'Migration of owner-authorized content already published on the legacy Valkyria website; third-party rights remain with their authors.',
          defaultAltCs: media.alt,
        }, { mediaRoot: options.mediaRoot });
        await recordIdentity(tx, context, identity, { assetId: uploaded.id });
        context.media.set(media.id, uploaded.id);
        return { ...base, action: 'create', targetId: uploaded.id };
      });
      context.report.push(result);
    } catch (error) { context.report.push({ ...base, action: 'invalid', reason: importFailure(error) }); }
  }
  // Competitions precede their matches; documents are independent of their extraction order.
  for (const document of [...bundle.documents].sort((a, b) => Number(b.kind === 'tournament') - Number(a.kind === 'tournament'))) {
    if (repairing && !options.repairEditorialMetadata) continue;
    try {
      context.report.push(repairing ? await repairEditorialMetadata(db, context, document, supplement) : document.kind === 'tournament' ? await importTournamentRecord(db, context, document) : await importContentRecord(db, context, document));
    } catch (error) { context.report.push({ kind: document.kind, key: document.legacyId, action: 'invalid', reason: importFailure(error) }); }
  }
  for (const row of bundle.matches) {
    if (repairing && !options.repairMatchMetadata) continue;
    try { context.report.push(repairing ? await repairMatchMetadata(db, context, row) : await importMatchRecord(db, context, row)); }
    catch (error) { context.report.push({ kind: 'match', key: String(row.id).slice(0, 100), action: 'invalid', reason: importFailure(error) }); }
  }
  const counts: Record<string, number> = {};
  for (const item of context.report) counts[`${item.kind}:${item.action}`] = (counts[`${item.kind}:${item.action}`] ?? 0) + 1;
  return { apply: Boolean(options.apply), publish: Boolean(options.publish), repairMatchMetadata: Boolean(options.repairMatchMetadata), repairEditorialMetadata: Boolean(options.repairEditorialMetadata), matchClock: options.matchClock ?? 'legacy-fixed-offset', sourceRevision: bundle.sourceRevision, observedAt: bundle.observedAt, counts, items: context.report };
}
