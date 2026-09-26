// Local stand-in for the Discord REST guild-member endpoint used by browser tests.
// Only the synthetic guild exists; every identity is synthetic. Listens on loopback only.
//
//   GET  /api/v10/guilds/:guild/members/:user   -> 200 member | 404 Unknown Member/Guild | 503 outage | 429
//   POST /__control/members  { userId, roles?: string[], status?: 'present'|'absent'|'rate_limited'|'error' }
//   POST /__control/outage   { enabled: boolean, userId?: string }   (global when userId is omitted)
//   POST /__control/reset
//   GET  /__control/health
import http from 'node:http';

const port = Number(process.env.E2E_DISCORD_MOCK_PORT ?? 0);
if (!Number.isInteger(port) || port <= 0) throw new Error('E2E_DISCORD_MOCK_PORT must be set.');

const GUILD_ID = '100000000000000001';
const SNOWFLAKE = /^[0-9]{5,25}$/;
const members = new Map();
const userOutages = new Set();
let globalOutage = false;

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16_384) throw new Error('payload too large');
  }
  return raw ? JSON.parse(raw) : {};
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/__control/health') return send(res, 200, { ok: true });
    if (req.method === 'POST' && url.pathname === '/__control/reset') {
      members.clear();
      userOutages.clear();
      globalOutage = false;
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/__control/members') {
      const body = await readJson(req);
      if (!SNOWFLAKE.test(String(body.userId ?? ''))) return send(res, 400, { error: 'userId must be a snowflake' });
      const roles = Array.isArray(body.roles) ? body.roles.filter((role) => SNOWFLAKE.test(String(role))).map(String) : [];
      const status = ['present', 'absent', 'rate_limited', 'error'].includes(body.status) ? body.status : 'present';
      members.set(String(body.userId), { roles, status });
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/__control/outage') {
      const body = await readJson(req);
      if (body.userId !== undefined) {
        if (!SNOWFLAKE.test(String(body.userId))) return send(res, 400, { error: 'userId must be a snowflake' });
        if (body.enabled) userOutages.add(String(body.userId));
        else userOutages.delete(String(body.userId));
      } else {
        globalOutage = Boolean(body.enabled);
      }
      return send(res, 200, { ok: true });
    }

    const match = req.method === 'GET' ? url.pathname.match(/^\/api\/v10\/guilds\/([^/]+)\/members\/([^/]+)$/) : null;
    if (!match) return send(res, 404, { message: '404: Not Found', code: 0 });
    if (!(req.headers.authorization ?? '').startsWith('Bot ')) return send(res, 401, { message: '401: Unauthorized', code: 0 });
    const [, guildId, userId] = match;
    if (guildId !== GUILD_ID) return send(res, 404, { message: 'Unknown Guild', code: 10004 });
    if (globalOutage || userOutages.has(userId)) return send(res, 503, { message: 'Service Unavailable', code: 0 });
    const member = members.get(userId);
    if (!member || member.status === 'absent') return send(res, 404, { message: 'Unknown Member', code: 10007 });
    if (member.status === 'rate_limited') return send(res, 429, { message: 'You are being rate limited.', retry_after: 30, global: false }, { 'retry-after': '30' });
    if (member.status === 'error') return send(res, 500, { message: 'Internal Server Error', code: 0 });
    return send(res, 200, { user: { id: userId }, roles: member.roles, joined_at: '2024-01-01T00:00:00.000Z' });
  } catch {
    return send(res, 400, { error: 'bad request' });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[discord-mock] listening on 127.0.0.1:${port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
