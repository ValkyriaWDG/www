import { z } from 'zod';

/*
 * Wire DTOs of `GET /api/v1/clan/server-game-history` (Logi PR #158 at `72946e3`,
 * retained-history implementation `051457a`, duplicate-faction fix `424e118`):
 * `src/domain/game-data/history.ts`, `warcon-history-facts.ts` and the
 * `providerSessionSchema` of `contracts.ts`. The producer serves retained completed
 * Warcon games of the Wardogs workspace with UTC start/end, map, final scores, winner
 * and outcome, faction names/colours, mode/lighting, feed coverage and per-player
 * facts. This is server gameplay history: factions are not clan teams, provider
 * players are not verified members and games are not official League results.
 *
 * Everything is `z.strictObject`: an unknown key (or a newer producer version) is an
 * `invalid_response`, never data. The upstream refinements of a retained session are
 * encoded in the types where possible (`complete: true`, non-null start/end, required
 * Warcon metadata) and as refinements otherwise, so the accepted set is the producer's.
 * These are not website publication DTOs (see `history-public.ts`).
 */

/** Scanned games per page at most; a filtered page can be empty and still carry a cursor. */
export const HISTORY_PAGE_SIZE = 20;
/** Producer bound of the signed continuation cursor. */
export const HISTORY_CURSOR_MAX_LENGTH = 8192;
/** Workspace history revision and record revision: a decimal string compared with `BigInt`, never `Number`. */
export const HISTORY_REVISION_PATTERN = /^(0|[1-9][0-9]{0,127})$/;
/** Opaque retained-history source ID (not a Warcon connection ID, provider server ID or website public ID). */
export const HISTORY_SOURCE_ID_PATTERN = /^[a-f0-9]{64}$/;
/** Playtime floor of the player ranking, in minutes (`aggregateHistory`). */
export const HISTORY_MIN_MINUTES_DEFAULT = 60;
export const HISTORY_MIN_MINUTES_MAX = 100_000;

const text = z.string().min(1).max(200);
const timestamp = z.iso.datetime();
export const historyRevisionSchema = z.string().regex(HISTORY_REVISION_PATTERN);
export const historySourceIdSchema = z.string().regex(HISTORY_SOURCE_ID_PATTERN);

export const historyOutcomeSchema = z.enum(['decided', 'draw', 'no_result', 'unknown']);
export type HistoryOutcome = z.infer<typeof historyOutcomeSchema>;
export const historyPlatformSchema = z.enum(['steam', 'xbox', 'unknown']);
export type HistoryPlatform = z.infer<typeof historyPlatformSchema>;
export const historyPlayerResultSchema = z.enum(['win', 'loss', 'draw']);
export type HistoryPlayerResult = z.infer<typeof historyPlayerResultSchema>;

/** Final scoreboard entry; `id` is the faction name the Warcon metadata refers to. */
export const historyParticipantSchema = z.strictObject({
  id: text,
  label: text,
  score: z.number().finite().nullable(),
});
export type HistoryParticipant = z.infer<typeof historyParticipantSchema>;

export const historyFactionSchema = z.strictObject({
  name: text,
  colorHex: z.string().regex(/^#[\da-f]{6}$/i).nullable(),
});
export type HistoryFaction = z.infer<typeof historyFactionSchema>;

/** Warcon metadata of a retained game (`warconHistoryMetadataSchema`); faction names are unique. */
export const historyWarconSchema = z.strictObject({
  schemaVersion: z.literal(1),
  winner: text.nullable(),
  outcome: historyOutcomeSchema,
  hasFeed: z.boolean(),
  mode: z.string().max(200).nullable(),
  lighting: z.string().max(200).nullable(),
  factions: z.array(historyFactionSchema).max(16).refine((factions) => new Set(factions.map((faction) => faction.name)).size === factions.length, { message: 'Duplicate Warcon faction.' }),
});
export type HistoryWarcon = z.infer<typeof historyWarconSchema>;

/** One provider player fact; identity is `platform:platformId`, never the observed name. */
export const historyPlayerSchema = z.strictObject({
  platform: historyPlatformSchema,
  platformId: text,
  name: z.string().max(200).nullable().optional(),
  faction: z.string().max(200).nullable().optional(),
  result: historyPlayerResultSchema.nullable().optional(),
  /** Known values only; a missing or `null` metric is unknown, never zero. */
  metrics: z.record(z.string(), z.number().finite().nullable()),
});
export type HistoryPlayerFact = z.infer<typeof historyPlayerSchema>;

export const historySessionSchema = z.strictObject({
  externalId: z.string().min(1).max(100),
  startedAt: timestamp,
  endedAt: timestamp,
  complete: z.literal(true),
  map: text.nullable(),
  participants: z.array(historyParticipantSchema).max(16),
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
  warcon: historyWarconSchema,
  players: z.array(historyPlayerSchema).max(300),
}).refine((session) =>
  Date.parse(session.endedAt) >= Date.parse(session.startedAt)
  && new Set(session.players.map((player) => `${player.platform}:${player.platformId}`)).size === session.players.length
  && new Set(session.participants.map((faction) => faction.id)).size === session.participants.length
  && (session.warcon.winner === null || session.participants.length === 0 || session.participants.some((faction) => faction.id === session.warcon.winner)),
{ message: 'Invalid retained Warcon session.' });
export type HistorySession = z.infer<typeof historySessionSchema>;

export const historyRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  /** Stable record ID; replaying a game or rotating its key keeps it. */
  id: z.string().min(1).max(200),
  guildId: z.string().min(1).max(64),
  gameId: z.literal('wardogs'),
  provider: z.literal('wardogs_warcon'),
  sourceId: historySourceIdSchema,
  serverName: z.string().max(200).nullable(),
  revision: historyRevisionSchema,
  collectedAt: timestamp,
  updatedAt: timestamp,
  session: historySessionSchema,
});
export type HistoryRecord = z.infer<typeof historyRecordSchema>;

export const historyPageSchema = z.strictObject({
  items: z.array(historyRecordSchema).max(HISTORY_PAGE_SIZE),
  /** Workspace history revision of the whole scan; every item revision is at most this. */
  revision: historyRevisionSchema,
  /** The website rejects an empty continuation outright instead of asking the producer. */
  nextCursor: z.string().min(1).max(HISTORY_CURSOR_MAX_LENGTH).nullable(),
  /** Most recent successful game import of the workspace, not of the filtered source. */
  lastCollectedAt: timestamp.nullable(),
});
export type HistoryPage = z.infer<typeof historyPageSchema>;
export const historyPageEnvelopeSchema = z.strictObject({ data: historyPageSchema });
/** `?id=` answer; not used by the website readers yet, modelled for completeness. */
export const historyRecordEnvelopeSchema = z.strictObject({ data: historyRecordSchema });

const canonicalInstant = timestamp.transform((value) => new Date(value).toISOString());

/** Producer query filters (`historyFiltersSchema`); end time in `[from, until)`, exact map. */
export const historyFiltersSchema = z.strictObject({
  sourceId: historySourceIdSchema.optional(),
  map: text.optional(),
  from: canonicalInstant.optional(),
  until: canonicalInstant.optional(),
}).refine((value) => !value.from || !value.until || Date.parse(value.from) < Date.parse(value.until), { message: 'from must precede until' });
export type HistoryFilters = z.infer<typeof historyFiltersSchema>;

/** Compares two revision strings as the producer does. */
export function compareHistoryRevisions(left: string, right: string): -1 | 0 | 1 {
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
