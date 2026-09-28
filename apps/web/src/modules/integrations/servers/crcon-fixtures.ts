/**
 * Unmistakably synthetic CRCON responses for tests and local review; no real server,
 * map rotation or population is represented.
 */

/** Synthetic response in the shape of CRCON's current `get_public_info` (rconweb/api/views.py). */
export function syntheticPublicInfo(overrides: Record<string, unknown> = {}) {
  return {
    result: {
      current_map: {
        map: {
          id: 'synthetic_warfare',
          map: { id: 'synthetic', name: 'SYNTHETIC', tag: 'SYN', pretty_name: 'Synthetic Map North', shortname: 'SYN' },
          game_mode: 'warfare',
          attackers: null,
          environment: 'day',
          pretty_name: 'Synthetic Map North Warfare',
        },
        start: 1790000000,
      },
      next_map: {
        map: { id: 'synthetic_east_offensive', map: { pretty_name: 'Synthetic Map East' }, game_mode: 'offensive', pretty_name: 'Synthetic Map East Offensive' },
        start: null,
      },
      player_count: 64,
      max_player_count: 100,
      player_count_by_team: { allied: 33, axis: 31 },
      score: { allied: 3, axis: 2 },
      allied_morale: 50,
      axis_morale: 50,
      time_remaining: 3252.4,
      vote_status: { votes: {} },
      name: { name: '[SYNTHETIC] CRCON Test Server', short_name: 'SYN', public_stats_port: null, public_stats_port_https: null },
      config: { server_name: '[SYNTHETIC] CRCON Test Server', password_protected: false },
      ...overrides,
    },
    command: 'get_public_info',
    arguments: {},
    failed: false,
    error: null,
    version: 'v0.0.0-synthetic',
  };
}
