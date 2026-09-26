import { DOCUMENT_KINDS, GAMES, LOCALES, SCHEDULE_STATES } from '@valkyria/db';
import { z } from 'zod';
import { DomainError } from '@/lib/result';
import { RICH_TEXT_LIMITS } from './rich-text/schema';
import { SLUG_PATTERN, slugSchema } from './slug';

/**
 * Input schemas for the content use cases. Exported so server actions and route
 * handlers validate the same shapes before calling a use case (which validates again).
 */

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Trimmed single-line text without control characters. */
const plainText = (max: number) =>
  z
    .string()
    .transform((value) => value.replace(CONTROL, '').replace(/\s+/g, ' ').trim())
    .pipe(z.string().max(max));

export const FIELD_LIMITS = {
  title: 200,
  excerpt: 600,
  authorLabel: 120,
  seoTitle: 120,
  seoDescription: 320,
} as const;

export const localeSchema = z.enum(LOCALES);
export const uuidSchema = z.uuid();
export const versionSchema = z.number().int().min(1).max(2_147_483_647);
export const taxonomyKeySchema = z.string().max(64).regex(SLUG_PATTERN);
export const gameSchema = z.enum(GAMES);

export const coverInputSchema = z.object({
  assetId: uuidSchema.transform((value) => value.toLowerCase()),
  alt: plainText(RICH_TEXT_LIMITS.maxAltLength).default(''),
  caption: plainText(RICH_TEXT_LIMITS.maxCaptionLength).default(''),
  decorative: z.boolean().default(false),
});

export const draftFieldsSchema = z
  .object({
    title: plainText(FIELD_LIMITS.title),
    slug: slugSchema,
    excerpt: plainText(FIELD_LIMITS.excerpt),
    /** Rich-text JSON; validated by `parseRichTextDocument`. */
    body: z.unknown(),
    cover: coverInputSchema.nullable(),
    authorLabel: plainText(FIELD_LIMITS.authorLabel),
    seoTitle: plainText(FIELD_LIMITS.seoTitle),
    seoDescription: plainText(FIELD_LIMITS.seoDescription),
  })
  .partial();
export type DraftFieldsInput = z.input<typeof draftFieldsSchema>;

/** Shared document fields (category/tags/game) with their own optimistic version. */
export const sharedFieldsSchema = z.object({
  expectedDocumentVersion: versionSchema,
  categoryKey: taxonomyKeySchema.nullable().optional(),
  tagKeys: z.array(taxonomyKeySchema).max(10).optional(),
  game: gameSchema.nullable().optional(),
});

export const createDocumentSchema = z.object({
  kind: z.literal('news').default('news'),
  locale: localeSchema,
  title: plainText(FIELD_LIMITS.title).pipe(z.string().min(1)),
  slug: slugSchema.optional(),
  fields: draftFieldsSchema.omit({ title: true, slug: true }).optional(),
  categoryKey: taxonomyKeySchema.nullable().optional(),
  tagKeys: z.array(taxonomyKeySchema).max(10).optional(),
  game: gameSchema.nullable().optional(),
});
export type CreateDocumentInput = z.input<typeof createDocumentSchema>;

export const addTranslationSchema = z.object({
  documentId: uuidSchema,
  locale: localeSchema,
  title: plainText(FIELD_LIMITS.title).optional(),
  slug: slugSchema.optional(),
});
export type AddTranslationInput = z.input<typeof addTranslationSchema>;

export const saveDraftSchema = z.object({
  translationId: uuidSchema,
  expectedVersion: versionSchema,
  kind: z.enum(['autosave', 'save']).default('save'),
  fields: draftFieldsSchema.default({}),
  shared: sharedFieldsSchema.optional(),
});
export type SaveDraftInput = z.input<typeof saveDraftSchema>;

export const translationVersionSchema = z.object({ translationId: uuidSchema, expectedVersion: versionSchema });
export type TranslationVersionInput = z.input<typeof translationVersionSchema>;

export const restoreRevisionSchema = translationVersionSchema.extend({ revisionId: uuidSchema });
export type RestoreRevisionInput = z.input<typeof restoreRevisionSchema>;

export const editorStateSchema = z.union([
  z.object({ translationId: uuidSchema }),
  z.object({ documentId: uuidSchema }),
]);
export type EditorStateInput = z.input<typeof editorStateSchema>;

export const listRevisionsSchema = z.object({
  translationId: uuidSchema,
  limit: z.number().int().min(1).max(100).default(50),
});
export type ListRevisionsInput = z.input<typeof listRevisionsSchema>;

export const ADMIN_STATES = [
  'draft',
  'published',
  'published_with_changes',
  'scheduled',
  'published_update_scheduled',
  'archived',
] as const;

export const listDocumentsSchema = z.object({
  q: plainText(80).optional(),
  kind: z.enum(DOCUMENT_KINDS).optional(),
  state: z.enum(ADMIN_STATES).optional(),
  locale: localeSchema.optional(),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});
export type ListDocumentsInput = z.input<typeof listDocumentsSchema>;

export const documentVersionSchema = z.object({ documentId: uuidSchema, expectedDocumentVersion: versionSchema });
export type DocumentVersionInput = z.input<typeof documentVersionSchema>;

export const duplicateDocumentSchema = z.object({ documentId: uuidSchema });

/** An absolute instant with offset, or a local wall-clock time in an IANA zone. */
export const dueAtSchema = z.union([
  z.iso.datetime({ offset: true }),
  z.object({
    localDateTime: z.string().max(19),
    timeZone: z.string().max(64).default('Europe/Prague'),
  }),
]);
export type DueAtInput = z.input<typeof dueAtSchema>;

export const scheduleSchema = z.object({
  translationId: uuidSchema,
  revisionId: uuidSchema.optional(),
  expectedVersion: versionSchema.optional(),
  dueAt: dueAtSchema,
});
export type ScheduleInput = z.input<typeof scheduleSchema>;

export const scheduleIdSchema = z.object({ scheduleId: uuidSchema });

export const reapproveSchema = z.object({ scheduleId: uuidSchema, dueAt: dueAtSchema.optional() });
export type ReapproveInput = z.input<typeof reapproveSchema>;

export const listSchedulesSchema = z.object({
  overdue: z.boolean().optional(),
  state: z.enum(SCHEDULE_STATES).optional(),
  locale: localeSchema.optional(),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});
export type ListSchedulesInput = z.input<typeof listSchedulesSchema>;

/** Parses input or throws `DomainError('validation')` with per-field messages. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    fieldErrors[key] ??= issue.message;
  }
  throw new DomainError('validation', 'Invalid input.', fieldErrors);
}
