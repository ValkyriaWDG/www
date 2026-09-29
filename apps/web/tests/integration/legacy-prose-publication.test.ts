import os from 'node:os';
import { asset, match, proseRevision, proseTranslation, tournament } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importLegacyBundle } from '@/modules/legacy/import-bundle';
import { IMPORT_ACTOR } from '@/modules/legacy/import-shared';
import { getPublicProse } from '@/modules/prose/queries';
import { publishProse, saveProseDraft } from '@/modules/prose/service';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;
let sequence = 9100;
const body = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const baseBundle = { schemaVersion: 1, sourceOrigin: 'https://valkyriahll.cz', observedAt: '2026-09-29T10:00:00Z', sourceRevision: 'synthetic-prose-test', media: [], scoreboardSources: [], warnings: [] };

beforeAll(async () => { t = await createTestDatabase(); });
afterAll(async () => { await t.drop(); });

async function importedDraft(kind: 'match' | 'tournament') {
  const key = String(++sequence);
  const input = {
    ...baseBundle,
    documents: kind === 'tournament' ? [{
      kind, legacyId: key, slug: `synthetic-${key}`, game: 'hell-let-loose', locale: 'cs', sourceLanguage: 'cs',
      sourceUrl: `https://valkyriahll.cz/tournaments/synthetic-${key}`, sourcePublishedOn: '2020-05-01', sourceModifiedOn: null,
      title: 'Synthetic historical tournament', excerpt: '', authorLabel: '', credits: '', body: body('Original imported description'),
      coverAssetId: null, tags: [], metadata: {}, warnings: [],
    }] : [],
    matches: kind === 'match' ? [{
      id: Number(key), date: '27/09/2020 19:30', completed: false,
      teams: { home: { name: 'VLK', score: 0, side: 'allies' }, away: { name: 'SYN', score: 0, side: 'axis' } },
      league: { name: 'Friendly' }, format: 'best of 1', map: 'Synthetic map', length: 75,
      links: [{ title: 'Synthetic recording', url: 'https://example.org/recording' }],
    }] : [],
  };
  const report = await importLegacyBundle(t.db, input, os.tmpdir(), { apply: true });
  expect(report.items[0]).toMatchObject({ action: 'create' });
  const owner = { kind, id: report.items[0]!.targetId! };
  const [translation] = await t.db.select().from(proseTranslation).where(and(
    kind === 'match' ? eq(proseTranslation.matchId, owner.id) : eq(proseTranslation.tournamentId, owner.id),
    eq(proseTranslation.locale, 'cs'),
  ));
  const [revision] = await t.db.select().from(proseRevision).where(eq(proseRevision.id, translation!.draftRevisionId!));
  const table = kind === 'match' ? match : tournament;
  const [original] = await t.db.select({ version: table.version, publication: table.publication }).from(table).where(eq(table.id, owner.id));
  return { input, owner, translation: translation!, revision: revision!, original: original! };
}

describe.each(['match', 'tournament'] as const)('legacy %s prose publication guard', (kind) => {
  it('rejects an independently edited body in dry-run and apply without publishing or overwriting it', async () => {
    const fixture = await importedDraft(kind);
    const edited = await saveProseDraft(t.db, IMPORT_ACTOR, { owner: fixture.owner, locale: 'cs', expectedVersion: fixture.translation.version, body: body('Private editorial changes') });
    const table = kind === 'match' ? match : tournament;
    const [owner] = await t.db.select({ version: table.version }).from(table).where(eq(table.id, fixture.owner.id));
    expect(owner!.version).toBe(fixture.original.version);

    for (const apply of [false, true]) {
      const report = await importLegacyBundle(t.db, fixture.input, os.tmpdir(), { apply, publish: true });
      expect(report.items[0]).toMatchObject({ action: 'conflict', reason: 'edited_draft_not_published_by_migration' });
    }
    const [translation] = await t.db.select().from(proseTranslation).where(eq(proseTranslation.id, fixture.translation.id));
    expect(translation).toMatchObject({ draftRevisionId: edited.revisionId, publishedRevisionId: null, version: edited.version });
    const [target] = await t.db.select({ version: table.version, publication: table.publication }).from(table).where(eq(table.id, fixture.owner.id));
    expect(target).toEqual(fixture.original);
  });

  it('rejects cover-only changes even when the body still matches the imported snapshot', async () => {
    const fixture = await importedDraft(kind);
    const [image] = await t.db.insert(asset).values({ scope: 'editorial', state: 'ready', originalFilename: 'synthetic.png', sourceFormat: 'png', width: 800, height: 450, bytes: 100, sha256: 'synthetic' }).returning();
    const edited = await saveProseDraft(t.db, IMPORT_ACTOR, {
      owner: fixture.owner, locale: 'cs', expectedVersion: fixture.translation.version, body: fixture.revision.body,
      cover: { assetId: image!.id, alt: 'Private editorial cover', caption: '', decorative: false },
    });
    const report = await importLegacyBundle(t.db, fixture.input, os.tmpdir(), { apply: true, publish: true });
    expect(report.items[0]).toMatchObject({ action: 'conflict', reason: 'edited_draft_not_published_by_migration' });
    const [translation] = await t.db.select().from(proseTranslation).where(eq(proseTranslation.id, fixture.translation.id));
    expect(translation).toMatchObject({ draftRevisionId: edited.revisionId, publishedRevisionId: null });
  });

  it('publishes unchanged normalized imported prose and remains idempotent', async () => {
    const fixture = await importedDraft(kind);
    expect((await importLegacyBundle(t.db, fixture.input, os.tmpdir(), { publish: true })).items[0]?.action).toBe('publish');
    expect((await importLegacyBundle(t.db, fixture.input, os.tmpdir(), { apply: true, publish: true })).items[0]?.action).toBe('publish');
    const [translation] = await t.db.select().from(proseTranslation).where(eq(proseTranslation.id, fixture.translation.id));
    expect(translation!.publishedRevisionId).toBe(fixture.translation.draftRevisionId);
    expect((await importLegacyBundle(t.db, fixture.input, os.tmpdir(), { apply: true, publish: true })).items[0]?.action).toBe('unchanged');
  });

  it('does not expose an edited published revision when the draft was restored to the imported body', async () => {
    const fixture = await importedDraft(kind);
    const edited = await saveProseDraft(t.db, IMPORT_ACTOR, { owner: fixture.owner, locale: 'cs', expectedVersion: fixture.translation.version, body: body('Edited description behind unpublished owner') });
    const live = await publishProse(t.db, IMPORT_ACTOR, { owner: fixture.owner, locale: 'cs', expectedVersion: edited.version });
    await saveProseDraft(t.db, IMPORT_ACTOR, { owner: fixture.owner, locale: 'cs', expectedVersion: live.version, body: fixture.revision.body });
    const report = await importLegacyBundle(t.db, fixture.input, os.tmpdir(), { apply: true, publish: true });
    expect(report.items[0]).toMatchObject({ action: 'conflict', reason: 'edited_draft_not_published_by_migration' });
    const table = kind === 'match' ? match : tournament;
    const [owner] = await t.db.select({ publication: table.publication }).from(table).where(eq(table.id, fixture.owner.id));
    expect(owner!.publication).toBe('draft');
  });

  it('rejects a missing imported prose translation instead of silently publishing the owner', async () => {
    const fixture = await importedDraft(kind);
    await t.db.delete(proseTranslation).where(eq(proseTranslation.id, fixture.translation.id));
    const report = await importLegacyBundle(t.db, fixture.input, os.tmpdir(), { apply: true, publish: true });
    expect(report.items[0]).toMatchObject({ action: 'conflict', reason: 'edited_draft_not_published_by_migration' });
  });

  it.each([false, true])('does not expose independently published English prose behind a draft owner (apply=%s)', async (apply) => {
    const fixture = await importedDraft(kind);
    const english = await saveProseDraft(t.db, IMPORT_ACTOR, {
      owner: fixture.owner, locale: 'en', expectedVersion: 0, body: body('English editorial content behind a draft owner'),
    });
    const published = await publishProse(t.db, IMPORT_ACTOR, { owner: fixture.owner, locale: 'en', expectedVersion: english.version });
    expect(await getPublicProse(t.db, fixture.owner, 'en')).toBeNull();

    const report = await importLegacyBundle(t.db, fixture.input, os.tmpdir(), { apply, publish: true });
    expect.soft(report.items[0]).toMatchObject({ action: 'conflict', reason: 'edited_draft_not_published_by_migration' });
    const table = kind === 'match' ? match : tournament;
    const [owner] = await t.db.select({ version: table.version, publication: table.publication }).from(table).where(eq(table.id, fixture.owner.id));
    expect.soft(owner).toEqual(fixture.original);
    expect(await getPublicProse(t.db, fixture.owner, 'en')).toBeNull();
    const [translation] = await t.db.select().from(proseTranslation).where(eq(proseTranslation.id, english.translationId));
    expect(translation).toMatchObject({ draftRevisionId: english.revisionId, publishedRevisionId: english.revisionId, version: published.version });
  });

  it('preserves an unpublished English draft while publishing unchanged imported Czech prose', async () => {
    const fixture = await importedDraft(kind);
    const english = await saveProseDraft(t.db, IMPORT_ACTOR, {
      owner: fixture.owner, locale: 'en', expectedVersion: 0, body: body('Unpublished English editorial draft'),
    });
    const report = await importLegacyBundle(t.db, fixture.input, os.tmpdir(), { apply: true, publish: true });
    expect(report.items[0]).toMatchObject({ action: 'publish' });
    expect(await getPublicProse(t.db, fixture.owner, 'en')).toMatchObject({ state: 'missing' });
    expect(await getPublicProse(t.db, fixture.owner, 'cs')).toMatchObject({ state: 'published' });
    const [translation] = await t.db.select().from(proseTranslation).where(eq(proseTranslation.id, english.translationId));
    expect(translation).toMatchObject({ draftRevisionId: english.revisionId, publishedRevisionId: null, version: english.version });
  });
});
