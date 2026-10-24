import { logiMemberLink, logiProjection, logiSyncScope, memberProfile } from '@valkyria/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testPrincipal } from '@/modules/access/testing';
import { configuredLogiSources } from '@/modules/integrations/logi-config';
import { readLogiMemberCandidates, readLogiTeam, readPublicLogiEventPeople, readPublicLogiMemberEnrichment, readPublicLogiRosterDirectory } from '@/modules/integrations/logi-people';
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
const directory = () => readPublicLogiRosterDirectory(database.db, env, options);
const checkpoint = () => ({ version: 1, generation: null, mode: 'live', resourceIndex: 3, listCursor: null, boundaryCursor: 'boundary', cursor: 'current', reconciledAt: clock.toISOString() });

async function projection(scopeKey: string, resource: string, payload: Record<string, unknown>) {
  await database.db.insert(logiProjection).values({ scopeKey, generation: 'accepted', resource, externalId: String(payload.id), revision: '1', operation: 'upsert', data: payload, observedAt: clock });
}
async function updateProjection(resource: string, payload: Record<string, unknown> | null) {
  await database.db.update(logiProjection).set({ data: payload, operation: payload ? 'upsert' : 'remove', revision: '2' }).where(and(eq(logiProjection.scopeKey, people.scopeKey), eq(logiProjection.resource, resource)));
}

async function withPublicAlias(change: 'equal' | 'unreviewed' | 'conflicting' | 'unknown-canonical' | 'absent-canonical' = 'equal') {
  const rows = await database.db.select().from(logiProjection).where(eq(logiProjection.scopeKey, data.scopeKey));
  for (const row of rows) await projection(data.scopeKey, row.resource, {
    ...(row.data as Record<string, unknown>), id: 'event-alias',
    ...(row.resource === 'result-summaries' ? { eventId: 'event-alias' } : {}),
    ...(change === 'conflicting' && row.resource === 'event-summaries' ? { title: 'Different current match facts' } : {}),
  });
  await projection(people.scopeKey, 'roster-summaries', { ...fixture.roster, id: 'alias-roster', eventId: 'event-alias' });
  if (change === 'unknown-canonical' || change === 'absent-canonical') await database.db.update(logiProjection).set({ operation: 'remove', data: null })
    .where(and(eq(logiProjection.scopeKey, data.scopeKey), eq(logiProjection.externalId, 'event-example'), eq(logiProjection.resource, change === 'unknown-canonical' ? 'result-summaries' : 'event-summaries')));
  return { ...env, LOGI_SOURCES_JSON: JSON.stringify([{ ...config, matchAliases: change === 'unreviewed' ? [] : [{ canonicalEventId: 'event-example', aliasEventIds: ['event-alias'] }] }]) };
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
  it('counts a reviewed equivalent alias once across directory, profile and match roster', async () => {
    const aliasedEnv = await withPublicAlias();
    const directoryRows = await readPublicLogiRosterDirectory(database.db, aliasedEnv, options);
    expect(directoryRows).toHaveLength(1);
    expect(directoryRows[0]!.matches).toHaveLength(1);
    expect(directoryRows[0]!.matches[0]!.href).toBe('/wardogs/matches/logi/event-example');
    const profileRows = await readPublicLogiMemberEnrichment(database.db, aliasedEnv, 'approved-player', options);
    expect(profileRows[0]!.rosters).toHaveLength(1);
    expect(profileRows[0]!.rosters[0]!.eventId).toBe('event-example');
    for (const id of ['event-example', 'event-alias']) {
      const match = await readPublicLogiEventPeople(database.db, aliasedEnv, 'wardogs', id, options);
      expect(match!.roster).toHaveLength(1);
      expect(match!.roster[0]!.eventId).toBe('event-example');
      expect(match!.statistics).toMatchObject([{ statistics: { sessions: 1 } }]);
    }
  });
  it('links alias-only roster and result-attributed sessions to the equivalent canonical match', async () => {
    const aliasedEnv = await withPublicAlias();
    await database.db.delete(logiProjection).where(and(eq(logiProjection.scopeKey, people.scopeKey), eq(logiProjection.externalId, fixture.roster.id)));
    await updateProjection('player-stat-summaries', { ...fixture.statistics, eventRefs: [{ eventId: 'event-alias', resultVersion: 2, resultState: 'corrected' }] });
    expect(await readPublicLogiRosterDirectory(database.db, aliasedEnv, options)).toMatchObject([{ matches: [{ href: '/wardogs/matches/logi/event-example' }] }]);
    expect(await readPublicLogiMemberEnrichment(database.db, aliasedEnv, 'approved-player', options)).toMatchObject([{ rosters: [{ eventId: 'event-example', matchTitle: 'Public synthetic match' }] }]);
    expect(await readPublicLogiEventPeople(database.db, aliasedEnv, 'wardogs', 'event-example', options)).toMatchObject({ roster: [{ eventId: 'event-example' }], statistics: [{ statistics: { sessions: 1 } }] });
  });
  it.each(['unreviewed', 'conflicting', 'unknown-canonical', 'absent-canonical'] as const)('keeps %s alias participation independent', async (change) => {
    const aliasedEnv = await withPublicAlias(change);
    const expected = change === 'absent-canonical' ? ['event-alias'] : ['event-alias', 'event-example'];
    const directoryRows = await readPublicLogiRosterDirectory(database.db, aliasedEnv, options);
    expect(directoryRows.flatMap((row) => row.matches.map((match) => match.href.split('/').at(-1))).sort()).toEqual(expected);
    const profileRows = await readPublicLogiMemberEnrichment(database.db, aliasedEnv, 'approved-player', options);
    expect(profileRows.flatMap((row) => row.rosters.map((roster) => roster.eventId)).sort()).toEqual(expected);
    const alias = await readPublicLogiEventPeople(database.db, aliasedEnv, 'wardogs', 'event-alias', options);
    expect(alias!.roster.map((row) => row.eventId)).toEqual(['event-alias']);
  });
  it.each(['consent', 'scope', 'roster-grant', 'game'] as const)('does not let an approved alias bypass a revoked %s boundary', async (boundary) => {
    const aliasedEnv = await withPublicAlias();
    if (boundary === 'consent') await database.db.update(memberProfile).set({ state: 'hidden', consentConfirmedAt: null }).where(eq(memberProfile.id, profileId));
    if (boundary === 'scope') await database.db.update(logiSyncScope).set({ errorCode: 'forbidden' }).where(eq(logiSyncScope.scopeKey, people.scopeKey));
    if (boundary === 'roster-grant') await database.db.update(logiMemberLink).set({ allowRoster: false }).where(eq(logiMemberLink.profileId, profileId));
    if (boundary === 'game') await database.db.update(memberProfile).set({ games: ['hell-let-loose'] }).where(eq(memberProfile.id, profileId));
    expect(await readPublicLogiRosterDirectory(database.db, aliasedEnv, options)).toEqual([]);
    const profiles = await readPublicLogiMemberEnrichment(database.db, aliasedEnv, 'approved-player', options);
    expect(profiles.flatMap((row) => row.rosters)).toEqual([]);
    const match = await readPublicLogiEventPeople(database.db, aliasedEnv, 'wardogs', 'event-example', options);
    expect(match?.roster ?? []).toEqual([]);
  });
  it('adds approved match lineups to the ordinary public profile directory without private member fields', async () => {
    const result = await directory();
    expect(result).toEqual([{
      profileSlug: 'approved-player', game: 'wardogs', observedAt: clock.toISOString(),
      matches: [{ href: '/wardogs/matches/logi/event-example', title: 'Public synthetic match', startsAt: '2026-10-03T09:00:00Z', squad: 'Alpha', slot: 0, reserve: false }],
    }]);
    const serialized = JSON.stringify(result);
    for (const privateValue of ['Synthetic member', fixture.member.identityId, fixture.member.id, fixture.member.discordSubject, 'attendance', 'completed', 'discordSubject', 'scopeKey', '"status"', '"type"', '"groups"']) expect(serialized).not.toContain(privateValue);
    await database.db.insert(memberProfile).values({ slug: 'same-source-nickname', displayName: fixture.member.displayName!, games: ['wardogs'], state: 'published', consentConfirmedAt: clock, publishedAt: clock });
    expect(await directory()).toEqual(result);
    await projection(people.scopeKey, 'roster-summaries', { ...fixture.roster, id: 'duplicate-published-roster' });
    expect(await directory()).toEqual(result);
    expect(await profile()).toMatchObject([{ rosters: [{ matchTitle: 'Public synthetic match' }] }]);
    expect((await event())!.roster).toHaveLength(1);
  });
  it('preserves different squad positions independently of repeated squad display names', async () => {
    const squad = fixture.roster.squads[0]!;
    await projection(people.scopeKey, 'roster-summaries', { ...fixture.roster, id: 'second-published-roster', squads: [{ ...squad, index: 1 }] });
    expect((await profile())[0]!.rosters).toHaveLength(2);
    expect((await event())!.roster).toHaveLength(2);
    expect((await directory())[0]!.matches).toHaveLength(1);
  });
  it('composes both games by approved profile identity with an explicit game scope', async () => {
    const hllConfig = { ...config, gameId: 'hell_let_loose' };
    const bothEnv = { ...env, LOGI_SOURCES_JSON: JSON.stringify([config, hllConfig]), LOGI_PEOPLE_API_KEY_HLL: 'synthetic-hll-people-key-123456', LOGI_DATA_API_KEY_HLL: 'synthetic-hll-data-key-123456' };
    const hllPeople = configuredLogiSources(bothEnv, 'people').find((source) => source.gameId === 'hell_let_loose')!;
    const hllData = configuredLogiSources(bothEnv, 'data').find((source) => source.gameId === 'hell_let_loose')!;
    for (const source of [hllPeople, hllData]) await database.db.insert(logiSyncScope).values({ scopeKey: source.scopeKey, sourceInstanceId: source.sourceInstanceId, guildId: source.guildId, gameId: source.gameId, activeGeneration: 'accepted', checkpoint: checkpoint(), version: 1, lastSuccessAt: clock });
    await projection(hllPeople.scopeKey, 'member-summaries', { ...fixture.member, gameId: 'hell_let_loose' });
    await projection(hllPeople.scopeKey, 'roster-summaries', { ...fixture.roster, gameId: 'hell_let_loose' });
    await projection(hllData.scopeKey, 'event-summaries', { id: 'event-example', guildId: config.guildId, gameId: 'hell_let_loose', title: 'Public HLL match', updatedAt: clock.toISOString(), kind: 'match', status: 'registration', startsAt: '2026-10-03T09:00:00Z', endsAt: '2026-10-03T10:00:00Z' });
    await database.db.update(memberProfile).set({ games: ['wardogs', 'hell-let-loose'] }).where(eq(memberProfile.id, profileId));
    await database.db.insert(logiMemberLink).values({ profileId, scopeKey: hllPeople.scopeKey, sourceInstanceId: hllPeople.sourceInstanceId, guildId: hllPeople.guildId, gameId: hllPeople.gameId, memberId: fixture.member.id, identityId: fixture.member.identityId, allowStats: false, allowRoster: true });
    const result = await readPublicLogiRosterDirectory(database.db, bothEnv, options);
    expect(result).toHaveLength(2);
    expect(result.map((row) => row.profileSlug)).toEqual(['approved-player', 'approved-player']);
    expect(result.flatMap((row) => row.matches.map((match) => match.href))).toEqual(expect.arrayContaining(['/wardogs/matches/logi/event-example', '/hll/matches/logi/event-example']));
    expect(await readPublicLogiRosterDirectory(database.db, bothEnv, { ...options, game: 'hell-let-loose' })).toMatchObject([{ game: 'hell-let-loose', matches: [{ title: 'Public HLL match' }] }]);
  });
  it('requires current consent, identity and roster grant for directory activity', async () => {
    await database.db.update(logiMemberLink).set({ allowRoster: false }).where(eq(logiMemberLink.profileId, profileId));
    expect(await directory()).toEqual([]);
    await database.db.update(logiMemberLink).set({ allowRoster: true }).where(eq(logiMemberLink.profileId, profileId));
    await database.db.update(memberProfile).set({ state: 'hidden', consentConfirmedAt: null }).where(eq(memberProfile.id, profileId));
    expect(await directory()).toEqual([]);
    await database.db.update(memberProfile).set({ state: 'published', consentConfirmedAt: clock }).where(eq(memberProfile.id, profileId));
    await updateProjection('member-summaries', { ...fixture.member, identityId: 'replacement-person' });
    expect(await directory()).toEqual([]);
    await updateProjection('member-summaries', fixture.member);
    expect(await directory()).toHaveLength(1);
    clock = new Date('2026-10-03T10:07:00Z');
    expect(await directory()).toEqual([]);
  });
  it('omits directory lineups when source permission is revoked, rebuilding or match publication is disabled', async () => {
    expect(await readPublicLogiRosterDirectory(database.db, { ...env, LOGI_SOURCES_JSON: JSON.stringify([{ ...config, publishMatches: false }]) }, options)).toEqual([]);
    await database.db.update(logiSyncScope).set({ errorCode: 'forbidden' }).where(eq(logiSyncScope.scopeKey, people.scopeKey));
    expect(await directory()).toEqual([]);
    await database.db.update(logiSyncScope).set({ errorCode: null, checkpoint: { ...checkpoint(), mode: 'bootstrap', generation: 'building' } }).where(eq(logiSyncScope.scopeKey, people.scopeKey));
    expect(await directory()).toEqual([]);
  });
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
