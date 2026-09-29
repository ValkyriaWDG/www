import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { contentDocument, contentRevision, contentTranslation, legacyImport, tournament } from '@valkyria/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { importLegacyBundle } from '@/modules/legacy/import-bundle';
import { importBundleSchema, sourceHash } from '@/modules/legacy/import-contract';
import { getPublishedNewsBySlug } from '@/modules/content/public';
import { getPublicTournament } from '@/modules/tournaments/queries';
import { publishedEditorialArchives } from '@/modules/legacy/editorial-public';
import { deliverMedia } from '@/modules/media/delivery';
import { hasPublishedReference, usageCount, listAssetReferences } from '@/modules/media/usage';
import { createTestDatabase, type TestDatabase } from '../support/test-db';
import { runSeed } from '@/seed';

let t: TestDatabase; let root: string; let supplemental: string; let mediaRoot: string;
const logoId = '65100415-99c3-43fd-ab7b-133c14a82c3a'; const authorId = '30aaf222-f934-4319-9c97-264be26a2f26';
const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Unchanged source body.' }] }] };
const news = { kind: 'news', legacyId: 'synthetic-history', slug: 'synthetic-history', game: 'hell-let-loose', locale: 'cs', sourceLanguage: 'cs', sourceUrl: 'https://valkyriahll.cz/clanky/synthetic-history', sourcePublishedOn: '2020-05-01', sourceModifiedOn: '2019-05-01', title: 'Synthetic history', excerpt: 'Original excerpt.', authorLabel: 'Synthetic author', credits: '', body, coverAssetId: null, tags: [], metadata: {}, warnings: [] };
const competition = { ...news, kind: 'tournament', legacyId: 'synthetic-cup', slug: 'synthetic-cup', sourceUrl: 'https://valkyriahll.cz/turnaje/synthetic-cup', title: 'Synthetic Cup', excerpt: 'Previously omitted tournament description.', metadata: { name: 'Synthetic Cup', tag: 'SYN', series: 'Synthetic series', season: '2020', startsOn: '2020-05-01', endsOn: '2020-06-01', logoAssetId: logoId } };
let bundle: ReturnType<typeof importBundleSchema.parse>; let supplement: Record<string, unknown>;

beforeAll(async () => {
  t = await createTestDatabase(); await runSeed(t.db); root = await mkdtemp(path.join(os.tmpdir(), 'vlk-editorial-parity-'));
  supplemental = path.join(root, 'supplement'); mediaRoot = path.join(root, 'storage'); await mkdir(supplemental);
  const bytes = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#baab55' } }).webp().toBuffer();
  const descriptor = (id: string, url: string) => ({ id, sourceUrl: url, relativeFile: `${id}.webp`, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, alt: 'Synthetic source image', role: 'logo', rightsStatus: 'legacy-published-owner-migration' });
  const logo = descriptor(logoId, 'https://valkyriahll.cz/content/tournaments/synthetic-logo.webp');
  const author = descriptor(authorId, 'https://valkyriahll.cz/content/articles/authors/synthetic-author.webp');
  await writeFile(path.join(root, logo.relativeFile), bytes); await writeFile(path.join(supplemental, author.relativeFile), bytes);
  bundle = importBundleSchema.parse({ schemaVersion: 1, sourceOrigin: 'https://valkyriahll.cz', observedAt: '2026-09-29T10:00:00Z', sourceRevision: 'synthetic-editorial-snapshot', documents: [news, competition], media: [logo], matches: [], scoreboardSources: [], warnings: [] });
  supplement = { schemaVersion: 1, sourceRevision: bundle.sourceRevision, bundleSha256: sourceHash(bundle), media: [author], documents: [{ kind: 'news', legacyId: news.legacyId, authorImageSourceUrl: author.sourceUrl, coverSourceUrl: 'https://valkyriahll.cz/content/articles/synthetic-cover.gif' }] };
});
afterAll(async () => { await t.drop(); await rm(root, { recursive: true, force: true }); });

describe('additive historical editorial repair on PostgreSQL', () => {
  it('repairs complete source metadata, preserves source hashes and later editorial versions, and reruns without mutations', async () => {
    const imported = await importLegacyBundle(t.db, bundle, root, { apply: true, publish: true, mediaRoot });
    expect(imported.items.every((item) => item.action === 'create')).toBe(true);
    const [translation] = await t.db.select().from(contentTranslation).where(eq(contentTranslation.liveSlug, news.slug));
    await t.db.update(contentTranslation).set({ version: translation!.version + 3, draftSlug: 'editorial-draft' }).where(eq(contentTranslation.id, translation!.id));
    const before = { translations: await t.db.select().from(contentTranslation), revisions: await t.db.select().from(contentRevision), tournaments: await t.db.select().from(tournament), ledger: await t.db.select().from(legacyImport) };
    const options = { repairEditorialMetadata: true, editorialSupplement: supplement, editorialSupplementRoot: supplemental, mediaRoot };
    const dry = await importLegacyBundle(t.db, bundle, root, options);
    expect(dry.counts).toEqual({ 'media:create': 1, 'tournament:repair': 1, 'news:repair': 1 });
    expect(await t.db.select().from(legacyImport)).toEqual(before.ledger);
    const result = await importLegacyBundle(t.db, bundle, root, { ...options, apply: true });
    expect(result.counts).toEqual(dry.counts);
    expect(await t.db.select().from(contentTranslation)).toEqual(before.translations);
    expect(await t.db.select().from(contentRevision)).toEqual(before.revisions);
    expect(await t.db.select().from(tournament)).toEqual(before.tournaments);
    const after = await t.db.select().from(legacyImport);
    for (const prior of before.ledger) expect(after.find((row) => row.id === prior.id)?.sourceSha256).toBe(prior.sourceSha256);
    expect((await importLegacyBundle(t.db, bundle, root, { ...options, apply: true })).items.every((item) => item.action === 'unchanged')).toBe(true);
    expect(await t.db.select().from(legacyImport)).toEqual(after);
  });

  it('exposes attributed excerpt, source date anomaly, logo and author media through real public delivery', async () => {
    const lookup = await getPublishedNewsBySlug('cs', news.slug, t.db);
    expect(lookup?.kind).toBe('article'); if (lookup?.kind !== 'article') throw new Error('Missing article');
    const details = lookup.article.archiveEditorial!;
    expect(details).toMatchObject({ sourceModifiedOn: '2019-05-01', warnings: ['modified_before_published'], coverSourceUrl: 'https://valkyriahll.cz/content/articles/synthetic-cover.gif', sourceAuthorLabel: news.authorLabel });
    expect(lookup.article.body).toEqual(body);
    const cup = await getPublicTournament(t.db, 'hell-let-loose', competition.slug, 'cs');
    expect(cup?.archiveEditorial).toMatchObject({ excerpt: competition.excerpt, tag: 'SYN', series: 'Synthetic series' });
    for (const image of [details.authorImage, cup!.archiveEditorial!.logo]) {
      expect(image).toBeTruthy(); const id = image!.assetId;
      expect(await hasPublishedReference(t.db, id)).toBe(true);
      expect(await usageCount(t.db, id)).toBeGreaterThan(0);
      expect((await listAssetReferences(t.db, id)).some((ref) => ref.published)).toBe(true);
      const response = await deliverMedia(new Request(`https://example.test/api/media/${id}/thumb`), { assetId: id, variant: 'thumb' }, { db: t.db, mediaRoot, resolveActor: async () => ({ kind: 'anonymous' }) });
      expect(response.status).toBe(200); expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    }
    expect((await getPublicTournament(t.db, 'hell-let-loose', competition.slug, 'en'))?.archiveEditorial).toBeNull();
  });

  it('rejects mismatched source and supplement identity without silently changing metadata', async () => {
    const before = await t.db.select().from(legacyImport);
    await expect(importLegacyBundle(t.db, bundle, root, { apply: true, repairEditorialMetadata: true, editorialSupplement: { ...supplement, bundleSha256: '0'.repeat(64) } })).rejects.toThrow('match');
    const changed = importBundleSchema.parse({ ...bundle, documents: [{ ...news, excerpt: 'Changed source' }] });
    const report = await importLegacyBundle(t.db, changed, root, { apply: true, repairEditorialMetadata: true });
    expect(report.items[0]).toMatchObject({ action: 'conflict', reason: 'editorial_source_identity_mismatch' });
    expect(await t.db.select().from(legacyImport)).toEqual(before);
  });

  it('fails closed for a malformed, tampered or source-mismatched archival media grant', async () => {
    const [entry] = await t.db.select().from(legacyImport).where(eq(legacyImport.sourceKey, news.legacyId));
    const details = entry!.sourceMetadata.archiveEditorial as Record<string, unknown>;
    const author = details.authorImageAssetId as string;
    const variants = [
      { ...entry!.sourceMetadata, archiveEditorialSha256: '0'.repeat(64) },
      { ...entry!.sourceMetadata, archiveEditorial: { ...details, sourceUrl: 'https://valkyriahll.cz/articles/someone-else' }, archiveEditorialSha256: sourceHash({ ...details, sourceUrl: 'https://valkyriahll.cz/articles/someone-else' }) },
      { ...entry!.sourceMetadata, archiveEditorial: { ...details, kind: 'manual' }, archiveEditorialSha256: sourceHash({ ...details, kind: 'manual' }) },
    ];
    for (const metadata of variants) {
      await t.db.update(legacyImport).set({ sourceMetadata: metadata }).where(eq(legacyImport.id, entry!.id));
      expect(await hasPublishedReference(t.db, author)).toBe(false);
      expect((await publishedEditorialArchives(t.db, { kind: 'translation', ids: [entry!.translationId!] }, 'cs')).size).toBe(0);
      const response = await deliverMedia(new Request('https://example.test/media'), { assetId: author, variant: 'thumb' }, { db: t.db, mediaRoot, resolveActor: async () => ({ kind: 'anonymous' }) });
      expect(response.status).toBe(404);
    }
    await t.db.update(legacyImport).set({ sourceMetadata: entry!.sourceMetadata }).where(eq(legacyImport.id, entry!.id));
    expect(await hasPublishedReference(t.db, author)).toBe(true);
  });

  it('revokes anonymous media and metadata on archive/unpublish, preserving private reference/deletion protection', async () => {
    const [entry] = await t.db.select().from(legacyImport).where(eq(legacyImport.sourceKey, news.legacyId));
    const [translation] = await t.db.select().from(contentTranslation).where(eq(contentTranslation.id, entry!.translationId!));
    const metadata = entry!.sourceMetadata.archiveEditorial as { authorImageAssetId: string };
    await t.db.update(contentDocument).set({ archivedAt: new Date() }).where(eq(contentDocument.id, translation!.documentId));
    expect((await publishedEditorialArchives(t.db, { kind: 'translation', ids: [translation!.id] }, 'cs')).size).toBe(0);
    expect(await hasPublishedReference(t.db, metadata.authorImageAssetId)).toBe(false);
    const response = await deliverMedia(new Request('https://example.test/media'), { assetId: metadata.authorImageAssetId, variant: 'thumb' }, { db: t.db, mediaRoot, resolveActor: async () => ({ kind: 'anonymous' }) });
    expect(response.status).toBe(404); expect(await usageCount(t.db, metadata.authorImageAssetId)).toBeGreaterThan(0);
    const [cup] = await t.db.select().from(tournament).where(eq(tournament.slug, competition.slug));
    const [cupEntry] = await t.db.select().from(legacyImport).where(eq(legacyImport.tournamentId, cup!.id));
    await t.db.update(tournament).set({ publication: 'draft' }).where(eq(tournament.id, cup!.id));
    const logo = (cupEntry!.sourceMetadata.archiveEditorial as { logoAssetId: string }).logoAssetId;
    expect(await hasPublishedReference(t.db, logo)).toBe(false);
    expect((await publishedEditorialArchives(t.db, { kind: 'tournament', ids: [cup!.id] }, 'cs')).size).toBe(0);
  });
});
