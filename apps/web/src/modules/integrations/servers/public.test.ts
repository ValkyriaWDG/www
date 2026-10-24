import { describe, expect, it } from 'vitest';
import type { ServerSnapshot } from '../contract';
import { toPublicServerOverview } from './public';

const privateSnapshot: ServerSnapshot = {
  ref: { source: 'logi', sourceInstanceId: 'PRIVATE_INSTANCE', guildId: 'PRIVATE_GUILD', game: 'wardogs', kind: 'server', externalId: 'PRIVATE_CONNECTION' },
  publicId: 'community-main', name: 'Community server', reachability: 'online', map: 'Current map', mode: 'Warfare',
  players: 0, capacity: 100, nextMap: null, timeRemainingSeconds: 0, score: { allied: 0, axis: 5 }, teams: { allied: 0, axis: 12 },
  teamScores: [{ id: 'PRIVATE_FACTION', label: 'Faction A', score: 0 }, { id: 'PRIVATE_OTHER_FACTION', label: 'Faction B', score: null }],
  observedAt: '2026-10-24T16:00:00Z', freshness: 'fresh', connect: { kind: 'address', address: 'join.example.test:7777' }, statsUrl: 'https://stats.example.test',
};

describe('public server telemetry boundary', () => {
  it.each(['ok', 'unavailable'] as const)('removes operational identity and unexpected nested fields from %s observations', (state) => {
    const server = {
      ...privateSnapshot, providerEndpoint: 'PRIVATE_ENDPOINT',
      score: { allied: 0, axis: 5, scopeKey: 'PRIVATE_SCORE_SCOPE' },
      teams: { allied: 0, axis: 12, guildId: 'PRIVATE_TEAM_TENANT' },
      connect: { kind: 'address' as const, address: 'join.example.test:7777', password: 'PRIVATE_PASSWORD' },
      teamScores: [{ id: 'PRIVATE_FACTION', label: 'Faction A', score: 0, credential: 'PRIVATE_CREDENTIAL' }, { id: 'PRIVATE_OTHER_FACTION', label: 'Faction B', score: null }],
    };
    const internal = { state, servers: [server], attemptedAt: '2026-10-24T16:00:01Z', synthetic: false, partial: false, sourceOrigin: 'PRIVATE_ORIGIN' };
    const result = toPublicServerOverview(internal);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_');
    expect(result).toMatchObject({ state, attemptedAt: internal.attemptedAt, servers: [{
      publicId: 'community-main', players: 0, capacity: 100, timeRemainingSeconds: 0, freshness: 'fresh',
      score: { allied: 0, axis: 5 }, teams: { allied: 0, axis: 12 },
      teamScores: [{ label: 'Faction A', score: 0 }, { label: 'Faction B', score: null }],
      connect: { kind: 'address', address: 'join.example.test:7777' }, statsUrl: 'https://stats.example.test',
    }] });
    expect(JSON.stringify(result)).not.toContain('"ref"');
    // Internal source/cache identity is still available to the adapters after publication.
    expect(server.ref.externalId).toBe('PRIVATE_CONNECTION');
    expect(server.teamScores[0]!.id).toBe('PRIVATE_FACTION');
    if (state === 'unavailable') expect(result).not.toHaveProperty('synthetic');
  });

  it('does not serialize an unexpected source context for an unconfigured source', () => {
    const internal = { state: 'not_configured' as const, source: { credential: 'PRIVATE_TOKEN' } };
    expect(toPublicServerOverview(internal)).toEqual({ state: 'not_configured' });
  });
});
