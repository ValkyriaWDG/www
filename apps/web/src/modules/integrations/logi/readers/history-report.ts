import { compareHistoryRevisions, HISTORY_MIN_MINUTES_DEFAULT, HISTORY_MIN_MINUTES_MAX, historyRecordSchema, type HistoryFilters, type HistoryRecord } from './history-contracts';

/*
 * Pure calculation rules of the retained-history report, ported from the producer's
 * `src/domain/game-data/history-report.ts` (Logi PR #158 at `72946e3`) so a website
 * report equals the Logi dashboard for the same records. No `server-only`, no I/O.
 *
 * Rules: records are deduplicated by ID keeping the highest revision (a correction
 * replaces its earlier contribution; nothing is incremented from polls); mixed guilds
 * are rejected; games are ordered by end time, then ID. Outcomes come from the Warcon
 * metadata. A faction's wins and appearances come from the faction list, with the
 * "winner named but absent from the factions" case counted as one appearance and one
 * win; winShare = wins / decided games (null without a decided game). Players are
 * keyed by `platform:platformId`, never by nickname; the latest non-empty name wins.
 * Metrics are summed over known values only with a `knownGames` count, and feed-only
 * metrics count only for games with a feed. Eligibility is a playtime floor that never
 * removes a game from the faction totals. K/D needs known kills and deaths for every
 * game of the player and deaths above zero; win rate excludes unknown results.
 */

export const HISTORY_METRICS = ['seconds', 'kills', 'deaths', 'cashDelta', 'headshots', 'teamKills', 'suicides', 'vehicleKills'] as const;
export type HistoryMetric = (typeof HISTORY_METRICS)[number];
/** Metrics the provider knows without a feed; the rest are unknown (not zero) in a game without one. */
export const HISTORY_BASE_METRICS: readonly HistoryMetric[] = ['seconds', 'kills', 'deaths', 'cashDelta'];

export type HistoryMetricTotal = { value: number | null; knownGames: number };

export type HistoryPlayer = {
  platform: string;
  platformId: string;
  name: string | null;
  lastSeen: string;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  unknownResults: number;
  eligible: boolean;
  winRate: number | null;
  kd: number | null;
  metrics: Record<HistoryMetric, HistoryMetricTotal>;
};

export type HistoryFactionTotal = { name: string; colorHex: string | null; wins: number; appearances: number; winShare: number | null };

export type HistoryOutcomes = { decided: number; draw: number; no_result: number; unknown: number };

export type HistoryReport = {
  games: number;
  outcomes: HistoryOutcomes;
  feedGames: number;
  minMinutes: number;
  firstEndedAt: string | null;
  lastEndedAt: string | null;
  factions: HistoryFactionTotal[];
  players: HistoryPlayer[];
  eligiblePlayers: number;
};

export type HistoryMapCount = { name: string; games: number };

/** Validates every candidate, keeps the highest revision per ID and orders by end time, then ID. */
export function latestHistoryRecords(input: readonly HistoryRecord[]): HistoryRecord[] {
  const latest = new Map<string, HistoryRecord>();
  let guildId: string | undefined;
  for (const candidate of input) {
    const record = historyRecordSchema.parse(candidate);
    guildId ??= record.guildId;
    if (record.guildId !== guildId) throw new Error('Mixed history workspace.');
    const previous = latest.get(record.id);
    if (!previous || compareHistoryRevisions(record.revision, previous.revision) > 0) latest.set(record.id, record);
  }
  return [...latest.values()].sort((a, b) => a.session.endedAt.localeCompare(b.session.endedAt) || a.id.localeCompare(b.id));
}

const emptyFaction = (name: string): HistoryFactionTotal => ({ name, colorHex: null, wins: 0, appearances: 0, winShare: null });

/** All counters are rebuilt from the latest retained records; nothing is incremented from polls. */
export function aggregateHistory(input: readonly HistoryRecord[], minMinutes: number = HISTORY_MIN_MINUTES_DEFAULT): HistoryReport {
  if (!Number.isFinite(minMinutes) || minMinutes < 0 || minMinutes > HISTORY_MIN_MINUTES_MAX) throw new Error('Invalid playtime floor.');
  const records = latestHistoryRecords(input);
  const outcomes: HistoryOutcomes = { decided: 0, draw: 0, no_result: 0, unknown: 0 };
  const factions = new Map<string, HistoryFactionTotal>();
  const players = new Map<string, HistoryPlayer>();
  let feedGames = 0;
  for (const { session } of records) {
    const metadata = session.warcon;
    outcomes[metadata.outcome] += 1;
    if (metadata.hasFeed) feedGames += 1;
    for (const side of metadata.factions) {
      const faction = factions.get(side.name) ?? emptyFaction(side.name);
      faction.colorHex = side.colorHex ?? faction.colorHex;
      faction.appearances += 1;
      if (metadata.outcome === 'decided' && side.name === metadata.winner) faction.wins += 1;
      factions.set(side.name, faction);
    }
    // A provider can name a winner without retaining the final scoreboard.
    if (metadata.winner && !metadata.factions.some((faction) => faction.name === metadata.winner)) {
      const winner = factions.get(metadata.winner) ?? emptyFaction(metadata.winner);
      winner.appearances += 1;
      winner.wins += 1;
      factions.set(winner.name, winner);
    }
    for (const fact of session.players) {
      const key = `${fact.platform}:${fact.platformId}`;
      const player = players.get(key) ?? {
        platform: fact.platform, platformId: fact.platformId, name: null, lastSeen: session.endedAt,
        matches: 0, wins: 0, losses: 0, draws: 0, unknownResults: 0, eligible: false, kd: null, winRate: null,
        metrics: Object.fromEntries(HISTORY_METRICS.map((metric) => [metric, { value: null, knownGames: 0 }])) as HistoryPlayer['metrics'],
      };
      player.matches += 1;
      player.lastSeen = session.endedAt;
      if (fact.name) player.name = fact.name;
      if (fact.result === 'win') player.wins += 1;
      else if (fact.result === 'loss') player.losses += 1;
      else if (fact.result === 'draw') player.draws += 1;
      else player.unknownResults += 1;
      for (const metric of HISTORY_METRICS) {
        const value = fact.metrics[metric];
        // Feed-only zeros without a feed are unknown, not observed zeros.
        if (typeof value !== 'number' || (!metadata.hasFeed && !HISTORY_BASE_METRICS.includes(metric))) continue;
        player.metrics[metric].value = (player.metrics[metric].value ?? 0) + value;
        player.metrics[metric].knownGames += 1;
      }
      players.set(key, player);
    }
  }
  for (const player of players.values()) {
    const { seconds, kills, deaths } = player.metrics;
    player.eligible = seconds.value !== null && seconds.value >= minMinutes * 60;
    player.kd = kills.knownGames === player.matches && deaths.knownGames === player.matches && deaths.value !== null && deaths.value > 0 && kills.value !== null
      ? kills.value / deaths.value
      : null;
    const decided = player.wins + player.losses + player.draws;
    player.winRate = decided ? player.wins / decided : null;
  }
  for (const faction of factions.values()) faction.winShare = outcomes.decided ? faction.wins / outcomes.decided : null;
  const everyPlayer = [...players.values()];
  return {
    games: records.length,
    outcomes,
    feedGames,
    minMinutes,
    firstEndedAt: records[0]?.session.endedAt ?? null,
    lastEndedAt: records.at(-1)?.session.endedAt ?? null,
    factions: [...factions.values()].sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name)),
    players: everyPlayer.sort((a, b) => (b.metrics.kills.value ?? -1) - (a.metrics.kills.value ?? -1) || a.platformId.localeCompare(b.platformId)),
    eligiblePlayers: everyPlayer.filter((player) => player.eligible).length,
  };
}

/**
 * Applies the producer's filter semantics locally so one complete snapshot answers any
 * filter: game end time in `[from, until)` (ISO instants, UTC), exact map name (a game
 * without a map never matches a map filter) and, when given, the exact source ID.
 * Keeps the input order and does not deduplicate.
 */
export function filterHistoryRecords(records: readonly HistoryRecord[], filters: Pick<HistoryFilters, 'from' | 'until' | 'map' | 'sourceId'>): HistoryRecord[] {
  const from = filters.from === undefined ? Number.NEGATIVE_INFINITY : Date.parse(filters.from);
  const until = filters.until === undefined ? Number.POSITIVE_INFINITY : Date.parse(filters.until);
  if (!Number.isFinite(from) && filters.from !== undefined) throw new Error('Invalid history filter.');
  if (!Number.isFinite(until) && filters.until !== undefined) throw new Error('Invalid history filter.');
  return records.filter((record) => {
    const ended = Date.parse(record.session.endedAt);
    return ended >= from && ended < until
      && (filters.map === undefined || record.session.map === filters.map)
      && (filters.sourceId === undefined || record.sourceId === filters.sourceId);
  });
}

/** Distinct map names of the latest retained games with their game counts, most played first, then by name. */
export function listHistoryMaps(input: readonly HistoryRecord[]): HistoryMapCount[] {
  const counts = new Map<string, number>();
  for (const record of latestHistoryRecords(input)) {
    if (record.session.map === null) continue;
    counts.set(record.session.map, (counts.get(record.session.map) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, games]) => ({ name, games })).sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
}
