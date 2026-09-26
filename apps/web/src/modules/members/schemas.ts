import { GAMES, PROFILE_STATES, PUBLIC_ROLE_KEYS } from '@valkyria/db/schema';
import { z } from 'zod';
import { codePointLength, hasControlCharacters } from '@/modules/prose/text';
import { SLUG_PATTERN } from '@/modules/prose/slug';

export const MEMBER_SLUG_MAX = 80;
export const DISPLAY_NAME_MAX = 80;

/**
 * Approved display name. Only surrounding whitespace is trimmed; diacritics, emoji and
 * Unicode composition are stored exactly as supplied (no normalization).
 */
export const displayNameSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !hasControlCharacters(value), 'control_characters')
  .refine((value) => codePointLength(value) <= DISPLAY_NAME_MAX, 'too_long');

export const memberSlugSchema = z.string().trim().max(MEMBER_SLUG_MAX).regex(SLUG_PATTERN, 'invalid_slug');

const uniqueList = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .array(z.enum(values))
    .max(values.length)
    .refine((items) => new Set(items).size === items.length, 'duplicates');

const profileFields = {
  displayName: displayNameSchema,
  slug: memberSlugSchema.optional(),
  games: uniqueList(GAMES).optional(),
  publicRoleKeys: uniqueList(PUBLIC_ROLE_KEYS).optional(),
  avatarAssetId: z.uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
};

const target = { id: z.uuid(), expectedVersion: z.number().int().min(1) };

export const createMemberSchema = z.object(profileFields);

export const updateMemberSchema = z.object({
  ...target,
  displayName: displayNameSchema.optional(),
  slug: profileFields.slug,
  games: profileFields.games,
  publicRoleKeys: profileFields.publicRoleKeys,
  avatarAssetId: profileFields.avatarAssetId,
  sortOrder: profileFields.sortOrder,
});

export const memberTargetSchema = z.object(target);

const optionalFilter = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

/** Public directory filters. Invalid optional filters are ignored; page size is clamped to 50. */
export const publicMemberListSchema = z.object({
  game: optionalFilter(z.enum(GAMES)),
  role: optionalFilter(z.enum(PUBLIC_ROLE_KEYS)),
  q: optionalFilter(z.string().trim().transform((value) => value.slice(0, 100) || undefined)),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .catch(24)
    .transform((value) => Math.min(value, 50)),
});

export const adminMemberListSchema = z.object({
  q: optionalFilter(z.string().trim().transform((value) => value.slice(0, 100) || undefined)),
  state: z.enum(PROFILE_STATES).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateMemberInput = z.input<typeof createMemberSchema>;
export type UpdateMemberInput = z.input<typeof updateMemberSchema>;
export type MemberTargetInput = z.input<typeof memberTargetSchema>;
/** Raw public filters (e.g. URL search params); invalid values are ignored or clamped. */
export type PublicMemberListInput = {
  game?: string;
  role?: string;
  q?: string;
  page?: number | string;
  pageSize?: number | string;
};
export type AdminMemberListInput = z.input<typeof adminMemberListSchema>;
