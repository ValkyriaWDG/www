import { logiMemberLink, logiProjection, logiSyncScope, memberProfile } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { configuredLogiSources, logiPeopleStatisticsSource } from '@/modules/integrations/logi-config';
import * as people from '@/modules/integrations/logi-people';
import { logiMemberSummarySchema } from '@/modules/integrations/logi/people-contracts';
import { publicLogiPlayerKey, readPublicLogiPlayerDirectory, readPublicLogiPlayers, readPublicLogiPlayerMatchPeople, readPublicLogiPlayerStatisticsTargets } from '@/modules/integrations/logi-public-players';
import fixture from '@/modules/integrations/logi/fixtures/v0.14-people.json';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let database: TestDatabase;
const clock = new Date('2026-10-03T10:01:00Z');
const config = { sourceInstanceId: 'synthetic-public-player-source', origin: 'https://logi.example.test', guildId: fixture.member.guildId, gameId: 'wardogs', syncPeople: true, publishMatches: true, publishPlayers: true };
const env = { LOGI_SOURCES_JSON: JSON.stringify([config]), LOGI_PEOPLE_API_KEY_WDG: 'synthetic-public-people-key-123456', LOGI_DATA_API_KEY_WDG: 'synthetic-public-data-key-123456' };
const core = configuredLogiSources(env, 'people')[0]!;
const stats = logiPeopleStatisticsSource(core);
const data = configuredLogiSources(env, 'data')[0]!;
const checkpoint = { version: 1, mode: 'live', generation: null, resourceIndex: 2, listCursor: null, boundaryCursor: 'boundary', cursor: 'current', reconciledAt: clock.toISOString() };
const options = { now: () => clock };
const read = (input = env) => readPublicLogiPlayers(database.db, input, options);
const parsedMember = logiMemberSummarySchema.parse(fixture.member);
const key = publicLogiPlayerKey(core, parsedMember);

async function projection(scopeKey: string, resource: string, value: Record<string, unknown>) {
  await database.db.insert(logiProjection).values({ scopeKey, generation: 'accepted', resource, externalId: String(value.id), revision: '1', operation: 'upsert', data: value, observedAt: clock });
}
async function seed() {
  for (const source of [core, stats, data]) await database.db.insert(logiSyncScope).values({ scopeKey: source.scopeKey, sourceInstanceId: source.sourceInstanceId, guildId: source.guildId, gameId: source.gameId, activeGeneration: 'accepted', checkpoint, version: 1, lastSuccessAt: clock });
  await projection(core.scopeKey, 'member-summaries', fixture.member);
  await projection(core.scopeKey, 'roster-summaries', fixture.roster);
  await projection(stats.scopeKey, 'player-stat-summaries', fixture.statistics);
  const common = { id: 'event-example', guildId: core.guildId, gameId: 'wardogs', title: 'Public synthetic match', updatedAt: clock.toISOString() };
  await projection(data.scopeKey, 'event-summaries', { ...common, title: 'Public synthetic match', kind: 'match', status: 'concluded', startsAt: '2026-10-03T09:00:00Z', endsAt: '2026-10-03T10:00:00Z' });
  await projection(data.scopeKey, 'result-summaries', { ...common, eventId: common.id, resultState: 'corrected', result: { status: 'corrected', version: 2, participants: [{ id: 'a', label: 'Alpha', score: 10 }, { id: 'b', label: 'Bravo', score: 20 }], provenance: { origin: 'collected', sources: [] }, reviewedAt: clock.toISOString(), supersedesVersion: 1, attribution: { verified: 1, unresolved: 0 } } });
}
async function editorial(fields: Partial<typeof memberProfile.$inferInsert> = {}, grants = { allowRoster: true, allowStats: true }) {
  const [profile] = await database.db.insert(memberProfile).values({ slug: 'approved-player', displayName: 'Approved public name', games: ['wardogs'], state: 'published', consentConfirmedAt: clock, publishedAt: clock, ...fields }).returning({ id: memberProfile.id });
  await database.db.insert(logiMemberLink).values({ profileId: profile!.id, scopeKey: core.scopeKey, sourceInstanceId: core.sourceInstanceId, guildId: core.guildId, gameId: core.gameId, memberId: fixture.member.id, identityId: fixture.member.identityId, ...grants });
  return profile!.id;
}
async function recreateAssignment() {
  const memberId = 'recreated-assignment-same-native-person';
  await database.db.delete(logiProjection).where(and(eq(logiProjection.scopeKey, core.scopeKey), eq(logiProjection.resource, 'member-summaries')));
  await projection(core.scopeKey, 'member-summaries', { ...fixture.member, id: memberId });
  await database.db.update(logiProjection).set({ data: { ...fixture.roster,
    squads: fixture.roster.squads.map((squad) => ({ ...squad, slots: squad.slots.map((slot) => slot.memberId === fixture.member.id ? { ...slot, memberId } : slot) })),
    eventParticipation: fixture.roster.eventParticipation.map((row) => ({ ...row, memberId })),
  } }).where(and(eq(logiProjection.scopeKey, core.scopeKey), eq(logiProjection.resource, 'roster-summaries')));
  await database.db.update(logiProjection).set({ data: { ...fixture.statistics, players: fixture.statistics.players.map((row) => ({ ...row, memberId })) } })
    .where(eq(logiProjection.scopeKey, stats.scopeKey));
}

beforeAll(async () => { database = await createTestDatabase(); });
afterAll(async () => { await database.drop(); });
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => { await database.db.delete(memberProfile); await database.db.delete(logiSyncScope); await seed(); });

describe('owner-authorized public gaming names over real PostgreSQL snapshots', () => {
  it('publishes basic players without creating an editorial profile or consent', async () => {
    const players = await read();
    expect(players).toMatchObject([{ key, href: `/players/${key}`, displayName: fixture.member.displayName, games: ['wardogs'], profileSlug: null, activity: [{ game: 'wardogs', statistics: { sessions: 1 }, rosters: [{ href: '/wardogs/matches/logi/event-example', title: 'Public synthetic match', squad: 'Alpha', slot: 0, reserve: false }] }] }]);
    expect(await database.db.select().from(memberProfile)).toEqual([]);
    const json = JSON.stringify(players);
    for (const value of [fixture.member.id, fixture.member.identityId, fixture.member.discordSubject, core.guildId, core.sourceInstanceId, env.LOGI_PEOPLE_API_KEY_WDG, 'attendance', 'identityState', 'groups', 'paused', '"status"', '"type"', 'connectionId', 'sourceDigest']) if (value) expect(json.includes(value), `Forbidden player DTO token: ${value}`).toBe(false);
  });
  it('keeps the default source switch disabled and never borrows publication from match configuration', async () => {
    expect(await read({ ...env, LOGI_SOURCES_JSON: JSON.stringify([{ ...config, publishPlayers: false }]) })).toEqual([]);
    const { publishPlayers: _disabled, ...withoutSwitch } = config;
    expect(await read({ ...env, LOGI_SOURCES_JSON: JSON.stringify([withoutSwitch]) })).toEqual([]);
    expect((await readPublicLogiPlayerDirectory(database.db, { ...env, LOGI_SOURCES_JSON: JSON.stringify([withoutSwitch]) }, options)).availability.state).toBe('disabled');
  });
  it('distinguishes a complete empty current generation from a missing source without another snapshot read', async () => {
    await database.db.delete(logiProjection).where(eq(logiProjection.scopeKey, core.scopeKey));
    const snapshots = vi.spyOn(people, 'readLogiPeopleSnapshot');
    expect(await readPublicLogiPlayerDirectory(database.db, env, options)).toEqual({ players: [], availability: { state: 'complete', enabledGames: ['wardogs'], currentGames: ['wardogs'] } });
    expect(snapshots).toHaveBeenCalledTimes(1);
    await database.db.delete(logiSyncScope).where(eq(logiSyncScope.scopeKey, core.scopeKey));
    expect(await readPublicLogiPlayerDirectory(database.db, env, options)).toEqual({ players: [], availability: { state: 'unavailable', enabledGames: ['wardogs'], currentGames: [] } });
  });
  it('does not mistake a missing service key or disabled synchronization for disabled publication', async () => {
    for (const input of [{ ...env, LOGI_PEOPLE_API_KEY_WDG: undefined }, { ...env, LOGI_SOURCES_JSON: JSON.stringify([{ ...config, syncPeople: false }]) }]) {
      expect(await readPublicLogiPlayerDirectory(database.db, input, options)).toEqual({ players: [], availability: { state: 'unavailable', enabledGames: ['wardogs'], currentGames: [] } });
    }
  });
  it('retains the current game and explicitly reports partial coverage when the other game has not reconciled', async () => {
    const both = { ...env, LOGI_PEOPLE_API_KEY_HLL: 'synthetic-hll-public-people-key-123456', LOGI_SOURCES_JSON: JSON.stringify([config, { ...config, gameId: 'hell_let_loose' }]) };
    expect(await readPublicLogiPlayerDirectory(database.db, both, options)).toMatchObject({ players: [{ key, games: ['wardogs'] }], availability: { state: 'partial', enabledGames: ['wardogs', 'hell-let-loose'], currentGames: ['wardogs'] } });
    expect((await readPublicLogiPlayerDirectory(database.db, both, { ...options, game: 'wardogs' })).availability.state).toBe('complete');
  });
  it('uses immutable identity, never name, for opaque keys and cross-game equivalence', () => {
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(publicLogiPlayerKey({ ...core, gameId: 'hell_let_loose' }, parsedMember)).toBe(key);
    expect(publicLogiPlayerKey(core, { ...parsedMember, id: 'new-assignment-same-user' })).toBe(key);
    expect(publicLogiPlayerKey(core, { ...parsedMember, identityId: 'another-person' })).not.toBe(key);
    const unresolved = { ...fixture.member, identityId: null, identityState: 'unresolved' as const };
    expect(publicLogiPlayerKey(core, unresolved)).not.toBe(publicLogiPlayerKey({ ...core, gameId: 'hell_let_loose' }, unresolved));
  });
  it('retains two people with the same supplied name without nickname joins', async () => {
    await projection(core.scopeKey, 'member-summaries', { ...fixture.member, id: 'another-assignment', identityId: 'another-person' });
    const players = await read();
    expect(players).toHaveLength(2);
    expect(new Set(players.map((player) => player.key)).size).toBe(2);
    expect(players.filter((player) => player.activity[0]!.rosters.length)).toHaveLength(1);
  });
  it('deduplicates both games only through the same exact immutable source identity', async () => {
    const both = { ...env, LOGI_PEOPLE_API_KEY_HLL: 'synthetic-hll-public-people-key-123456', LOGI_DATA_API_KEY_HLL: 'synthetic-hll-public-data-key-123456', LOGI_SOURCES_JSON: JSON.stringify([config, { ...config, gameId: 'hell_let_loose' }]) };
    const hll = configuredLogiSources(both, 'people').find((source) => source.gameId === 'hell_let_loose')!;
    await database.db.insert(logiSyncScope).values({ scopeKey: hll.scopeKey, sourceInstanceId: hll.sourceInstanceId, guildId: hll.guildId, gameId: hll.gameId, activeGeneration: 'accepted', checkpoint, version: 1, lastSuccessAt: clock });
    await projection(hll.scopeKey, 'member-summaries', { ...fixture.member, id: 'hll-assignment', gameId: 'hell_let_loose' });
    const merged = await read(both);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.games.sort()).toEqual(['hell-let-loose', 'wardogs']);
    expect(merged[0]!.activity).toHaveLength(2);
    expect(await readPublicLogiPlayers(database.db, both, { ...options, game: 'hell-let-loose' })).toMatchObject([{ games: ['hell-let-loose'] }]);
    await database.db.update(logiProjection).set({ data: { ...fixture.member, id: 'hll-assignment', identityId: 'another-native-user', gameId: 'hell_let_loose' } }).where(eq(logiProjection.scopeKey, hll.scopeKey));
    expect(await read(both)).toHaveLength(2);
  });
  it('maps alias-only roster facts to the reviewed canonical public match', async () => {
    const values = await database.db.select().from(logiProjection).where(eq(logiProjection.scopeKey, data.scopeKey));
    for (const value of values) await projection(data.scopeKey, value.resource, { ...value.data, id: 'event-alias', ...(value.resource === 'result-summaries' ? { eventId: 'event-alias' } : {}) });
    await database.db.update(logiProjection).set({ data: { ...fixture.roster, eventId: 'event-alias' } }).where(and(eq(logiProjection.scopeKey, core.scopeKey), eq(logiProjection.resource, 'roster-summaries')));
    const aliases = { ...env, LOGI_SOURCES_JSON: JSON.stringify([{ ...config, matchAliases: [{ canonicalEventId: 'event-example', aliasEventIds: ['event-alias'] }] }]) };
    expect(await read(aliases)).toMatchObject([{ activity: [{ rosters: [{ href: '/wardogs/matches/logi/event-example' }] }] }]);
  });
  it.each(['hidden', 'draft', 'withdrawn', 'game-removed'] as const)('does not bypass an exact %s editorial association', async (reason) => {
    await editorial(reason === 'withdrawn' ? { state: 'hidden', consentConfirmedAt: null } : reason === 'game-removed' ? { games: ['hell-let-loose'] } : { state: reason });
    expect(await read()).toEqual([]);
    expect(await readPublicLogiPlayerStatisticsTargets(database.db, env, key, options)).toEqual([]);
  });
  it('prioritizes an approved exact profile and preserves independent data opt-outs', async () => {
    await editorial({}, { allowRoster: false, allowStats: false });
    expect(await read()).toMatchObject([{ href: '/members/approved-player', profileSlug: 'approved-player', displayName: 'Approved public name', activity: [{ statistics: null, rosters: [] }] }]);
    expect(await readPublicLogiPlayerStatisticsTargets(database.db, env, key, options)).toEqual([]);
  });
  it('does not let an unrelated hidden same-name profile suppress or identify a player', async () => {
    await database.db.insert(memberProfile).values({ slug: 'unrelated', displayName: fixture.member.displayName!, state: 'hidden' });
    expect(await read()).toMatchObject([{ href: `/players/${key}`, profileSlug: null }]);
  });
  it('preserves an exact withdrawn association across credential rotation without renewing positive profile authority', async () => {
    await editorial({ state: 'hidden', consentConfirmedAt: null });
    const rotated = { ...env, LOGI_PEOPLE_API_KEY_WDG: 'synthetic-rotated-people-key-123456' };
    const next = configuredLogiSources(rotated, 'people')[0]!;
    await database.db.insert(logiSyncScope).values({ scopeKey: next.scopeKey, sourceInstanceId: next.sourceInstanceId, guildId: next.guildId, gameId: next.gameId, activeGeneration: 'accepted', checkpoint, version: 1, lastSuccessAt: clock });
    await projection(next.scopeKey, 'member-summaries', fixture.member);
    expect(await read(rotated)).toEqual([]);
    expect(await readPublicLogiPlayerStatisticsTargets(database.db, rotated, key, options)).toEqual([]);
  });
  it('preserves native-identity withdrawal after deleting and recreating the same-game assignment', async () => {
    await editorial({ state: 'hidden', consentConfirmedAt: null });
    await recreateAssignment();
    expect(await read()).toEqual([]);
    expect(await readPublicLogiPlayerStatisticsTargets(database.db, env, key, options)).toEqual([]);
  });
  it.each(['roster', 'statistics'] as const)('preserves the independent %s opt-out after assignment recreation', async (denied) => {
    await editorial({}, { allowRoster: denied !== 'roster', allowStats: denied !== 'statistics' });
    await recreateAssignment();
    const [player] = await read();
    expect(player).toMatchObject({ key, href: `/players/${key}`, profileSlug: null, displayName: fixture.member.displayName });
    expect(player!.activity[0]!.rosters).toHaveLength(denied === 'roster' ? 0 : 1);
    expect(player!.activity[0]!.statistics).toEqual(denied === 'statistics' ? null : expect.objectContaining({ sessions: 1 }));
    expect(await readPublicLogiPlayerStatisticsTargets(database.db, env, key, options)).toHaveLength(denied === 'statistics' ? 0 : 1);
  });
  it('does not renew positive editorial authority from an old assignment of the same native person', async () => {
    await editorial();
    await recreateAssignment();
    expect(await read()).toMatchObject([{ key, href: `/players/${key}`, profileSlug: null, displayName: fixture.member.displayName, activity: [{ rosters: [{ title: 'Public synthetic match' }], statistics: { sessions: 1 } }] }]);
  });
  it.each(['unresolved', 'conflict'] as const)('retains hidden exact-assignment withdrawal when the native identity becomes %s', async (identityState) => {
    await editorial({ state: 'hidden', consentConfirmedAt: null });
    await database.db.update(logiProjection).set({ data: { ...fixture.member, identityState, identityId: null, discordSubject: null, displayName: null } })
      .where(and(eq(logiProjection.scopeKey, core.scopeKey), eq(logiProjection.resource, 'member-summaries')));
    expect(await read()).toEqual([]);
  });
  it('never inherits a positive editorial name/profile or bound facts from an unresolved exact assignment with false grants', async () => {
    await editorial({}, { allowRoster: false, allowStats: false });
    const unresolved = logiMemberSummarySchema.parse({ ...fixture.member, identityState: 'unresolved', identityId: null, discordSubject: null, displayName: null });
    await database.db.update(logiProjection).set({ data: unresolved }).where(and(eq(logiProjection.scopeKey, core.scopeKey), eq(logiProjection.resource, 'member-summaries')));
    const unresolvedKey = publicLogiPlayerKey(core, unresolved);
    expect(await read()).toMatchObject([{ key: unresolvedKey, href: `/players/${unresolvedKey}`, profileSlug: null, displayName: null, activity: [{ rosters: [], statistics: null }] }]);
    expect(await readPublicLogiPlayerStatisticsTargets(database.db, env, unresolvedKey, options)).toEqual([]);
  });
  it('does not transfer a different resolved native person’s editorial identity or withdrawal by the reused assignment alone', async () => {
    await editorial({ state: 'hidden', consentConfirmedAt: null });
    const current = logiMemberSummarySchema.parse({ ...fixture.member, identityId: 'different-native-person', discordSubject: '910000000000000099' });
    await database.db.update(logiProjection).set({ data: current }).where(and(eq(logiProjection.scopeKey, core.scopeKey), eq(logiProjection.resource, 'member-summaries')));
    const currentKey = publicLogiPlayerKey(core, current);
    expect(await read()).toMatchObject([{ key: currentKey, href: `/players/${currentKey}`, profileSlug: null, displayName: fixture.member.displayName, activity: [{ rosters: [], statistics: null }] }]);
  });
  it('retains unresolved entries without claiming identity-bound roster or statistics facts', async () => {
    await database.db.update(logiProjection).set({ data: { ...fixture.member, identityState: 'unresolved', identityId: null, discordSubject: null, displayName: null } }).where(and(eq(logiProjection.scopeKey, core.scopeKey), eq(logiProjection.resource, 'member-summaries')));
    expect(await read()).toMatchObject([{ displayName: null, activity: [{ rosters: [], statistics: null }] }]);
    expect(await readPublicLogiPlayerStatisticsTargets(database.db, env, key, options)).toEqual([]);
  });
  it.each(['forbidden', 'stale', 'bootstrap'] as const)('suppresses %s core while preserving private/public separation', async (reason) => {
    await database.db.update(logiSyncScope).set(reason === 'forbidden' ? { errorCode: 'forbidden' } : reason === 'stale' ? { lastSuccessAt: new Date(clock.getTime() - 6 * 60_000) } : { checkpoint: { ...checkpoint, mode: 'bootstrap', generation: 'building' } }).where(eq(logiSyncScope.scopeKey, core.scopeKey));
    expect(await read()).toEqual([]);
    expect((await readPublicLogiPlayerDirectory(database.db, env, options)).availability).toEqual({ state: 'unavailable', enabledGames: ['wardogs'], currentGames: [] });
  });
  it('keeps members and rosters when complete statistics are unavailable', async () => {
    await database.db.update(logiSyncScope).set({ errorCode: 'forbidden' }).where(eq(logiSyncScope.scopeKey, stats.scopeKey));
    expect(await read()).toMatchObject([{ activity: [{ statistics: null, rosters: [{ title: 'Public synthetic match' }] }] }]);
  });
  it('requires actual same-game website publication before match activity or match statistics', async () => {
    const privateMatchEnv = { ...env, LOGI_SOURCES_JSON: JSON.stringify([{ ...config, publishMatches: false }]) };
    expect(await read(privateMatchEnv)).toMatchObject([{ activity: [{ rosters: [] }] }]);
    expect(await readPublicLogiPlayerMatchPeople(database.db, privateMatchEnv, 'wardogs', 'event-example', options)).toEqual({ roster: [], statistics: [] });
    expect(await readPublicLogiPlayerMatchPeople(database.db, env, 'hell-let-loose', 'event-example', options)).toEqual({ roster: [], statistics: [] });
    expect(await readPublicLogiPlayerMatchPeople(database.db, env, 'wardogs', 'event-example', options)).toMatchObject({ roster: [{ href: `/players/${key}`, displayName: fixture.member.displayName }], statistics: [{ statistics: { sessions: 1 } }] });
  });
  it('fences a withdrawal committed during asynchronous source work in the final SQL statement', async () => {
    const id = await editorial();
    const original = people.readScopedLogiPeopleEvents;
    vi.spyOn(people, 'readScopedLogiPeopleEvents').mockImplementationOnce(async (...args) => {
      await database.db.update(memberProfile).set({ state: 'hidden', consentConfirmedAt: null }).where(eq(memberProfile.id, id));
      return original(...args);
    });
    expect(await read()).toEqual([]);
  });
  it('rejects a source checkpoint changed while awaited work was running', async () => {
    const original = people.readScopedLogiPeopleEvents;
    vi.spyOn(people, 'readScopedLogiPeopleEvents').mockImplementationOnce(async (...args) => {
      await database.db.update(logiSyncScope).set({ version: 2, checkpoint: { ...checkpoint, version: 2 } }).where(eq(logiSyncScope.scopeKey, core.scopeKey));
      return original(...args);
    });
    expect(await read()).toEqual([]);
  });
  it('drops statistics whose independent version changed before final publication without dropping current roster facts', async () => {
    const original = people.readScopedLogiPeopleEvents;
    vi.spyOn(people, 'readScopedLogiPeopleEvents').mockImplementationOnce(async (...args) => {
      const events = await original(...args);
      await database.db.update(logiSyncScope).set({ version: 2, checkpoint: { ...checkpoint, version: 2 } }).where(eq(logiSyncScope.scopeKey, stats.scopeKey));
      return events;
    });
    expect(await read()).toMatchObject([{ activity: [{ statistics: null, rosters: [{ title: 'Public synthetic match' }] }] }]);
  });
  it('rechecks the clock after awaited publication work', async () => {
    let calls = 0;
    expect(await readPublicLogiPlayers(database.db, env, { now: () => calls++ ? new Date(clock.getTime() + 6 * 60_000) : clock })).toEqual([]);
  });
  it('provides current exact internal stats targets only for an eligible opaque key', async () => {
    expect(await readPublicLogiPlayerStatisticsTargets(database.db, env, key, options)).toMatchObject([{ source: { scopeKey: core.scopeKey }, member: { id: fixture.member.id, identityId: fixture.member.identityId }, version: 1 }]);
    expect(await readPublicLogiPlayerStatisticsTargets(database.db, env, fixture.member.id, options)).toEqual([]);
    expect(await readPublicLogiPlayerStatisticsTargets(database.db, env, key, { ...options, game: 'hell-let-loose' })).toEqual([]);
  });
});
