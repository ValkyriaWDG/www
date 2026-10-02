import { describe, expect, it } from 'vitest';
import { mapLogiEventSummary, mapLogiServerSnapshot, type LogiPublicServer } from './mapping';
import { logiEventSummarySchema, logiResultSummarySchema, logiServerSnapshotSchema } from './contracts';
import servers from './fixtures/v0.5.json';
import changes from './fixtures/v0.6.json';
import factions from './fixtures/result-wardogs-factions.json';

const now = new Date('2026-09-28T12:00:00Z');
const server = logiServerSnapshotSchema.parse(servers.snapshots.data[0]);
const scope = { sourceInstanceId: 'fixture-instance', guildId: server.guildId, gameId: server.gameId };
const published: LogiPublicServer = { connectionId: server.id, publicId: 'valkyria-one', name: 'Approved server', published: true, address: null, statsUrl: 'https://stats.example/public' };

describe('explicit public projections', () => {
  it('requires publication and an exact configured connection identity', () => {
    expect(mapLogiServerSnapshot(scope, server, { ...published, published: false }, now)).toBeNull();
    expect(mapLogiServerSnapshot(scope, server, { ...published, connectionId: 'another' }, now)).toBeNull();
    expect(() => mapLogiServerSnapshot({ ...scope, gameId: 'wardogs' }, server, published, now)).toThrow('scope mismatch');
  });

  it('keeps a real zero, strips provider internals, and uses only approved public metadata', () => {
    const result = mapLogiServerSnapshot(scope, { ...server, providerInstanceId: 'internal-instance', attribution: { label: 'Upstream', url: 'https://internal.example' } }, published, now);
    expect(result).toMatchObject({ name: 'Approved server', players: 0, capacity: 100, freshness: 'fresh', score: null, statsUrl: 'https://stats.example/public' });
    expect(result?.ref).toMatchObject({ source: 'logi', sourceInstanceId: 'fixture-instance', game: 'hll' });
    for (const privateField of ['internal-instance', 'internal.example', 'providerInstanceId', 'capabilities', 'lastSuccessAt']) expect(JSON.stringify(result)).not.toContain(privateField);
  });

  it('ages even a source claiming fresh and removes expired or future values', () => {
    expect(mapLogiServerSnapshot(scope, server, published, new Date(now.getTime() + 180_000))).toMatchObject({ freshness: 'stale', players: 0 });
    expect(mapLogiServerSnapshot(scope, server, published, new Date(now.getTime() + 31 * 60_000))).toMatchObject({ freshness: 'unavailable', players: null, capacity: null, map: null, reachability: 'unknown' });
    expect(mapLogiServerSnapshot(scope, { ...server, observedAt: '2026-09-28T13:00:00Z' }, published, now)).toMatchObject({ freshness: 'unavailable', players: null });
    expect(mapLogiServerSnapshot(scope, server, published, now, false)).toMatchObject({ freshness: 'stale', reachability: 'unknown' });
  });

  it('does not upgrade provider stale/unavailable data by transport success', () => {
    expect(mapLogiServerSnapshot(scope, { ...server, freshness: 'stale' }, published, now)?.freshness).toBe('stale');
    expect(mapLogiServerSnapshot(scope, { ...server, freshness: 'unavailable' }, published, now)).toMatchObject({ freshness: 'unavailable', players: null });
  });

  it('maps HLL sides only by an explicit binding and never squeezes Wardogs factions into them', () => {
    const scored = { ...server, scores: [{ id: 'a', label: 'A', score: 0 }, { id: 'b', label: 'B', score: 5 }] };
    expect(mapLogiServerSnapshot(scope, scored, published, now)?.score).toBeNull();
    const mapped = { ...published, hllScoreSides: { allied: 'b', axis: 'a' } };
    expect(mapLogiServerSnapshot(scope, scored, mapped, now)?.score).toEqual({ allied: 5, axis: 0 });
    expect(mapLogiServerSnapshot(scope, { ...scored, scores: [{ id: 'a', label: 'A', score: null }] }, mapped, now)?.score).toBeNull();
    const wardogs = logiServerSnapshotSchema.parse(servers.snapshots.data[1]);
    expect(mapLogiServerSnapshot({ ...scope, gameId: 'wardogs' }, wardogs, { ...mapped, connectionId: wardogs.id }, now)?.score).toBeNull();
  });

  it('does not accept private/admin source URLs as configured public links', () => {
    expect(() => mapLogiServerSnapshot(scope, server, { ...published, statsUrl: 'https://user:pass@stats.example' }, now)).toThrow();
    expect(() => mapLogiServerSnapshot(scope, server, { ...published, statsUrl: 'javascript:alert(1)' }, now)).toThrow();
  });

  it('requires explicit event publication and preserves unknown schedule and results', () => {
    const event = logiEventSummarySchema.parse(changes.record.data.data);
    const source = { ...scope, gameId: event.gameId, guildId: event.guildId };
    expect(mapLogiEventSummary(source, event, null, { externalId: event.id, published: false }, now.toISOString())).toBeNull();
    const mapped = mapLogiEventSummary(source, event, null, { externalId: event.id, published: true }, now.toISOString());
    expect(mapped).toMatchObject({ startsAt: null, status: null, result: { state: 'unknown', version: null, participants: [] } });
    expect(mapped).not.toHaveProperty('opponentName');
    expect(mapped).not.toHaveProperty('scoreValkyria');
  });

  it('preserves all actual producer result participants, state, null and zero', () => {
    const result = logiResultSummarySchema.parse(factions.data);
    const event = logiEventSummarySchema.parse({ ...changes.record.data.data, id: result.id, guildId: result.guildId, gameId: result.gameId });
    const source = { ...scope, gameId: event.gameId, guildId: event.guildId };
    const mapped = mapLogiEventSummary(source, event, result, { externalId: event.id, published: true }, now.toISOString());
    expect(mapped?.result.participants).toEqual(result.result?.participants);
    expect(mapped?.result.participants).toHaveLength(3);
    expect(mapped?.result.state).toBe('provisional');
    expect(mapped?.result).not.toHaveProperty('attribution');
    expect(mapped?.result).not.toHaveProperty('provenance');
    expect(() => mapLogiEventSummary(source, event, { ...result, id: 'different', eventId: 'different' }, { externalId: event.id, published: true }, now.toISOString())).toThrow('identity mismatch');
  });
});
