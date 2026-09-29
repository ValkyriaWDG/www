import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { parseRichTextDocument } from '@/modules/content/rich-text/schema';
import { httpsUrlSchema } from '@/modules/matches/schemas';
import { LEGACY_HLL_ORIGIN } from './hll';

const text = (max: number) => z.string().max(max);
const day = z.iso.date().nullable();
const sourceUrl = httpsUrlSchema.refine((value) => new URL(value).origin === LEGACY_HLL_ORIGIN, 'Unexpected legacy origin');
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(120);
const relativeFile = z.string().min(1).max(500).refine((value) => !value.includes('\\') && !value.startsWith('/') && !value.includes(':') && value.split('/').every((part) => part && part !== '.' && part !== '..'), 'Unsafe bundle path');
const digest = z.string().regex(/^[a-f0-9]{64}$/);

export const importDocumentSchema = z.object({
  kind: z.enum(['news', 'manual', 'tournament', 'page']), legacyId: text(200).min(1), slug,
  game: z.enum(['hell-let-loose', 'wardogs']).nullable(), locale: z.literal('cs'), sourceLanguage: z.enum(['cs', 'sk']),
  sourceUrl, sourcePublishedOn: day, sourceModifiedOn: day,
  title: text(200).min(1), excerpt: text(600), authorLabel: text(120), credits: text(500),
  body: z.unknown().transform((value, ctx) => {
    const parsed = parseRichTextDocument(value);
    if (!parsed.ok) { ctx.addIssue({ code: 'custom', message: parsed.issues.join('; ') }); return z.NEVER; }
    return parsed.doc;
  }),
  coverAssetId: z.uuid().nullable(), tags: z.array(text(80)).max(30),
  metadata: z.object({
    categoryKey: slug.optional(), sortOrder: z.number().int().min(0).max(10000).optional(),
    pageKey: z.enum(['faq', 'clan']).optional(), archive: z.boolean().optional(), expiresOn: day.optional(),
    name: text(160).optional(), tag: text(80).optional(), series: text(160).optional(), season: text(60).optional(),
    startsOn: day.optional(), endsOn: day.optional(), links: z.array(z.object({ label: text(80), url: httpsUrlSchema })).max(10).optional(),
    sourceNotes: z.array(text(1000)).max(100).optional(), logoAssetId: z.uuid().nullable().optional(),
  }), warnings: z.array(text(1000)).max(500),
}).superRefine((value, ctx) => {
  if (value.kind === 'manual' && (!value.game || !value.metadata.categoryKey)) ctx.addIssue({ code: 'custom', message: 'Manual game/category required' });
  if (value.kind === 'page' && !value.metadata.pageKey) ctx.addIssue({ code: 'custom', message: 'Page key required' });
});

export const importMediaSchema = z.object({
  id: z.uuid(), sourceUrl: httpsUrlSchema, relativeFile: relativeFile.optional(), sha256: digest.optional(), bytes: z.number().int().positive().max(15 * 1024 * 1024).optional(),
  alt: text(300), role: z.enum(['body', 'cover', 'logo']), rightsStatus: z.enum(['legacy-published-owner-migration', 'external-review-required']),
}).superRefine((value, ctx) => {
  if (value.rightsStatus === 'legacy-published-owner-migration' && (!value.relativeFile || !value.sha256 || !value.bytes || new URL(value.sourceUrl).origin !== LEGACY_HLL_ORIGIN)) ctx.addIssue({ code: 'custom', message: 'Local legacy media needs its source, file, hash and size' });
});

export const importBundleSchema = z.object({
  schemaVersion: z.literal(1), sourceOrigin: z.literal(LEGACY_HLL_ORIGIN), observedAt: z.iso.datetime({ offset: true }), sourceRevision: text(100),
  documents: z.array(importDocumentSchema).max(500), media: z.array(importMediaSchema).max(1500),
  matches: z.array(z.record(z.string(), z.unknown())).max(5000),
  matchMedia: z.array(z.object({ legacyMatchId: z.number().int().positive(), homeLogoAssetId: z.uuid().nullable(), awayLogoAssetId: z.uuid().nullable(), leagueLogoAssetId: z.uuid().nullable(), mapAssetId: z.uuid().nullable(), mapSourceUrl: httpsUrlSchema.nullable() })).max(5000).optional(),
  scoreboardSources: z.array(z.object({ legacyMatchId: z.number().int().positive(), ordinal: z.number().int().min(1).max(50), providerGameId: z.number().int().positive().nullable(), valkyriaSide: z.enum(['allies', 'axis']).nullable().optional(), sourceGameUrl: httpsUrlSchema.refine((value) => /^https:\/\/event\.valkyriahll\.app\/games\/[1-9]\d*$/.test(value)).nullable().optional(), notes: z.array(text(2000)).max(100).optional(), relativeFile, sha256: digest, bytes: z.number().int().positive().max(16 * 1024 * 1024) })).max(1000),
  warnings: z.array(text(2000)).max(2000),
}).superRefine((value, ctx) => {
  const ids = [...value.documents.map((item) => `${item.kind}:${item.legacyId}`), ...value.media.map((item) => `media:${item.id}`)];
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Duplicate source identity' });
  const games = value.scoreboardSources.map((item) => `${item.legacyMatchId}:${item.ordinal}`);
  if (new Set(games).size !== games.length) ctx.addIssue({ code: 'custom', message: 'Duplicate scoreboard round' });
});

export type ImportBundle = z.output<typeof importBundleSchema>;
export type ImportDocument = z.output<typeof importDocumentSchema>;
export type ImportMedia = z.output<typeof importMediaSchema>;

/** Stable content hash; JSON property ordering and extraction time do not create new identities. */
export function sourceHash(value: unknown): string {
  function canonical(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
    return item;
  }
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

/** Files must stay inside the reviewed bundle, including after symlink resolution. */
export async function readBundleFile(root: string, file: { relativeFile: string; bytes: number; sha256: string }, maxBytes: number): Promise<Buffer> {
  relativeFile.parse(file.relativeFile);
  const base = await realpath(root);
  const target = await realpath(path.resolve(base, file.relativeFile));
  const relative = path.relative(base, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Bundle file escapes its directory');
  const info = await stat(target);
  if (!info.isFile() || info.size !== file.bytes || info.size > maxBytes) throw new Error('Bundle file size mismatch');
  const bytes = await readFile(target);
  if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error('Bundle file checksum mismatch');
  return bytes;
}
