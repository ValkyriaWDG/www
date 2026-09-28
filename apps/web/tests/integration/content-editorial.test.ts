import { auditEvent, contentRevision, contentTranslation, taxonomyTerm } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainError } from '@/lib/result';
import { testPrincipal } from '@/modules/access/testing';
import { AccessDeniedError } from '@/modules/access/types';
import {
  addTranslation,
  archiveDocument,
  createDocument,
  deleteDocument,
  duplicateDocument,
  getEditorState,
  listDocumentsForAdmin,
  listRevisions,
  restoreRevision,
  saveDraft,
  unarchiveDocument,
} from '@/modules/content/editor';
import { getPreview } from '@/modules/content/preview';
import {
  getAvailableTaxonomy,
  getLatestNewsTeaser,
  getPublishedNewsBySlug,
  getRelatedNews,
  listPublishedNews,
  listPublishedNewsForSitemap,
  resolveNewsCounterpart,
} from '@/modules/content/public';
import { publishTranslation, unpublishTranslation } from '@/modules/content/publication';
import { AUTOSAVE_HISTORY_LIMIT } from '@/modules/content/store';
import { insertTestAsset, sampleBody, seedTaxonomy, seedTestUsers, testActors } from '@/modules/content/testing';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;
const actors = testActors();
const editor = actors.editorCs;
const enEditor = actors.editorEn;

beforeAll(async () => {
  t = await createTestDatabase();
  await seedTestUsers(t.db);
  await seedTaxonomy(t.db);
});
afterAll(async () => {
  await t.drop();
});

let counter = 0;
const unique = (prefix: string) => `${prefix}-${++counter}`;

/** Creates a Czech news post with complete publishable fields. */
async function createCzechPost(options: { slug?: string; title?: string; categoryKey?: string; tagKeys?: string[]; coverAssetId?: string } = {}) {
  const slug = options.slug ?? unique('clanek');
  const created = await createDocument(t.db, editor, {
    kind: 'news',
    locale: 'cs',
    title: options.title ?? 'Příliš žluťoučký kůň',
    slug,
    categoryKey: options.categoryKey ?? 'announcements',
    tagKeys: options.tagKeys ?? ['tournament'],
    game: 'wardogs',
    fields: {
      excerpt: 'Krátké shrnutí článku.',
      body: sampleBody('Obsah článku v češtině.'),
      authorLabel: 'Redakce Valkyria',
      seoTitle: 'SEO titulek',
      seoDescription: 'SEO popis',
      cover: options.coverAssetId ? { assetId: options.coverAssetId, alt: 'Titulní obrázek', caption: 'Foto', decorative: false } : null,
    },
  });
  return created;
}

async function addEnglish(documentId: string, slug?: string) {
  const added = await addTranslation(t.db, enEditor, { documentId, locale: 'en', title: 'Draft', slug });
  const saved = await saveDraft(t.db, enEditor, {
    translationId: added.translationId,
    expectedVersion: added.version,
    fields: { title: 'English article', excerpt: 'Short English summary.', body: sampleBody('English body text.') },
  });
  return { ...added, version: saved.version };
}

describe('editorial lifecycle', () => {
  it('create → save → reload → publish → public list/detail', async () => {
    const coverId = await insertTestAsset(t.db);
    const created = await createCzechPost({ slug: 'prvni-clanek', coverAssetId: coverId });
    expect(created.slug).toBe('prvni-clanek');

    const saved = await saveDraft(t.db, editor, {
      translationId: created.translationId,
      expectedVersion: created.version,
      kind: 'save',
      fields: { title: 'První článek', body: sampleBody('Upravený obsah.') },
    });
    expect(saved.version).toBe(created.version + 1);

    const state = await getEditorState(t.db, editor, { translationId: created.translationId });
    const cs = state.translations.cs!;
    expect(cs.draft?.title).toBe('První článek');
    expect(cs.draft?.excerpt).toBe('Krátké shrnutí článku.');
    expect(cs.draft?.taxonomy.category).toEqual({ key: 'announcements', label: 'Oznámení' });
    expect(cs.state).toBe('draft');
    expect(state.translations.en).toBeUndefined();

    // Draft is invisible publicly.
    expect(await getPublishedNewsBySlug('cs', 'prvni-clanek', t.db)).toBeNull();

    const published = await publishTranslation(t.db, editor, { translationId: created.translationId, expectedVersion: saved.version });
    expect(published.slug).toBe('prvni-clanek');
    // A Wardogs post is revalidated at its canonical game section, the shared list and the game landing.
    expect(published.affectedPaths).toEqual(expect.arrayContaining(['/cs/news', '/cs/wardogs/news/prvni-clanek', '/cs/wardogs/news', '/cs/wardogs', '/sitemap.xml']));

    const list = await listPublishedNews({ locale: 'cs' }, t.db);
    const item = list.items.find((entry) => entry.slug === 'prvni-clanek');
    expect(item).toMatchObject({
      title: 'První článek',
      excerpt: 'Krátké shrnutí článku.',
      authorLabel: 'Redakce Valkyria',
      category: { key: 'announcements', label: 'Oznámení' },
      tags: [{ key: 'tournament', label: 'Turnaj' }],
      game: 'wardogs',
      cover: { assetId: coverId, alt: 'Titulní obrázek', width: 1600, height: 900 },
    });
    expect((await listPublishedNews({ locale: 'en' }, t.db)).items.some((entry) => entry.documentId === created.documentId)).toBe(false);

    const detail = await getPublishedNewsBySlug('cs', 'prvni-clanek', t.db);
    expect(detail?.kind).toBe('article');
    if (detail?.kind !== 'article') return;
    expect(detail.article).toMatchObject({ title: 'První článek', seoTitle: 'SEO titulek', isPreview: false, counterparts: { cs: 'prvni-clanek' } });
    expect(detail.article.assets.get(coverId)).toEqual({ width: 1600, height: 900 });
    expect(detail.article.cover?.caption).toBe('Foto');

    const audit = await t.db
      .select()
      .from(auditEvent)
      .where(and(eq(auditEvent.action, 'content.publish'), eq(auditEvent.translationId, created.translationId)));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ locale: 'cs', outcome: 'success', actorKind: 'discord', capability: 'content.publish' });
  });

  it('autosave and save after publication change only the draft', async () => {
    const created = await createCzechPost();
    const live = await publishTranslation(t.db, editor, { translationId: created.translationId, expectedVersion: created.version });
    const auto = await saveDraft(t.db, editor, {
      translationId: created.translationId,
      expectedVersion: live.version,
      kind: 'autosave',
      fields: { title: 'Rozepsaná změna', seoTitle: 'Nové SEO', excerpt: 'Jiné shrnutí' },
    });
    expect(auto.changed).toBe(true);
    // An autosave without changes writes nothing.
    const again = await saveDraft(t.db, editor, { translationId: created.translationId, expectedVersion: auto.version, kind: 'autosave', fields: { title: 'Rozepsaná změna' } });
    expect(again.changed).toBe(false);
    expect(again.version).toBe(auto.version);

    const detail = await getPublishedNewsBySlug('cs', created.slug, t.db);
    expect(detail?.kind === 'article' && detail.article.title).toBe('Příliš žluťoučký kůň');
    expect(detail?.kind === 'article' && detail.article.seoTitle).toBe('SEO titulek');
    const state = await getEditorState(t.db, editor, { documentId: created.documentId });
    expect(state.translations.cs?.state).toBe('published_with_changes');
    expect(state.translations.cs?.published?.title).toBe('Příliš žluťoučký kůň');
  });

  it('restores a revision to a NEW draft revision without touching live content', async () => {
    const created = await createCzechPost();
    const v2 = await saveDraft(t.db, editor, { translationId: created.translationId, expectedVersion: created.version, fields: { title: 'Verze dvě' } });
    const live = await publishTranslation(t.db, editor, { translationId: created.translationId, expectedVersion: v2.version });
    const v3 = await saveDraft(t.db, editor, { translationId: created.translationId, expectedVersion: live.version, fields: { title: 'Verze tři' } });

    const restored = await restoreRevision(t.db, editor, { translationId: created.translationId, revisionId: created.revisionId!, expectedVersion: v3.version });
    expect(restored.revisionId).not.toBe(created.revisionId);
    const [row] = await t.db.select().from(contentRevision).where(eq(contentRevision.id, restored.revisionId!));
    expect(row).toMatchObject({ kind: 'restore', restoredFromRevisionId: created.revisionId, title: 'Příliš žluťoučký kůň' });

    const detail = await getPublishedNewsBySlug('cs', created.slug, t.db);
    expect(detail?.kind === 'article' && detail.article.title).toBe('Verze dvě');

    const history = await listRevisions(t.db, editor, { translationId: created.translationId });
    expect(history[0]).toMatchObject({ id: restored.revisionId, kind: 'restore', isDraft: true, isPublished: false });
    expect(history.find((entry) => entry.id === v2.revisionId)?.isPublished).toBe(true);

    // A revision of another translation can never be restored here.
    const other = await createCzechPost();
    await expect(
      restoreRevision(t.db, editor, { translationId: created.translationId, revisionId: other.revisionId!, expectedVersion: restored.version }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('lets Czech and English translators save concurrently; same-translation stale saves conflict', async () => {
    const created = await createCzechPost();
    const en = await addEnglish(created.documentId);
    const [csSave, enSave] = await Promise.all([
      saveDraft(t.db, editor, { translationId: created.translationId, expectedVersion: created.version, fields: { title: 'Český souběh' } }),
      saveDraft(t.db, enEditor, { translationId: en.translationId, expectedVersion: en.version, fields: { title: 'English concurrent' } }),
    ]);
    expect(csSave.version).toBe(created.version + 1);
    expect(enSave.version).toBe(en.version + 1);
    const state = await getEditorState(t.db, editor, { documentId: created.documentId });
    expect(state.translations.cs?.draft?.title).toBe('Český souběh');
    expect(state.translations.en?.draft?.title).toBe('English concurrent');

    // Stale version for the same translation → conflict, nothing overwritten.
    await expect(
      saveDraft(t.db, enEditor, { translationId: created.translationId, expectedVersion: created.version, fields: { title: 'Přepis' } }),
    ).rejects.toMatchObject({ code: 'conflict' });
    // Two simultaneous saves of one translation with the same expected version: exactly one wins.
    const results = await Promise.allSettled([
      saveDraft(t.db, editor, { translationId: created.translationId, expectedVersion: csSave.version, fields: { title: 'A' } }),
      saveDraft(t.db, enEditor, { translationId: created.translationId, expectedVersion: csSave.version, fields: { title: 'B' } }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(DomainError);
    expect((rejected.reason as DomainError).code).toBe('conflict');

    // Shared fields use the document version.
    const withShared = await saveDraft(t.db, editor, {
      translationId: created.translationId,
      expectedVersion: csSave.version + 1,
      fields: {},
      shared: { expectedDocumentVersion: csSave.documentVersion, categoryKey: 'match-reports' },
    });
    expect(withShared.documentVersion).toBe(csSave.documentVersion + 1);
    await expect(
      saveDraft(t.db, enEditor, {
        translationId: en.translationId,
        expectedVersion: enSave.version,
        fields: {},
        shared: { expectedDocumentVersion: csSave.documentVersion, tagKeys: [] },
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('publishes locales independently and resolves counterparts by identity', async () => {
    const created = await createCzechPost({ slug: 'jen-cesky' });
    const en = await addEnglish(created.documentId, 'english-only-draft');
    await publishTranslation(t.db, editor, { translationId: created.translationId, expectedVersion: created.version });

    const [enRow] = await t.db.select().from(contentTranslation).where(eq(contentTranslation.id, en.translationId));
    expect(enRow!.publishedRevisionId).toBeNull();
    expect(await getPublishedNewsBySlug('en', 'english-only-draft', t.db)).toBeNull();
    expect(await resolveNewsCounterpart('cs', 'jen-cesky', 'en', t.db)).toEqual({ kind: 'missing', sourceSlug: 'jen-cesky' });
    expect(await resolveNewsCounterpart('en', 'english-only-draft', 'cs', t.db)).toBeNull();
    const detail = await getPublishedNewsBySlug('cs', 'jen-cesky', t.db);
    expect(detail?.kind === 'article' && detail.article.counterparts).toEqual({ cs: 'jen-cesky' });

    const enPublished = await publishTranslation(t.db, enEditor, { translationId: en.translationId, expectedVersion: en.version });
    expect(enPublished.affectedPaths).toContain('/cs/wardogs/news/jen-cesky');
    expect(await resolveNewsCounterpart('cs', 'jen-cesky', 'en', t.db)).toEqual({ kind: 'published', slug: 'english-only-draft' });
    const csAgain = await getPublishedNewsBySlug('cs', 'jen-cesky', t.db);
    expect(csAgain?.kind === 'article' && csAgain.article.counterparts).toEqual({ cs: 'jen-cesky', en: 'english-only-draft' });

    // Unpublishing English leaves Czech live.
    await unpublishTranslation(t.db, enEditor, { translationId: en.translationId, expectedVersion: enPublished.version });
    expect(await getPublishedNewsBySlug('en', 'english-only-draft', t.db)).toBeNull();
    expect((await getPublishedNewsBySlug('cs', 'jen-cesky', t.db))?.kind).toBe('article');
    const sitemap = await listPublishedNewsForSitemap(t.db);
    expect(sitemap.find((entry) => entry.path === '/cs/wardogs/news/jen-cesky')?.alternates).toEqual({ cs: '/cs/wardogs/news/jen-cesky' });
    expect(sitemap.some((entry) => entry.path === '/en/wardogs/news/english-only-draft')).toBe(false);
  });

  it('enforces locale-scoped slugs, redirects on live slug changes and never loops', async () => {
    const a = await createCzechPost({ slug: 'sdileny-slug' });
    await expect(createCzechPost({ slug: 'sdileny-slug' })).rejects.toMatchObject({ code: 'slug_taken' });
    // Same spelling in the other locale is allowed.
    const en = await addTranslation(t.db, enEditor, { documentId: a.documentId, locale: 'en', slug: 'sdileny-slug' });
    expect(en.slug).toBe('sdileny-slug');
    // Derived slugs get a numeric suffix instead of failing.
    const derived = await createDocument(t.db, editor, { kind: 'news', locale: 'cs', title: 'Sdílený slug' });
    expect(derived.slug).toBe('sdileny-slug-2');

    const live1 = await publishTranslation(t.db, editor, { translationId: a.translationId, expectedVersion: a.version });
    const renamed = await saveDraft(t.db, editor, { translationId: a.translationId, expectedVersion: live1.version, fields: { slug: 'novy-slug' } });
    // Changing the draft slug does not change the live URL.
    expect((await getPublishedNewsBySlug('cs', 'sdileny-slug', t.db))?.kind).toBe('article');
    const live2 = await publishTranslation(t.db, editor, { translationId: a.translationId, expectedVersion: renamed.version });
    expect(live2).toMatchObject({ slug: 'novy-slug', previousSlug: 'sdileny-slug' });
    expect(await getPublishedNewsBySlug('cs', 'sdileny-slug', t.db)).toEqual({ kind: 'redirect', slug: 'novy-slug' });
    expect(await resolveNewsCounterpart('cs', 'sdileny-slug', 'cs', t.db)).toEqual({ kind: 'published', slug: 'novy-slug' });

    // The redirect source stays reserved for other Czech translations.
    await expect(createCzechPost({ slug: 'sdileny-slug' })).rejects.toMatchObject({ code: 'slug_taken' });
    const other = await createCzechPost();
    await expect(
      saveDraft(t.db, editor, { translationId: other.translationId, expectedVersion: other.version, fields: { slug: 'sdileny-slug' } }),
    ).rejects.toMatchObject({ code: 'slug_taken' });

    // Switching back removes the self-redirect: no loop.
    const back = await saveDraft(t.db, editor, { translationId: a.translationId, expectedVersion: live2.version, fields: { slug: 'sdileny-slug' } });
    await publishTranslation(t.db, editor, { translationId: a.translationId, expectedVersion: back.version });
    const lookup = await getPublishedNewsBySlug('cs', 'sdileny-slug', t.db);
    expect(lookup?.kind).toBe('article');
    expect(await getPublishedNewsBySlug('cs', 'novy-slug', t.db)).toEqual({ kind: 'redirect', slug: 'sdileny-slug' });
    // English translation with the same spelling is unaffected.
    const [enRow] = await t.db.select().from(contentTranslation).where(eq(contentTranslation.id, en.translationId));
    expect(enRow!.draftSlug).toBe('sdileny-slug');
  });

  it('keeps published taxonomy labels when term labels change later', async () => {
    const created = await createCzechPost({ categoryKey: 'match-reports', tagKeys: ['recruitment'] });
    await publishTranslation(t.db, editor, { translationId: created.translationId, expectedVersion: created.version });
    await t.db.update(taxonomyTerm).set({ labelCs: 'Přejmenováno' }).where(eq(taxonomyTerm.key, 'match-reports'));
    const detail = await getPublishedNewsBySlug('cs', created.slug, t.db);
    expect(detail?.kind === 'article' && detail.article.category).toEqual({ key: 'match-reports', label: 'Reporty ze zápasů' });
    const filtered = await listPublishedNews({ locale: 'cs', category: 'match-reports' }, t.db);
    expect(filtered.items.map((item) => item.documentId)).toContain(created.documentId);
    expect((await listPublishedNews({ locale: 'cs', tag: 'recruitment' }, t.db)).items.map((i) => i.documentId)).toContain(created.documentId);
    expect((await listPublishedNews({ locale: 'cs', category: 'Robert"); drop table x;--' }, t.db)).total).toBe(0);
    const facets = await getAvailableTaxonomy('cs', t.db);
    expect(facets.categories.find((facet) => facet.key === 'match-reports')?.label).toBe('Přejmenováno');
    await t.db.update(taxonomyTerm).set({ labelCs: 'Reporty ze zápasů' }).where(eq(taxonomyTerm.key, 'match-reports'));
  });

  it('filters, searches and paginates the public list; related and teaser use published data only', async () => {
    const one = await createCzechPost({ title: 'Hledaný výraz 100%', categoryKey: 'match-reports', tagKeys: ['tournament'] });
    await publishTranslation(t.db, editor, { translationId: one.translationId, expectedVersion: one.version });
    const two = await createCzechPost({ categoryKey: 'match-reports', tagKeys: ['tournament'] });
    const twoLive = await publishTranslation(t.db, editor, { translationId: two.translationId, expectedVersion: two.version });
    await saveDraft(t.db, editor, { translationId: two.translationId, expectedVersion: twoLive.version, fields: { title: 'Tajný koncept' } });

    expect((await listPublishedNews({ locale: 'cs', q: 'hledaný VÝRAZ 100%' }, t.db)).items.map((i) => i.documentId)).toEqual([one.documentId]);
    expect((await listPublishedNews({ locale: 'cs', q: 'Tajný koncept' }, t.db)).total).toBe(0);
    expect((await listPublishedNews({ locale: 'cs', q: '%' }, t.db)).items.every((i) => i.title.includes('%'))).toBe(true);
    const page = await listPublishedNews({ locale: 'cs', pageSize: 2, page: 1 }, t.db);
    expect(page.items).toHaveLength(2);
    expect(page.pageCount).toBe(Math.ceil(page.total / 2));
    expect((await listPublishedNews({ locale: 'cs', pageSize: 500 }, t.db)).pageSize).toBeLessThanOrEqual(24);

    const related = await getRelatedNews({ locale: 'cs', documentId: one.documentId }, t.db);
    expect(related.map((r) => r.documentId)).toContain(two.documentId);
    expect(related.every((r) => r.title !== 'Tajný koncept')).toBe(true);
    const teaser = await getLatestNewsTeaser('cs', t.db);
    expect(teaser?.title).not.toBe('Tajný koncept');
  });

  it('hides archived documents publicly and restores them on unarchive', async () => {
    const created = await createCzechPost();
    await publishTranslation(t.db, editor, { translationId: created.translationId, expectedVersion: created.version });
    const archived = await archiveDocument(t.db, editor, { documentId: created.documentId, expectedDocumentVersion: 1 });
    expect(await getPublishedNewsBySlug('cs', created.slug, t.db)).toBeNull();
    expect((await listPublishedNews({ locale: 'cs', pageSize: 24 }, t.db)).items.some((i) => i.documentId === created.documentId)).toBe(false);
    expect((await listPublishedNewsForSitemap(t.db)).some((e) => e.path.endsWith(created.slug))).toBe(false);
    await expect(
      saveDraft(t.db, editor, { translationId: created.translationId, expectedVersion: 2, fields: { title: 'x' } }),
    ).rejects.toMatchObject({ code: 'invalid_state' });
    await unarchiveDocument(t.db, editor, { documentId: created.documentId, expectedDocumentVersion: archived.version });
    expect((await getPublishedNewsBySlug('cs', created.slug, t.db))?.kind).toBe('article');
  });

  it('bounds autosave history without pruning pointers', async () => {
    const created = await createCzechPost();
    let version = created.version;
    for (let i = 0; i < AUTOSAVE_HISTORY_LIMIT + 5; i += 1) {
      const saved = await saveDraft(t.db, editor, { translationId: created.translationId, expectedVersion: version, kind: 'autosave', fields: { title: `Autosave ${i}` } });
      version = saved.version;
    }
    const revisions = await t.db.select().from(contentRevision).where(eq(contentRevision.translationId, created.translationId));
    expect(revisions.filter((r) => r.kind === 'autosave')).toHaveLength(AUTOSAVE_HISTORY_LIMIT);
    expect(revisions.some((r) => r.id === created.revisionId)).toBe(true);
    const state = await getEditorState(t.db, editor, { translationId: created.translationId });
    expect(state.translations.cs?.draft?.title).toBe(`Autosave ${AUTOSAVE_HISTORY_LIMIT + 4}`);
  });

  it('rejects unsafe rich text, unknown taxonomy and foreign assets', async () => {
    const created = await createCzechPost();
    await expect(
      saveDraft(t.db, editor, {
        translationId: created.translationId,
        expectedVersion: created.version,
        fields: { body: { type: 'doc', content: [{ type: 'iframe', attrs: { src: 'https://evil.example' } }] } },
      }),
    ).rejects.toMatchObject({ code: 'validation' });
    await expect(
      createDocument(t.db, editor, { kind: 'news', locale: 'cs', title: 'X', categoryKey: 'neexistuje' }),
    ).rejects.toMatchObject({ code: 'validation' });
    const matchAsset = await insertTestAsset(t.db, { scope: 'match' });
    await expect(
      saveDraft(t.db, editor, {
        translationId: created.translationId,
        expectedVersion: created.version,
        fields: { cover: { assetId: matchAsset, alt: 'Logo', caption: '', decorative: false } },
      }),
    ).rejects.toMatchObject({ code: 'validation' });
    // Publishing requires alt text on a non-decorative cover.
    const coverId = await insertTestAsset(t.db);
    const saved = await saveDraft(t.db, editor, {
      translationId: created.translationId,
      expectedVersion: created.version,
      fields: { cover: { assetId: coverId, alt: '', caption: '', decorative: false } },
    });
    await expect(publishTranslation(t.db, editor, { translationId: created.translationId, expectedVersion: saved.version })).rejects.toMatchObject({
      code: 'validation',
      fieldErrors: { 'cover.alt': 'required' },
    });
  });

  it('duplicates, lists for admin and deletes only non-live documents', async () => {
    const created = await createCzechPost({ slug: 'originalni-clanek' });
    const en = await addEnglish(created.documentId, 'original-article');
    const copy = await duplicateDocument(t.db, editor, { documentId: created.documentId });
    const copyState = await getEditorState(t.db, editor, { documentId: copy.documentId });
    expect(copyState.translations.cs?.draftSlug).toBe('originalni-clanek-copy');
    expect(copyState.translations.en?.draftSlug).toBe('original-article-copy');
    expect(copyState.translations.en?.draft?.title).toBe('English article');
    expect(copyState.translations.cs?.published).toBeNull();

    await publishTranslation(t.db, enEditor, { translationId: en.translationId, expectedVersion: en.version });
    const adminList = await listDocumentsForAdmin(t.db, editor, { q: 'originalni-clanek', locale: 'en', state: 'published' });
    expect(adminList.items.map((item) => item.documentId)).toEqual([created.documentId]);
    expect(adminList.items[0]!.translations.cs?.state).toBe('draft');
    expect(adminList.items[0]!.translations.en?.state).toBe('published');

    await expect(deleteDocument(t.db, editor, { documentId: created.documentId, expectedDocumentVersion: 1 })).rejects.toMatchObject({ code: 'invalid_state' });
    await deleteDocument(t.db, editor, { documentId: copy.documentId, expectedDocumentVersion: 1 });
    await expect(getEditorState(t.db, editor, { documentId: copy.documentId })).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('authorization and preview', () => {
  it('denies private reads and writes to unauthorized actors', async () => {
    const created = await createCzechPost();
    await expect(getEditorState(t.db, { kind: 'anonymous' }, { documentId: created.documentId })).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(getEditorState(t.db, actors.member, { documentId: created.documentId })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(listDocumentsForAdmin(t.db, actors.matchManager, {})).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      createDocument(t.db, actors.matchManager, { kind: 'news', locale: 'cs', title: 'Eskalace' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const readOnly = testPrincipal(['editor'], { userId: actors.editorCs.userId, intent: 'read' });
    await expect(
      saveDraft(t.db, readOnly, { translationId: created.translationId, expectedVersion: created.version, fields: { title: 'x' } }),
    ).rejects.toMatchObject({ code: 'stale_authorization' });
    await expect(
      publishTranslation(t.db, testPrincipal(['editor'], { userId: actors.editorCs.userId, status: 'unavailable' }), {
        translationId: created.translationId,
        expectedVersion: created.version,
      }),
    ).rejects.toMatchObject({ code: 'verification_unavailable' });
    const denied = await t.db.select().from(auditEvent).where(and(eq(auditEvent.outcome, 'denied'), eq(auditEvent.actorUserId, actors.matchManager.userId)));
    expect(denied.length).toBeGreaterThan(0);
  });

  it('previews drafts only for authorized editors', async () => {
    const created = await createCzechPost();
    const saved = await saveDraft(t.db, editor, { translationId: created.translationId, expectedVersion: created.version, fields: { title: 'Náhled konceptu' } });
    const preview = await getPreview(t.db, editor, { translationId: created.translationId });
    expect(preview).toMatchObject({ title: 'Náhled konceptu', isPreview: true, publishedAt: null, revisionId: saved.revisionId });
    const older = await getPreview(t.db, actors.administrator, { translationId: created.translationId, revisionId: created.revisionId! });
    expect(older.title).toBe('Příliš žluťoučký kůň');
    for (const actor of [actors.matchManager, actors.member, { kind: 'anonymous' as const }]) {
      await expect(getPreview(t.db, actor, { translationId: created.translationId })).rejects.toBeInstanceOf(AccessDeniedError);
    }
    const other = await createCzechPost();
    await expect(getPreview(t.db, editor, { translationId: created.translationId, revisionId: other.revisionId! })).rejects.toMatchObject({ code: 'not_found' });
  });
});
