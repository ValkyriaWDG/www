import { auditEvent, contentRevision, contentTranslation, manualCategory, taxonomyTerm } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FIXTURE_MANUAL_SLUGS, loadFixtures } from '@/fixtures';
import { ensureTestActors, TEST_ACTOR_IDS, type TestActors } from '@/fixtures/test-actors';
import { testPrincipal } from '@/modules/access/testing';
import { AccessDeniedError, type Principal } from '@/modules/access/types';
import { listTaxonomyOptions } from '@/modules/content/admin-queries';
import { createDocument, saveDraft } from '@/modules/content/editor';
import { getAvailableTaxonomy } from '@/modules/content/public';
import { sampleBody } from '@/modules/content/testing';
import { listManualCategoryOptions } from '@/modules/field-manual/admin';
import { getPublishedManualBySlug, listManualCategories, listPublishedManual } from '@/modules/field-manual/public';
import {
  archiveTaxonomyTerm,
  deleteTaxonomyTerm,
  getTaxonomyTermForAdmin,
  listTaxonomyForAdmin,
  restoreTaxonomyTerm,
  saveTaxonomyTerm,
  type SaveTaxonomyTermInput,
  type TaxonomyTermDTO,
} from '@/modules/taxonomy/admin';
import { runSeed } from '@/seed';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

/*
 * Taxonomy administration on PostgreSQL: scope authorization (platform-wide, HLL-only and
 * Wardogs-only editors), server-side validation, optimistic concurrency, archive/restore
 * visibility in the pickers and validation, referenced deletion and the public effect of
 * label changes. Seeded categories plus synthetic fixtures only.
 */

let t: TestDatabase;
let actors: TestActors;
let hllEditor: Principal;
let wdgEditor: Principal;
const HLL = 'hell-let-loose' as const;
const MANUAL = { scope: 'manual-category', game: HLL } as const;
const NEWS_CATEGORY = { scope: 'news-category' } as const;
const NEWS_TAG = { scope: 'news-tag' } as const;

type Failure = { code?: string; fieldErrors?: Record<string, string> };
const failure = <T,>(promise: Promise<T>): Promise<Failure | null> => promise.then(() => null, (error: unknown) => error as Failure);

const base = (overrides: Partial<SaveTaxonomyTermInput> = {}): SaveTaxonomyTermInput => ({
  scope: NEWS_TAG,
  id: null,
  key: 'synthetic-tag',
  labelCs: 'Syntetický štítek',
  labelEn: 'Synthetic tag',
  descriptionCs: '',
  descriptionEn: '',
  sortOrder: 100,
  ...overrides,
});

async function auditRows(action: string, outcome: 'success' | 'denied') {
  return t.db
    .select({ entityType: auditEvent.entityType, entityId: auditEvent.entityId, summary: auditEvent.summary, capability: auditEvent.capability })
    .from(auditEvent)
    .where(and(eq(auditEvent.action, action), eq(auditEvent.outcome, outcome)));
}

beforeAll(async () => {
  t = await createTestDatabase();
  actors = await ensureTestActors(t.db);
  hllEditor = testPrincipal(['editor'], { userId: TEST_ACTOR_IDS.editor, label: 'Synthetic HLL editor', games: [HLL] });
  wdgEditor = testPrincipal(['editor'], { userId: TEST_ACTOR_IDS.editor, label: 'Synthetic Wardogs editor', games: ['wardogs'] });
  await runSeed(t.db);
  await loadFixtures(t.db, { mediaRoot: `${process.cwd()}/.local/test-media-taxonomy-admin` });
});
afterAll(async () => {
  await t.drop();
});

describe('taxonomy overview per scope', () => {
  it('lists manual categories with article counts and the shared news taxonomy for a platform-wide editor', async () => {
    const overview = await listTaxonomyForAdmin(t.db, actors.editor);
    expect(overview.manual.map((entry) => entry.game)).toEqual([HLL]);
    const categories = overview.manual[0]!.categories;
    expect(categories.map((category) => category.key)).toEqual(['getting-started', 'communication', 'roles', 'leadership', 'vehicles', 'spawns']);
    expect(categories.find((category) => category.key === 'getting-started')).toMatchObject({ labelCs: 'Začínáme', archived: false });
    expect(categories.find((category) => category.key === 'getting-started')!.referenceCount).toBeGreaterThan(0);
    // `spawns` is referenced by the private draft fixture; `leadership` has no fixture article.
    expect(categories.find((category) => category.key === 'spawns')!.referenceCount).toBe(1);
    expect(categories.find((category) => category.key === 'leadership')!.referenceCount).toBe(0);
    expect(overview.news?.categories.map((category) => category.key)).toEqual(expect.arrayContaining(['announcement', 'match-report', 'community', 'update']));
    const tag = overview.news?.tags.find((candidate) => candidate.key === 'fixture-hll');
    expect(tag).toMatchObject({ labelCs: 'Ukázka HLL', labelEn: 'Sample HLL', archived: false });
    expect(tag!.referenceCount).toBeGreaterThan(0);
  });

  it('limits a game-scoped editor to the manual categories of that game', async () => {
    const hll = await listTaxonomyForAdmin(t.db, hllEditor);
    expect(hll.manual.map((entry) => entry.game)).toEqual([HLL]);
    expect(hll.news).toBeNull();
    const wdg = await listTaxonomyForAdmin(t.db, wdgEditor);
    expect(wdg.manual).toEqual([]);
    expect(wdg.news).toBeNull();
  });

  it('requires private content access', async () => {
    await expect(listTaxonomyForAdmin(t.db, actors.matchManager)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(listTaxonomyForAdmin(t.db, actors.anonymous)).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(saveTaxonomyTerm(t.db, actors.matchManager, base())).rejects.toBeInstanceOf(AccessDeniedError);
    // A read-intent session cannot mutate.
    await expect(saveTaxonomyTerm(t.db, { ...actors.editor, intent: 'read' }, base())).rejects.toBeInstanceOf(AccessDeniedError);
  });
});

describe('scope authorization', () => {
  it('lets an HLL-only editor manage HLL manual categories but denies news taxonomy, with an audit record', async () => {
    const created = await saveTaxonomyTerm(t.db, hllEditor, base({ scope: MANUAL, key: 'synthetic-hll', labelCs: 'Syntetická HLL', labelEn: 'Synthetic HLL', sortOrder: 70 }));
    expect(created).toMatchObject({ scope: MANUAL, key: 'synthetic-hll', referenceCount: 0, archived: false });
    const updated = await saveTaxonomyTerm(t.db, hllEditor, base({ scope: MANUAL, id: created.id, key: undefined, labelCs: 'Syntetická HLL 2', labelEn: 'Synthetic HLL 2', sortOrder: 71, expectedUpdatedAt: created.updatedAt }));
    expect(updated.labelCs).toBe('Syntetická HLL 2');
    await expect(getTaxonomyTermForAdmin(t.db, hllEditor, { scope: MANUAL, id: created.id })).resolves.toMatchObject({ key: 'synthetic-hll' });

    await expect(saveTaxonomyTerm(t.db, hllEditor, base({ key: 'synthetic-denied' }))).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(saveTaxonomyTerm(t.db, hllEditor, base({ scope: NEWS_CATEGORY, key: 'synthetic-denied' }))).rejects.toBeInstanceOf(AccessDeniedError);
    const [announcement] = await t.db.select().from(taxonomyTerm).where(and(eq(taxonomyTerm.kind, 'category'), eq(taxonomyTerm.key, 'announcement')));
    await expect(getTaxonomyTermForAdmin(t.db, hllEditor, { scope: NEWS_CATEGORY, id: announcement!.id })).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(archiveTaxonomyTerm(t.db, hllEditor, { scope: NEWS_CATEGORY, id: announcement!.id })).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(deleteTaxonomyTerm(t.db, hllEditor, { scope: NEWS_CATEGORY, id: announcement!.id })).rejects.toBeInstanceOf(AccessDeniedError);
    const denials = await auditRows('taxonomy.create', 'denied');
    expect(denials.some((row) => row.entityType === 'taxonomy_term' && (row.summary as { reason?: string }).reason === 'game_scope')).toBe(true);
    expect(await t.db.select().from(taxonomyTerm).where(eq(taxonomyTerm.key, 'synthetic-denied'))).toEqual([]);

    await deleteTaxonomyTerm(t.db, hllEditor, { scope: MANUAL, id: created.id });
    expect(await t.db.select().from(manualCategory).where(eq(manualCategory.key, 'synthetic-hll'))).toEqual([]);
  });

  it('denies a Wardogs-only editor every HLL manual category operation', async () => {
    const [roles] = await t.db.select().from(manualCategory).where(and(eq(manualCategory.game, HLL), eq(manualCategory.key, 'roles')));
    await expect(saveTaxonomyTerm(t.db, wdgEditor, base({ scope: MANUAL, key: 'synthetic-wdg' }))).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      saveTaxonomyTerm(t.db, wdgEditor, base({ scope: MANUAL, id: roles!.id, key: undefined, labelCs: 'X', labelEn: 'X', expectedUpdatedAt: roles!.updatedAt.toISOString() })),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(getTaxonomyTermForAdmin(t.db, wdgEditor, { scope: MANUAL, id: roles!.id })).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(archiveTaxonomyTerm(t.db, wdgEditor, { scope: MANUAL, id: roles!.id })).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(deleteTaxonomyTerm(t.db, wdgEditor, { scope: MANUAL, id: roles!.id })).rejects.toBeInstanceOf(AccessDeniedError);
    const [after] = await t.db.select().from(manualCategory).where(eq(manualCategory.id, roles!.id));
    expect(after).toMatchObject({ labelCs: 'Role', archivedAt: null });
    const denials = await auditRows('taxonomy.update', 'denied');
    expect(denials.some((row) => row.entityType === 'manual_category' && row.entityId === roles!.id)).toBe(true);
  });

  it('does not return a term through another scope', async () => {
    const [announcement] = await t.db.select().from(taxonomyTerm).where(and(eq(taxonomyTerm.kind, 'category'), eq(taxonomyTerm.key, 'announcement')));
    expect(await getTaxonomyTermForAdmin(t.db, actors.editor, { scope: NEWS_TAG, id: announcement!.id })).toBeNull();
    expect(await getTaxonomyTermForAdmin(t.db, actors.editor, { scope: MANUAL, id: announcement!.id })).toBeNull();
    expect((await failure(archiveTaxonomyTerm(t.db, actors.editor, { scope: NEWS_TAG, id: announcement!.id })))?.code).toBe('not_found');
  });
});

describe('server-side validation', () => {
  const invalid = async (overrides: Partial<SaveTaxonomyTermInput>, field: string, code: string) => {
    const error = await failure(saveTaxonomyTerm(t.db, actors.editor, base(overrides)));
    expect(error?.code, `${field} ${code}`).toBe('validation');
    expect(error?.fieldErrors?.[field]).toBe(code);
  };

  it('rejects empty, oversized, malformed, duplicate and out-of-range values', async () => {
    await invalid({ labelCs: '   ' }, 'labelCs', 'required');
    await invalid({ labelEn: 'x'.repeat(81) }, 'labelEn', 'too_long');
    await invalid({ descriptionCs: 'x'.repeat(301) }, 'descriptionCs', 'too_long');
    await invalid({ key: 'Bad Key' }, 'key', 'invalid_key');
    await invalid({ key: 'a'.repeat(65) }, 'key', 'too_long');
    await invalid({ key: undefined }, 'key', 'required');
    await invalid({ sortOrder: -1 }, 'sortOrder', 'out_of_range');
    await invalid({ sortOrder: 10_001 }, 'sortOrder', 'out_of_range');
    await invalid({ sortOrder: 1.5 }, 'sortOrder', 'invalid_number');
    await invalid({ scope: MANUAL, key: 'getting-started' }, 'key', 'duplicate_key');
    await invalid({ scope: NEWS_CATEGORY, key: 'announcement' }, 'key', 'duplicate_key');
    // A tag may reuse a category key (different kind), but not another tag's key.
    await invalid({ key: 'fixture-hll' }, 'key', 'duplicate_key');
    const [announcement] = await t.db.select().from(taxonomyTerm).where(and(eq(taxonomyTerm.kind, 'category'), eq(taxonomyTerm.key, 'announcement')));
    await invalid({ scope: NEWS_CATEGORY, id: announcement!.id, key: undefined, expectedUpdatedAt: undefined }, 'expectedUpdatedAt', 'required');
    expect(await t.db.select().from(taxonomyTerm).where(eq(taxonomyTerm.key, 'synthetic-tag'))).toEqual([]);
  });
});

describe('news tag lifecycle', () => {
  let tag: TaxonomyTermDTO;

  it('creates a tag, offers it in order and audits the creation', async () => {
    tag = await saveTaxonomyTerm(t.db, actors.editor, base({ sortOrder: 1, descriptionCs: 'Interní poznámka', descriptionEn: 'Internal note' }));
    expect(tag).toMatchObject({ scope: NEWS_TAG, key: 'synthetic-tag', sortOrder: 1, descriptionCs: 'Interní poznámka', referenceCount: 0, archived: false });
    const options = await listTaxonomyOptions(t.db, actors.editor);
    expect(options.tags[0]).toEqual({ key: 'synthetic-tag', labelCs: 'Syntetický štítek', labelEn: 'Synthetic tag', archived: false });
    const audit = await auditRows('taxonomy.create', 'success');
    expect(audit.find((row) => row.entityId === tag.id)).toMatchObject({ entityType: 'taxonomy_term', capability: 'content.edit', summary: { scope: 'news-tag', key: 'synthetic-tag', sortOrder: 1 } });
  });

  it('updates labels with the loaded version, keeps the key and rejects a stale version', async () => {
    const stale = tag.updatedAt;
    const updated = await saveTaxonomyTerm(t.db, actors.editor, base({ id: tag.id, key: 'renamed-key', labelCs: 'Štítek v2', labelEn: 'Tag v2', sortOrder: 2, expectedUpdatedAt: stale }));
    expect(updated).toMatchObject({ id: tag.id, key: 'synthetic-tag', labelCs: 'Štítek v2', labelEn: 'Tag v2', sortOrder: 2 });
    expect(updated.updatedAt).not.toBe(stale);
    const conflict = await failure(saveTaxonomyTerm(t.db, actors.editor, base({ id: tag.id, key: undefined, labelCs: 'Ztracená změna', expectedUpdatedAt: stale })));
    expect(conflict?.code).toBe('conflict');
    const [stored] = await t.db.select().from(taxonomyTerm).where(eq(taxonomyTerm.id, tag.id));
    expect(stored).toMatchObject({ key: 'synthetic-tag', labelCs: 'Štítek v2' });
    const audit = await auditRows('taxonomy.update', 'success');
    expect(audit.find((row) => row.entityId === tag.id)?.summary).toMatchObject({ key: 'synthetic-tag', sortOrder: 2, previousSortOrder: 1 });
    tag = updated;
  });

  it('lets exactly one of two concurrent edits with the same version win', async () => {
    const results = await Promise.all([
      failure(saveTaxonomyTerm(t.db, actors.editor, base({ id: tag.id, key: undefined, labelCs: 'Souběh A', expectedUpdatedAt: tag.updatedAt }))),
      failure(saveTaxonomyTerm(t.db, actors.editor, base({ id: tag.id, key: undefined, labelCs: 'Souběh B', expectedUpdatedAt: tag.updatedAt }))),
    ]);
    expect(results.filter((result) => result === null)).toHaveLength(1);
    expect(results.find((result) => result !== null)?.code).toBe('conflict');
    const [stored] = await t.db.select().from(taxonomyTerm).where(eq(taxonomyTerm.id, tag.id));
    expect(['Souběh A', 'Souběh B']).toContain(stored!.labelCs);
    tag = (await getTaxonomyTermForAdmin(t.db, actors.editor, { scope: NEWS_TAG, id: tag.id }))!;
  });

  it('archives the tag: hidden from new assignments, kept where already assigned, visible again after restore', async () => {
    const tagged = await createDocument(t.db, actors.editor, { kind: 'news', locale: 'cs', title: '[Synthetic] Označený', slug: 'synteticky-oznaceny', tagKeys: ['synthetic-tag'], fields: { body: sampleBody('Text.') } });
    const archived = await archiveTaxonomyTerm(t.db, actors.editor, { scope: NEWS_TAG, id: tag.id });
    expect(archived).toMatchObject({ archived: true, referenceCount: 1 });
    expect(archived.archivedAt).not.toBeNull();
    expect((await failure(archiveTaxonomyTerm(t.db, actors.editor, { scope: NEWS_TAG, id: tag.id })))?.code).toBe('invalid_state');

    expect((await listTaxonomyOptions(t.db, actors.editor)).tags.map((option) => option.key)).not.toContain('synthetic-tag');
    expect((await listTaxonomyOptions(t.db, actors.editor, { include: ['synthetic-tag'] })).tags.find((option) => option.key === 'synthetic-tag')).toMatchObject({ archived: true });
    expect((await listTaxonomyOptions(t.db, actors.editor, { includeArchived: true })).tags.map((option) => option.key)).toContain('synthetic-tag');

    // New assignment is rejected; the existing assignment survives a shared-field save.
    const rejected = await failure(createDocument(t.db, actors.editor, { kind: 'news', locale: 'cs', title: '[Synthetic] Nový', slug: 'synteticky-novy-archiv', tagKeys: ['synthetic-tag'] }));
    expect(rejected?.code).toBe('validation');
    expect(rejected?.fieldErrors?.tagKeys).toBe('archived_tag');
    const kept = await saveDraft(t.db, actors.editor, {
      translationId: tagged.translationId,
      expectedVersion: tagged.version,
      shared: { expectedDocumentVersion: tagged.documentVersion, tagKeys: ['synthetic-tag'], categoryKey: 'announcement' },
    });
    expect(kept.documentVersion).toBe(tagged.documentVersion + 1);
    const other = await createDocument(t.db, actors.editor, { kind: 'news', locale: 'cs', title: '[Synthetic] Jiný', slug: 'synteticky-jiny' });
    const otherRejected = await failure(saveDraft(t.db, actors.editor, { translationId: other.translationId, expectedVersion: other.version, shared: { expectedDocumentVersion: other.documentVersion, tagKeys: ['synthetic-tag'] } }));
    expect(otherRejected?.fieldErrors?.tagKeys).toBe('archived_tag');

    // Delete is refused while the tag is referenced; nothing is cascaded.
    const refused = await failure(deleteTaxonomyTerm(t.db, actors.editor, { scope: NEWS_TAG, id: tag.id }));
    expect(refused).toMatchObject({ code: 'conflict', fieldErrors: { _: 'referenced' } });
    expect(await t.db.select({ id: taxonomyTerm.id }).from(taxonomyTerm).where(eq(taxonomyTerm.id, tag.id))).toHaveLength(1);
    expect(await t.db.select({ id: contentTranslation.id }).from(contentTranslation).where(eq(contentTranslation.id, tagged.translationId))).toHaveLength(1);

    const restored = await restoreTaxonomyTerm(t.db, actors.editor, { scope: NEWS_TAG, id: tag.id });
    expect(restored).toMatchObject({ archived: false, archivedAt: null });
    expect((await listTaxonomyOptions(t.db, actors.editor)).tags.map((option) => option.key)).toContain('synthetic-tag');
    const audits = await Promise.all([auditRows('taxonomy.archive', 'success'), auditRows('taxonomy.restore', 'success')]);
    expect(audits[0].find((row) => row.entityId === tag.id)?.summary).toMatchObject({ key: 'synthetic-tag', archived: true, referenceCount: 1 });
    expect(audits[1].find((row) => row.entityId === tag.id)?.summary).toMatchObject({ key: 'synthetic-tag', archived: false });

    // Once unreferenced, the tag can be deleted and the deletion is audited.
    await saveDraft(t.db, actors.editor, { translationId: tagged.translationId, expectedVersion: kept.version, shared: { expectedDocumentVersion: kept.documentVersion, tagKeys: [] } });
    await expect(deleteTaxonomyTerm(t.db, actors.editor, { scope: NEWS_TAG, id: tag.id })).resolves.toEqual({ id: tag.id, key: 'synthetic-tag' });
    expect(await t.db.select().from(taxonomyTerm).where(eq(taxonomyTerm.id, tag.id))).toEqual([]);
    expect((await auditRows('taxonomy.delete', 'success')).find((row) => row.entityId === tag.id)?.summary).toMatchObject({ scope: 'news-tag', key: 'synthetic-tag' });
  });
});

describe('manual categories and the public manual', () => {
  it('applies label, description and order changes to the public manual immediately without touching the published snapshot', async () => {
    const [roles] = await t.db.select().from(manualCategory).where(and(eq(manualCategory.game, HLL), eq(manualCategory.key, 'roles')));
    const updated = await saveTaxonomyTerm(t.db, actors.editor, {
      scope: MANUAL,
      id: roles!.id,
      labelCs: 'Role (upraveno)',
      labelEn: 'Roles (edited)',
      descriptionCs: 'Upravený popis.',
      descriptionEn: 'Edited description.',
      sortOrder: 5,
      expectedUpdatedAt: roles!.updatedAt.toISOString(),
    });
    expect(updated.referenceCount).toBeGreaterThan(0);

    const categories = await listManualCategories(t.db, { locale: 'cs', game: HLL });
    expect(categories[0]).toMatchObject({ key: 'roles', label: 'Role (upraveno)', description: 'Upravený popis.' });
    expect((await listManualCategories(t.db, { locale: 'en', game: HLL })).find((category) => category.key === 'roles')).toBeUndefined();
    const list = await listPublishedManual(t.db, { locale: 'cs', game: HLL, category: 'roles' });
    expect(list.items[0]?.category).toEqual({ key: 'roles', label: 'Role (upraveno)' });
    const lookup = await getPublishedManualBySlug(t.db, { locale: 'cs', game: HLL, slug: FIXTURE_MANUAL_SLUGS.squadLeaderCs });
    expect(lookup?.kind === 'article' && lookup.article.category).toEqual({ key: 'roles', label: 'Role (upraveno)' });
    // The immutable published revision keeps its own snapshot label.
    const [snapshot] = await t.db
      .select({ taxonomy: contentRevision.taxonomy })
      .from(contentTranslation)
      .innerJoin(contentRevision, eq(contentRevision.id, contentTranslation.publishedRevisionId))
      .where(and(eq(contentTranslation.namespace, 'manual'), eq(contentTranslation.locale, 'cs'), eq(contentTranslation.liveSlug, FIXTURE_MANUAL_SLUGS.squadLeaderCs)));
    expect(snapshot?.taxonomy.category).toEqual({ key: 'roles', label: 'Role' });
  });

  it('keeps an archived category public for its published articles while hiding it from new assignments', async () => {
    const [roles] = await t.db.select().from(manualCategory).where(and(eq(manualCategory.game, HLL), eq(manualCategory.key, 'roles')));
    await archiveTaxonomyTerm(t.db, actors.editor, { scope: MANUAL, id: roles!.id });
    expect((await listManualCategories(t.db, { locale: 'cs', game: HLL })).map((category) => category.key)).toContain('roles');
    expect((await listManualCategoryOptions(t.db, actors.editor, HLL)).categories.map((option) => option.key)).not.toContain('roles');
    expect((await listManualCategoryOptions(t.db, actors.editor, HLL, { include: ['roles'] })).categories.find((option) => option.key === 'roles')).toMatchObject({ archived: true });
    expect((await listManualCategoryOptions(t.db, wdgEditor, HLL, { includeArchived: true })).categories).toEqual([]);
    const rejected = await failure(createDocument(t.db, actors.editor, { kind: 'manual', locale: 'cs', title: '[Synthetic] Archivovaná kategorie', game: HLL, categoryKey: 'roles' }));
    expect(rejected?.fieldErrors?.categoryKey).toBe('archived_category');
    const refused = await failure(deleteTaxonomyTerm(t.db, actors.editor, { scope: MANUAL, id: roles!.id }));
    expect(refused).toMatchObject({ code: 'conflict', fieldErrors: { _: 'referenced' } });
    await restoreTaxonomyTerm(t.db, actors.editor, { scope: MANUAL, id: roles!.id });
    expect((await listManualCategoryOptions(t.db, actors.editor, HLL)).categories.map((option) => option.key)).toContain('roles');
  });

  it('deletes only an unreferenced manual category', async () => {
    const category = await saveTaxonomyTerm(t.db, actors.editor, base({ scope: MANUAL, key: 'synthetic-delete', labelCs: 'Ke smazání', labelEn: 'To delete', sortOrder: 90 }));
    const created = await createDocument(t.db, actors.editor, { kind: 'manual', locale: 'cs', title: '[Synthetic] Ke smazání', game: HLL, categoryKey: 'synthetic-delete' });
    expect((await failure(deleteTaxonomyTerm(t.db, actors.editor, { scope: MANUAL, id: category.id })))?.fieldErrors?._).toBe('referenced');
    expect((await getTaxonomyTermForAdmin(t.db, actors.editor, { scope: MANUAL, id: category.id }))?.referenceCount).toBe(1);
    await saveDraft(t.db, actors.editor, { translationId: created.translationId, expectedVersion: created.version, shared: { expectedDocumentVersion: created.documentVersion, categoryKey: 'leadership' } });
    await expect(deleteTaxonomyTerm(t.db, actors.editor, { scope: MANUAL, id: category.id })).resolves.toEqual({ id: category.id, key: 'synthetic-delete' });
    expect(await t.db.select().from(manualCategory).where(eq(manualCategory.id, category.id))).toEqual([]);
    expect((await auditRows('taxonomy.delete', 'success')).find((row) => row.entityId === category.id)?.summary).toMatchObject({ scope: 'manual-category', game: HLL, key: 'synthetic-delete' });
  });
});

describe('news taxonomy and public filters', () => {
  it('renames a tag in the public filter facets immediately and keeps archived tags with published posts', async () => {
    const [fixtureTag] = await t.db.select().from(taxonomyTerm).where(and(eq(taxonomyTerm.kind, 'tag'), eq(taxonomyTerm.key, 'fixture-hll')));
    await saveTaxonomyTerm(t.db, actors.editor, {
      scope: NEWS_TAG,
      id: fixtureTag!.id,
      labelCs: 'Ukázka HLL (nově)',
      labelEn: 'Sample HLL (renamed)',
      descriptionCs: '',
      descriptionEn: '',
      sortOrder: 100,
      expectedUpdatedAt: fixtureTag!.updatedAt.toISOString(),
    });
    expect((await getAvailableTaxonomy('cs', t.db)).tags.find((tag) => tag.key === 'fixture-hll')?.label).toBe('Ukázka HLL (nově)');
    expect((await getAvailableTaxonomy('en', t.db)).tags.find((tag) => tag.key === 'fixture-hll')?.label).toBe('Sample HLL (renamed)');
    await archiveTaxonomyTerm(t.db, actors.editor, { scope: NEWS_TAG, id: fixtureTag!.id });
    expect((await getAvailableTaxonomy('cs', t.db)).tags.map((tag) => tag.key)).toContain('fixture-hll');
    expect((await listTaxonomyOptions(t.db, actors.editor)).tags.map((tag) => tag.key)).not.toContain('fixture-hll');
    await restoreTaxonomyTerm(t.db, actors.editor, { scope: NEWS_TAG, id: fixtureTag!.id });
  });
});
