import { logiMemberLink, logiProjection, logiSyncScope, memberProfile } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testPrincipal } from '@/modules/access/testing';
import { configuredLogiSources } from '@/modules/integrations/logi-config';
import { readLogiMemberCandidates, readLogiTeam, readPublicLogiEventPeople, readPublicLogiMemberEnrichment } from '@/modules/integrations/logi-people';
import { readActiveLogiProjections } from '@/modules/integrations/logi-store';
import fixture from '@/modules/integrations/logi/fixtures/v0.14-people.json';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let database: TestDatabase;
let clock: Date;
let profileId: string;
const config = { sourceInstanceId: 'synthetic-people', origin: 'https://logi.example.test', guildId: fixture.member.guildId, gameId: 'wardogs', syncPeople: true, publishMatches: true };
const env = { LOGI_SOURCES_JSON: JSON.stringify([config]), LOGI_PEOPLE_API_KEY_WDG: 'synthetic-people-key-123456', LOGI_DATA_API_KEY_WDG: 'synthetic-data-key-123456' };
const people = configuredLogiSources(env, 'people')[0]!;
const data = configuredLogiSources(env, 'data')[0]!;
const member = testPrincipal(['member'], { games: ['wardogs'], intent: 'read' });
const editor = testPrincipal(['editor'], { games: ['wardogs'], intent: 'read' });
const options = { now: () => clock };
const profile = () => readPublicLogiMemberEnrichment(database.db, env, 'approved-player', options);
const event = () => readPublicLogiEventPeople(database.db, env, 'wardogs', 'event-example', options);
const checkpoint = () => ({ version: 1, generation: null, mode: 'live', resourceIndex: 3, listCursor: null, boundaryCursor: 'boundary', cursor: 'current', reconciledAt: clock.toISOString() });

async function projection(scopeKey: string, resource: string, payload: Record<string, unknown>) {
  await database.db.insert(logiProjection).values({ scopeKey, generation: 'accepted', resource, externalId: String(payload.id), revision: '1', operation: 'upsert', data: payload, observedAt: clock });
}
async function updateProjection(resource: string, payload: Record<string, unknown> | null) {
  await database.db.update(logiProjection).set({ data: payload, operation: payload ? 'upsert' : 'remove', revision: '2' }).where(and(eq(logiProjection.scopeKey, people.scopeKey), eq(logiProjection.resource, resource)));
}

beforeAll(async () => { database = await createTestDatabase(); });
afterAll(async () => { await database.drop(); });
beforeEach(async () => {
  clock = new Date('2026-10-03T10:01:00Z');
  await database.db.delete(memberProfile);
  await database.db.delete(logiSyncScope);
  for (const source of [people, data]) await database.db.insert(logiSyncScope).values({ scopeKey: source.scopeKey, sourceInstanceId: source.sourceInstanceId, guildId: source.guildId, gameId: source.gameId, activeGeneration: 'accepted', checkpoint: checkpoint(), version: 1, lastSuccessAt: clock });
  await projection(people.scopeKey, 'member-summaries', fixture.member);
  await projection(people.scopeKey, 'roster-summaries', fixture.roster);
  await projection(people.scopeKey, 'player-stat-summaries', fixture.statistics);
  const identity = { id: 'event-example', eventId: 'event-example', guildId: config.guildId, gameId: 'wardogs', title: 'Public synthetic match', updatedAt: clock.toISOString() };
  await projection(data.scopeKey, 'event-summaries', { ...identity, eventId: undefined, kind: 'match', status: 'concluded', startsAt: '2026-10-03T09:00:00Z', endsAt: '2026-10-03T10:00:00Z' });
  await projection(data.scopeKey, 'result-summaries', { ...identity, resultState: 'corrected', result: { status: 'corrected', version: 2, participants: [{ id: 'alpha', label: 'Alpha', score: 10 }, { id: 'bravo', label: 'Bravo', score: 20 }], provenance: { origin: 'collected', sources: [] }, reviewedAt: clock.toISOString(), supersedesVersion: 1, attribution: { verified: 1, unresolved: 2 } } });
  const [row] = await database.db.insert(memberProfile).values({ slug: 'approved-player', displayName: 'Approved Player', games: ['wardogs'], state: 'published', consentConfirmedAt: clock, publishedAt: clock }).returning({ id: memberProfile.id });
  profileId = row!.id;
  await database.db.insert(logiMemberLink).values({ profileId, scopeKey: people.scopeKey, sourceInstanceId: people.sourceInstanceId, guildId: people.guildId, gameId: people.gameId, memberId: fixture.member.id, identityId: fixture.member.identityId, allowStats: true, allowRoster: true });
});

describe('real PostgreSQL people projection and publication boundary', () => {
  it('shows members published rosters and attendance only to current game-authorized readers', async () => {
    expect(await readLogiTeam(database.db, env, member, 'wardogs', options)).toMatchObject({ state: 'fresh', members: [{ displayName: 'Synthetic member', statistics: { sessions: 1 } }], rosters: [{ squads: [{ slots: [{ displayName: 'Synthetic member', attendance: 'acknowledged' }, { displayName: null }] }] }], attendance: [{ status: 'attending', completed: null }] });
    for (const actor of [{ kind: 'anonymous' as const }, editor, testPrincipal(['member'], { games: ['hell-let-loose'] }), { ...member, status: 'stale' as const }]) {
      await expect(readLogiTeam(database.db, env, actor, 'wardogs', options)).rejects.toHaveProperty('code');
    }
  });
  it('uses only the approved website name and excludes private identities and attendance publicly', async () => {
    const result = await profile();
    expect(result).toMatchObject([{ game: 'wardogs', statistics: { sessions: 1 }, rosters: [{ displayName: 'Approved Player', profileSlug: 'approved-player', squad: 'Alpha' }] }]);
    expect(await event()).toMatchObject({ roster: [{ displayName: 'Approved Player' }], statistics: [{ displayName: 'Approved Player', statistics: { completeSessions: 1 } }] });
    const serialized = JSON.stringify([result, await event()]);
    for (const privateValue of ['Synthetic member', 'Synthetic squad', fixture.member.identityId, fixture.member.id, fixture.member.discordSubject, 'attendance', 'completed', 'discordSubject', 'scopeKey', '"status"', '"type"', '"groups"']) expect(serialized).not.toContain(privateValue);
  });
  it('does not need a data key for protected people or independently consented profile statistics', async () => {
    const onlyPeople = { ...env, LOGI_DATA_API_KEY_WDG: undefined };
    expect((await readLogiTeam(database.db, onlyPeople, member, 'wardogs', options)).members).toHaveLength(1);
    expect(await readPublicLogiMemberEnrichment(database.db, onlyPeople, 'approved-player', options)).toMatchObject([{ statistics: { sessions: 1 }, rosters: [] }]);
  });
  it('requires separate explicit roster and statistics grants on the profile link', async () => {
    await database.db.update(logiMemberLink).set({ allowStats: false }).where(eq(logiMemberLink.profileId, profileId));
    expect(await profile()).toMatchObject([{ statistics: null, rosters: [{ profileSlug: 'approved-player' }] }]);
    await database.db.update(logiMemberLink).set({ allowStats: true, allowRoster: false }).where(eq(logiMemberLink.profileId, profileId));
    expect(await profile()).toMatchObject([{ statistics: { sessions: 1 }, rosters: [] }]);
    await database.db.update(logiMemberLink).set({ allowStats: false }).where(eq(logiMemberLink.profileId, profileId));
    expect(await profile()).toEqual([]);
  });
  it.each(['withdrawn', 'hidden', 'wrong-game', 'unlinked'] as const)('immediately omits %s profiles', async (change) => {
    if (change === 'unlinked') await database.db.delete(logiMemberLink);
    else await database.db.update(memberProfile).set(change === 'withdrawn' ? { state: 'hidden', consentConfirmedAt: null } : change === 'hidden' ? { state: 'hidden' } : { games: ['hell-let-loose'] }).where(eq(memberProfile.id, profileId));
    expect(await profile()).toEqual([]);
    expect(await event()).toMatchObject({ roster: [], statistics: [] });
  });
  it('rejects changed identities, removed assignments and a replaced grant key', async () => {
    await updateProjection('member-summaries', { ...fixture.member, identityId: 'replacement-person' });
    expect(await profile()).toEqual([]);
    expect((await readLogiTeam(database.db, env, member, 'wardogs', options)).members[0]!.statistics).toBeNull();
    await updateProjection('member-summaries', null);
    expect(await profile()).toEqual([]);
    expect(await readLogiMemberCandidates(database.db, { ...env, LOGI_PEOPLE_API_KEY_WDG: 'replacement-people-key-123456' }, editor, 'wardogs', options)).toEqual([]);
  });
  it.each(['forbidden', 'unauthorized', 'reset_required'])('suppresses public rows after source %s without waiting for TTL', async (errorCode) => {
    await database.db.update(logiSyncScope).set({ errorCode }).where(eq(logiSyncScope.scopeKey, people.scopeKey));
    expect(await profile()).toEqual([]);
    expect(await readLogiMemberCandidates(database.db, env, editor, 'wardogs', options)).toEqual([]);
  });
  it('hides old people rows during an incomplete rebuild and never treats idle pulls as fresh attribution', async () => {
    await database.db.update(logiSyncScope).set({ checkpoint: { ...checkpoint(), mode: 'bootstrap', generation: 'building' } }).where(eq(logiSyncScope.scopeKey, people.scopeKey));
    expect(await profile()).toEqual([]);
    expect((await readLogiTeam(database.db, env, member, 'wardogs', options)).state).toBe('stale');
    clock = new Date('2026-10-03T10:07:00Z');
    await database.db.update(logiSyncScope).set({ checkpoint: checkpoint(), lastSuccessAt: clock }).where(eq(logiSyncScope.scopeKey, people.scopeKey));
    expect(await profile()).toEqual([]);
    expect((await readLogiTeam(database.db, env, member, 'wardogs', options)).state).toBe('unavailable');
  });
  it('labels stale private rows but omits public data, then removes unavailable private rows', async () => {
    await updateProjection('player-stat-summaries', null);
    clock = new Date('2026-10-03T10:07:00Z');
    expect(await profile()).toEqual([]);
    expect(await readLogiTeam(database.db, env, member, 'wardogs', options)).toMatchObject({ state: 'stale', members: [{ statistics: null }] });
    clock = new Date('2026-10-03T10:17:00Z');
    expect(await readLogiTeam(database.db, env, member, 'wardogs', options)).toMatchObject({ state: 'unavailable', members: [], attendance: [] });
  });
  it('does not disguise an expired session as complete statistics from a fresher subset', async () => {
    await projection(people.scopeKey, 'player-stat-summaries', { ...fixture.statistics, id: 'expired-session', externalSessionId: 'expired-round', attributionCheckedAt: '2026-10-03T09:50:00.000Z' });
    expect(await profile()).toEqual([]);
    expect(await readLogiTeam(database.db, env, member, 'wardogs', options)).toMatchObject({ state: 'unavailable', members: [] });
  });
  it('does not attach sessions to unreviewed, corrected-away or unpublished events', async () => {
    await updateProjection('player-stat-summaries', { ...fixture.statistics, eventRefs: [{ eventId: 'event-example', resultVersion: 1, resultState: 'confirmed' }] });
    expect(await event()).toMatchObject({ roster: [{ profileSlug: 'approved-player' }], statistics: [] });
    expect(await readPublicLogiEventPeople(database.db, env, 'wardogs', 'unpublished-event', options)).toBeNull();
  });
  it('exposes immutable link candidates only to an authorized editor and never grants access from them', async () => {
    expect(await readLogiMemberCandidates(database.db, env, editor, 'wardogs', options)).toMatchObject([{ memberId: fixture.member.id, identityId: fixture.member.identityId, scopeKey: people.scopeKey }]);
    await expect(readLogiMemberCandidates(database.db, env, member, 'wardogs', options)).rejects.toHaveProperty('code', 'forbidden');
  });
  it('contains candidate source unavailability while preserving authorization failures', async () => {
    const invalid = { ...env, LOGI_SOURCES_JSON: '{invalid' };
    await expect(readLogiMemberCandidates(database.db, invalid, editor, 'wardogs', options)).resolves.toEqual([]);
    await expect(readLogiMemberCandidates(database.db, invalid, member, 'wardogs', options)).rejects.toHaveProperty('code', 'forbidden');
    await expect(readLogiMemberCandidates(database.db, { ...env, LOGI_PEOPLE_API_KEY_WDG: undefined }, editor, 'wardogs', options)).resolves.toEqual([]);
    await updateProjection('member-summaries', { ...fixture.member, identityState: 'invalid' });
    await expect(readLogiMemberCandidates(database.db, env, editor, 'wardogs', options)).resolves.toEqual([]);
  });
  it('uses a single decision time instead of silently filtering one session at a TTL boundary', async () => {
    await projection(people.scopeKey, 'player-stat-summaries', { ...fixture.statistics, id: 'newer-session', externalSessionId: 'newer-round', attributionCheckedAt: '2026-10-03T10:04:00.000Z' });
    let reads = 0;
    const now = () => new Date(++reads <= 4 ? '2026-10-03T10:05:02.000Z' : '2026-10-03T10:05:02.001Z');
    const result = await readPublicLogiMemberEnrichment(database.db, env, 'approved-player', { now });
    expect(result).toMatchObject([{ statistics: { sessions: 2 } }]);
    expect(reads).toBeLessThanOrEqual(4);
    reads = 0;
    expect(await readPublicLogiEventPeople(database.db, env, 'wardogs', 'event-example', { now })).toMatchObject({ statistics: [{ statistics: { sessions: 2 } }] });
    expect(reads).toBeLessThanOrEqual(4);
  });
  it('rejects an oversized generation in PostgreSQL before returning personal JSON', async () => {
    await updateProjection('player-stat-summaries', { ...fixture.statistics, oversized: 'x'.repeat(16 * 1024 * 1024) });
    await expect(readActiveLogiProjections(database.db, people)).rejects.toThrow('capacity exceeded');
    expect(await profile()).toEqual([]);
    expect((await readLogiTeam(database.db, env, member, 'wardogs', options)).state).toBe('unavailable');
    await expect(readLogiMemberCandidates(database.db, env, editor, 'wardogs', options)).resolves.toEqual([]);
  });
});
