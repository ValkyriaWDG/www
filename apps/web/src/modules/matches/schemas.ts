import { COMPETITION_TYPES, GAMES, MATCH_OUTCOMES, MATCH_STATUSES, RESULT_VERIFICATION, type MatchOutcome } from '@valkyria/db/schema';
import { z } from 'zod';
import { codePointLength, hasControlCharacters } from '@/modules/prose/text';
import { SLUG_PATTERN } from '@/modules/prose/slug';
import { isValidTimeZone } from './time';

/*
 * Validated inputs for match use cases (usable from server actions and admin forms).
 * Optional text fields: `undefined` keeps the stored value on update, `null`/'' clears it.
 */

export const MATCH_SLUG_MAX = 120;
export const MAX_VOD_LINKS = 5;
export const MAX_ROUNDS = 50;
export const MAX_SCORE = 1_000_000;

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

/** HTTPS-only external URL without embedded credentials. */
export const httpsUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .pipe(z.url({ protocol: /^https$/ }))
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'credentials_not_allowed');

export const timeZoneSchema = z.string().trim().refine(isValidTimeZone, 'invalid_time_zone');

export const matchSlugSchema = z.string().trim().max(MATCH_SLUG_MAX).regex(SLUG_PATTERN, 'invalid_slug');

/**
 * Start time: an absolute instant (ISO 8601 with `Z`/offset, or a Date), or a wall-clock
 * time in an explicit IANA zone converted with DST checks (see `time.ts`).
 */
export const startsAtInputSchema = z.union([
  z.date(),
  z.iso.datetime({ offset: true }),
  z.object({
    localDateTime: z.string().trim(),
    timeZone: timeZoneSchema,
    disambiguation: z.enum(['earlier', 'later']).optional(),
  }),
]);
export type StartsAtInput = z.input<typeof startsAtInputSchema>;

export const vodLinkSchema = z.object({
  url: httpsUrlSchema,
  label: singleLine(80),
});

const scoreSchema = z.number().int().min(0).max(MAX_SCORE);

export function outcomeForScores(valkyria: number, opponent: number): Exclude<MatchOutcome, 'unknown'> {
  if (valkyria > opponent) return 'win';
  if (valkyria < opponent) return 'loss';
  return 'draw';
}

/** One optional round/map. Generic: no game-specific scoring model is assumed. */
export const roundInputSchema = z.object({
  ordinal: z.number().int().min(1).max(MAX_ROUNDS).optional(),
  mapName: optionalLine(80),
  mode: optionalLine(60),
  side: optionalLine(60),
  scoreValkyria: scoreSchema.nullable().optional(),
  scoreOpponent: scoreSchema.nullable().optional(),
  outcome: z.enum(MATCH_OUTCOMES).nullable().optional(),
});

export const roundsInputSchema = z
  .array(roundInputSchema)
  .max(MAX_ROUNDS)
  .transform((rounds) =>
    rounds.map((round, index) => ({
      ordinal: round.ordinal ?? index + 1,
      mapName: round.mapName ?? null,
      mode: round.mode ?? null,
      side: round.side ?? null,
      scoreValkyria: round.scoreValkyria ?? null,
      scoreOpponent: round.scoreOpponent ?? null,
      outcome: round.outcome ?? null,
    })),
  )
  .superRefine((rounds, ctx) => {
    const seen = new Set<number>();
    rounds.forEach((round, index) => {
      if (seen.has(round.ordinal)) ctx.addIssue({ code: 'custom', message: 'duplicate_ordinal', path: [index, 'ordinal'] });
      seen.add(round.ordinal);
      if (round.scoreValkyria !== null && round.scoreOpponent !== null && round.outcome && round.outcome !== 'unknown') {
        if (round.outcome !== outcomeForScores(round.scoreValkyria, round.scoreOpponent)) {
          ctx.addIssue({ code: 'custom', message: 'outcome_inconsistent', path: [index, 'outcome'] });
        }
      }
    });
  });
export type RoundInput = z.input<typeof roundInputSchema>;
export type NormalizedRound = z.output<typeof roundsInputSchema>[number];

const matchFacts = {
  game: z.enum(GAMES),
  opponentName: singleLine(120),
  opponentShortCode: z
    .string()
    .trim()
    .max(12)
    .regex(/^([\p{L}\p{N}][\p{L}\p{N}._-]*)?$/u, 'invalid_short_code')
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value)),
  opponentLogoAssetId: z.uuid().nullable().optional(),
  competitionType: z.enum(COMPETITION_TYPES),
  competitionName: optionalLine(120),
  /** Linked tournament of the same game; `null` unlinks. */
  tournamentId: z.uuid().nullable().optional(),
  season: optionalLine(60),
  format: optionalLine(60),
  bestOf: z.number().int().min(1).max(99).nullable().optional(),
  teamSize: z.number().int().min(1).max(200).nullable().optional(),
  eventUrl: httpsUrlSchema.nullable().optional().or(z.literal('').transform(() => null)),
  vodLinks: z.array(vodLinkSchema).max(MAX_VOD_LINKS).optional(),
  coverAssetId: z.uuid().nullable().optional(),
  internalNotes: z.string().max(5000).optional(),
  slug: matchSlugSchema.optional(),
  /** Display zone; defaults to the zone of a wall-clock `startsAt`, else Europe/Prague. */
  timeZone: timeZoneSchema.optional(),
};

const target = { id: z.uuid(), expectedVersion: z.number().int().min(1) };

export const createMatchSchema = z.object({ ...matchFacts, startsAt: startsAtInputSchema });

export const updateMatchSchema = z.object({
  ...target,
  game: matchFacts.game.optional(),
  opponentName: matchFacts.opponentName.optional(),
  opponentShortCode: matchFacts.opponentShortCode,
  opponentLogoAssetId: matchFacts.opponentLogoAssetId,
  competitionType: matchFacts.competitionType.optional(),
  competitionName: matchFacts.competitionName,
  tournamentId: matchFacts.tournamentId,
  season: matchFacts.season,
  format: matchFacts.format,
  bestOf: matchFacts.bestOf,
  teamSize: matchFacts.teamSize,
  eventUrl: matchFacts.eventUrl,
  vodLinks: matchFacts.vodLinks,
  coverAssetId: matchFacts.coverAssetId,
  internalNotes: matchFacts.internalNotes,
  slug: matchFacts.slug,
  timeZone: matchFacts.timeZone,
  /** Planned or played rounds; scores are accepted only for completed matches. */
  rounds: roundsInputSchema.optional(),
});

export const matchTargetSchema = z.object(target);

export const postponeMatchSchema = z.object({ ...target, newStartsAt: startsAtInputSchema.nullable().optional() });

export const rescheduleMatchSchema = z.object({ ...target, startsAt: startsAtInputSchema, timeZone: timeZoneSchema.optional() });

export const recordResultSchema = z
  .object({
    ...target,
    scoreValkyria: scoreSchema.nullable(),
    scoreOpponent: scoreSchema.nullable(),
    /** Derived from known scores when omitted; required explicitly only for unknown scores. */
    outcome: z.enum(MATCH_OUTCOMES).optional(),
    verification: z.enum(RESULT_VERIFICATION),
    source: z
      .string()
      .trim()
      .max(300)
      .refine((value) => !hasControlCharacters(value), 'control_characters')
      .default(''),
    /** `undefined` keeps stored rounds; `[]` clears them. */
    rounds: roundsInputSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const known = value.scoreValkyria !== null && value.scoreOpponent !== null;
    const half = (value.scoreValkyria === null) !== (value.scoreOpponent === null);
    if (half) {
      ctx.addIssue({ code: 'custom', message: 'scores_both_or_neither', path: [value.scoreValkyria === null ? 'scoreValkyria' : 'scoreOpponent'] });
      return;
    }
    if (known && value.outcome !== undefined && value.outcome !== outcomeForScores(value.scoreValkyria!, value.scoreOpponent!)) {
      ctx.addIssue({ code: 'custom', message: 'outcome_inconsistent', path: ['outcome'] });
    }
    if (value.verification === 'verified' && !known && (value.outcome === undefined || value.outcome === 'unknown')) {
      ctx.addIssue({ code: 'custom', message: 'verified_requires_result', path: ['verification'] });
    }
  })
  .transform((value) => ({
    ...value,
    outcome:
      value.scoreValkyria !== null && value.scoreOpponent !== null
        ? outcomeForScores(value.scoreValkyria, value.scoreOpponent)
        : (value.outcome ?? 'unknown'),
  }));

const optionalFilter = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);

/** Public list filters. Invalid optional filters are ignored; page size is clamped to 25. */
export const publicMatchListSchema = z.object({
  view: z.enum(['upcoming', 'results']),
  game: optionalFilter(z.enum(GAMES)),
  status: optionalFilter(z.enum(MATCH_STATUSES)),
  competition: optionalFilter(z.enum(COMPETITION_TYPES)),
  q: optionalFilter(z.string().trim().transform((value) => value.slice(0, 100) || undefined)),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .catch(10)
    .transform((value) => Math.min(value, 25)),
  now: z.date().optional(),
});
/** Raw public filters (e.g. URL search params); invalid optional values are ignored or clamped. */
export type PublicMatchListInput = {
  view: 'upcoming' | 'results';
  game?: string;
  status?: string;
  competition?: string;
  q?: string;
  page?: number | string;
  pageSize?: number | string;
  /** Reference time for deterministic callers/tests; classification itself is status-based. */
  now?: Date;
};

export const adminMatchListSchema = z.object({
  q: optionalFilter(z.string().trim().transform((value) => value.slice(0, 100) || undefined)),
  game: z.enum(GAMES).optional(),
  status: z.enum(MATCH_STATUSES).optional(),
  publication: z.enum(['draft', 'published']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type AdminMatchListInput = z.input<typeof adminMatchListSchema>;

export type CreateMatchInput = z.input<typeof createMatchSchema>;
export type UpdateMatchInput = z.input<typeof updateMatchSchema>;
export type MatchTargetInput = z.input<typeof matchTargetSchema>;
export type PostponeMatchInput = z.input<typeof postponeMatchSchema>;
export type RescheduleMatchInput = z.input<typeof rescheduleMatchSchema>;
export type RecordResultInput = z.input<typeof recordResultSchema>;
