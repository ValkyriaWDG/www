import { z } from 'zod';

/*
 * Wire DTOs of the three approved on-demand read endpoints of Logi PR #158 (af5a52a):
 * `GET /api/v1/clan/league-matches` (`src/domain/wardogs-league/contracts.ts`),
 * `GET /api/v1/clan/league-fixtures` (`src/domain/wardogs-league/fixture.ts`) and
 * `GET /api/v1/clan/warcon-data/{connectionId}` (`src/domain/game-data/warcon-contracts.ts`).
 * The producer validates its own output with `z.object` projections, so every served
 * object carries exactly the declared keys; this consumer uses `z.strictObject` so an
 * unexpected field (or a new producer version) is an `invalid_response`, never data.
 * Only the consumed views are modelled: the League read, the tracked-fixture collection
 * page and the Warcon `live` and `matches` views. These are not website publication
 * DTOs (see `public.ts`).
 */

export const LEAGUE_PARSER_VERSION = 'wardogs-league-html/1';
/** Producer-side shared cache lifetime per match ID. */
export const LEAGUE_CACHE_MS = 5 * 60_000;

const leagueText = z.string().min(1).max(500);
const leagueNullableText = leagueText.nullable();
const leagueTimestamp = z.iso.datetime();
const leagueCount = z.number().int().nonnegative().nullable();
const leagueChoice = z.strictObject({ teamCode: leagueText, value: leagueNullableText });

export const leagueSnapshotSchema = z.strictObject({
  id: leagueText,
  sourceUrl: z.url(),
  parserVersion: z.literal(LEAGUE_PARSER_VERSION),
  title: leagueText,
  fixtureNumber: leagueCount,
  type: leagueNullableText,
  status: leagueNullableText,
  scheduledAt: leagueTimestamp.nullable(),
  request: z.strictObject({ number: leagueCount, url: z.url() }).nullable(),
  teams: z.array(z.strictObject({
    code: leagueText,
    name: leagueNullableText,
    profileUrl: z.url(),
    nations: z.array(leagueText).max(30).nullable(),
    displayedMemberCount: leagueCount,
    faction: leagueNullableText,
    readyCheck: leagueNullableText,
  })).max(20).nullable(),
  map: z.strictObject({ name: leagueNullableText, zone: leagueNullableText, lighting: leagueNullableText }).nullable(),
  hosting: z.strictObject({ mode: leagueNullableText, teamCode: leagueNullableText }).nullable(),
  moderator: leagueNullableText,
  mapVote: z.strictObject({ status: leagueNullableText, closesAt: leagueTimestamp.nullable(), ballots: z.array(leagueChoice).max(20).nullable() }).nullable(),
  rules: z.strictObject({ summary: leagueNullableText, choices: z.array(leagueChoice).max(20).nullable() }).nullable(),
  readyCheck: leagueNullableText,
  progress: z.array(z.strictObject({ label: leagueText, state: z.enum(['done', 'current', 'not_started']).nullable(), detail: leagueNullableText })).max(30).nullable(),
  scoringRule: leagueNullableText,
  /** Always null in parser version 1: the League preview never carries a result. */
  results: z.null(),
  warnings: z.array(leagueText).max(100),
  fetchedAt: leagueTimestamp,
});
export type LeagueSnapshot = z.infer<typeof leagueSnapshotSchema>;

export const leagueErrorSchema = z.enum(['rate_limited', 'timeout', 'network', 'http', 'invalid_html', 'unsafe_redirect', 'too_large', 'refresh_in_progress']);
export type LeagueErrorCode = z.infer<typeof leagueErrorSchema>;

export const leagueReadSchema = z.strictObject({
  snapshot: leagueSnapshotSchema.nullable(),
  stale: z.boolean(),
  ageSeconds: z.number().int().nonnegative().nullable(),
  lastAttemptAt: leagueTimestamp.nullable(),
  nextRefreshAt: leagueTimestamp,
  error: leagueErrorSchema.nullable(),
});
export type LeagueRead = z.infer<typeof leagueReadSchema>;
export const leagueReadEnvelopeSchema = z.strictObject({ data: leagueReadSchema });

/** Producer tracking state of a durable League fixture record (`leagueTrackedMatches.state`). */
export const leagueFixtureStateSchema = z.enum(['pending', 'tracked', 'unmatched', 'ignored', 'paused', 'archived']);
export type LeagueFixtureState = z.infer<typeof leagueFixtureStateSchema>;

/** Producer page bounds of `GET /api/v1/clan/league-fixtures` (`parseLeagueFixtureQuery`). */
export const LEAGUE_FIXTURES_PAGE_LIMIT = 100;
export const LEAGUE_FIXTURES_CURSOR_MAX_LENGTH = 4096;

/**
 * One tracked external fixture (`projectLeagueFixture`): the League match ID, the guild
 * and game scope, an optional native Logi event binding, the tracking state and the same
 * public snapshot as the preview (results always `null`). `error` is a free producer
 * string and is bounded here; it never reaches a public DTO.
 */
export const leagueFixtureSchema = z.strictObject({
  /** External League match ID (the `id` of `https://wardogsleague.net/matches/<id>`), never a native event ID. */
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  guildId: z.string().min(1).max(64),
  gameId: z.literal('wardogs'),
  /** Native Logi event external ID bound to the fixture, when an administrator linked one. */
  eventId: z.string().min(1).max(200).nullable(),
  revision: z.string().min(1).max(40),
  state: leagueFixtureStateSchema,
  snapshot: leagueSnapshotSchema,
  stale: z.boolean(),
  ageSeconds: z.number().int().nonnegative(),
  lastAttemptAt: leagueTimestamp.nullable(),
  error: z.string().max(500).nullable(),
});
export type LeagueFixture = z.infer<typeof leagueFixtureSchema>;

export const leagueFixturesPageSchema = z.strictObject({
  items: z.array(leagueFixtureSchema).max(LEAGUE_FIXTURES_PAGE_LIMIT),
  nextCursor: z.string().min(1).max(LEAGUE_FIXTURES_CURSOR_MAX_LENGTH).nullable(),
});
export type LeagueFixturesPage = z.infer<typeof leagueFixturesPageSchema>;
export const leagueFixturesEnvelopeSchema = z.strictObject({ data: leagueFixturesPageSchema });

const warconText = z.string().max(200);
const warconCount = z.number().int().nonnegative().safe();
const warconNumber = z.number().finite();
const warconPositive = warconNumber.nonnegative();
const warconTime = z.iso.datetime({ offset: true });
const warconSteam = z.string().regex(/^7656119\d{10}$/);
const warconColor = z.string().regex(/^#[\da-f]{6}$/i).or(z.literal('')).nullable();
const warconScore = z.strictObject({ name: warconText, score: warconNumber });
const warconFaction = warconScore.extend({ colorHex: warconColor });
export const warconFreshnessSchema = z.enum(['fresh', 'stale', 'unavailable']);
export type WarconFreshness = z.infer<typeof warconFreshnessSchema>;

/** Live player observations are validated for contract fidelity and dropped before any website DTO. */
const warconPlayer = z.strictObject({
  steamId: warconSteam,
  name: warconText,
  faction: warconText.nullable(),
  kills: warconCount,
  deaths: warconCount,
  cash: warconNumber,
  ping: warconPositive.nullable(),
});

export const warconLiveStatusSchema = z.strictObject({
  serverName: warconText,
  map: warconText,
  experiences: z.array(warconText).max(100),
  lighting: warconText,
  alternator: warconText,
  scoreTick: warconNumber.nullable(),
  scoreTickMin: warconNumber.nullable(),
  scoreTickMax: warconNumber.nullable(),
  scoreCap: warconNumber.nullable(),
  matchSeconds: warconPositive.nullable(),
  playerCount: warconCount,
  maxPlayers: warconCount,
  scores: z.array(warconFaction).max(16),
  rotationNow: z.number().int(),
  rotationNext: z.number().int(),
});

export const warconLiveSchema = z.strictObject({
  serverId: z.uuid(),
  ok: z.boolean(),
  tier: z.enum(['watched', 'hot', 'idle', 'offline']),
  build: warconText,
  gameServerId: warconText,
  startedAt: warconTime.nullable(),
  reservedSlots: warconCount.nullable(),
  throttledUntil: warconTime.nullable(),
  status: warconLiveStatusSchema.nullable(),
  players: z.array(warconPlayer).max(300),
  statusAt: warconTime.nullable(),
  playersAt: warconTime.nullable(),
  observedAt: warconTime.nullable(),
  freshness: warconFreshnessSchema,
  playersFreshness: warconFreshnessSchema,
}).refine((value) => new Set(value.players.map((player) => player.steamId)).size === value.players.length);
export type WarconLive = z.infer<typeof warconLiveSchema>;

export const warconMatchSchema = z.strictObject({
  id: warconCount,
  startedAt: warconTime,
  endedAt: warconTime.nullable(),
  map: warconText.nullable(),
  experiences: warconText.nullable(),
  lighting: warconText.nullable(),
  peakPlayers: warconCount,
  players: warconCount,
  finalScores: z.array(warconScore).max(16).nullable(),
  winner: warconText.nullable(),
});
export const warconMatchesSchema = z.strictObject({
  matches: z.array(warconMatchSchema).max(50),
  live: z.array(warconFaction).max(16),
  page: warconCount,
  pageSize: warconCount,
  total: warconCount,
  pages: warconCount,
});
export type WarconMatches = z.infer<typeof warconMatchesSchema>;

export const WARCON_READ_VIEWS = ['live', 'matches'] as const;
export type WarconReadView = (typeof WARCON_READ_VIEWS)[number];

/** Only the two consumed views; any other producer view is out of this reader's scope. */
export const warconReadSchema = z.discriminatedUnion('view', [
  z.strictObject({ view: z.literal('live'), data: warconLiveSchema }),
  z.strictObject({ view: z.literal('matches'), data: warconMatchesSchema }),
]);
export const warconEnvelopeSchema = z.strictObject({
  connectionId: z.string().min(1).max(200),
  gameId: z.literal('wardogs'),
  provider: z.literal('wardogs_warcon'),
  fetchedAt: warconTime,
  cacheUntil: warconTime,
  result: warconReadSchema,
});
export type WarconEnvelope = z.infer<typeof warconEnvelopeSchema>;
export const warconEnvelopeResponseSchema = z.strictObject({ data: warconEnvelopeSchema });

/** Producer cache lifetime per view (`warconCacheMs`); the website polls no faster. */
export const WARCON_CACHE_MS: Record<WarconReadView, number> = { live: 10_000, matches: 60_000 };

/** Producer freshness rule (`warconFreshness`): fresh < 45 s, stale 45–180 s, otherwise unavailable; `!ok` is never fresh. */
export function warconFreshness(timestamp: string | null, nowMs: number, ok = true): WarconFreshness {
  const age = timestamp === null ? Number.POSITIVE_INFINITY : nowMs - Date.parse(timestamp);
  if (!Number.isFinite(age) && timestamp !== null) return 'unavailable';
  return age < 0 || age >= 180_000 ? 'unavailable' : !ok || age >= 45_000 ? 'stale' : 'fresh';
}
