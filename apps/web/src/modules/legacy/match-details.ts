import { z } from 'zod';
import { httpsUrlSchema } from '@/modules/matches/schemas';
import { hasControlCharacters } from '@/modules/prose/text';
import { normalizeLegacyMatch, type LegacyMatchClock } from './import-match';

// These are public source labels, not HTML or a copy of the original export.
// Preserve regional/unknown country labels as text; only the UI decides flag support.
const text = (max: number) => z.string().max(max).refine((value) => !hasControlCharacters(value), 'control_characters');
const nullableText = (max: number) => text(max).nullable();
const side = z.enum(['allies', 'axis']);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const sourceLink = z.object({
  url: httpsUrlSchema,
  title: nullableText(200), description: nullableText(2000), author: nullableText(200),
  date: nullableText(60), type: nullableText(60),
});

const detailsSchema = z.object({
  version: z.literal(1),
  homeTeamName: text(120).min(1), awayTeamName: text(120).min(1),
  homeCountry: nullableText(80), awayCountry: nullableText(80),
  homeSide: side.nullable(), awaySide: side.nullable(),
  homeSideLabel: nullableText(80), awaySideLabel: nullableText(80),
  capturePoint: nullableText(120), legacyPoint: nullableText(120),
  points: z.array(text(120)).max(20), durationMinutes: z.number().nonnegative().nullable(),
  firstCapture: side.nullable(), legacyFirstCaptured: side.nullable(), firstCaptureConflict: z.boolean(),
  sourceDate: z.string().regex(/^\d{1,2}\/\d{1,2}\/\d{4} (?:[01]\d|2[0-3]):[0-5]\d$/),
  separateTime: time.nullable(), timeConflict: z.boolean(),
  clock: z.enum(['legacy-fixed-offset', 'europe-prague']),
  sourceLinks: z.array(sourceLink).max(50),
}).refine((value) => value.firstCaptureConflict === Boolean(value.firstCapture && value.legacyFirstCaptured && value.firstCapture !== value.legacyFirstCaptured), 'capture_conflict_flag')
  .refine((value) => value.timeConflict === Boolean(value.separateTime && value.separateTime !== value.sourceDate.split(' ')[1]), 'time_conflict_flag');

export type LegacyMatchDetails = z.infer<typeof detailsSchema>;

/** Public projection: callers must first authorize the parent match's visibility. */
export function parseLegacyMatchDetails(input: unknown): LegacyMatchDetails | null {
  const result = detailsSchema.safeParse(input);
  return result.success ? result.data : null;
}

const extrasSchema = z.object({
  point: nullableText(120).optional(), time: time.nullable().optional(),
  first_capture: side.nullable().optional(), first_captured: side.nullable().optional(),
  links: z.array(sourceLink.extend({
    title: nullableText(200).optional(), description: nullableText(2000).optional(), author: nullableText(200).optional(),
    date: nullableText(60).optional(), type: nullableText(60).optional(),
  })).max(50).optional(),
});

/** Keep this projection separate from the v1 row used by historical source hashes. */
export function normalizeLegacyMatchDetails(input: unknown, clock: LegacyMatchClock = 'legacy-fixed-offset'): LegacyMatchDetails {
  const { row } = normalizeLegacyMatch(input, clock);
  const extras = extrasSchema.parse(input);
  const knownSide = (value: string | undefined) => value === 'allies' || value === 'axis' ? value : null;
  const firstCapture = extras.first_capture ?? null;
  const legacyFirstCaptured = extras.first_captured ?? null;
  const separateTime = extras.time ?? null;
  return detailsSchema.parse({
    version: 1, homeTeamName: row.teams.home.name, awayTeamName: row.teams.away.name,
    homeCountry: row.teams.home.country ?? null, awayCountry: row.teams.away.country ?? null,
    homeSide: knownSide(row.teams.home.side), awaySide: knownSide(row.teams.away.side),
    homeSideLabel: row.teams.home.side ?? null, awaySideLabel: row.teams.away.side ?? null,
    capturePoint: row.capPoint ?? null, legacyPoint: extras.point ?? null,
    points: row.points ?? [], durationMinutes: row.length ?? null,
    firstCapture, legacyFirstCaptured,
    firstCaptureConflict: Boolean(firstCapture && legacyFirstCaptured && firstCapture !== legacyFirstCaptured),
    sourceDate: row.date, separateTime,
    timeConflict: Boolean(separateTime && separateTime !== row.date.split(' ')[1]), clock,
    sourceLinks: (extras.links ?? []).map((link) => ({ url: link.url, title: link.title ?? null, description: link.description ?? null, author: link.author ?? null, date: link.date ?? null, type: link.type ?? null })),
  });
}
