import { z } from 'zod';
import { createMatchSchema, httpsUrlSchema, type CreateMatchInput } from '@/modules/matches/schemas';
import { zonedLocalToInstant } from '@/modules/matches/time';
import { LEGACY_HLL_ORIGIN } from './hll';

const team = z.object({ name: z.string().min(1).max(120), side: z.string().max(60).optional(), img: z.string().max(2048).optional(), score: z.number().int().min(0).max(1_000_000), country: z.string().max(10).optional() });
const schema = z.object({
  id: z.number().int().positive(), date: z.string().regex(/^\d{1,2}\/\d{1,2}\/\d{4} \d{2}:\d{2}$/), completed: z.boolean(),
  teams: z.object({ home: team, away: team }), league: z.object({ name: z.string().min(1).max(120) }),
  map: z.string().max(80).nullable().optional(), capPoint: z.string().max(120).nullable().optional(),
  format: z.string().max(60), aside: z.string().max(60).optional(),
  length: z.union([z.number().nonnegative(), z.string().regex(/^\d{1,4}:[0-5]\d$/).transform((value) => { const [minutes, seconds] = value.split(':').map(Number); return minutes! + seconds! / 60; })]).optional(), points: z.array(z.string().max(120)).max(20).optional(),
  links: z.array(z.object({ url: httpsUrlSchema, title: z.string().max(200).optional(), author: z.string().max(200).optional() })).max(50).optional(),
  _legacyIdentity: z.object({ originalEmbeddedId: z.number().int().positive(), sourceFile: z.string().regex(/^\d+\.json$/), sourceUrl: httpsUrlSchema.refine((value) => new URL(value).origin === LEGACY_HLL_ORIGIN) }).optional(),
});

const TOURNAMENTS: Record<string, string> = {
  'ECL #26 S2': 'ecl-2026-fall', 'ECL #26 S1': 'ecl-2026-spring', 'ECL #25 S2': 'ecl-2025-fall',
  'ECL #25 S1': 'ecl-2025-spring', 'ECL #24': 'ecl-2024', 'GSC #25': 'greyhound-skirmish-cup-2025',
  'HCA FAP #25': 'hca-fap-2025', 'TNL EU S7': 'thursday-night-league-eu-season-7',
};

export type LegacyMatchClock = 'legacy-fixed-offset' | 'europe-prague';

export function normalizeLegacyMatch(input: unknown, clock: LegacyMatchClock = 'legacy-fixed-offset') {
  const row = schema.parse(input);
  if (!/^VLK(?:\b|RT|\+)/.test(row.teams.home.name)) throw new Error('Legacy home team is not Valkyria; manual mapping required');
  const [day, month, year, hour, minute] = row.date.split(/[ /:]/);
  const local = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}T${hour}:${minute}`;
  const startsAt = clock === 'europe-prague'
    ? zonedLocalToInstant(local, 'Europe/Prague')
    : new Date(z.iso.datetime({ offset: true }).parse(`${local}:00+01:00`));
  const bestOf = /^best of (\d+)$/.exec(row.format)?.[1];
  const teamSize = /^(\d+)vs\d+$/.exec(row.aside ?? '')?.[1];
  const sourceUrl = `${LEGACY_HLL_ORIGIN}/matches/${row.id}`;
  const facts: CreateMatchInput = createMatchSchema.parse({
    slug: String(row.id), game: 'hell-let-loose', opponentName: row.teams.away.name,
    opponentShortCode: /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,11}$/u.test(row.teams.away.name) ? row.teams.away.name : null,
    competitionType: row.league.name === 'Friendly' ? 'friendly' : /^(ECL|TNL)/.test(row.league.name) ? 'league' : 'tournament',
    competitionName: row.league.name, format: row.format, bestOf: bestOf ? Number(bestOf) : null,
    teamSize: teamSize ? Number(teamSize) : null, startsAt, timeZone: 'Europe/Prague',
    eventUrl: sourceUrl,
    vodLinks: (row.links ?? []).slice(0, 5).map((link) => ({ url: link.url, label: (link.title || link.author || 'Recording').slice(0, 80) })),
    internalNotes: `Legacy source: ${sourceUrl}\nHome team: ${row.teams.home.name}\nSource date: ${row.date} (${clock})\nCapture point: ${row.capPoint ?? 'unknown'}\nPoints: ${(row.points ?? []).join(', ')}\nDuration: ${row.length ?? 'unknown'} minutes`,
  });
  return { row, facts, sourceUrl, tournamentSlug: TOURNAMENTS[row.league.name] ?? null, valkyriaSide: row.teams.home.side === 'allies' || row.teams.home.side === 'axis' ? row.teams.home.side : null };
}
