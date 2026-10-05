import { describe, expect, it } from 'vitest';
import { mapLogiEventSummary, mapLogiServerSnapshot, type LogiPublicServer } from './mapping';
import { logiEventSummarySchema, logiMatchSummarySchema, logiResultSummarySchema, logiServerSnapshotSchema } from './contracts';
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

  it('preserves named Wardogs teams, zero and unknown scores only while fresh', () => {
    const wardogs = logiServerSnapshotSchema.parse(servers.snapshots.data[1]);
    const scores = [{ id: 'charlie', label: 'Charlie', score: null }, { id: 'alpha', label: 'Alpha', score: 0 }, { id: 'bravo', label: 'Bravo', score: 12 }];
    const config = { ...published, connectionId: wardogs.id };
    const source = { ...scope, gameId: 'wardogs' as const };
    const input = { ...wardogs, scores, observedAt: now.toISOString(), freshness: 'fresh' as const };
    expect(mapLogiServerSnapshot(source, input, config, now)).toMatchObject({ score: null, teamScores: scores });
    expect(mapLogiServerSnapshot(source, input, config, new Date(now.getTime() + 121_000))?.teamScores).toBeNull();
    expect(mapLogiServerSnapshot(source, input, config, now, false)?.teamScores).toBeNull();
    expect(mapLogiServerSnapshot(source, { ...input, observedAt: null }, config, now)?.teamScores).toBeNull();
    expect(mapLogiServerSnapshot(source, { ...input, scores: [] }, config, now)?.teamScores).toEqual([]);
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
    expect(mapped?.result.provenance).toEqual({ kind: 'reviewed_result', origin: result.result?.provenance.origin });
    expect(mapped?.result.provenance).not.toHaveProperty('sources');
    expect(() => mapLogiEventSummary(source, event, { ...result, id: 'different', eventId: 'different' }, { externalId: event.id, published: true }, now.toISOString())).toThrow('identity mismatch');
  });
});

const imported = logiMatchSummarySchema.parse({
  id: 'synthetic-history', eventId: 'synthetic-history', guildId: '910000000000000001', gameId: 'hell_let_loose',
  title: 'Synthetic imported match', updatedAt: null, resultState: 'provisional',
  result: { mapId: 'synthetic-map', mapName: 'Synthetic Map', sideA: 'axis', sideB: 'allies', score: { sideA: 0, sideB: 5 }, outcome: 'defeat', endedAt: '2026-09-27T20:00:00Z', provenance: { type: 'event_result_import', importedAt: '2026-09-28T09:00:00Z' } },
});
const historicalEvent = logiEventSummarySchema.parse({
  id: imported.id, guildId: imported.guildId, gameId: imported.gameId, title: imported.title, updatedAt: null,
  kind: 'match', status: null, startsAt: null, endsAt: '2026-09-27T21:00:00Z',
});
const historicalScope = { sourceInstanceId: 'synthetic-source', guildId: imported.guildId, gameId: imported.gameId };
const historicalPublication = { externalId: imported.id, published: true };

describe('historical public match projections', () => {
  it('exposes an imported score as provisional with its provenance and never invents a start or team affiliation', () => {
    const mapped = mapLogiEventSummary(historicalScope, historicalEvent, null, historicalPublication, now.toISOString(), imported);
    expect(mapped).toMatchObject({
      status: null, startsAt: null, teams: [],
      result: {
        state: 'provisional', version: null, reviewedAt: null, endedAt: '2026-09-27T20:00:00Z',
        participants: [{ id: 'sideA', label: 'axis', score: 0 }, { id: 'sideB', label: 'allies', score: 5 }],
        provenance: { kind: 'event_result_import', importedAt: '2026-09-28T09:00:00Z' },
      },
    });
    expect(mapped).not.toHaveProperty('scoreValkyria');
    expect(mapped?.result).not.toHaveProperty('outcome');
  });

  it.each(['provisional', 'confirmed', 'corrected'] as const)('a supplied %s result always wins over a conflicting imported score', (state) => {
    const reviewed = logiResultSummarySchema.parse({
      ...factions.data, id: imported.id, eventId: imported.id, guildId: imported.guildId, gameId: imported.gameId,
      resultState: state, result: { ...factions.data.result, status: state },
    });
    const mapped = mapLogiEventSummary(historicalScope, historicalEvent, reviewed, historicalPublication, now.toISOString(), imported);
    expect(mapped?.result).toMatchObject({ state, version: reviewed.result?.version, reviewedAt: reviewed.result?.reviewedAt, endedAt: null, participants: reviewed.result?.participants, provenance: { kind: 'reviewed_result', origin: reviewed.result?.provenance.origin } });
    expect(mapped?.result.provenance).not.toHaveProperty('importedAt');
  });

  it('uses the imported fallback when the reviewed-result resource explicitly reports unknown', () => {
    const unknown = logiResultSummarySchema.parse({ id: imported.id, eventId: imported.id, guildId: imported.guildId, gameId: imported.gameId, title: imported.title, updatedAt: null, resultState: 'unknown', result: null });
    expect(mapLogiEventSummary(historicalScope, historicalEvent, unknown, historicalPublication, now.toISOString(), imported)?.result.state).toBe('provisional');
    expect(mapLogiEventSummary(historicalScope, historicalEvent, unknown, historicalPublication, now.toISOString(), { ...imported, resultState: 'unknown', result: null })?.result).toMatchObject({ state: 'unknown', participants: [], provenance: null });
  });

  it('rejects mismatched imported event identities and games before accepting a fallback', () => {
    expect(() => mapLogiEventSummary(historicalScope, historicalEvent, null, historicalPublication, now.toISOString(), { ...imported, id: 'different', eventId: 'different' })).toThrow('identity mismatch');
    expect(() => mapLogiEventSummary(historicalScope, historicalEvent, null, historicalPublication, now.toISOString(), { ...imported, gameId: 'wardogs' })).toThrow('scope mismatch');
    expect(mapLogiEventSummary(historicalScope, historicalEvent, null, { ...historicalPublication, published: false }, now.toISOString(), imported)).toBeNull();
  });

  it('publishes captured team names, codes and sides by slot without logos or mapping teams onto scores', () => {
    const team = { teamId: 'synthetic-team-c', slot: 'c' as const, side: null, name: 'Charlie', shortCode: 'CHA', logoUrl: 'https://private.example/team.png', teamRevision: 2, capturedAt: now.toISOString() };
    const event = { ...historicalEvent, matchTeams: [team, { ...team, teamId: 'synthetic-team-a', slot: 'a' as const, side: 'Axis' as const, name: 'Alpha', shortCode: null }] };
    const mapped = mapLogiEventSummary(historicalScope, event, null, historicalPublication, now.toISOString(), imported);
    expect(mapped?.teams).toEqual([
      { id: 'synthetic-team-a', slot: 'a', side: 'Axis', name: 'Alpha', shortCode: null },
      { id: 'synthetic-team-c', slot: 'c', side: null, name: 'Charlie', shortCode: 'CHA' },
    ]);
    expect(mapped?.result.participants.map((participant) => participant.label)).toEqual(['axis', 'allies']);
    for (const secret of ['logoUrl', 'private.example', 'teamRevision', 'capturedAt']) expect(JSON.stringify(mapped)).not.toContain(secret);
    // The event's explicit removal of its teams cannot be undone by another resource.
    expect(mapLogiEventSummary(historicalScope, { ...event, matchTeams: [] }, null, historicalPublication, now.toISOString(), { ...imported, matchTeams: [team] })?.teams).toEqual([]);
  });
});
