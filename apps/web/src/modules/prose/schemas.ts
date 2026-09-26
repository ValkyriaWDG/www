import { LOCALES } from '@valkyria/db/schema';
import { z } from 'zod';

/** Maximum serialized size of one prose body (bytes of JSON text). */
export const MAX_PROSE_BODY_BYTES = 200_000;

export const proseOwnerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('member'), id: z.uuid() }),
  z.object({ kind: z.literal('match'), id: z.uuid() }),
]);

export const localeSchema = z.enum(LOCALES);

/** Revision-local cover presentation; alt text is required unless the image is decorative. */
export const coverSnapshotSchema = z
  .object({
    assetId: z.uuid(),
    alt: z.string().trim().max(300),
    caption: z.string().trim().max(500),
    decorative: z.boolean(),
  })
  .refine((cover) => cover.decorative || cover.alt.length > 0, { path: ['alt'], message: 'alt_required' });

const target = {
  owner: proseOwnerSchema,
  locale: localeSchema,
};

export const saveProseDraftSchema = z.object({
  ...target,
  /** `0` creates the translation; otherwise the translation's current version. */
  expectedVersion: z.number().int().min(0),
  body: z.unknown(),
  cover: coverSnapshotSchema.nullable().optional(),
  /** Debounced autosaves are marked separately from explicit saves in history. */
  kind: z.enum(['save', 'autosave']).default('save'),
});

export const publishProseSchema = z.object({
  ...target,
  expectedVersion: z.number().int().min(1),
  /** Defaults to the current draft revision of this exact translation. */
  revisionId: z.uuid().optional(),
});

export const unpublishProseSchema = z.object({ ...target, expectedVersion: z.number().int().min(1) });

export const restoreProseRevisionSchema = z.object({
  ...target,
  expectedVersion: z.number().int().min(1),
  revisionId: z.uuid(),
});

export const proseTargetSchema = z.object(target);

export type SaveProseDraftInput = z.input<typeof saveProseDraftSchema>;
export type PublishProseInput = z.input<typeof publishProseSchema>;
export type UnpublishProseInput = z.input<typeof unpublishProseSchema>;
export type RestoreProseRevisionInput = z.input<typeof restoreProseRevisionSchema>;
export type ProseTargetInput = z.input<typeof proseTargetSchema>;
