import { z } from 'zod';
import { importMediaSchema, sourceHash } from './import-contract';
import { LEGACY_HLL_ORIGIN } from './hll';

const sourceUrl = z.url().max(2048).refine((value) => {
  const url = new URL(value);
  return url.origin === LEGACY_HLL_ORIGIN && !url.username && !url.password;
});
const digest = z.string().regex(/^[a-f0-9]{64}$/);

/** A separately hashed supplement; it never changes the accepted source bundle. */
export const editorialSupplementSchema = z.object({
  schemaVersion: z.literal(1), sourceRevision: z.string().min(1).max(100), bundleSha256: digest,
  media: z.array(importMediaSchema).max(50),
  documents: z.array(z.object({
    kind: z.enum(['news', 'manual', 'tournament']), legacyId: z.string().min(1).max(200),
    authorImageSourceUrl: sourceUrl.optional(), coverSourceUrl: sourceUrl.optional(),
    thumbnailSourceUrl: sourceUrl.optional(), sourceIndex: z.number().int().min(0).max(10000).optional(),
  }).strict()).max(500),
}).strict().superRefine((value, ctx) => {
  const keys = value.documents.map((doc) => `${doc.kind}:${doc.legacyId}`);
  if (new Set(keys).size !== keys.length || new Set(value.media.map((item) => item.id)).size !== value.media.length) ctx.addIssue({ code: 'custom', message: 'Duplicate supplement identity' });
  if (value.media.some((item) => item.rightsStatus !== 'legacy-published-owner-migration')) ctx.addIssue({ code: 'custom', message: 'Supplement media must use reviewed local intake' });
});
export type EditorialSupplement = z.infer<typeof editorialSupplementSchema>;
export const parseEditorialSupplement = (value: unknown) => editorialSupplementSchema.parse(value);

/** Public historical provenance, separate from the current editable revision. */
export const archiveEditorialSchema = z.object({
  schemaVersion: z.literal(1), kind: z.enum(['news', 'manual', 'page', 'tournament']),
  sourceUrl, sourceLanguage: z.enum(['cs', 'sk']), sourcePublishedOn: z.iso.date().nullable(),
  sourceModifiedOn: z.iso.date().nullable(), sourceAuthorLabel: z.string().max(120),
  excerpt: z.string().max(600), tag: z.string().max(80), series: z.string().max(160),
  logoAssetId: z.uuid().nullable(), authorImageAssetId: z.uuid().nullable(),
  coverSourceUrl: sourceUrl.nullable(), thumbnailSourceUrl: sourceUrl.nullable(),
  sourceIndex: z.number().int().min(0).max(10000).nullable(),
  warnings: z.array(z.enum(['modified_before_published'])).max(1),
}).strict();
export type ArchiveEditorialDetails = z.infer<typeof archiveEditorialSchema>;
export type PublicArchiveEditorial = ArchiveEditorialDetails & {
  logo: { assetId: string; width: number; height: number } | null;
  authorImage: { assetId: string; width: number; height: number } | null;
};

export function readArchiveEditorial(metadata: Record<string, unknown>): ArchiveEditorialDetails | null {
  const parsed = archiveEditorialSchema.safeParse(metadata.archiveEditorial);
  return parsed.success && metadata.archiveEditorialSha256 === sourceHash(parsed.data) ? parsed.data : null;
}
