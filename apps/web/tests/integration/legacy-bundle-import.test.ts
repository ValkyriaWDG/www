import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { contentDocument, contentRevision, contentTranslation, legacyImport, legacyMatchScoreboard, match, matchResult, matchStatistics, taxonomyTerm } from '@valkyria/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importLegacyBundle } from '@/modules/legacy/import-bundle';
import { sourceHash } from '@/modules/legacy/import-contract';
import { runSeed } from '@/seed';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;
let root: string;
const doc = { kind: 'news', legacyId: 'synthetic-report', slug: 'synthetic-report', game: 'hell-let-loose', locale: 'cs', sourceLanguage: 'cs', sourceUrl: 'https://valkyriahll.cz/clanky/synthetic-report', sourcePublishedOn: '2020-05-01', sourceModifiedOn: null, title: 'Synthetic historical report', excerpt: 'Synthetic excerpt.', authorLabel: 'Synthetic author', credits: '', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Synthetic historical body.' }] }] }, coverAssetId: null, tags: [], metadata: {}, warnings: [] };
const fixture = { id: 901, date: '27/09/2020 19:30', completed: false, teams: { home: { name: 'VLK', score: 0, side: 'allies' }, away: { name: 'SYN', score: 0, side: 'axis' } }, league: { name: 'Friendly' }, format: 'best of 1' };
const bundle = { schemaVersion: 1, sourceOrigin: 'https://valkyriahll.cz', observedAt: '2026-09-29T10:00:00Z', sourceRevision: 'synthetic-test', documents: [doc], media: [], matches: [fixture], scoreboardSources: [], warnings: [] };

beforeAll(async () => { t = await createTestDatabase(); root = await mkdtemp(path.join(os.tmpdir(), 'vlk-legacy-bundle-')); await runSeed(t.db); });
afterAll(async () => { await t.drop(); await rm(root, { recursive: true, force: true }); });

describe('legacy bundle migration on PostgreSQL', () => {
  it('dry-runs without writes, imports historic content/facts, and never turns upcoming 0:0 into a result', async () => {
    const dry = await importLegacyBundle(t.db, bundle, root, { publish: true });
    expect(dry.items.map((item) => item.action)).toEqual(['create', 'create']);
    expect(await t.db.select().from(legacyImport)).toHaveLength(0);
    const applied = await importLegacyBundle(t.db, bundle, root, { apply: true, publish: true });
    expect(applied.items.map((item) => item.action)).toEqual(['create', 'create']);
    const [post] = await t.db.select().from(contentTranslation).where(eq(contentTranslation.liveSlug, doc.slug));
    expect(post!.firstPublishedAt).toEqual(new Date('2020-05-01T00:00:00Z'));
    expect(post!.publishedAt!.getTime()).toBeGreaterThan(post!.firstPublishedAt!.getTime());
    expect(await t.db.select().from(matchResult)).toHaveLength(0);
    expect((await t.db.select().from(match))[0]).toMatchObject({ slug: '901', status: 'scheduled', publication: 'published' });
  });
  it('reruns remain idempotent after an editor renames a draft; changed sources conflict without overwriting', async () => {
    const [post] = await t.db.select().from(contentTranslation).where(eq(contentTranslation.liveSlug, doc.slug));
    await t.db.update(contentTranslation).set({ draftSlug: 'editor-renamed', version: post!.version + 1 }).where(eq(contentTranslation.id, post!.id));
    const again = await importLegacyBundle(t.db, bundle, root, { apply: true, publish: true });
    expect(again.items.every((item) => item.action === 'unchanged')).toBe(true);
    const changed = await importLegacyBundle(t.db, { ...bundle, documents: [{ ...doc, title: 'Changed upstream' }], matches: [] }, root, { apply: true });
    expect(changed.items[0]).toMatchObject({ action: 'conflict', reason: 'source_changed_since_import' });
    expect(await t.db.select().from(legacyImport)).toHaveLength(2);
  });
  it('does not adopt unrelated existing pages, but adopts an untouched FAQ seed explicitly', async () => {
    const faq = { ...doc, kind: 'page', legacyId: 'faq', slug: 'faq', sourceUrl: 'https://valkyriahll.cz/faq', metadata: { pageKey: 'faq' } };
    const input = { ...bundle, documents: [faq], matches: [] };
    expect((await importLegacyBundle(t.db, input, root, { apply: true })).items[0]?.action).toBe('conflict');
    expect((await importLegacyBundle(t.db, input, root, { apply: true, publish: true, adoptSeed: true })).items[0]?.action).toBe('adopt');
    const [page] = await t.db.select().from(contentDocument).where(eq(contentDocument.pageKey, 'faq'));
    expect(page).toBeTruthy();
  });
  it('serializes concurrent reruns, leaving one identity and one match', async () => {
    const input = { ...bundle, documents: [], matches: [{ ...fixture, id: 902 }] };
    const reports = await Promise.all([importLegacyBundle(t.db, input, root, { apply: true }), importLegacyBundle(t.db, input, root, { apply: true })]);
    expect(reports.map((r) => r.items[0]!.action).sort()).toEqual(['create', 'unchanged']);
    expect(await t.db.select().from(match).where(eq(match.slug, '902'))).toHaveLength(1);
  });
  it('preserves multiple allowlisted rounds with unknown sides and no account identifiers', async () => {
    const sources = [];
    for (let ordinal = 1; ordinal <= 2; ordinal++) {
      const bytes = Buffer.from(JSON.stringify({ result: { id: 700 + ordinal, player_stats: [{ player: 'Synthetic Player', steam_id: 'PRIVATE-MARKER', team: { side: 'allies' }, kills: 10, deaths: 2 }], start: '2020-09-27T18:30:00Z', end: '2020-09-27T20:00:00Z', result: { allied: 2, axis: 3 } } }));
      const relativeFile = `round-${ordinal}.json`;
      await writeFile(path.join(root, relativeFile), bytes);
      sources.push({ legacyMatchId: 903, ordinal, providerGameId: 700 + ordinal, valkyriaSide: null, relativeFile, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
    }
    const result = await importLegacyBundle(t.db, { ...bundle, documents: [], matches: [{ ...fixture, id: 903, completed: true }], scoreboardSources: sources }, root, { apply: true, publish: true });
    expect(result.items[0]?.action).toBe('create');
    const [row] = await t.db.select().from(match).where(eq(match.slug, '903'));
    const [stats] = await t.db.select().from(matchStatistics).where(eq(matchStatistics.matchId, row!.id));
    const rounds = await t.db.select().from(legacyMatchScoreboard).where(eq(legacyMatchScoreboard.matchId, row!.id));
    expect(stats!.valkyriaSide).toBeNull();
    expect(stats!.sourceGameUrl).toBeNull();
    expect(rounds).toHaveLength(1);
    expect(rounds[0]!.snapshot.valkyriaSide).toBeNull();
    expect(JSON.stringify([stats, rounds])).not.toContain('PRIVATE-MARKER');
    expect(sourceHash(stats!.players)).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects duplicate source IDs before writing any records', async () => {
    await expect(importLegacyBundle(t.db, { ...bundle, documents: [], matches: [fixture, fixture] }, root, { apply: true })).rejects.toThrow('Duplicate');
  });
  it('keeps source tag labels in published revisions and preserves later taxonomy edits', async () => {
    const tagged = { ...doc, legacyId: 'tagged-report', slug: 'tagged-report', tags: ['ECL 2025', 'Herní servery'] };
    const input = { ...bundle, documents: [tagged], matches: [] };
    expect((await importLegacyBundle(t.db, input, root, { apply: true, publish: true })).items[0]?.action).toBe('create');
    const [translation] = await t.db.select().from(contentTranslation).where(eq(contentTranslation.liveSlug, tagged.slug));
    const [revision] = await t.db.select().from(contentRevision).where(eq(contentRevision.id, translation!.publishedRevisionId!));
    expect(revision!.taxonomy.tags.map((tag) => tag.label)).toEqual(tagged.tags);
    const key = revision!.taxonomy.tags[0]!.key;
    await t.db.update(taxonomyTerm).set({ labelCs: 'Editorial label' }).where(eq(taxonomyTerm.key, key));
    expect((await importLegacyBundle(t.db, input, root, { apply: true, publish: true })).items[0]?.action).toBe('unchanged');
    expect((await t.db.select().from(taxonomyTerm).where(eq(taxonomyTerm.key, key)))[0]?.labelCs).toBe('Editorial label');
  });
});
