import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { archiveEditorialSchema, editorialSupplementSchema, readArchiveEditorial } from './editorial-details';
import { extractEditorialSupplement } from './extract-editorial-supplement';
import { sourceHash, importBundleSchema, readBundleFile } from './import-contract';

const original = importBundleSchema.parse({ schemaVersion: 1, sourceOrigin: 'https://valkyriahll.cz', observedAt: '2026-09-29T10:00:00Z', sourceRevision: 'frozen-revision', media: [], matches: [], scoreboardSources: [], warnings: [], documents: [{ kind: 'news', legacyId: 'synthetic', slug: 'synthetic', game: 'hell-let-loose', locale: 'cs', sourceLanguage: 'cs', sourceUrl: 'https://valkyriahll.cz/articles/synthetic', sourcePublishedOn: '2020-01-01', sourceModifiedOn: null, title: 'Synthetic', excerpt: '', authorLabel: 'Synthetic author', credits: '', body: { type: 'doc', content: [{ type: 'paragraph', content: [] }] }, coverAssetId: null, tags: [], metadata: {}, warnings: [] }] });
const provenance = { schemaVersion: 1, kind: 'news', sourceUrl: original.documents[0]!.sourceUrl, sourceLanguage: 'cs', sourcePublishedOn: '2020-01-01', sourceModifiedOn: null, sourceAuthorLabel: 'Synthetic author', excerpt: '', tag: '', series: '', logoAssetId: null, authorImageAssetId: null, coverSourceUrl: null, thumbnailSourceUrl: null, sourceIndex: null, warnings: [] };

describe('historical editorial provenance boundary', () => {
  it('only projects exact typed metadata with its matching digest', () => {
    const value = archiveEditorialSchema.parse(provenance);
    expect(readArchiveEditorial({ archiveEditorial: value, archiveEditorialSha256: sourceHash(value) })).toEqual(value);
    expect(readArchiveEditorial({ archiveEditorial: { ...value, excerpt: 'changed' }, archiveEditorialSha256: sourceHash(value) })).toBeNull();
    expect(readArchiveEditorial({ archiveEditorial: { ...value, unexpectedPrivateField: 'value' }, archiveEditorialSha256: sourceHash(value) })).toBeNull();
  });
  it.each(['https://user:password@valkyriahll.cz/path', 'https://example.test/path', 'javascript:alert(1)'])('rejects unsafe public source URL %s', (sourceUrl) => {
    expect(archiveEditorialSchema.safeParse({ ...provenance, sourceUrl }).success).toBe(false);
  });
  it('rejects duplicate supplemental records and unreviewed media', () => {
    const entry = { kind: 'news', legacyId: 'synthetic' };
    const supplement = { schemaVersion: 1, sourceRevision: original.sourceRevision, bundleSha256: sourceHash(original), media: [], documents: [entry, entry] };
    expect(editorialSupplementSchema.safeParse(supplement).success).toBe(false);
    expect(editorialSupplementSchema.safeParse({ ...supplement, documents: [entry], media: [{ id: 'd1c159cb-660e-4e58-b933-42c0d41fc7c2', sourceUrl: 'https://example.test/image.webp', role: 'logo', alt: '', rightsStatus: 'external-review-required' }] }).success).toBe(false);
  });
});

describe('bounded local editorial supplement extraction', () => {
  let root: string; let output: string;
  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'vlk-supplement-')); output = path.join(root, '.local', 'supplement');
    await mkdir(path.join(root, 'content', 'articles'), { recursive: true });
    await mkdir(path.join(root, 'public', 'content', 'articles', 'authors'), { recursive: true });
    await writeFile(path.join(root, 'public', 'content', 'articles', 'authors', 'synthetic.webp'), Buffer.from('Synthetic source bytes; media pipeline validates image encoding separately.'));
    await writeFile(path.join(root, 'content', 'articles', 'synthetic.mdx'), '---\ntitle: Synthetic\nauthorImage: /content/articles/authors/synthetic.webp\nbannerUrl: /content/articles/synthetic.gif\nthumbnail: /content/articles/synthetic.gif\n---\n<CodeThatMustNeverRun />');
  });
  afterAll(async () => { await rm(root, { recursive: true, force: true }); });
  it('stages verified source bytes separately, deterministically, without altering the frozen input', async () => {
    const before = JSON.stringify(original);
    const first = await extractEditorialSupplement(original, root, output);
    const second = await extractEditorialSupplement(original, root, output);
    expect(second).toEqual(first); expect(JSON.stringify(original)).toBe(before);
    expect(first.bundleSha256).toBe(sourceHash(original)); expect(first.media).toHaveLength(1);
    expect(first.documents[0]?.coverSourceUrl).toBe('https://valkyriahll.cz/content/articles/synthetic.gif');
    const media = first.media[0]!;
    expect(await readBundleFile(output, { relativeFile: media.relativeFile!, bytes: media.bytes!, sha256: media.sha256! }, 15 * 1024 * 1024)).toEqual(await readFile(path.join(root, 'public/content/articles/authors/synthetic.webp')));
  });
  it('refuses output outside ignored staging and unauthorized source paths', async () => {
    await expect(extractEditorialSupplement(original, root, path.join(root, 'public-output'))).rejects.toThrow('ignored');
    await writeFile(path.join(root, 'content/articles/synthetic.mdx'), '---\nauthorImage: /private.webp\n---\n');
    await expect(extractEditorialSupplement(original, root, output)).rejects.toThrow('Unexpected');
  });
});
