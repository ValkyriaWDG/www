import { auditEvent, manualArticle } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FIXTURE_MANUAL_SLUGS, loadFixtures } from '@/fixtures';
import { ensureTestActors, TEST_ACTOR_IDS, type TestActors } from '@/fixtures/test-actors';
import { testPrincipal } from '@/modules/access/testing';
import { AccessDeniedError } from '@/modules/access/types';
import { createDocument, getEditorState, saveDraft } from '@/modules/content/editor';
import { publishTranslation } from '@/modules/content/publication';
import { sampleBody } from '@/modules/content/testing';
import { saveManualMeta } from '@/modules/field-manual/admin';
import {
  getPublishedManualBySlug,
  listManualCategories,
  listPublishedManual,
  listPublishedManualForSitemap,
  manualSearchTerms,
  resolveManualCounterpart,
} from '@/modules/field-manual/public';
import { runSeed } from '@/seed';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

/*
 * Field manual = content documents of kind `manual` on the shared CMS. Public reads list
 * only published HLL translations of the requested locale; drafts never leak through
 * lists, categories, search, lookups, counterparts or the sitemap. Synthetic data only.
 */

let t: TestDatabase;
let actors: TestActors;
const HLL = 'hell-let-loose' as const;

beforeAll(async () => {
  t = await createTestDatabase();
  actors = await ensureTestActors(t.db);
  await runSeed(t.db);
  await loadFixtures(t.db, { mediaRoot: `${process.cwd()}/.local/test-media-field-manual` });
});
afterAll(async () => {
  await t.drop();
});

const slugsOf = (items: { slug: string }[]) => items.map((item) => item.slug);

describe('public field manual', () => {
  it('lists only categories that have a published article in the locale, in editorial order', async () => {
    const cs = await listManualCategories(t.db, { locale: 'cs', game: HLL });
    expect(cs.map((category) => category.key)).toEqual(['getting-started', 'communication', 'roles', 'vehicles']);
    expect(cs.find((category) => category.key === 'roles')).toMatchObject({ label: 'Role', count: 1 });
    // English: the tank article is only a private draft and the squad leader guide is Czech-only.
    const en = await listManualCategories(t.db, { locale: 'en', game: HLL });
    expect(en.map((category) => category.key)).toEqual(['getting-started', 'communication']);
    expect(en[0]?.label).toBe('Getting started');
    expect(await listManualCategories(t.db, { locale: 'cs', game: 'wardogs' })).toEqual([]);
  });

  it('never exposes drafts in lists, category filters or lookups', async () => {
    const cs = await listPublishedManual(t.db, { locale: 'cs', game: HLL });
    expect(cs.total).toBe(4);
    expect(slugsOf(cs.items)).not.toContain(FIXTURE_MANUAL_SLUGS.draftCs);
    expect(slugsOf((await listPublishedManual(t.db, { locale: 'cs', game: HLL, category: 'spawns' })).items)).toEqual([]);
    expect(slugsOf((await listPublishedManual(t.db, { locale: 'cs', game: HLL, category: 'roles' })).items)).toEqual([FIXTURE_MANUAL_SLUGS.squadLeaderCs]);
    expect((await listPublishedManual(t.db, { locale: 'cs', game: HLL, category: 'Not A Key' })).total).toBe(0);
    expect(await getPublishedManualBySlug(t.db, { locale: 'cs', game: HLL, slug: FIXTURE_MANUAL_SLUGS.draftCs })).toBeNull();
    expect(await getPublishedManualBySlug(t.db, { locale: 'en', game: HLL, slug: FIXTURE_MANUAL_SLUGS.tankEnDraft })).toBeNull();
    // Right slug, wrong game section.
    expect(await getPublishedManualBySlug(t.db, { locale: 'cs', game: 'wardogs', slug: FIXTURE_MANUAL_SLUGS.setupCs })).toBeNull();
  });

  it('returns the published article with its provenance', async () => {
    const lookup = await getPublishedManualBySlug(t.db, { locale: 'cs', game: HLL, slug: FIXTURE_MANUAL_SLUGS.setupCs });
    expect(lookup?.kind).toBe('article');
    if (lookup?.kind !== 'article') return;
    expect(lookup.article.title).toBe('[Ukázka] První nastavení hry');
    expect(lookup.article.counterparts.en).toBe(FIXTURE_MANUAL_SLUGS.setupEn);
    expect(lookup.meta).toMatchObject({ sourceLanguage: 'cs', sourcePublishedOn: '2021-03-14', credits: 'Syntetický autor A, Syntetický autor B' });
    expect(lookup.meta.reviewedAt).toBeInstanceOf(Date);
  });

  it('searches title, summary and body text without diacritics and with abbreviations', async () => {
    const search = async (q: string, locale = 'cs') => slugsOf((await listPublishedManual(t.db, { locale, game: HLL, q })).items);
    expect(await search('druzstva')).toEqual([FIXTURE_MANUAL_SLUGS.squadLeaderCs]);
    expect(await search('DRUŽSTVA')).toEqual([FIXTURE_MANUAL_SLUGS.squadLeaderCs]);
    // `SL` expands to "velitel družstva".
    expect(manualSearchTerms('SL')).toContain('velitel druzstva');
    expect(await search('SL')).toContain(FIXTURE_MANUAL_SLUGS.squadLeaderCs);
    // Body text: only the squad leader guide has a fifth step.
    expect(await search('krok 5')).toEqual([FIXTURE_MANUAL_SLUGS.squadLeaderCs]);
    expect((await search('zlutoucky')).length).toBe(4);
    // Drafts are not searchable; LIKE wildcards are literal.
    expect(await search('soukromy koncept')).toEqual([]);
    expect(await search('%')).toEqual([]);
    expect(await search('private draft', 'en')).toEqual([]);
  });

  it('maps language counterparts by entity and reports a missing translation', async () => {
    expect(await resolveManualCounterpart(t.db, { game: HLL, fromLocale: 'cs', slug: FIXTURE_MANUAL_SLUGS.setupCs, toLocale: 'en' })).toEqual({
      kind: 'published',
      slug: FIXTURE_MANUAL_SLUGS.setupEn,
    });
    expect(await resolveManualCounterpart(t.db, { game: HLL, fromLocale: 'cs', slug: FIXTURE_MANUAL_SLUGS.tankCs, toLocale: 'en' })).toEqual({
      kind: 'missing',
      sourceSlug: FIXTURE_MANUAL_SLUGS.tankCs,
    });
    expect(await resolveManualCounterpart(t.db, { game: HLL, fromLocale: 'cs', slug: FIXTURE_MANUAL_SLUGS.draftCs, toLocale: 'en' })).toBeNull();
  });

  it('lists published manual URLs in the sitemap under the game section', async () => {
    const entries = await listPublishedManualForSitemap(t.db);
    const paths = entries.map((entry) => entry.path);
    expect(paths).toEqual(expect.arrayContaining([`/cs/hll/field-manual/${FIXTURE_MANUAL_SLUGS.setupCs}`, `/en/hll/field-manual/${FIXTURE_MANUAL_SLUGS.setupEn}`]));
    expect(paths.some((path) => path.includes(FIXTURE_MANUAL_SLUGS.draftCs) || path.includes(FIXTURE_MANUAL_SLUGS.tankEnDraft))).toBe(false);
    expect(entries.find((entry) => entry.path.endsWith(FIXTURE_MANUAL_SLUGS.setupCs))?.alternates).toEqual({
      cs: `/cs/hll/field-manual/${FIXTURE_MANUAL_SLUGS.setupCs}`,
      en: `/en/hll/field-manual/${FIXTURE_MANUAL_SLUGS.setupEn}`,
    });
  });
});

describe('field manual editing on the shared CMS', () => {
  it('creates, publishes and describes a manual article through the editorial workflow', async () => {
    const created = await createDocument(t.db, actors.editor, {
      kind: 'manual',
      locale: 'cs',
      title: '[Synthetic] Nový návod',
      slug: 'synteticky-novy-navod',
      categoryKey: 'leadership',
      game: HLL,
      fields: { excerpt: '', body: sampleBody('Syntetický návod pro velitele.'), authorLabel: 'Synthetic' },
    });
    const [meta] = await t.db.select().from(manualArticle).where(eq(manualArticle.documentId, created.documentId));
    expect(meta).toMatchObject({ sortOrder: 100, credits: '' });

    // A manual article needs a summary before publication.
    const blocked = await publishTranslation(t.db, actors.editor, { translationId: created.translationId, expectedVersion: created.version }).then(
      () => null,
      (error: unknown) => error as { code?: string; fieldErrors?: Record<string, string> },
    );
    expect(blocked?.fieldErrors?.excerpt).toBe('required');

    const state = await getEditorState(t.db, { ...actors.editor, intent: 'read' }, { documentId: created.documentId });
    expect(state.document.kind).toBe('manual');
    const saved = await saveDraft(t.db, actors.editor, {
      translationId: created.translationId,
      expectedVersion: created.version,
      fields: { excerpt: 'Syntetické shrnutí návodu.' },
    });
    const published = await publishTranslation(t.db, actors.editor, { translationId: created.translationId, expectedVersion: saved.version });
    expect(published.affectedPaths).toEqual(expect.arrayContaining(['/cs/hll/field-manual', '/cs/hll/field-manual/synteticky-novy-navod', '/sitemap.xml']));
    expect((await listManualCategories(t.db, { locale: 'cs', game: HLL })).map((category) => category.key)).toContain('leadership');

    await saveManualMeta(t.db, actors.editor, {
      documentId: created.documentId,
      sortOrder: 5,
      sourceUrl: 'https://example.org/synthetic-fixture/new-guide',
      sourcePublishedOn: '2020-01-31',
      sourceLanguage: 'sk',
      credits: 'Synthetic author',
      markReviewed: true,
    });
    const lookup = await getPublishedManualBySlug(t.db, { locale: 'cs', game: HLL, slug: 'synteticky-novy-navod' });
    expect(lookup?.kind === 'article' && lookup.meta).toMatchObject({ sourceLanguage: 'sk', credits: 'Synthetic author', sourceUrl: 'https://example.org/synthetic-fixture/new-guide' });
  });

  it('rejects a manual article without a game or with another game’s category', async () => {
    const noGame = await createDocument(t.db, actors.editor, { kind: 'manual', locale: 'cs', title: '[Synthetic] Bez hry', game: null }).then(
      () => null,
      (error: unknown) => error as { code?: string },
    );
    expect(noGame?.code).toBe('validation');
    const wrongCategory = await createDocument(t.db, actors.editor, { kind: 'manual', locale: 'cs', title: '[Synthetic] Cizí kategorie', game: HLL, categoryKey: 'announcement' }).then(
      () => null,
      (error: unknown) => error as { code?: string },
    );
    expect(wrongCategory?.code).toBe('validation');
  });

  it('keeps a Wardogs-scoped editor out of the HLL manual and audits the denial', async () => {
    const wardogsEditor = testPrincipal(['editor'], { userId: TEST_ACTOR_IDS.editor, label: 'Synthetic Wardogs editor', games: ['wardogs'] });
    const error = await createDocument(t.db, wardogsEditor, { kind: 'manual', locale: 'cs', title: '[Synthetic] Cizí hra', game: HLL }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AccessDeniedError);
    const [setup] = (await listPublishedManual(t.db, { locale: 'cs', game: HLL, category: 'getting-started' })).items;
    await expect(getEditorState(t.db, { ...wardogsEditor, intent: 'read' }, { documentId: setup!.documentId })).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      saveManualMeta(t.db, wardogsEditor, { documentId: setup!.documentId, sortOrder: 1, sourceUrl: '', sourcePublishedOn: '', sourceLanguage: null, credits: '', markReviewed: false }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    const denials = await t.db
      .select({ summary: auditEvent.summary })
      .from(auditEvent)
      .where(and(eq(auditEvent.action, 'content.create'), eq(auditEvent.outcome, 'denied'), eq(auditEvent.actorUserId, TEST_ACTOR_IDS.editor)));
    expect(denials.some((row) => (row.summary as { reason?: string }).reason === 'game_scope')).toBe(true);
  });
});
