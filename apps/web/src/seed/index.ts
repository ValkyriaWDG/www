import {
  contentDocument,
  contentRevision,
  contentTranslation,
  LOCALES,
  manualCategory,
  PAGE_KEYS,
  taxonomyTerm,
  type Database,
  type Executor,
} from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import type { Actor } from '../modules/access/types';
import { recordAudit } from '../modules/audit/audit';
import { SEED_AUTHOR_LABEL, SEED_DRAFT_ONLY_PAGES, SEED_PAGES } from './pages';
import { imageAssetIds, SEED_RICH_TEXT_SCHEMA_VERSION } from './rich-text';
import { SEED_CATEGORIES, SEED_MANUAL_CATEGORIES } from './taxonomy';

/*
 * Production seed: reviewed public content only, inserted when missing by stable keys
 * (page key + locale, taxonomy kind + key). Existing rows are never updated, so content
 * edited by administrators is preserved and re-running changes nothing. No accounts,
 * grants, fixtures or settings are created. Pages without reviewed copy (the FAQ) are
 * created as unpublished drafts only.
 */

export type SeedReport = { inserted: string[]; skipped: string[] };

const SEED_ACTOR: Actor = { kind: 'system', label: 'seed', capabilities: new Set() };

/**
 * Inserts the reviewed news and field manual categories that are missing. `manual: false`
 * leaves out the field manual categories for a schema that predates their table.
 */
export async function ensureSeedTaxonomy(
  db: Executor,
  report: SeedReport = { inserted: [], skipped: [] },
  options: { manual?: boolean } = {},
): Promise<SeedReport> {
  for (const category of SEED_CATEGORIES) {
    const rows = await db
      .insert(taxonomyTerm)
      .values({ kind: 'category', key: category.key, labelCs: category.labelCs, labelEn: category.labelEn })
      .onConflictDoNothing({ target: [taxonomyTerm.kind, taxonomyTerm.key] })
      .returning({ id: taxonomyTerm.id });
    (rows.length > 0 ? report.inserted : report.skipped).push(`taxonomy category ${category.key}`);
  }
  for (const category of options.manual === false ? [] : SEED_MANUAL_CATEGORIES) {
    const rows = await db
      .insert(manualCategory)
      .values({ ...category })
      .onConflictDoNothing({ target: [manualCategory.game, manualCategory.key] })
      .returning({ id: manualCategory.id });
    (rows.length > 0 ? report.inserted : report.skipped).push(`manual category ${category.game}/${category.key}`);
  }
  return report;
}

async function seedPage(db: Database, pageKey: (typeof PAGE_KEYS)[number], report: SeedReport, now: Date) {
  await db.transaction(async (tx) => {
    let [document] = await tx.select({ id: contentDocument.id }).from(contentDocument).where(eq(contentDocument.pageKey, pageKey)).for('update');
    if (!document) {
      [document] = await tx.insert(contentDocument).values({ kind: 'page', pageKey }).returning({ id: contentDocument.id });
      report.inserted.push(`page ${pageKey} document`);
    }
    for (const locale of LOCALES) {
      const label = `page ${pageKey} (${locale})`;
      const [existing] = await tx
        .select({ id: contentTranslation.id })
        .from(contentTranslation)
        .where(and(eq(contentTranslation.documentId, document!.id), eq(contentTranslation.locale, locale)))
        .limit(1);
      if (existing) {
        report.skipped.push(`${label}: already present`);
        continue;
      }
      const copy = SEED_PAGES[pageKey][locale];
      const publish = !SEED_DRAFT_ONLY_PAGES.has(pageKey);
      const [translation] = await tx
        .insert(contentTranslation)
        .values({ documentId: document!.id, locale, namespace: 'page', draftSlug: pageKey })
        .returning({ id: contentTranslation.id });
      const [revision] = await tx
        .insert(contentRevision)
        .values({
          translationId: translation!.id,
          locale,
          kind: 'seed',
          schemaVersion: SEED_RICH_TEXT_SCHEMA_VERSION,
          title: copy.title,
          slug: pageKey,
          excerpt: copy.excerpt,
          body: copy.body,
          cover: null,
          taxonomy: { category: null, tags: [], game: null },
          authorLabel: SEED_AUTHOR_LABEL,
          seoTitle: copy.seoTitle,
          seoDescription: copy.seoDescription,
          assetIds: imageAssetIds(copy.body),
          createdByLabel: 'seed',
        })
        .returning({ id: contentRevision.id });
      await tx
        .update(contentTranslation)
        .set(
          publish
            ? { draftRevisionId: revision!.id, publishedRevisionId: revision!.id, liveSlug: pageKey, publishedAt: now, firstPublishedAt: now, updatedAt: now }
            : { draftRevisionId: revision!.id, updatedAt: now },
        )
        .where(eq(contentTranslation.id, translation!.id));
      await recordAudit(tx, {
        actor: SEED_ACTOR,
        action: 'seed.page.insert',
        outcome: 'success',
        entityType: 'content_document',
        entityId: document!.id,
        translationId: translation!.id,
        locale,
        summary: { pageKey, revisionId: revision!.id, published: publish },
      });
      report.inserted.push(publish ? label : `${label} draft`);
    }
  });
}

/** Idempotent production seed. Safe to run on every deployment. */
export async function runSeed(db: Database, options: { now?: Date } = {}): Promise<SeedReport> {
  const now = options.now ?? new Date();
  const report: SeedReport = { inserted: [], skipped: [] };
  await db.transaction(async (tx) => {
    await ensureSeedTaxonomy(tx, report);
  });
  for (const pageKey of PAGE_KEYS) await seedPage(db, pageKey, report, now);
  return report;
}
