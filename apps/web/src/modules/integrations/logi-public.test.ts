import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetServerEnvForTests } from '@/lib/env';
import { getLogiServerOverview, readPublicLogiEvents } from './logi-public';
import type { Executor } from '@valkyria/db';
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

describe('published Logi matches use every supplied result resource', () => {
  const env = (published = true) => ({ LOGI_DATA_API_KEY_HLL: 'synthetic-data-key-123456', LOGI_SOURCES_JSON: JSON.stringify([{ sourceInstanceId: 'synthetic-source', origin: 'https://logi.example.test', guildId: '910000000000000001', gameId: 'hell_let_loose', publishMatches: published }]) });
  const event = { id: 'synthetic-match', guildId: '910000000000000001', gameId: 'hell_let_loose', title: 'Synthetic old match', updatedAt: null, kind: 'match', status: null, startsAt: null, endsAt: '2026-09-01T20:00:00Z' };
  const imported = { id: event.id, eventId: event.id, guildId: event.guildId, gameId: event.gameId, title: event.title, updatedAt: null, resultState: 'provisional', result: { mapId: 'synthetic-map', mapName: null, sideA: 'allies', sideB: 'axis', score: { sideA: 0, sideB: 5 }, outcome: 'defeat', endedAt: null, provenance: { type: 'event_result_import', importedAt: '2026-09-02T00:00:00Z' } } };
  const row = (resource: string, data: Record<string, unknown>): Awaited<ReturnType<typeof readActiveLogiProjections>>[number] => ({ resource, externalId: event.id, data, revision: '1', operation: 'upsert', withinBudget: true, observedAt, lastSuccessAt: observedAt, checkpoint: null, errorCode: null });

  it('joins an imported match summary by exact event identity in the active source', async () => {
    vi.mocked(readActiveLogiProjections).mockResolvedValue([row('event-summaries', event), row('match-summaries', imported)]);
    const result = await readPublicLogiEvents({} as Executor, env(), 'hll', now);
    expect(result).toHaveLength(1);
    expect(result[0]?.result).toMatchObject({ state: 'provisional', participants: [{ label: 'allies', score: 0 }, { label: 'axis', score: 5 }], provenance: { kind: 'event_result_import' } });
    expect(result[0]?.startsAt).toBeNull();
  });

  it('ignores another event and tombstoned imported scores', async () => {
    const importedRow = row('match-summaries', imported);
    vi.mocked(readActiveLogiProjections).mockResolvedValue([row('event-summaries', event), { ...importedRow, externalId: 'another' }]);
    expect((await readPublicLogiEvents({} as Executor, env(), 'hll', now))[0]?.result.state).toBe('unknown');
    vi.mocked(readActiveLogiProjections).mockResolvedValue([row('event-summaries', event), { ...importedRow, operation: 'remove', data: null }]);
    expect((await readPublicLogiEvents({} as Executor, env(), 'hll', now))[0]?.result.state).toBe('unknown');
  });

  it('keeps unpublished, stale, wrong-game and removed events out of the public list', async () => {
    const records = [row('event-summaries', event), row('match-summaries', imported)];
    vi.mocked(readActiveLogiProjections).mockResolvedValue(records);
    expect(await readPublicLogiEvents({} as Executor, env(false), 'hll', now)).toEqual([]);
    expect(await readPublicLogiEvents({} as Executor, env(), 'wardogs', now)).toEqual([]);
    expect(await readPublicLogiEvents({} as Executor, env(), 'hll', new Date(now.getTime() + 16 * 60_000))).toEqual([]);
    vi.mocked(readActiveLogiProjections).mockResolvedValue([{ ...records[0]!, operation: 'remove', data: null }, records[1]!]);
    expect(await readPublicLogiEvents({} as Executor, env(), 'hll', now)).toEqual([]);
  });
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
