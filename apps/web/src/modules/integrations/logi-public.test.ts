import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetServerEnvForTests } from '@/lib/env';
import { getLogiServerOverview, readPublicLogiEvents } from './logi-public';
import type { Executor } from '@valkyria/db';
import { readActiveLogiProjections } from './logi-store';
import { logiServerSnapshotSchema } from './logi/contracts';
import fixtures from './logi/fixtures/v0.5.json';
import { readCurrentLogiServers } from './servers/logi';
import { getWarconServersPublic } from './logi/readers/warcon';
import type { WarconServerPublic } from './logi/readers/public';
import { getServerPresentation } from './servers/presentation';

vi.mock('@/lib/db', () => ({ getDb: () => ({}) }));
vi.mock('./logi-store', () => ({ readActiveLogiProjections: vi.fn() }));
vi.mock('./servers/logi', () => ({ readCurrentLogiServers: vi.fn() }));
vi.mock('./logi/readers/warcon', () => ({ getWarconServersPublic: vi.fn() }));
vi.mock('./servers/presentation', () => ({ getServerPresentation: vi.fn(), isServerPublished: (rows: { game: string; publicId: string; published: boolean }[], game: string, id: string) => rows.find((row) => row.game === game && row.publicId === id)?.published !== false }));

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
  it('uses direct current state and removes live scores when its next read fails', async () => {
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
    vi.mocked(readCurrentLogiServers).mockResolvedValue({ rows: [server, { ...server, id: 'unpublished-connection' }], available: true });
    const before = await getLogiServerOverview(game, now);
    expect(before).toMatchObject({ state: 'ok', servers: [{ freshness: 'fresh', reachability: 'online' }] });
    if (before.state !== 'ok') throw new Error('Expected the approved current server.');
    expect(hll ? before.servers[0]?.score : before.servers[0]?.teamScores).toEqual(hll ? { allied: 3, axis: 2 } : scores);
    expect(before.servers).toHaveLength(1);
    expect(readActiveLogiProjections).not.toHaveBeenCalled();

    vi.mocked(readCurrentLogiServers).mockResolvedValue({ rows: [server], available: false });
    expect(await getLogiServerOverview(game, now)).toMatchObject({
      state: 'unavailable', servers: [{ freshness: 'stale', reachability: 'unknown', map: server.map, players: server.players, score: null, teamScores: null, observedAt: observedAt.toISOString() }],
    });
  });
});

describe('authorized Wardogs Warcon live overview overlay', () => {
  const generic = logiServerSnapshotSchema.parse({ ...fixtures.snapshots.data[1], guildId: '910000000000000001', observedAt: '2026-10-03T11:55:00.000Z', freshness: 'stale', state: 'unknown' });
  const live = (change: Partial<WarconServerPublic['live']> = {}): WarconServerPublic => ({ publicId: 'community-one', synthetic: false, recentMatches: null,
    live: { publicId: 'community-one', observedAt: now.toISOString(), freshness: 'fresh', serverName: 'Provider name', map: 'Current map', lighting: 'Day', playerCount: 0, maxPlayers: 100, matchSeconds: 1200,
      scores: [{ name: 'Alpha', score: 0 }, { name: 'Bravo', score: 12 }, { name: 'Charlie', score: 4 }], rotationNow: 1, rotationNext: 2, ...change },
  });
  function configure(key = true) {
    vi.stubEnv('LOGI_SOURCES_JSON', JSON.stringify([{
      sourceInstanceId: 'synthetic-source', origin: 'https://logi.example.test', guildId: generic.guildId, gameId: 'wardogs',
      publicServers: [{ connectionId: generic.id, publicId: 'community-one', name: 'Approved name', published: true, address: null, statsUrl: null }],
      warconConnections: [{ connectionId: 'approved-warcon', publicId: 'community-one' }],
    }]));
    vi.stubEnv('LOGI_DATA_API_KEY_WDG', 'synthetic-data-key-123456');
    vi.stubEnv('LOGI_WARCON_API_KEY_WDG', key ? 'synthetic-warcon-key-123456' : '');
    resetServerEnvForTests();
    vi.mocked(readCurrentLogiServers).mockResolvedValue({ rows: [generic], available: true });
    vi.mocked(getServerPresentation).mockResolvedValue([]);
    vi.mocked(getWarconServersPublic).mockResolvedValue([live()]);
  }

  it('supplies current map, zero population and named scores to the ordinary overview with no elapsed/remaining inference', async () => {
    configure();
    expect(await getLogiServerOverview('wardogs', now)).toMatchObject({ state: 'ok', partial: false, servers: [{
      publicId: 'community-one', name: 'Approved name', map: 'Current map', players: 0, capacity: 100, freshness: 'fresh', reachability: 'online', observedAt: now.toISOString(),
      score: null, timeRemainingSeconds: null, teamScores: [{ id: 'Alpha', label: 'Alpha', score: 0 }, { id: 'Bravo', label: 'Bravo', score: 12 }, { id: 'Charlie', label: 'Charlie', score: 4 }],
    }] });
    expect(getWarconServersPublic).toHaveBeenCalledExactlyOnceWith(['community-one'], null, now);
  });

  it('does not request a website-hidden server and does not require a Warcon key for the generic fallback', async () => {
    configure();
    vi.mocked(getServerPresentation).mockResolvedValue([{ game: 'wardogs', publicId: 'community-one', published: false }]);
    await getLogiServerOverview('wardogs', now);
    expect(getWarconServersPublic).not.toHaveBeenCalled();
    vi.mocked(getWarconServersPublic).mockClear();
    configure(false);
    expect(await getLogiServerOverview('wardogs', now)).toMatchObject({ state: 'ok', servers: [{ freshness: 'stale', reachability: 'unknown' }] });
    expect(getWarconServersPublic).not.toHaveBeenCalled();
  });

  it('keeps failed/unavailable Warcon honest and ages stale observations without live scores', async () => {
    configure();
    vi.mocked(getWarconServersPublic).mockResolvedValue([live({ freshness: 'unavailable', map: null, playerCount: null, maxPlayers: null, scores: [] })]);
    expect(await getLogiServerOverview('wardogs', now)).toMatchObject({ servers: [{ freshness: 'stale', reachability: 'unknown', observedAt: generic.observedAt }] });
    vi.mocked(getWarconServersPublic).mockResolvedValue([live({ observedAt: '2026-10-03T11:59:00.000Z' })]);
    expect(await getLogiServerOverview('wardogs', now)).toMatchObject({ servers: [{ map: 'Current map', freshness: 'stale', reachability: 'unknown', teamScores: null, timeRemainingSeconds: null }] });
  });

  it('allows an independently authorized current live read to recover an unavailable generic collection', async () => {
    configure();
    vi.mocked(readCurrentLogiServers).mockResolvedValue({ rows: [], available: false });
    expect(await getLogiServerOverview('wardogs', now)).toMatchObject({ state: 'ok', servers: [{ freshness: 'fresh', players: 0 }] });
    vi.mocked(getWarconServersPublic).mockResolvedValue([live({ freshness: 'unavailable' })]);
    expect(await getLogiServerOverview('wardogs', now)).toMatchObject({ state: 'unavailable', servers: [{ freshness: 'unavailable' }] });
  });
});
