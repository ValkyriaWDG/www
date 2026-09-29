import type { MatchStatisticsPlayer, MatchStatisticsTeam, StatisticsSide } from '@valkyria/db/schema';

/**
 * Game statistics from a CRCON scoreboard (`GET <base>/api/get_map_scoreboard?map_id=N`,
 * or the same JSON exported and uploaded by an editor). Only an allowlist is kept:
 * in-game names and numbers, never Steam/platform IDs, encounters or chat. Values that
 * are missing or implausible become 0 for counters and are skipped for names.
 */

export const MAX_STATISTICS_PLAYERS = 200;
const MAX_WEAPONS_PER_TEAM = 12;

export type ParsedScoreboard = {
  externalGameId: string | null;
  serverNumber: number | null;
  mapName: string | null;
  mode: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  result: { allied: number; axis: number } | null;
  players: MatchStatisticsPlayer[];
  /** Weapon kill counts per player, used for team aggregation only (not stored per player). */
  weaponsByPlayer: Record<string, number>[];
  killsByTypeByPlayer: Record<string, number>[];
};

type Json = Record<string, unknown>;

function record(value: unknown): Json | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.length > max ? clean.slice(0, max) : clean;
}

function counter(value: unknown, max = 100_000): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? Math.round(value) : 0;
}

function ratio(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000 ? Math.round(value * 100) / 100 : 0;
}

function counts(value: unknown, maxEntries = 200): Record<string, number> {
  const source = record(value);
  if (!source) return {};
  const out: Record<string, number> = {};
  for (const [key, amount] of Object.entries(source).slice(0, maxEntries)) {
    const name = text(key, 80);
    const n = counter(amount);
    if (name && n > 0) out[name] = (out[name] ?? 0) + n;
  }
  return out;
}

function date(value: unknown): Date | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value * (value < 1e12 ? 1000 : 1));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value !== 'string') return null;
  const parsed = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Scores and source identity are facts: malformed values must never become zero. */
function integer(value: unknown, max: number, min = 0): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

function side(value: unknown): StatisticsSide | 'unknown' {
  const raw = typeof value === 'string' ? value : typeof record(value)?.side === 'string' ? (record(value)!.side as string) : null;
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  if (lower === 'allies' || lower === 'allied') return 'allies';
  if (lower === 'axis') return 'axis';
  return 'unknown';
}

const MODES: Record<string, string> = { warfare: 'Warfare', offensive: 'Offensive', skirmish: 'Skirmish', control: 'Control' };

function layer(value: unknown): { mapName: string | null; mode: string | null } {
  const entry = record(value);
  if (!entry) return { mapName: null, mode: null };
  const map = record(entry.map);
  const mode = text(entry.game_mode, 40)?.toLowerCase() ?? null;
  return { mapName: text(map?.pretty_name, 80) ?? text(map?.name, 80) ?? text(entry.pretty_name, 80), mode: mode ? (MODES[mode] ?? null) : null };
}

/** Parses a scoreboard envelope (`{ result: {...} }`) or its bare result object; `null` when it is not a game scoreboard. */
export function parseCrconScoreboard(body: unknown): ParsedScoreboard | null {
  const envelope = record(body);
  if (!envelope || envelope.failed === true) return null;
  // An envelope carries the game in `result`; a bare game object has its own `result` (the score).
  const inner = record(envelope.result);
  const game = inner && Array.isArray(inner.player_stats) ? inner : envelope;
  if (!Array.isArray(game.player_stats)) return null;
  const rows = game.player_stats.slice(0, MAX_STATISTICS_PLAYERS);
  const players: MatchStatisticsPlayer[] = [];
  const weaponsByPlayer: Record<string, number>[] = [];
  const killsByTypeByPlayer: Record<string, number>[] = [];
  for (const raw of rows) {
    const row = record(raw);
    const name = text(row?.player ?? row?.name, 64);
    if (!row || !name) continue;
    const weapons = counts(row.weapons);
    const topWeapon = Object.entries(weapons).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
    players.push({
      name,
      side: side(row.team),
      kills: counter(row.kills),
      deaths: counter(row.deaths),
      teamkills: counter(row.teamkills),
      combat: counter(row.combat),
      offense: counter(row.offense),
      defense: counter(row.defense),
      support: counter(row.support),
      killsPerMinute: ratio(row.kills_per_minute),
      killDeathRatio: ratio(row.kill_death_ratio),
      timeSeconds: counter(row.time_seconds, 6 * 3600),
      topWeapon,
    });
    weaponsByPlayer.push(weapons);
    killsByTypeByPlayer.push(counts(row.kills_by_type, 40));
  }
  const result = record(game.result);
  const allied = result ? integer(result.allied ?? result.Allied, 5) : null;
  const axis = result ? integer(result.axis ?? result.Axis, 5) : null;
  const externalId = game.id;
  const { mapName, mode } = layer(game.map);
  return {
    externalGameId: typeof externalId === 'number' || typeof externalId === 'string' ? (text(String(externalId), 64)?.match(/^[A-Za-z0-9_.:-]+$/)?.[0] ?? null) : null,
    serverNumber: integer(game.server_number, 2_147_483_647, 1),
    mapName: mapName ?? text(game.map_name, 80),
    mode,
    startedAt: date(game.start),
    endedAt: date(game.end),
    result: result && allied !== null && axis !== null ? { allied, axis } : null,
    players,
    weaponsByPlayer,
    killsByTypeByPlayer,
  };
}

function emptyTeam(): MatchStatisticsTeam {
  return { players: 0, kills: 0, deaths: 0, teamkills: 0, combat: 0, offense: 0, defense: 0, support: 0, killsByType: {}, weapons: [] };
}

/** Per-side totals, kills by weapon category and the most used weapons. Unknown-side players are not attributed. */
export function summarizeTeams(parsed: ParsedScoreboard): Record<StatisticsSide, MatchStatisticsTeam> {
  const teams = { allies: emptyTeam(), axis: emptyTeam() };
  const weapons = { allies: {} as Record<string, number>, axis: {} as Record<string, number> };
  parsed.players.forEach((player, index) => {
    if (player.side === 'unknown') return;
    const team = teams[player.side];
    team.players += 1;
    for (const key of ['kills', 'deaths', 'teamkills', 'combat', 'offense', 'defense', 'support'] as const) team[key] += player[key];
    for (const [type, n] of Object.entries(parsed.killsByTypeByPlayer[index] ?? {})) team.killsByType[type] = (team.killsByType[type] ?? 0) + n;
    for (const [weapon, n] of Object.entries(parsed.weaponsByPlayer[index] ?? {})) weapons[player.side][weapon] = (weapons[player.side][weapon] ?? 0) + n;
  });
  for (const key of ['allies', 'axis'] as const) {
    teams[key].weapons = Object.entries(weapons[key])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_WEAPONS_PER_TEAM)
      .map(([weapon, kills]) => ({ weapon, kills }));
  }
  return teams;
}

/** Players ordered for display: known sides first, then combat score and kills. */
export function orderPlayers(players: readonly MatchStatisticsPlayer[]): MatchStatisticsPlayer[] {
  return [...players].sort((a, b) => b.kills - a.kills || b.combat - a.combat || a.name.localeCompare(b.name));
}
