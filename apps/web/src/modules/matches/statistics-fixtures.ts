/**
 * Unmistakably synthetic CRCON scoreboard (`get_map_scoreboard` shape) for tests,
 * fixtures and review screenshots. Player names are labelled synthetic; the IDs and
 * Steam fields exist only to prove that the import drops them.
 */

const WEAPONS = {
  allies: ['M1 GARAND', 'BROWNING M1919', 'M1A1 THOMPSON', 'M1 CARBINE', 'BAZOOKA'],
  axis: ['KARABINER 98K', 'MG42', 'MP40', 'GEWEHR 43', 'PANZERSCHRECK'],
} as const;

function player(side: 'allies' | 'axis', index: number) {
  const base = side === 'allies' ? 30 : 22;
  const kills = base - index * 4;
  const deaths = 12 + index * 2;
  const weapons = Object.fromEntries(WEAPONS[side].slice(0, 3).map((weapon, position) => [weapon, Math.max(0, kills - position * 8 - 6)]));
  return {
    id: 1000 + index + (side === 'axis' ? 50 : 0),
    player_id: `76561190000000${side === 'allies' ? 1 : 2}${index}`,
    player: `[SYN] ${side === 'allies' ? 'Allies' : 'Axis'} Player ${String(index + 1).padStart(2, '0')}`,
    steaminfo: { profile: { personaname: 'must not be imported' } },
    kills,
    kills_by_type: { infantry: kills - 4, machine_gun: 3, grenade: 1 },
    deaths,
    teamkills: index === 2 ? 1 : 0,
    time_seconds: 5400 - index * 60,
    kills_per_minute: Math.round((kills / 90) * 100) / 100,
    kill_death_ratio: Math.round((kills / deaths) * 100) / 100,
    combat: 400 - index * 30,
    offense: 120 + index * 10,
    defense: 300 - index * 15,
    support: 150 + index * 20,
    weapons,
    death_by_weapons: {},
    team: { side, confidence: 'strong', ratio: 100 },
    encounters: [{ action: 'KILL', player_id: 'x', player_name: 'must not be imported', ts: 10, weapon: 'MG42' }],
  };
}

/** A finished synthetic Warfare game (default Allies 1 : 4 Axis), six players per side. */
export function syntheticScoreboard(options: { gameId?: number; perSide?: number; result?: { allied: number; axis: number } } = {}) {
  const perSide = options.perSide ?? 6;
  return {
    result: {
      id: options.gameId ?? 4242,
      creation_time: '2024-05-12T20:00:00',
      start: '2024-05-12T18:00:00',
      end: '2024-05-12T19:30:00',
      server_number: 1,
      map_name: 'synthetic_warfare',
      result: options.result ?? { allied: 1, axis: 4 },
      map: { id: 'synthetic_warfare', map: { id: 'synthetic', pretty_name: 'Synthetic Map D' }, game_mode: 'warfare', pretty_name: 'Synthetic Map D Warfare' },
      player_stats: [...Array.from({ length: perSide }, (_, index) => player('allies', index)), ...Array.from({ length: perSide }, (_, index) => player('axis', index))],
    },
    command: 'get_map_scoreboard',
    failed: false,
    error: null,
  };
}
