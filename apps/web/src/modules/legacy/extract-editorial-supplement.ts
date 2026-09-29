import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseLegacyFrontmatter } from './extract-source';
import { editorialSupplementSchema, type EditorialSupplement } from './editorial-details';
import { importBundleSchema, sourceHash, type ImportMedia } from './import-contract';
import { LEGACY_HLL_ORIGIN } from './hll';

const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
async function contained(root: string, relative: string) {
  const base = await realpath(root);
  const file = await realpath(path.resolve(base, relative));
  const from = path.relative(base, file);
  if (!from || from.startsWith('..') || path.isAbsolute(from)) throw new Error('Editorial source path escaped');
  return file;
}

/** Reads only the frozen public-content frontmatter and its two author media candidates. */
export async function extractEditorialSupplement(input: unknown, sourceRoot: string, output: string): Promise<EditorialSupplement> {
  const bundle = importBundleSchema.parse(input);
  if (!path.resolve(output).split(path.sep).includes('.local')) throw new Error('Supplement must stay in ignored .local');
  const publicRoot = await contained(sourceRoot, 'public');
  const media = new Map<string, ImportMedia>();
  const documents: EditorialSupplement['documents'] = [];
  await mkdir(path.join(output, 'media'), { recursive: true });
  for (const doc of bundle.documents) {
    if (doc.kind === 'page' || doc.metadata.archive) continue;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(doc.legacyId)) throw new Error('Unsupported editorial source identity');
    const category = doc.kind === 'news' ? 'articles' : doc.kind === 'manual' ? 'guide' : 'tournaments';
    const { metadata } = parseLegacyFrontmatter(await readFile(await contained(sourceRoot, `content/${category}/${doc.legacyId}.mdx`), 'utf8'));
    const url = (key: string) => {
      const value = metadata[key];
      if (!value || typeof value !== 'string') return undefined;
      const parsed = new URL(value, LEGACY_HLL_ORIGIN);
      if (parsed.origin !== LEGACY_HLL_ORIGIN || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Unreviewed supplemental source URL');
      return parsed.href;
    };
    const authorImageSourceUrl = url('authorImage');
    const sourceIndex = typeof metadata.index === 'string' ? Number(metadata.index) : undefined;
    documents.push({ kind: doc.kind, legacyId: doc.legacyId, authorImageSourceUrl, coverSourceUrl: url('bannerUrl') ?? url('thumbnail'), thumbnailSourceUrl: url('thumbnail'), sourceIndex });
    if (authorImageSourceUrl && !media.has(authorImageSourceUrl)) {
      const parsed = new URL(authorImageSourceUrl);
      const relative = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
      if (relative.includes('\\') || !/^content\/articles\/authors\/[a-z0-9-]+\.webp$/.test(relative)) throw new Error('Unexpected supplemental author image');
      const filename = await contained(publicRoot, relative);
      if ((await stat(filename)).size > 15 * 1024 * 1024) throw new Error('Supplement image exceeds limit');
      const bytes = await readFile(filename);
      const digest = hash(`valkyria-legacy-media-v1:${authorImageSourceUrl}`);
      const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
      const relativeFile = `media/${id}.webp`;
      await writeFile(path.join(output, relativeFile), bytes, { flag: 'wx' }).catch(async (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST' || hash(await readFile(path.join(output, relativeFile))) !== hash(bytes)) throw error;
      });
      media.set(authorImageSourceUrl, { id, sourceUrl: authorImageSourceUrl, relativeFile, sha256: hash(bytes), bytes: bytes.length, alt: doc.authorLabel, role: 'logo', rightsStatus: 'legacy-published-owner-migration' });
    }
  }
  return editorialSupplementSchema.parse({ schemaVersion: 1, sourceRevision: bundle.sourceRevision, bundleSha256: sourceHash(bundle), media: [...media.values()], documents });
}
