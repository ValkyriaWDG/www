// Local CRCON mock for reviewing SERVER_STATUS_SOURCE=crcon without a real server.
// Serves unmistakably synthetic `get_public_info` responses in CRCON's current shape:
//   /alpha/api/get_public_info, /bravo/api/get_public_info → 200, /down/... → 503.
// Usage: node e2e/support/crcon-mock.mjs [port]  (loopback only)
import { createServer } from 'node:http';

const port = Number(process.argv[2] || 4610);

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

createServer((req, res) => {
  const match = /^\/([a-z]+)\/api\/get_public_info$/.exec(req.url ?? '');
  const result = match ? servers[match[1]] : undefined;
  if (!result) {
    res.statusCode = match?.[1] === 'down' ? 503 : 404;
    res.end();
    return;
  }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ result, command: 'get_public_info', arguments: {}, failed: false, error: null, version: 'v0.0.0-synthetic' }));
}).listen(port, '127.0.0.1', () => console.log(`Synthetic CRCON mock on http://127.0.0.1:${port}`));
