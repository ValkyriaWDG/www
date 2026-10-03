import { classifyFreshness, SERVER_FRESHNESS, type Freshness } from '../../contract';
import { type LeagueFixture, type LeagueFixtureState, type LeagueRead, type WarconLive, type WarconMatches, warconFreshness } from './contracts';

/*
 * Minimal website publication DTOs of the approved readers. Pure module (usable by client
 * components for typing and ageing). Producer identities and operational fields never
 * enter these objects: no Steam IDs, player rows, panel `serverId`, join `gameServerId`,
 * build, tier, reserved slots, throttling, ping, cash, Logi connection IDs, League
 * moderator text, member counts, warnings or parser diagnostics.
 */

/** Public rendering never presents an observation older than this as data (as for Logi projections). */
export const READER_PUBLIC_MAX_AGE_MS = 15 * 60_000;
/** Recent Warcon matches shown per server. */
export const WARCON_RECENT_MATCH_LIMIT = 5;

export type WarconScorePublic = { name: string; score: number };

export type WarconLivePublic = {
  /** Website public server ID (`?server=`), never the Logi connection ID. */
  publicId: string;
  observedAt: string | null;
  freshness: Freshness;
  serverName: string | null;
  map: string | null;
  lighting: string | null;
  playerCount: number | null;
  maxPlayers: number | null;
  /** Current round time, fresh observations only. */
  matchSeconds: number | null;
  /** Named faction scores, fresh observations only; zero is a real score. */
  scores: WarconScorePublic[];
  rotationNow: number | null;
  rotationNext: number | null;
};

export type WarconRecentMatchPublic = {
  id: number;
  startedAt: string;
  endedAt: string | null;
  map: string | null;
  experiences: string | null;
  lighting: string | null;
  peakPlayers: number;
  finalScores: WarconScorePublic[] | null;
  winner: string | null;
};

export type WarconRecentMatchesPublic = {
  publicId: string;
  observedAt: string | null;
  freshness: Freshness;
  matches: WarconRecentMatchPublic[];
};

/** One approved Warcon connection composed under its published website server. */
export type WarconServerPublic = {
  publicId: string;
  synthetic: boolean;
  live: WarconLivePublic;
  /** Present only where the recent-match view was requested (server detail). */
  recentMatches: WarconRecentMatchesPublic | null;
};

/** Unavailable view; `observedAt` keeps the last valid observation time so the UI can say how old it is. */
export function emptyWarconLive(publicId: string, observedAt: string | null = null): WarconLivePublic {
  return { publicId, observedAt, freshness: 'unavailable', serverName: null, map: null, lighting: null, playerCount: null, maxPlayers: null, matchSeconds: null, scores: [], rotationNow: null, rotationNext: null };
}

export function emptyWarconMatches(publicId: string): WarconRecentMatchesPublic {
  return { publicId, observedAt: null, freshness: 'unavailable', matches: [] };
}

const worse = (left: Freshness, right: Freshness): Freshness => (left === 'unavailable' || right === 'unavailable' ? 'unavailable' : left === 'stale' || right === 'stale' ? 'stale' : 'fresh');

/** Removes round progress from a non-fresh observation and every value from an unavailable one. */
function boundLive(live: WarconLivePublic, freshness: Freshness): WarconLivePublic {
  if (freshness === 'unavailable') return emptyWarconLive(live.publicId, live.observedAt);
  const fresh = freshness === 'fresh';
  return { ...live, freshness, matchSeconds: fresh ? live.matchSeconds : null, scores: fresh ? live.scores : [], rotationNow: fresh ? live.rotationNow : null, rotationNext: fresh ? live.rotationNext : null };
}

/**
 * Live view projection. `answered` is false after a failed pull: the view is then
 * unavailable immediately (keeping only the last valid observation time), so a cached
 * live score is never presented as current.
 */
export function toWarconLivePublic(publicId: string, live: WarconLive | null, now: Date, answered: boolean): WarconLivePublic {
  if (!live || !answered || !live.status) return emptyWarconLive(publicId, live?.observedAt ?? null);
  const freshness = worse(live.freshness, warconFreshness(live.observedAt, now.getTime(), live.ok));
  const status = live.status;
  return boundLive({
    publicId, observedAt: live.observedAt, freshness,
    serverName: status.serverName, map: status.map, lighting: status.lighting,
    playerCount: status.playerCount, maxPlayers: status.maxPlayers, matchSeconds: status.matchSeconds,
    scores: status.scores.map(({ name, score }) => ({ name, score })),
    rotationNow: status.rotationNow, rotationNext: status.rotationNext,
  }, freshness);
}

/** Ages a live projection on the client; a failed browser refresh is at most stale, never a silent upgrade. */
export function ageWarconLivePublic(live: WarconLivePublic, now: Date, failed = false): WarconLivePublic {
  const observed = warconFreshness(live.observedAt, now.getTime());
  const freshness = worse(live.freshness, failed && observed === 'fresh' ? 'stale' : observed);
  return boundLive(live, freshness);
}

export function toWarconRecentMatchesPublic(publicId: string, matches: WarconMatches | null, observedAt: string | null, now: Date, answered: boolean): WarconRecentMatchesPublic {
  if (!matches || observedAt === null) return emptyWarconMatches(publicId);
  const age = classifyFreshness(new Date(observedAt), now, SERVER_FRESHNESS);
  const freshness = worse(age, answered ? 'fresh' : 'stale');
  if (freshness === 'unavailable') return emptyWarconMatches(publicId);
  const rows = [...matches.matches]
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt) || right.id - left.id)
    .slice(0, WARCON_RECENT_MATCH_LIMIT)
    .map((row) => ({
      id: row.id, startedAt: row.startedAt, endedAt: row.endedAt, map: row.map, experiences: row.experiences, lighting: row.lighting,
      peakPlayers: row.peakPlayers, finalScores: row.finalScores?.map(({ name, score }) => ({ name, score })) ?? null, winner: row.winner,
    }));
  return { publicId, observedAt, freshness, matches: rows };
}

export function ageWarconRecentMatchesPublic(recent: WarconRecentMatchesPublic, now: Date, failed = false): WarconRecentMatchesPublic {
  const age = classifyFreshness(recent.observedAt ? new Date(recent.observedAt) : null, now, SERVER_FRESHNESS);
  const freshness = worse(recent.freshness, failed && age === 'fresh' ? 'stale' : age);
  return freshness === 'unavailable' ? emptyWarconMatches(recent.publicId) : { ...recent, freshness };
}

export function ageWarconServerPublic(entry: WarconServerPublic, now: Date, failed = false): WarconServerPublic {
  return { ...entry, live: ageWarconLivePublic(entry.live, now, failed), recentMatches: entry.recentMatches ? ageWarconRecentMatchesPublic(entry.recentMatches, now, failed) : null };
}

export type LeaguePreviewState = 'fresh' | 'stale' | 'unavailable';

/** Unverified Wardogs League preview; never carries a result (the CMS result is the only result). */
export type LeaguePreviewPublic = {
  /** Canonical editorial source URL (public League page). */
  sourceUrl: string;
  /** When the producer observed the League page (`fetchedAt`), null when nothing is shown. */
  observedAt: string | null;
  state: LeaguePreviewState;
  synthetic: boolean;
  title: string | null;
  fixtureNumber: number | null;
  type: string | null;
  status: string | null;
  scheduledAt: string | null;
  teams: { code: string; name: string | null }[];
  map: { name: string | null; zone: string | null; lighting: string | null } | null;
  hosting: { mode: string | null; teamCode: string | null } | null;
  mapVote: { status: string | null; closesAt: string | null } | null;
  progress: { label: string; state: 'done' | 'current' | 'not_started' | null; detail: string | null }[];
};

export function emptyLeaguePreview(sourceUrl: string, synthetic = false): LeaguePreviewPublic {
  return { sourceUrl, observedAt: null, state: 'unavailable', synthetic, title: null, fixtureNumber: null, type: null, status: null, scheduledAt: null, teams: [], map: null, hosting: null, mapVote: null, progress: [] };
}

/**
 * League read projection. `answered` is false when the last website pull failed; the
 * producer's own `stale`/`error` flags also keep the preview stale. A snapshot older
 * than the public maximum age is not shown at all.
 */
export function toLeaguePreviewPublic(sourceUrl: string, read: LeagueRead | null, now: Date, answered: boolean, synthetic = false): LeaguePreviewPublic {
  const snapshot = read?.snapshot ?? null;
  if (!read || !snapshot) return emptyLeaguePreview(sourceUrl, synthetic);
  const fetched = Date.parse(snapshot.fetchedAt);
  const age = now.getTime() - fetched;
  if (!Number.isFinite(age) || age < -30_000 || age > READER_PUBLIC_MAX_AGE_MS) return emptyLeaguePreview(sourceUrl, synthetic);
  return {
    sourceUrl, observedAt: snapshot.fetchedAt, synthetic,
    state: read.stale || read.error !== null || !answered ? 'stale' : 'fresh',
    title: snapshot.title, fixtureNumber: snapshot.fixtureNumber, type: snapshot.type, status: snapshot.status, scheduledAt: snapshot.scheduledAt,
    teams: snapshot.teams?.map(({ code, name }) => ({ code, name })) ?? [],
    map: snapshot.map ? { name: snapshot.map.name, zone: snapshot.map.zone, lighting: snapshot.map.lighting } : null,
    hosting: snapshot.hosting ? { mode: snapshot.hosting.mode, teamCode: snapshot.hosting.teamCode } : null,
    mapVote: snapshot.mapVote ? { status: snapshot.mapVote.status, closesAt: snapshot.mapVote.closesAt } : null,
    progress: snapshot.progress?.map(({ label, state, detail }) => ({ label, state, detail })) ?? [],
  };
}

/** Ages a preview for rendering: past the public maximum age nothing is shown. */
export function ageLeaguePreviewPublic(preview: LeaguePreviewPublic, now: Date): LeaguePreviewPublic {
  if (preview.state === 'unavailable' || preview.observedAt === null) return preview;
  const age = now.getTime() - Date.parse(preview.observedAt);
  return !Number.isFinite(age) || age > READER_PUBLIC_MAX_AGE_MS ? emptyLeaguePreview(preview.sourceUrl, preview.synthetic) : preview;
}

/** Tracked fixtures shown on the Wardogs matches page at most. */
export const LEAGUE_FIXTURES_PUBLIC_LIMIT = 20;
/**
 * A tracked fixture whose snapshot is older than this is no longer shown: the producer
 * refreshes tracked fixtures about every 5 minutes, so an older snapshot means the
 * fixture is no longer being refreshed (paused, archived or past its horizon).
 */
export const LEAGUE_FIXTURES_MAX_AGE_MS = 24 * 60 * 60_000;

export type LeagueFixtureItemState = 'fresh' | 'stale';

/** One unverified tracked Wardogs League fixture; never carries a result. */
export type LeagueFixturePublic = {
  /** External League match ID. */
  id: string;
  /** Canonical public League page of the fixture. */
  sourceUrl: string;
  /** Native Logi event external ID (a public `/[game]/matches/logi/[id]` route parameter), when bound. */
  eventId: string | null;
  /** Producer tracking state. */
  tracking: LeagueFixtureState;
  state: LeagueFixtureItemState;
  /** When the producer observed the League page (`fetchedAt`). */
  observedAt: string;
  title: string;
  fixtureNumber: number | null;
  type: string | null;
  status: string | null;
  scheduledAt: string | null;
  teams: { code: string; name: string | null }[];
  map: { name: string | null; zone: string | null; lighting: string | null } | null;
  hosting: { mode: string | null; teamCode: string | null } | null;
};

export type LeagueFixturesPublic = {
  /** Newest observation among the listed fixtures, null when nothing is listed. */
  observedAt: string | null;
  /** `unavailable` without any answered list, `stale` after a failed website pull, else `fresh`. */
  state: LeaguePreviewState;
  synthetic: boolean;
  /** More producer pages remained beyond the website's page bound. */
  truncated: boolean;
  items: LeagueFixturePublic[];
};

export function emptyLeagueFixtures(synthetic = false): LeagueFixturesPublic {
  return { observedAt: null, state: 'unavailable', synthetic, truncated: false, items: [] };
}

function withinFixtureAge(observedAt: string, now: Date): boolean {
  const age = now.getTime() - Date.parse(observedAt);
  return Number.isFinite(age) && age >= -30_000 && age <= LEAGUE_FIXTURES_MAX_AGE_MS;
}

/** Kickoff ascending, unscheduled fixtures last, then by League ID for a stable order. */
function compareFixtures(left: LeagueFixturePublic, right: LeagueFixturePublic): number {
  if (left.scheduledAt === null || right.scheduledAt === null) {
    if (left.scheduledAt === right.scheduledAt) return left.id.localeCompare(right.id);
    return left.scheduledAt === null ? 1 : -1;
  }
  return left.scheduledAt.localeCompare(right.scheduledAt) || left.id.localeCompare(right.id);
}

function newestObservation(items: readonly LeagueFixturePublic[]): string | null {
  let newest: string | null = null;
  for (const item of items) if (newest === null || item.observedAt > newest) newest = item.observedAt;
  return newest;
}

/**
 * Collection projection. `items` is `null` without any answered list (unavailable);
 * `answered` is false when the last website pull failed, which keeps every item and the
 * collection stale. The producer's own `stale`/`error` flags keep an item stale. Fixtures
 * whose snapshot is older than the public maximum age are dropped, the rest sorted by
 * kickoff with unscheduled ones last and capped at the public limit.
 */
export function toLeagueFixturesPublic(items: readonly LeagueFixture[] | null, now: Date, answered: boolean, synthetic = false, truncated = false): LeagueFixturesPublic {
  if (items === null) return emptyLeagueFixtures(synthetic);
  const rows: LeagueFixturePublic[] = [];
  for (const item of items) {
    const snapshot = item.snapshot;
    if (!withinFixtureAge(snapshot.fetchedAt, now)) continue;
    rows.push({
      id: item.id, sourceUrl: snapshot.sourceUrl, eventId: item.eventId, tracking: item.state,
      state: item.stale || item.error !== null || !answered ? 'stale' : 'fresh',
      observedAt: snapshot.fetchedAt,
      title: snapshot.title, fixtureNumber: snapshot.fixtureNumber, type: snapshot.type, status: snapshot.status, scheduledAt: snapshot.scheduledAt,
      teams: snapshot.teams?.map(({ code, name }) => ({ code, name })) ?? [],
      map: snapshot.map ? { name: snapshot.map.name, zone: snapshot.map.zone, lighting: snapshot.map.lighting } : null,
      hosting: snapshot.hosting ? { mode: snapshot.hosting.mode, teamCode: snapshot.hosting.teamCode } : null,
    });
  }
  const shown = rows.sort(compareFixtures).slice(0, LEAGUE_FIXTURES_PUBLIC_LIMIT);
  return { observedAt: newestObservation(shown), state: answered ? 'fresh' : 'stale', synthetic, truncated, items: shown };
}

/** Ages a collection for rendering: fixtures past the public maximum age disappear; the collection state is kept. */
export function ageLeagueFixturesPublic(list: LeagueFixturesPublic, now: Date): LeagueFixturesPublic {
  if (list.state === 'unavailable') return list;
  const items = list.items.filter((item) => withinFixtureAge(item.observedAt, now));
  return items.length === list.items.length ? list : { ...list, observedAt: newestObservation(items), items };
}
