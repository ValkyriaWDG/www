/** Test-process preload, never imported by application code or shipped as an API route. */
import { createHash } from 'node:crypto';
if (process.env.E2E_PUBLIC_PLAYER_FIXTURES !== '1') throw new Error('Public player mock requires its explicit synthetic fixture switch.');
const app = new URL(process.env.APP_URL ?? '');
const database = new URL(process.env.DATABASE_URL ?? '');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(app.hostname) || !['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname) || !database.pathname.endsWith('_logi_e2e')) throw new Error('Public player mock requires the disposable loopback browser environment.');
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.origin !== 'https://logi.example.test') return original(input, init);
  const gameId = url.searchParams.get('game');
  if (url.pathname !== '/api/v1/public/players/910000000000000003' || !['hell_let_loose', 'wardogs'].includes(gameId) || (init?.method ?? 'GET') !== 'GET') return Response.json({ error: { code: 'not_found' } }, { status: 404 });
  const wardogs = gameId === 'wardogs';
  return Response.json({ data: {
    ...(url.searchParams.get('identity') === 'discord' ? { identityBinding: createHash('sha256').update(JSON.stringify(['public-player-native-v1', 'private-basic-shared-identity', '910000000000000003'])).digest('hex') } : {}),
    id: '910000000000000003', name: 'PRIVATE_MOCK_ACCOUNT_NAME', avatar: 'https://example.test/private-mock-avatar',
    clans: [{ id: 'private-mock-guild', name: 'PRIVATE_MOCK_CLAN', avatar: '', gameIds: [gameId] }], gameId, games: [gameId],
    stats: { matches: 57, kills: 1234, deaths: 567, kd: 2.18, ...(wardogs ? { cashDelta: -321 } : {}) },
    recentMatches: Array.from({ length: 30 }, (_, i) => ({ eventId: `private-mock-event-${i}`, name: `[SYNTHETIC] Recorded ${wardogs ? 'WDG' : 'HLL'} match ${String(i + 1).padStart(2, '0')}`,
      endedAt: new Date(Date.now() - (i + 1) * 86_400_000).toISOString(), mapName: 'Synthetic Recorded Map', gameId, kills: 10, deaths: 2, killDeathRatio: 5,
      ...(wardogs ? { cashDelta: i === 5 ? null : -100 } : { offense: 10, defense: 20, support: 30 }) })), updatedAt: new Date().toISOString(),
  } });
};
