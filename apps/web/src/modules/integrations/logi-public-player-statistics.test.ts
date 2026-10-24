import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { Executor } from '@valkyria/db';
import { configuredLogiSources } from './logi-config';
import type { readPublicLogiPlayerStatisticsTargets } from './logi-public-players';
import { readPublicPlayerStatistics } from './logi-public-player-statistics';

const at = new Date('2026-10-25T00:00:00Z');
const db = {} as Executor;
const env = { NODE_ENV: 'test', LOGI_PEOPLE_API_KEY_HLL: 'synthetic-people-key-12345', LOGI_SOURCES_JSON: JSON.stringify([
  { sourceInstanceId: 'fixture', origin: 'https://logi.example.test', guildId: '100000000000000001', gameId: 'hell_let_loose', syncPeople: true, publishPlayers: true },
]) };
const target: Awaited<ReturnType<typeof readPublicLogiPlayerStatisticsTargets>>[number] = {
  source: configuredLogiSources(env, 'people')[0]!, version: 7,
  member: { schemaVersion: 1, id: 'private-member', guildId: '100000000000000001', gameId: 'hell_let_loose', updatedAt: at.toISOString(),
    identityId: 'private-identity', discordSubject: '100000000000000002', identityState: 'resolved', displayName: 'Fixture', type: 'member', status: 'active', paused: false, groups: [] },
};
const body = (gameId: 'hell_let_loose' | 'wardogs' = 'hell_let_loose') => ({ data: {
  identityBinding: createHash('sha256').update(JSON.stringify(['public-player-native-v1', target.member.identityId, target.member.discordSubject])).digest('hex'),
  id: 'private-returned-account', avatar: 'https://private.example/avatar', clans: [{ id: 'private-clan' }], gameId,
  stats: { matches: 40, kills: 1200, deaths: 600, kd: 2, ...(gameId === 'wardogs' ? { cashDelta: -50 } : {}) },
  recentMatches: [{ eventId: 'private-event', name: 'Actual supplied title', endedAt: at.toISOString(), gameId,
    kills: 30, deaths: 10, killDeathRatio: 3, offense: 500, defense: 200, support: 100, cashDelta: -50 }],
} });
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const resolver = () => vi.fn<typeof readPublicLogiPlayerStatisticsTargets>().mockResolvedValue([target]);

describe('public reviewed player statistics', () => {
  it('keeps lifetime totals and latest-match coverage distinct and strips all private identifiers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(body()));
    const result = await readPublicPlayerStatistics(db, env, 'opaque', { now: () => at, targets: resolver(), fetchImpl });
    expect(result[0]).toMatchObject({ game: 'hell-let-loose', matches: 40, kills: 1200, deaths: 600, kd: 2, recentLimit: 30, cashDelta: null });
    expect(result[0]!.recentMatches).toHaveLength(1);
    expect(result[0]!.recentMatches[0]).toMatchObject({ title: 'Actual supplied title', offense: 500, cashDelta: null });
    expect(JSON.stringify(result)).not.toMatch(/private-|10000000000000000|avatar|eventId|guildId|discordSubject/);
    expect(fetchImpl.mock.calls[0]![0]).toBe('https://logi.example.test/api/v1/public/players/100000000000000002?game=hell_let_loose&identity=discord');
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({ headers: { Accept: 'application/json' }, redirect: 'error', cache: 'no-store' });
  });
  it('suppresses facts when publication or native identity changes during the request', async () => {
    const targets = resolver().mockResolvedValueOnce([target]).mockResolvedValueOnce([{ ...target, version: 8 }]);
    expect(await readPublicPlayerStatistics(db, env, 'opaque', { now: () => at, targets, fetchImpl: async () => response(body()) })).toEqual([]);
    const withdrawn = resolver().mockResolvedValueOnce([target]).mockResolvedValueOnce([]);
    expect(await readPublicPlayerStatistics(db, env, 'opaque', { now: () => at, targets: withdrawn, fetchImpl: async () => response(body()) })).toEqual([]);
  });
  it('rechecks publication on warm cache hits and isolates changed identity, generation and source authority', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => response(body()));
    vi.stubGlobal('fetch', fetchMock);
    const cachedTarget = { ...target, source: { ...target.source, scopeKey: `${target.source.scopeKey}-cache-regression` } };
    const targets = vi.fn<typeof readPublicLogiPlayerStatisticsTargets>().mockResolvedValue([cachedTarget]);
    const read = () => readPublicPlayerStatistics(db, env, 'cache-opaque', { now: () => at, targets });
    try {
      expect(await read()).toHaveLength(1);
      expect(await read()).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      targets.mockResolvedValueOnce([cachedTarget]).mockResolvedValueOnce([]);
      expect(await read()).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      for (const changed of [
        { ...cachedTarget, version: 8 },
        { ...cachedTarget, source: { ...cachedTarget.source, scopeKey: `${cachedTarget.source.scopeKey}-rotated` } },
      ]) {
        targets.mockResolvedValue([changed]);
        expect(await read()).toHaveLength(1);
      }
      targets.mockResolvedValue([{ ...cachedTarget, member: { ...cachedTarget.member, identityId: 'replacement-native-identity' } }]);
      expect(await read()).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    } finally { vi.unstubAllGlobals(); }
  });
  it('rejects a legacy-ID shadow account even when its returned ID equals the requested Discord subject', async () => {
    const shadow = body();
    shadow.data.id = target.member.discordSubject!;
    shadow.data.identityBinding = createHash('sha256').update(JSON.stringify(['public-player-native-v1', 'other-native-identity', target.member.discordSubject])).digest('hex');
    expect(await readPublicPlayerStatistics(db, env, 'opaque', { now: () => at, targets: resolver(), fetchImpl: async () => response(shadow) })).toEqual([]);
  });
  it('rejects an older producer without identity proof and a proof for a different Discord subject', async () => {
    const old = body();
    const { identityBinding: _binding, ...withoutProof } = old.data;
    expect(await readPublicPlayerStatistics(db, env, 'opaque', { now: () => at, targets: resolver(), fetchImpl: async () => response({ data: withoutProof }) })).toEqual([]);
    const otherSubject = body();
    otherSubject.data.identityBinding = createHash('sha256').update(JSON.stringify(['public-player-native-v1', target.member.identityId, '100000000000000099'])).digest('hex');
    expect(await readPublicPlayerStatistics(db, env, 'opaque', { now: () => at, targets: resolver(), fetchImpl: async () => response(otherSubject) })).toEqual([]);
  });
  it.each([404, 429, 503])('does not invent zero totals on HTTP %i', async (status) => {
    expect(await readPublicPlayerStatistics(db, env, 'opaque', { now: () => at, targets: resolver(), fetchImpl: async () => response({}, status) })).toEqual([]);
  });
  it('rejects another game and mismatched recent-game facts', async () => {
    expect(await readPublicPlayerStatistics(db, env, 'opaque', { now: () => at, targets: resolver(), fetchImpl: async () => response(body('wardogs')) })).toEqual([]);
    const mixed = body(); mixed.data.recentMatches[0]!.gameId = 'wardogs';
    expect(await readPublicPlayerStatistics(db, env, 'opaque', { now: () => at, targets: resolver(), fetchImpl: async () => response(mixed) })).toEqual([]);
  });
  it('uses no provider account for unresolved or unpublished identities', async () => {
    const fetchImpl = vi.fn();
    expect(await readPublicPlayerStatistics(db, env, 'opaque', { now: () => at, targets: vi.fn().mockResolvedValue([]), fetchImpl })).toEqual([]);
    expect(await readPublicPlayerStatistics(db, env, 'opaque', { now: () => at, targets: vi.fn().mockResolvedValue([{ ...target, member: { ...target.member, discordSubject: null } }]), fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('retains signed Wardogs money and does not expose HLL score fields for Wardogs', async () => {
    const wardogs = { ...target, source: { ...target.source, gameId: 'wardogs' as const }, member: { ...target.member, gameId: 'wardogs' as const } };
    const result = await readPublicPlayerStatistics(db, env, 'opaque', { now: () => at, targets: vi.fn().mockResolvedValue([wardogs]), fetchImpl: async () => response(body('wardogs')) });
    expect(result[0]).toMatchObject({ game: 'wardogs', cashDelta: -50 });
    expect(result[0]!.recentMatches[0]).toMatchObject({ cashDelta: -50, offense: null, defense: null, support: null });
  });
  it('rejects oversized or malformed upstream payloads', async () => {
    const oversized = new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '1000000' } });
    expect(await readPublicPlayerStatistics(db, env, 'opaque', { now: () => at, targets: resolver(), fetchImpl: async () => oversized })).toEqual([]);
    const malformed = body(); malformed.data.stats.matches = 0;
    expect(await readPublicPlayerStatistics(db, env, 'opaque', { now: () => at, targets: resolver(), fetchImpl: async () => response(malformed) })).toEqual([]);
  });
});
