import { describe, expect, it } from 'vitest';
import { createLogiClient } from './client';
import { LOGI_PEOPLE_RESOURCES, logiMemberSummarySchema, logiPlayerStatSummarySchema, logiRosterSummarySchema } from './people-contracts';
import fixture from './fixtures/v0.14-people.json';

const config = { sourceInstanceId: 'synthetic', guildId: fixture.member.guildId, gameId: 'wardogs' as const, origin: 'https://logi.example.test', apiKey: 'synthetic-people-key-12345', resources: LOGI_PEOPLE_RESOURCES };

describe('Logi v0.14 people wire contract', () => {
  it('accepts the producer synthetic contract with nullable unsupported metrics', () => {
    expect(logiMemberSummarySchema.parse(fixture.member).id).toBe('assignment-example');
    expect(logiRosterSummarySchema.parse(fixture.roster).squads[0]!.slots[1]!.identityState).toBe('unresolved');
    expect(logiPlayerStatSummarySchema.parse(fixture.statistics).players[0]!.metrics).toMatchObject({ kills: 8, cashDelta: -125, combat: null });
  });
  it('rejects private extra fields, conflicting identity data and impossible coverage', () => {
    expect(logiMemberSummarySchema.safeParse({ ...fixture.member, email: 'private@example.test' }).success).toBe(false);
    expect(logiMemberSummarySchema.safeParse({ ...fixture.member, identityState: 'conflict' }).success).toBe(false);
    expect(logiRosterSummarySchema.safeParse({ ...fixture.roster, published: false }).success).toBe(false);
    expect(logiPlayerStatSummarySchema.safeParse({ ...fixture.statistics, coverage: { observedPlayers: 3, verifiedMembers: 2, unlinkedPlayers: 1 } }).success).toBe(false);
    expect(logiPlayerStatSummarySchema.safeParse({ ...fixture.statistics, players: [fixture.statistics.players[0], fixture.statistics.players[0]], coverage: { observedPlayers: 3, verifiedMembers: 2, unlinkedPlayers: 1 } }).success).toBe(false);
  });
  it('accepts a bounded smaller source page and an empty continuing page', async () => {
    let empty = true;
    const reader = createLogiClient(config, { fetchImpl: async () => Response.json({ data: empty ? [] : [fixture.statistics], page: { nextCursor: empty ? 'scan-next' : null, limit: 1 } }) });
    expect(await reader.list('player-stat-summaries', { limit: 10 })).toMatchObject({ data: [], page: { nextCursor: 'scan-next', limit: 1 } });
    empty = false;
    expect((await reader.list('player-stat-summaries')).data).toHaveLength(1);
    await expect(reader.list('player-stat-summaries', { limit: 11 })).rejects.toMatchObject({ code: 'configuration' });
  });
  it('denies cross-purpose use and wrong guild/game before any projection is accepted', async () => {
    const reader = createLogiClient(config, { fetchImpl: async () => Response.json({ data: [{ ...fixture.member, guildId: '910000000000000099' }], page: { nextCursor: null, limit: 10 } }) });
    await expect(reader.list('event-summaries')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(reader.list('member-summaries')).rejects.toMatchObject({ code: 'scope_mismatch' });
  });
});
