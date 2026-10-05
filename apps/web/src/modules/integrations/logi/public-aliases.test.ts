import { describe, expect, it } from 'vitest';
import { configuredLogiSourceBindings } from '../logi-config';
import type { PublicLogiEvent } from './mapping';
import { applyReviewedLogiAliases } from './public-aliases';

const source = { sourceInstanceId: 'synthetic', origin: 'https://logi.example.test', guildId: '100000000000000001', gameId: 'hell_let_loose', publishMatches: true, matchAliases: [{ canonicalEventId: 'canonical', aliasEventIds: ['alias'] }] };
const bindings = configuredLogiSourceBindings({ LOGI_SOURCES_JSON: JSON.stringify([source]) });
const event: PublicLogiEvent = { ref: { source: 'logi', sourceInstanceId: 'synthetic', guildId: source.guildId, game: 'hll', kind: 'match', externalId: 'canonical' }, title: 'Synthetic repeated import', kind: 'match', status: 'concluded', startsAt: '2026-10-01T18:00:00Z', endsAt: '2026-10-01T20:00:00Z', sourceUpdatedAt: null, observedAt: '2026-10-01T20:01:00Z', teams: [], result: { state: 'provisional', version: null, reviewedAt: null, endedAt: '2026-10-01T20:00:00Z', participants: [{ id: 'sideA', label: 'Red', score: 0 }, { id: 'sideB', label: 'Blue', score: 3 }], provenance: { kind: 'event_result_import', importedAt: '2026-10-01T20:00:01Z' } } };
const alias: PublicLogiEvent = { ...event, ref: { ...event.ref, externalId: 'alias' } };

describe('explicit duplicate-import associations', () => {
  it('collapses an approved equivalent alias and keeps its direct route identity', () => {
    expect(applyReviewedLogiAliases([alias, event], bindings)).toEqual([{ ...event, aliases: ['alias'] }]);
  });
  it('ignores differing observation/import timestamps, comparing supplied date instants', () => {
    expect(applyReviewedLogiAliases([event, { ...alias, startsAt: '2026-10-01T20:00:00+02:00', observedAt: '2026-10-02T00:00:00Z', result: { ...alias.result, provenance: { kind: 'event_result_import', importedAt: '2026-10-02T00:00:00Z' } } }], bindings)).toHaveLength(1);
  });
  it('keeps absent canonical, unapproved duplicates, other scope and conflicting current scores visible', () => {
    expect(applyReviewedLogiAliases([alias], bindings)).toEqual([alias]);
    expect(applyReviewedLogiAliases([event, alias], [])).toHaveLength(2);
    expect(applyReviewedLogiAliases([event, { ...alias, ref: { ...alias.ref, guildId: '100000000000000002' } }], bindings)).toHaveLength(2);
    expect(applyReviewedLogiAliases([event, { ...alias, result: { ...alias.result, participants: [{ id: 'sideA', label: 'Red', score: 1 }, { id: 'sideB', label: 'Blue', score: 3 }] } }], bindings)).toHaveLength(2);
    expect(applyReviewedLogiAliases([event, { ...alias, teams: [{ id: 'red', slot: 'a', side: null, name: 'Red team', shortCode: null }] }], bindings)).toHaveLength(2);
  });
  it('rejects cycles, repeated identities and an archive link targeting an alias', () => {
    for (const matchAliases of [
      [{ canonicalEventId: 'canonical', aliasEventIds: ['canonical'] }],
      [{ canonicalEventId: 'canonical', aliasEventIds: ['alias', 'alias'] }],
      [{ canonicalEventId: 'canonical', aliasEventIds: ['alias'] }, { canonicalEventId: 'alias', aliasEventIds: ['other'] }],
    ]) expect(() => configuredLogiSourceBindings({ LOGI_SOURCES_JSON: JSON.stringify([{ ...source, matchAliases }]) })).toThrow();
    expect(() => configuredLogiSourceBindings({ LOGI_SOURCES_JSON: JSON.stringify([{ ...source, matchLinks: [{ eventId: 'alias', matchId: '20000000-0000-4000-8000-000000000001' }] }]) })).toThrow();
  });
});
