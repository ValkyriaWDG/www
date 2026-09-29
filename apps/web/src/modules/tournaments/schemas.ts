import { GAMES } from '@valkyria/db/schema';
import { z } from 'zod';
import { vodLinkSchema } from '@/modules/matches/schemas';
import { SLUG_PATTERN } from '@/modules/prose/slug';
import { codePointLength, hasControlCharacters } from '@/modules/prose/text';

/*
 * Validated inputs for tournament use cases. Optional text fields: `undefined` keeps the
 * stored value on update, `null`/'' clears it. Dates are calendar days (`YYYY-MM-DD`).
 */

export const TOURNAMENT_SLUG_MAX = 120;
export const MAX_TOURNAMENT_LINKS = 10;

const singleLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((value) => !hasControlCharacters(value), 'control_characters')
    .refine((value) => codePointLength(value) <= max, 'too_long');

const optionalLine = (max: number) =>
  z
    .string()
    .trim()
    .refine((value) => !hasControlCharacters(value), 'control_characters')
    .refine((value) => codePointLength(value) <= max, 'too_long')
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value));

const optionalDay = z
  .union([z.iso.date(), z.literal('')])
  .nullable()
  .optional()
  .transform((value) => (value === '' ? null : value));

export const tournamentSlugSchema = z.string().trim().max(TOURNAMENT_SLUG_MAX).regex(SLUG_PATTERN, 'invalid_slug');

const facts = {
  game: z.enum(GAMES),
  name: singleLine(160),
  season: optionalLine(60),
  organizer: optionalLine(120),
  startsOn: optionalDay,
  endsOn: optionalDay,
  /** Website, rules, Discord or bracket links (HTTPS only). */
  links: z.array(vodLinkSchema).max(MAX_TOURNAMENT_LINKS).optional(),
  internalNotes: z.string().max(5000).optional(),
  slug: tournamentSlugSchema.optional(),
};

function endsAfterStart(value: { startsOn?: string | null; endsOn?: string | null }, ctx: z.RefinementCtx) {
  if (value.startsOn && value.endsOn && value.endsOn < value.startsOn) {
    ctx.addIssue({ code: 'custom', message: 'ends_before_start', path: ['endsOn'] });
  }
}

const target = { id: z.uuid(), expectedVersion: z.number().int().min(1) };

export const createTournamentSchema = z.object(facts).superRefine(endsAfterStart);

export const updateTournamentSchema = z
  .object({
    ...target,
    game: facts.game.optional(),
    name: facts.name.optional(),
    season: facts.season,
    organizer: facts.organizer,
    startsOn: facts.startsOn,
    endsOn: facts.endsOn,
    links: facts.links,
    internalNotes: facts.internalNotes,
    slug: facts.slug,
  })
  .superRefine(endsAfterStart);

export const tournamentTargetSchema = z.object(target);

const optionalFilter = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

export const adminTournamentListSchema = z.object({
  q: optionalFilter(z.string().trim().transform((value) => value.slice(0, 100) || undefined)),
  game: z.enum(GAMES).optional(),
  publication: z.enum(['draft', 'published']).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateTournamentInput = z.input<typeof createTournamentSchema>;
export type UpdateTournamentInput = z.input<typeof updateTournamentSchema>;
export type TournamentTargetInput = z.input<typeof tournamentTargetSchema>;
export type AdminTournamentListInput = z.input<typeof adminTournamentListSchema>;
