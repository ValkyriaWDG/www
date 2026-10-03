import { HISTORY_MIN_MINUTES_DEFAULT, HISTORY_MIN_MINUTES_MAX, type HistoryFilters, type HistoryOutcome, type HistoryPlatform, type HistoryPlayerResult, type HistoryRecord } from './history-contracts';
import { HISTORY_BASE_METRICS, HISTORY_METRICS, type HistoryMapCount, type HistoryMetric, type HistoryReport } from './history-report';

/*
 * Website publication DTOs of the retained Warcon game history. Pure module (no
 * `server-only`, no I/O): client components may import it for types and the parsers.
 *
 * Publication policy. Faction aggregates, outcomes, maps and per-game facts are always
 * publishable. Player names and statistics appear only for a source whose operator set
 * `publishPlayers`; otherwise `players` is `null` everywhere and `playersPublished` is
 * false. A player is identified by an opaque key the server derives from the provider
 * identity with a per-source salt (`playerKey`), never by the platform ID. Never
 * projected: platform IDs, the source ID, guild ID, source digest, external match ID,
 * the provider server name, raw record revisions or any key material. Nothing here
 * infers members, rosters or attendance: factions are not clan teams and provider
 * players are not verified members. Retained completed-game statistics differ from
 * Warcon's live/session leaderboard (different coverage of playtime).
 */

export type HistoryPublicState = 'fresh' | 'stale' | 'preparing' | 'unavailable' | 'denied' | 'unsupported';
/** `all`: the complete retained archive of the source; `window`: games that ended at or after `from` only (budget fallback). */
export type HistoryCoveragePublic = { kind: 'all'; from: null } | { kind: 'window'; from: string };

/** Normalized public filters: ISO instants (UTC) with `from < until`, exact map, playtime floor in minutes. */
export type HistoryPublicFilters = { from: string | null; until: string | null; map: string | null; minMinutes: number };
export type HistoryGamesFiltersPublic = Pick<HistoryPublicFilters, 'from' | 'until' | 'map'>;

export type HistoryMetricPublic = { value: number | null; knownGames: number };
export type HistoryFactionPublic = { name: string; colorHex: string | null; wins: number; appearances: number; winShare: number | null };
export type HistoryMapPublic = { name: string; games: number };
export type HistoryOutcomesPublic = { decided: number; draw: number; noResult: number; unknown: number };

export type HistoryPlayerPublic = {
  /** Opaque, stable per source and configuration; not reversible to a platform ID. */
  key: string;
  name: string | null;
  platform: HistoryPlatform;
  lastSeen: string;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  unknownResults: number;
  eligible: boolean;
  winRate: number | null;
  kd: number | null;
  metrics: Record<HistoryMetric, HistoryMetricPublic>;
};

export type HistoryReportPublic = {
  /** Website public server ID (`publicServers`), never the retained-history source ID. */
  publicId: string;
  state: HistoryPublicState;
  synthetic: boolean;
  coverage: HistoryCoveragePublic;
  /** When the website completed the scan this report is computed from (null without a snapshot). */
  refreshedAt: string | null;
  /** Most recent successful game import of the Logi workspace (workspace-wide, not this source). */
  lastCollectedAt: string | null;
  filters: HistoryPublicFilters;
  games: number;
  outcomes: HistoryOutcomesPublic;
  feedGames: number;
  firstEndedAt: string | null;
  lastEndedAt: string | null;
  /** Wins descending, then name. */
  factions: HistoryFactionPublic[];
  /** Maps of the games in the period (`from`/`until`), regardless of the map filter; most played first. */
  maps: HistoryMapPublic[];
  playersPublished: boolean;
  eligiblePlayers: number;
  /** Kills descending; `null` unless the source publishes players. */
  players: HistoryPlayerPublic[] | null;
};

export type HistoryGameFactionPublic = { name: string; colorHex: string | null; score: number | null };
export type HistoryGamePlayerPublic = {
  key: string;
  name: string | null;
  platform: HistoryPlatform;
  faction: string | null;
  result: HistoryPlayerResult | null;
  seconds: number | null;
  kills: number | null;
  deaths: number | null;
  cashDelta: number | null;
  headshots: number | null;
  teamKills: number | null;
  suicides: number | null;
  vehicleKills: number | null;
};
export type HistoryGamePublic = {
  /** Stable retained record ID of the producer (not the provider match ID). */
  id: string;
  startedAt: string;
  endedAt: string;
  map: string | null;
  mode: string | null;
  lighting: string | null;
  outcome: HistoryOutcome;
  winner: string | null;
  hasFeed: boolean;
  /** Warcon factions with their final score when the scoreboard was retained; a named winner missing from the factions is appended. */
  factions: HistoryGameFactionPublic[];
  /** `null` unless the source publishes players; feed-only metrics are `null` in a game without a feed. */
  players: HistoryGamePlayerPublic[] | null;
};

export type HistoryGamesPublic = {
  publicId: string;
  state: HistoryPublicState;
  synthetic: boolean;
  coverage: HistoryCoveragePublic;
  refreshedAt: string | null;
  lastCollectedAt: string | null;
  filters: HistoryGamesFiltersPublic;
  /** 1-based; a page past the end is empty. */
  page: number;
  pageSize: typeof HISTORY_GAMES_PAGE_SIZE;
  /** Games matching the filters in the snapshot. */
  total: number;
  playersPublished: boolean;
  /** Newest first (end time, then ID). */
  games: HistoryGamePublic[];
};

export const HISTORY_GAMES_PAGE_SIZE = 20;
/** Longest accepted exact map filter. */
export const HISTORY_MAP_FILTER_MAX_LENGTH = 200;

/** Derives the opaque public key of one provider identity; supplied by the server (per-source salt). */
export type HistoryPlayerKey = (platform: HistoryPlatform, platformId: string) => string;

export const DEFAULT_HISTORY_PUBLIC_FILTERS: HistoryPublicFilters = { from: null, until: null, map: null, minMinutes: HISTORY_MIN_MINUTES_DEFAULT };

function instant(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 40) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/**
 * Normalizes raw query values into public filters: an unreadable instant is dropped,
 * both instants are dropped when `from` is not before `until`, the map is trimmed and
 * bounded, and the playtime floor is a whole number of minutes within the producer's
 * range (default 60). Never throws.
 */
export function parseHistoryPublicFilters(input: Partial<Record<'from' | 'until' | 'map' | 'minMinutes', unknown>> | null | undefined): HistoryPublicFilters {
  let from = instant(input?.from);
  let until = instant(input?.until);
  if (from !== null && until !== null && Date.parse(from) >= Date.parse(until)) { from = null; until = null; }
  const rawMap = typeof input?.map === 'string' ? input.map.trim() : '';
  const map = rawMap.length > 0 && rawMap.length <= HISTORY_MAP_FILTER_MAX_LENGTH ? rawMap : null;
  const rawMinutes = typeof input?.minMinutes === 'number' ? input.minMinutes : typeof input?.minMinutes === 'string' && /^\d{1,6}$/.test(input.minMinutes.trim()) ? Number(input.minMinutes.trim()) : Number.NaN;
  const minMinutes = Number.isInteger(rawMinutes) && rawMinutes >= 0 && rawMinutes <= HISTORY_MIN_MINUTES_MAX ? rawMinutes : HISTORY_MIN_MINUTES_DEFAULT;
  return { from, until, map, minMinutes };
}

/** 1-based page number from a raw query value; anything else is page 1. */
export function parseHistoryPage(value: unknown): number {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  return /^[1-9]\d{0,5}$/.test(text) ? Number(text) : 1;
}

/** The producer-side filter shape (`historyFiltersSchema`) of public filters; the source ID is added by the server. */
export function toHistoryFilters(filters: HistoryGamesFiltersPublic): Pick<HistoryFilters, 'from' | 'until' | 'map'> {
  return { ...(filters.from === null ? {} : { from: filters.from }), ...(filters.until === null ? {} : { until: filters.until }), ...(filters.map === null ? {} : { map: filters.map }) };
}

export type HistoryPublicContext = {
  publicId: string;
  state: HistoryPublicState;
  synthetic: boolean;
  coverage: HistoryCoveragePublic;
  refreshedAt: string | null;
  lastCollectedAt: string | null;
  publishPlayers: boolean;
  playerKey: HistoryPlayerKey;
};

export function emptyHistoryReportPublic(publicId: string, state: HistoryPublicState, filters: HistoryPublicFilters, synthetic = false): HistoryReportPublic {
  return {
    publicId, state, synthetic, coverage: { kind: 'all', from: null }, refreshedAt: null, lastCollectedAt: null, filters,
    games: 0, outcomes: { decided: 0, draw: 0, noResult: 0, unknown: 0 }, feedGames: 0, firstEndedAt: null, lastEndedAt: null,
    factions: [], maps: [], playersPublished: false, eligiblePlayers: 0, players: null,
  };
}

export function emptyHistoryGamesPublic(publicId: string, state: HistoryPublicState, filters: HistoryGamesFiltersPublic, page: number, synthetic = false): HistoryGamesPublic {
  return { publicId, state, synthetic, coverage: { kind: 'all', from: null }, refreshedAt: null, lastCollectedAt: null, filters: { from: filters.from, until: filters.until, map: filters.map }, page, pageSize: HISTORY_GAMES_PAGE_SIZE, total: 0, playersPublished: false, games: [] };
}

/** Report projection: aggregate facts always, player rows only for a publishing source, with opaque keys. */
export function toHistoryReportPublic(context: HistoryPublicContext, filters: HistoryPublicFilters, report: HistoryReport, maps: readonly HistoryMapCount[]): HistoryReportPublic {
  return {
    publicId: context.publicId, state: context.state, synthetic: context.synthetic, coverage: context.coverage, refreshedAt: context.refreshedAt, lastCollectedAt: context.lastCollectedAt,
    filters: { from: filters.from, until: filters.until, map: filters.map, minMinutes: report.minMinutes },
    games: report.games,
    outcomes: { decided: report.outcomes.decided, draw: report.outcomes.draw, noResult: report.outcomes.no_result, unknown: report.outcomes.unknown },
    feedGames: report.feedGames, firstEndedAt: report.firstEndedAt, lastEndedAt: report.lastEndedAt,
    factions: report.factions.map(({ name, colorHex, wins, appearances, winShare }) => ({ name, colorHex, wins, appearances, winShare })),
    maps: maps.map(({ name, games }) => ({ name, games })),
    playersPublished: context.publishPlayers,
    eligiblePlayers: report.eligiblePlayers,
    players: context.publishPlayers
      ? report.players.map((player) => ({
        key: context.playerKey(player.platform as HistoryPlatform, player.platformId), name: player.name, platform: player.platform as HistoryPlatform, lastSeen: player.lastSeen,
        matches: player.matches, wins: player.wins, losses: player.losses, draws: player.draws, unknownResults: player.unknownResults,
        eligible: player.eligible, winRate: player.winRate, kd: player.kd,
        metrics: Object.fromEntries(HISTORY_METRICS.map((metric) => [metric, { value: player.metrics[metric].value, knownGames: player.metrics[metric].knownGames }])) as HistoryPlayerPublic['metrics'],
      }))
      : null,
  };
}

function metricOf(record: HistoryRecord, metrics: Record<string, number | null>, metric: HistoryMetric): number | null {
  if (!record.session.warcon.hasFeed && !HISTORY_BASE_METRICS.includes(metric)) return null;
  const value = metrics[metric];
  return typeof value === 'number' ? value : null;
}

function toHistoryGamePublic(context: HistoryPublicContext, record: HistoryRecord): HistoryGamePublic {
  const { session } = record;
  const scores = new Map(session.participants.map((participant) => [participant.id, participant.score]));
  const factions: HistoryGameFactionPublic[] = session.warcon.factions.map((faction) => ({ name: faction.name, colorHex: faction.colorHex, score: scores.get(faction.name) ?? null }));
  if (session.warcon.winner !== null && !factions.some((faction) => faction.name === session.warcon.winner)) {
    factions.push({ name: session.warcon.winner, colorHex: null, score: scores.get(session.warcon.winner) ?? null });
  }
  return {
    id: record.id, startedAt: session.startedAt, endedAt: session.endedAt, map: session.map, mode: session.warcon.mode, lighting: session.warcon.lighting,
    outcome: session.warcon.outcome, winner: session.warcon.winner, hasFeed: session.warcon.hasFeed, factions,
    players: context.publishPlayers
      ? session.players.map((player) => ({
        key: context.playerKey(player.platform, player.platformId), name: player.name ?? null, platform: player.platform, faction: player.faction ?? null, result: player.result ?? null,
        seconds: metricOf(record, player.metrics, 'seconds'), kills: metricOf(record, player.metrics, 'kills'), deaths: metricOf(record, player.metrics, 'deaths'), cashDelta: metricOf(record, player.metrics, 'cashDelta'),
        headshots: metricOf(record, player.metrics, 'headshots'), teamKills: metricOf(record, player.metrics, 'teamKills'), suicides: metricOf(record, player.metrics, 'suicides'), vehicleKills: metricOf(record, player.metrics, 'vehicleKills'),
      }))
      : null,
  };
}

/** Games projection of already filtered, deduplicated records: newest first, one page of `HISTORY_GAMES_PAGE_SIZE`. */
export function toHistoryGamesPublic(context: HistoryPublicContext, filters: HistoryGamesFiltersPublic, records: readonly HistoryRecord[], page: number): HistoryGamesPublic {
  const current = Number.isInteger(page) && page >= 1 ? page : 1;
  const ordered = [...records].sort((a, b) => b.session.endedAt.localeCompare(a.session.endedAt) || b.id.localeCompare(a.id));
  const start = (current - 1) * HISTORY_GAMES_PAGE_SIZE;
  return {
    publicId: context.publicId, state: context.state, synthetic: context.synthetic, coverage: context.coverage, refreshedAt: context.refreshedAt, lastCollectedAt: context.lastCollectedAt,
    filters: { from: filters.from, until: filters.until, map: filters.map },
    page: current, pageSize: HISTORY_GAMES_PAGE_SIZE, total: ordered.length, playersPublished: context.publishPlayers,
    games: ordered.slice(start, start + HISTORY_GAMES_PAGE_SIZE).map((record) => toHistoryGamePublic(context, record)),
  };
}
