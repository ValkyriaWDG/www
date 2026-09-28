// Local CRCON mock for SERVER_STATUS_SOURCE=crcon and scoreboard imports without a real
// server. Serves unmistakably synthetic responses in CRCON's current shape:
//   /alpha/api/get_public_info, /bravo/api/get_public_info → 200, /down/... → 503;
//   /alpha/api/get_map_scoreboard?map_id=N → a finished synthetic game N (N ≤ 9999).
// Usage: node e2e/support/crcon-mock.mjs [port]  (loopback only; the browser suite starts
// it on E2E_CRCON_MOCK_PORT through e2e/support/start-server.mjs)
import { createServer } from 'node:http';

const port = Number(process.argv[2] || process.env.E2E_CRCON_MOCK_PORT || 4610);

const layer = (map, mode) => ({ id: `synthetic_${mode}`, map: { id: 'synthetic', pretty_name: map }, game_mode: mode, pretty_name: `${map} ${mode}` });

const servers = {
  alpha: {
    current_map: { map: layer('Synthetic Map North', 'warfare'), start: Math.floor(Date.now() / 1000) - 1500 },
    next_map: { map: layer('Synthetic Map East', 'offensive'), start: null },
    player_count: 97,
    max_player_count: 100,
    player_count_by_team: { allied: 49, axis: 48 },
    score: { allied: 3, axis: 2 },
    time_remaining: 3252,
    name: { name: '[SYNTHETIC] CRCON Mock Alpha – Warfare', short_name: 'SYN' },
  },
  bravo: {
    current_map: { map: layer('Synthetic Map South', 'skirmish'), start: Math.floor(Date.now() / 1000) - 300 },
    next_map: { map: layer('Synthetic Map West', 'warfare'), start: null },
    player_count: 18,
    max_player_count: 100,
    player_count_by_team: { allied: 9, axis: 9 },
    score: { allied: 1, axis: 1 },
    time_remaining: 1210,
    name: { name: '[SYNTHETIC] CRCON Mock Bravo – Event server', short_name: 'SYN' },
  },
};

const weapons = { allies: ['M1 GARAND', 'BROWNING M1919'], axis: ['KARABINER 98K', 'MG42'] };

/** Five synthetic players per side; Axis wins 5 : 0 in Synthetic Map North (Offensive). */
function scoreboard(gameId) {
  const player = (side, index) => {
    const kills = (side === 'axis' ? 40 : 18) - index * 3;
    return {
      player_id: `synthetic-${side}-${index}`,
      player: `[SYN] CRCON ${side === 'allies' ? 'Allies' : 'Axis'} ${String(index + 1).padStart(2, '0')}`,
      steaminfo: { profile: { personaname: 'must not be imported' } },
      kills,
      kills_by_type: { infantry: kills - 2, machine_gun: 2 },
      deaths: 10 + index,
      teamkills: 0,
      time_seconds: 3600,
      kills_per_minute: Math.round((kills / 60) * 100) / 100,
      kill_death_ratio: Math.round((kills / (10 + index)) * 100) / 100,
      combat: 300 - index * 20,
      offense: 100 + index * 10,
      defense: 200 - index * 10,
      support: 100 + index * 15,
      weapons: { [weapons[side][0]]: kills - 2, [weapons[side][1]]: 2 },
      team: { side, confidence: 'strong', ratio: 100 },
      encounters: [],
    };
  };
  return {
    id: gameId,
    start: '2024-06-01T18:00:00',
    end: '2024-06-01T19:00:00',
    map_name: 'synthetic_offensive',
    result: { allied: 0, axis: 5 },
    map: layer('Synthetic Map North', 'offensive'),
    player_stats: [0, 1, 2, 3, 4].flatMap((index) => [player('allies', index), player('axis', index)]),
  };
}

function send(res, command, result) {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ result, command, arguments: {}, failed: false, error: null, version: 'v0.0.0-synthetic' }));
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const match = /^\/([a-z]+)\/api\/(get_public_info|get_map_scoreboard)$/.exec(url.pathname);
  const result = match ? servers[match[1]] : undefined;
  if (!match || !result) {
    res.statusCode = match?.[1] === 'down' ? 503 : 404;
    res.end();
    return;
  }
  if (match[2] === 'get_public_info') return send(res, 'get_public_info', result);
  const gameId = url.searchParams.get('map_id') ?? '';
  if (match[1] !== 'alpha' || !/^[1-9]\d{0,3}$/.test(gameId)) {
    res.statusCode = 404;
    res.end();
    return;
  }
  send(res, 'get_map_scoreboard', scoreboard(Number(gameId)));
}).listen(port, '127.0.0.1', () => console.log(`Synthetic CRCON mock on http://127.0.0.1:${port}`));
