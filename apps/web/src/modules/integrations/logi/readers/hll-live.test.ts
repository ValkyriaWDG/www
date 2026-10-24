import { afterEach, describe, expect, it, vi } from 'vitest';
import { configuredLogiSources } from '../../logi-config';
import { createLogiTransport } from '../transport';
import { hllLiveEnvelopeSchema } from './hll-live-contracts';
import { projectHllLive, readLogiHllLive, resetLogiHllLiveForTests } from './hll-live';

const now = new Date('2026-10-24T12:00:00Z');
const server = { connectionId: 'hll-one', publicId: 'community-one', name: 'Approved name', published: true, publishLivePlayers: true, address: null, statsUrl: null };
function source(publication = true) {
  return configuredLogiSources({ LOGI_DATA_API_KEY_HLL: 'synthetic-restricted-data-key', LOGI_SOURCES_JSON: JSON.stringify([{
    sourceInstanceId: 'test-source', origin: 'https://logi.example.test', guildId: '910000000000000001', gameId: 'hell_let_loose',
    publicServers: [{ ...server, publishLivePlayers: publication }],
  }]) }, 'data')[0]!;
}
function envelope() {
  return hllLiveEnvelopeSchema.parse({ connectionId: server.connectionId, gameId: 'hell_let_loose', provider: 'hll_crcon', data: {
    fetchedAt: now.toISOString(), statusAt: now.toISOString(), playersAt: now.toISOString(), statusFreshness: 'fresh', playersFreshness: 'fresh', refreshAfterSeconds: 30,
    status: { serverName: 'Private provider name', map: 'Current map', layerId: 'private-layer', mode: 'warfare', roundStartedAt: null, playerCount: 18, maxPlayers: 100,
      scores: [{ team: 'allies', score: 0 }, { team: 'axis', score: 5 }], timeRemainingSeconds: 0, environment: 'day', queueCount: 0,
      nextMap: { name: 'Next map', layerId: null, mode: 'offensive', environment: null } },
    players: [{ playerId: '76561190000000001', name: 'Alpha\nPlayer', team: 'allies', kills: 0, deaths: null, combat: 12, offense: null, defense: null, support: null }], warnings: [],
  } });
}

afterEach(resetLogiHllLiveForTests);

describe('HLL live producer contract and public minimization', () => {
  it('maps supported live facts and zero without raw identities or private metadata', () => {
    const result = projectHllLive(envelope(), server, now);
    expect(result.status).toMatchObject({ mode: 'warfare', nextMap: 'Next map', timeRemainingSeconds: 0, score: { allied: 0, axis: 5 } });
    expect(result.players).toMatchObject({ state: 'ok', freshness: 'fresh', players: [{ name: 'Alpha Player', side: 'allies', kills: 0, deaths: null }] });
    for (const hidden of ['7656119', 'playerId', 'private-layer', 'serverName', 'Private provider name', 'queueCount', 'warnings', 'connectionId', 'provider']) expect(JSON.stringify(result)).not.toContain(hidden);
  });

  it('requires explicit live player publication, independently of safe server status', () => {
    expect(projectHllLive(envelope(), { ...server, publishLivePlayers: false }, now)).toMatchObject({ status: { map: 'Current map' }, players: { state: 'not_configured', players: [], observedAt: null } });
    const { publishLivePlayers: _publication, ...unspecified } = server;
    expect(projectHllLive(envelope(), unspecified, now).players.players).toEqual([]);
  });

  it('ages status and player observations separately and strips live scores/timer on failure', () => {
    const oldPlayers = envelope();
    oldPlayers.data.playersAt = new Date(now.getTime() - 90_000).toISOString();
    expect(projectHllLive(oldPlayers, server, now)).toMatchObject({ status: { freshness: 'fresh' }, players: { freshness: 'stale' } });
    expect(projectHllLive(envelope(), server, now, true)).toMatchObject({ status: { freshness: 'stale', score: null, nextMap: null, timeRemainingSeconds: null }, players: { freshness: 'stale' } });
    expect(projectHllLive(envelope(), server, new Date(now.getTime() + 31 * 60_000))).toMatchObject({ status: null, players: { state: 'unavailable', players: [] } });
    const future = envelope();
    future.data.statusAt = new Date(now.getTime() + 6_000).toISOString();
    expect(projectHllLive(future, server, now).status).toBeNull();
  });

  it('rejects foreign provider/game, unknown fields and private payload additions', () => {
    for (const change of [{ gameId: 'wardogs' }, { provider: 'wardogs_warcon' }, { secret: 'hidden' }]) expect(hllLiveEnvelopeSchema.safeParse({ ...envelope(), ...change }).success).toBe(false);
    expect(hllLiveEnvelopeSchema.safeParse({ ...envelope(), data: { ...envelope().data, players: [{ ...envelope().data.players[0], ip: 'private' }] } }).success).toBe(false);
  });
});

describe('HLL live bounded scoped reader', () => {
  it('uses only the fixed no-query HLL route, deduplicates reads and respects producer refresh', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: envelope() }));
    await Promise.all([readLogiHllLive(source(), server, now, fetcher), readLogiHllLive(source(), server, now, fetcher)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, request] = fetcher.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('https://logi.example.test/api/v1/clan/hll-live/hll-one');
    expect(request).toMatchObject({ redirect: 'manual', cache: 'no-store', credentials: 'omit' });
    await readLogiHllLive(source(), server, new Date(now.getTime() + 29_000), fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await readLogiHllLive(source(), server, new Date(now.getTime() + 30_000), fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('retains transient failures as stale but clears data after grant refusal or foreign connection', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: envelope() }));
    await readLogiHllLive(source(), server, now, fetcher);
    fetcher.mockResolvedValue(new Response(null, { status: 503 }));
    expect(await readLogiHllLive(source(), server, new Date(now.getTime() + 30_000), fetcher)).toMatchObject({ status: { freshness: 'stale', score: null }, players: { freshness: 'stale' } });
    fetcher.mockResolvedValue(new Response(null, { status: 403 }));
    expect(await readLogiHllLive(source(), server, new Date(now.getTime() + 60_000), fetcher)).toMatchObject({ status: null, players: { state: 'unavailable', players: [] } });
    fetcher.mockResolvedValue(Response.json({ data: { ...envelope(), connectionId: 'another' } }));
    expect((await readLogiHllLive(source(), server, new Date(now.getTime() + 90_000), fetcher)).status).toBeNull();
  });

  it('cannot enable player publication through a caller override or read an unpublished connection', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: envelope() }));
    expect((await readLogiHllLive(source(false), server, now, fetcher)).players.state).toBe('not_configured');
    const configured = source();
    configured.publicServers[0]!.published = false;
    expect((await readLogiHllLive(configured, server, now, fetcher)).status).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('limits the query exception to valid HLL connection IDs while ordinary reads retain game', async () => {
    const configured = source();
    const fetcher = vi.fn(async () => Response.json({ data: [] }));
    const transport = createLogiTransport(configured, { fetchImpl: fetcher });
    expect(() => transport.getHllLive('../another')).toThrow('configuration');
    expect(() => createLogiTransport({ ...configured, gameId: 'wardogs' }, { fetchImpl: fetcher }).getHllLive(server.connectionId)).toThrow('configuration');
    await transport.get('server-snapshots', {});
    expect((fetcher.mock.calls[0]! as unknown as [string])[0]).toContain('game=hell_let_loose');
  });
});
