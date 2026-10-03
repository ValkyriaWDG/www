import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetServerEnvForTests } from '@/lib/env';
import { getLogiServerOverview } from './logi-public';
import { readActiveLogiProjections } from './logi-store';
import { logiServerSnapshotSchema } from './logi/contracts';
import fixtures from './logi/fixtures/v0.5.json';

vi.mock('@/lib/db', () => ({ getDb: () => ({}) }));
vi.mock('./logi-store', () => ({ readActiveLogiProjections: vi.fn() }));

const now = new Date('2026-10-03T12:00:00Z');
const observedAt = new Date('2026-10-03T11:59:30Z');

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  resetServerEnvForTests();
});

describe.each(['hll', 'wardogs'] as const)('Logi %s public server source health', (game) => {
  it.each(['network', 'unauthorized', 'forbidden'])('removes live scores after a persisted %s failure despite a recent successful snapshot', async (errorCode) => {
    const hll = game === 'hll';
    const scores = hll
      ? [{ id: 'allied', label: 'Allied', score: 3 }, { id: 'axis', label: 'Axis', score: 2 }]
      : [{ id: 'red', label: 'Red', score: 0 }, { id: 'blue', label: 'Blue', score: 12 }, { id: 'green', label: 'Green', score: null }];
    const server = logiServerSnapshotSchema.parse({ ...fixtures.snapshots.data[hll ? 0 : 1], guildId: '910000000000000001', state: 'online', scores, freshness: 'fresh', observedAt: observedAt.toISOString() });
    vi.stubEnv('LOGI_SOURCES_JSON', JSON.stringify([{
      sourceInstanceId: 'synthetic-source', origin: 'https://logi.example.test', guildId: server.guildId, gameId: server.gameId,
      publicServers: [{ connectionId: server.id, publicId: 'community-one', name: 'Approved server', published: true, address: null, statsUrl: null, ...(hll ? { hllScoreSides: { allied: 'allied', axis: 'axis' } } : {}) }],
    }]));
    vi.stubEnv(hll ? 'LOGI_DATA_API_KEY_HLL' : 'LOGI_DATA_API_KEY_WDG', 'synthetic-data-key-123456');
    resetServerEnvForTests();
    const cached: Awaited<ReturnType<typeof readActiveLogiProjections>>[number] = {
      resource: 'server-snapshots', externalId: server.id, revision: '1', operation: 'upsert', data: server, withinBudget: true,
      observedAt, lastSuccessAt: observedAt, checkpoint: null, errorCode: null,
    };
    vi.mocked(readActiveLogiProjections).mockResolvedValue([cached]);
    const before = await getLogiServerOverview(game, now);
    expect(before).toMatchObject({ state: 'ok', servers: [{ freshness: 'fresh', reachability: 'online' }] });
    if (before.state !== 'ok') throw new Error('Expected the approved current server.');
    expect(hll ? before.servers[0]?.score : before.servers[0]?.teamScores).toEqual(hll ? { allied: 3, axis: 2 } : scores);

    vi.mocked(readActiveLogiProjections).mockResolvedValue([{ ...cached, errorCode }]);
    expect(await getLogiServerOverview(game, now)).toMatchObject({
      state: 'ok', servers: [{ freshness: 'stale', reachability: 'unknown', map: server.map, players: server.players, score: null, teamScores: null, observedAt: observedAt.toISOString() }],
    });
  });
});
