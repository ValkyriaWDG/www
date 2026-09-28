import { contentDocument, contentRevision, contentTranslation, manualArticle, manualCategory, type Database } from '@valkyria/db';
import { and, eq, or } from 'drizzle-orm';
import type { Actor } from '@/modules/access/types';
import { recordAudit } from '@/modules/audit/audit';
import { SEED_RICH_TEXT_SCHEMA_VERSION } from '@/seed/rich-text';
import { LEGACY_GUIDES, LEGACY_HLL_ORIGIN, type LegacyGuide } from './hll';

/**
 * Creates private Czech draft shells for the eight legacy HLL guides: working title,
 * legacy slug, category and provenance (source URL, date, language, credits). The body
 * and summary stay empty — nothing is invented and publication is blocked until an editor
 * adds reviewed content. Idempotent by slug; existing drafts or articles are never changed.
 */

export type LegacyImportReport = { created: string[]; skipped: string[] };

const IMPORT_ACTOR: Actor = { kind: 'system', label: 'legacy-manual-import', capabilities: new Set() };
const HLL = 'hell-let-loose' as const;

export function legacyGuideUrl(guide: LegacyGuide): string {
  return `${LEGACY_HLL_ORIGIN}/guide/${guide.slug}`;
}

export async function importLegacyManualDrafts(db: Database, options: { dryRun?: boolean; now?: Date } = {}): Promise<LegacyImportReport> {
  const now = options.now ?? new Date();
  const report: LegacyImportReport = { created: [], skipped: [] };
  for (const guide of LEGACY_GUIDES) {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: contentTranslation.id })
        .from(contentTranslation)
        .where(
          and(
            eq(contentTranslation.namespace, 'manual'),
            eq(contentTranslation.locale, 'cs'),
            or(eq(contentTranslation.draftSlug, guide.slug), eq(contentTranslation.liveSlug, guide.slug)),
          ),
        )
        .limit(1);
      if (existing) {
        report.skipped.push(`${guide.slug}: a Czech manual translation with this slug exists`);
        return;
      }
      const [category] = await tx
        .select({ labelCs: manualCategory.labelCs })
        .from(manualCategory)
        .where(and(eq(manualCategory.game, HLL), eq(manualCategory.key, guide.category)));
      if (!category) {
        report.skipped.push(`${guide.slug}: manual category ${guide.category} is missing (run the seed first)`);
        return;
      }
      if (options.dryRun) {
        report.created.push(`${guide.slug} (dry run)`);
        return;
      }
      const [document] = await tx
        .insert(contentDocument)
        .values({ kind: 'manual', game: HLL, categoryKey: guide.category, tagKeys: [], createdAt: now, updatedAt: now })
        .returning({ id: contentDocument.id });
      await tx.insert(manualArticle).values({
        documentId: document!.id,
        sortOrder: guide.sortOrder,
        sourceUrl: legacyGuideUrl(guide),
        sourcePublishedOn: guide.sourcePublishedOn,
        sourceLanguage: guide.sourceLanguage,
        credits: guide.credits,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const [translation] = await tx
        .insert(contentTranslation)
        .values({ documentId: document!.id, locale: 'cs', namespace: 'manual', draftSlug: guide.slug, createdAt: now, updatedAt: now })
        .returning({ id: contentTranslation.id });
      const [revision] = await tx
        .insert(contentRevision)
        .values({
          translationId: translation!.id,
          locale: 'cs',
          kind: 'save',
          schemaVersion: SEED_RICH_TEXT_SCHEMA_VERSION,
          title: guide.workingTitle,
          slug: guide.slug,
          excerpt: '',
          body: { type: 'doc', content: [] },
          cover: null,
          taxonomy: { category: { key: guide.category, label: category.labelCs }, tags: [], game: HLL },
          authorLabel: '',
          seoTitle: '',
          seoDescription: '',
          assetIds: [],
          createdByLabel: 'legacy-manual-import',
          createdAt: now,
        })
        .returning({ id: contentRevision.id });
      await tx.update(contentTranslation).set({ draftRevisionId: revision!.id }).where(eq(contentTranslation.id, translation!.id));
      await recordAudit(tx, {
        actor: IMPORT_ACTOR,
        action: 'legacy.manual.import',
        outcome: 'success',
        entityType: 'content_document',
        entityId: document!.id,
        translationId: translation!.id,
        locale: 'cs',
        summary: { slug: guide.slug, sourceUrl: legacyGuideUrl(guide), sourcePublishedOn: guide.sourcePublishedOn },
      });
      report.created.push(guide.slug);
    });
  }
  return report;
}
