import 'server-only';
import { contentDocument, contentRevision, contentTranslation, legacyImport, manualArticle, type Executor } from '@valkyria/db';
import { and, eq, or } from 'drizzle-orm';
import { createDocument, saveDraft } from '@/modules/content/editor';
import { publishTranslation } from '@/modules/content/publication';
import { parseRichTextDocument, plainTextExcerpt } from '@/modules/content/rich-text/schema';
import { SEED_PAGES } from '@/seed/pages';
import { sourceHash, type ImportDocument } from './import-contract';
import { findIdentity, IMPORT_ACTOR, recordIdentity, type ImportContext, type ImportReportItem } from './import-shared';
import { importTagKeys } from './import-tags';

export function remapBodyAssets(value: unknown, media: Map<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => remapBodyAssets(item, media));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (key === 'assetId' && typeof item === 'string') {
        const id = media.get(item);
        if (!id) throw new Error('Unresolved migration media');
        return [key, id];
      }
      return [key, remapBodyAssets(item, media)];
    }));
  }
  return value;
}

export function importCover(document: ImportDocument, context: ImportContext) {
  if (!document.coverAssetId) return null;
  const assetId = context.media.get(document.coverAssetId);
  if (!assetId) throw new Error('Unresolved migration cover');
  const descriptor = context.bundle.media.find((item) => item.id === document.coverAssetId);
  return { assetId, alt: descriptor?.alt || document.title, caption: '', decorative: false };
}

/** Only untouched seed pages and explicitly empty legacy shells can be adopted. */
function isAdoptable(document: ImportDocument, row: typeof contentTranslation.$inferSelect, revision: typeof contentRevision.$inferSelect | undefined): boolean {
  if (!revision || row.version !== 1) return false;
  if (document.kind === 'page' && document.metadata.pageKey) {
    const seed = SEED_PAGES[document.metadata.pageKey].cs;
    return revision.kind === 'seed' && revision.createdByLabel === 'seed' && sourceHash(revision.body) === sourceHash(seed.body) && revision.title === seed.title;
  }
  return document.kind === 'manual' && !row.publishedRevisionId && revision.createdByLabel === 'legacy-manual-import' && revision.excerpt === '' && Array.isArray(revision.body.content) && revision.body.content.length === 0;
}

export async function importContentRecord(db: Executor, context: ImportContext, document: ImportDocument): Promise<ImportReportItem> {
  if (document.kind === 'tournament') throw new Error('Tournament has a separate importer');
  const namespace = document.kind;
  const identity = { kind: document.kind, key: document.legacyId, hash: sourceHash(document), sourceUrl: document.sourceUrl, sourcePublishedOn: document.sourcePublishedOn, sourceLanguage: document.sourceLanguage, credits: document.credits, sourceMetadata: { sourceModifiedOn: document.sourceModifiedOn, tags: document.tags, metadata: document.metadata, warnings: document.warnings } };
  const base = { kind: identity.kind, key: identity.key };
  return db.transaction(async (tx) => {
    const imported = await findIdentity(tx, context, identity);
    if (imported) {
      if (imported.sourceSha256 !== identity.hash) return { ...base, action: 'conflict', reason: 'source_changed_since_import' };
      const [target] = await tx.select().from(contentTranslation).where(eq(contentTranslation.id, imported.translationId!));
      if (!target) return { ...base, action: 'conflict', reason: 'imported_target_missing' };
      if (context.options.publish && !document.metadata.archive && !target.publishedRevisionId) {
        if (target.version !== imported.importedVersion) return { ...base, action: 'conflict', reason: 'edited_draft_not_published_by_migration', targetId: target.id };
        if (context.options.apply) {
          const result = await publishTranslation(tx, IMPORT_ACTOR, { translationId: target.id, expectedVersion: target.version });
          await tx.update(legacyImport).set({ importedVersion: result.version }).where(eq(legacyImport.id, imported.id));
        }
        return { ...base, action: 'publish', targetId: target.id };
      }
      return { ...base, action: 'unchanged', targetId: target.id, ...(target.version !== imported.importedVersion ? { reason: 'editorial_changes_preserved' } : {}) };
    }
    const [existing] = await tx.select({ translation: contentTranslation, document: contentDocument }).from(contentTranslation)
      .innerJoin(contentDocument, eq(contentDocument.id, contentTranslation.documentId))
      .where(and(eq(contentTranslation.locale, 'cs'), eq(contentTranslation.namespace, namespace),
        document.kind === 'page' ? eq(contentDocument.pageKey, document.metadata.pageKey!) : or(eq(contentTranslation.draftSlug, document.slug), eq(contentTranslation.liveSlug, document.slug)),
      )).limit(1);
    if (existing) {
      const [revision] = existing.translation.draftRevisionId ? await tx.select().from(contentRevision).where(eq(contentRevision.id, existing.translation.draftRevisionId)) : [];
      if (!context.options.adoptSeed || !isAdoptable(document, existing.translation, revision)) return { ...base, action: 'conflict', reason: 'existing_content_requires_editorial_review', targetId: existing.translation.id };
      if (existing.document.archivedAt || existing.translation.archivedAt || existing.document.version !== 1) return { ...base, action: 'conflict', reason: 'existing_content_modified' };
    } else if (document.kind === 'page') return { ...base, action: 'conflict', reason: 'run_production_seed_first' };

    let body = remapBodyAssets(document.body, context.media);
    // Preserve the unified platform introduction; add the historical HLL information below it.
    if (document.kind === 'page' && document.metadata.pageKey === 'clan') {
      body = { type: 'doc', content: [...(SEED_PAGES.clan.cs.body.content ?? []), { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Hell Let Loose — historie komunity' }] }, ...document.body.content.map((item) => remapBodyAssets(item, context.media))] };
    }
    const parsed = parseRichTextDocument(body);
    if (!parsed.ok) throw new Error('Invalid remapped body');
    const fields = {
      title: document.kind === 'page' && document.metadata.pageKey === 'clan' ? SEED_PAGES.clan.cs.title : document.title,
      slug: document.kind === 'page' ? document.metadata.pageKey! : document.slug,
      excerpt: document.excerpt || plainTextExcerpt(parsed.doc, 600), body: parsed.doc, cover: importCover(document, context),
      authorLabel: document.authorLabel || document.credits.slice(0, 120), seoTitle: document.title.slice(0, 120), seoDescription: (document.excerpt || plainTextExcerpt(parsed.doc, 320)).slice(0, 320),
    };
    const tagKeys = await importTagKeys(tx, document.tags, Boolean(context.options.apply));
    if (!context.options.apply) return { ...base, action: existing ? 'adopt' : 'create' };
    const result = existing
      ? await saveDraft(tx, IMPORT_ACTOR, { translationId: existing.translation.id, expectedVersion: existing.translation.version, fields, ...(tagKeys.length ? { shared: { expectedDocumentVersion: existing.document.version, tagKeys } } : {}) })
      : await createDocument(tx, IMPORT_ACTOR, { kind: document.kind as 'news' | 'manual', locale: 'cs', title: fields.title, slug: fields.slug, game: document.game, categoryKey: document.metadata.categoryKey ?? (document.kind === 'news' ? 'announcement' : null), tagKeys, fields });
    if (document.kind === 'manual') await tx.update(manualArticle).set({
      sourceUrl: document.sourceUrl, sourcePublishedOn: document.sourcePublishedOn, sourceLanguage: document.sourceLanguage,
      credits: document.credits, sortOrder: document.metadata.sortOrder ?? 100, reviewedAt: null,
    }).where(eq(manualArticle.documentId, result.documentId));
    if (document.sourcePublishedOn) await tx.update(contentTranslation).set({ firstPublishedAt: new Date(`${document.sourcePublishedOn}T00:00:00Z`) }).where(eq(contentTranslation.id, result.translationId));
    let version = result.version;
    if (context.options.publish && !document.metadata.archive) version = (await publishTranslation(tx, IMPORT_ACTOR, { translationId: result.translationId, expectedVersion: version })).version;
    if (document.metadata.archive) await tx.update(contentDocument).set({ archivedAt: new Date(context.bundle.observedAt) }).where(eq(contentDocument.id, result.documentId));
    await recordIdentity(tx, context, identity, { translationId: result.translationId, importedVersion: version });
    return { ...base, action: existing ? 'adopt' : 'create', targetId: result.translationId };
  });
}
