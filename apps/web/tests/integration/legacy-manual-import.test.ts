import { auditEvent, contentTranslation, manualArticle } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureTestActors, type TestActors } from '@/fixtures/test-actors';
import { getEditorState } from '@/modules/content/editor';
import { publishTranslation } from '@/modules/content/publication';
import { listPublishedManual } from '@/modules/field-manual/public';
import { importLegacyManualDrafts } from '@/modules/legacy/import-manual';
import { runSeed } from '@/seed';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

/*
 * Legacy guide import creates private draft shells with provenance only: no body text is
 * fetched or invented, nothing becomes public, and re-running changes nothing.
 */

let t: TestDatabase;
let actors: TestActors;

beforeAll(async () => {
  t = await createTestDatabase();
  actors = await ensureTestActors(t.db);
});
afterAll(async () => {
  await t.drop();
});

describe('legacy manual draft import', () => {
  it('skips every guide until the manual categories are seeded', async () => {
    const report = await importLegacyManualDrafts(t.db);
    expect(report.created).toEqual([]);
    expect(report.skipped).toHaveLength(8);
  });

  it('reports without writing in a dry run, then creates eight private drafts with provenance', async () => {
    await runSeed(t.db);
    const dry = await importLegacyManualDrafts(t.db, { dryRun: true });
    expect(dry.created).toHaveLength(8);
    expect(await t.db.select().from(manualArticle)).toEqual([]);

    const report = await importLegacyManualDrafts(t.db, { now: new Date('2026-09-28T12:00:00Z') });
    expect(report.created).toEqual(['zakladni-nastaveni', 'herni-mody', 'role', 'vozidla', 'tanky', 'spawny', 'gameplay', 'prirucka-sl']);

    const [tank] = await t.db
      .select({ translation: contentTranslation, meta: manualArticle })
      .from(contentTranslation)
      .innerJoin(manualArticle, eq(manualArticle.documentId, contentTranslation.documentId))
      .where(and(eq(contentTranslation.namespace, 'manual'), eq(contentTranslation.draftSlug, 'tanky')));
    expect(tank?.translation.publishedRevisionId).toBeNull();
    expect(tank?.translation.liveSlug).toBeNull();
    expect(tank?.meta).toMatchObject({ sourceUrl: 'https://valkyriahll.cz/guide/tanky', sourcePublishedOn: '2025-01-25', sourceLanguage: 'sk', credits: 'Ninjonik' });

    const state = await getEditorState(t.db, { ...actors.editor, intent: 'read' }, { translationId: tank!.translation.id });
    expect(state.document).toMatchObject({ kind: 'manual', game: 'hell-let-loose', categoryKey: 'vehicles' });
    expect(state.translations.cs?.draft?.body).toEqual({ type: 'doc', content: [] });

    expect((await listPublishedManual(t.db, { locale: 'cs', game: 'hell-let-loose' })).total).toBe(0);
    const audits = await t.db.select().from(auditEvent).where(eq(auditEvent.action, 'legacy.manual.import'));
    expect(audits).toHaveLength(8);
  });

  it('cannot be published before an editor adds a summary and body', async () => {
    const [row] = await t.db.select().from(contentTranslation).where(and(eq(contentTranslation.namespace, 'manual'), eq(contentTranslation.draftSlug, 'gameplay')));
    const error = await publishTranslation(t.db, actors.editor, { translationId: row!.id, expectedVersion: row!.version }).then(
      () => null,
      (e: unknown) => e as { code?: string; fieldErrors?: Record<string, string> },
    );
    expect(error?.code).toBe('validation');
    expect(error?.fieldErrors).toMatchObject({ excerpt: 'required' });
  });

  it('is idempotent and never overwrites existing drafts', async () => {
    const again = await importLegacyManualDrafts(t.db);
    expect(again.created).toEqual([]);
    expect(again.skipped).toHaveLength(8);
    expect(await t.db.select().from(manualArticle)).toHaveLength(8);
  });
});
