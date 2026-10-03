import { logiProjection, logiSyncScope } from '@valkyria/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configuredLogiSources } from '@/modules/integrations/logi-config';
import { createPostgresLogiSyncStore, readActiveLogiProjections } from '@/modules/integrations/logi-store';
import { LOGI_COLLECTION_RESOURCES, LOGI_PEOPLE_RESOURCES, type LogiSyncRecord } from '@/modules/integrations/logi/contracts';
import peopleFixture from '@/modules/integrations/logi/fixtures/v0.14-people.json';
import type { LogiSyncCheckpoint, LogiSyncCommit } from '@/modules/integrations/logi/sync';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let database: TestDatabase;
let clock = Date.parse('2026-10-02T12:00:00Z');
const source = configuredLogiSources({ LOGI_SOURCES_JSON: JSON.stringify([{ sourceInstanceId: 'local-proof', origin: 'https://logi.example.test', guildId: '100000000000000001', gameId: 'wardogs' }]), LOGI_DATA_API_KEY_WDG: 'synthetic-data-key-0123456789' }, 'data')[0]!;
const scope = { ...source, resources: LOGI_COLLECTION_RESOURCES };
const checkpoint = (version: number, generation: string | null = 'shadow'): LogiSyncCheckpoint => ({ version, generation, mode: generation ? 'bootstrap' : 'live', resourceIndex: 0, listCursor: null, boundaryCursor: 'boundary', cursor: `cursor-${version}` });
const record = (revision: string, removed = false): LogiSyncRecord<'event-summaries'> => ({ resource: 'event-summaries', id: 'match-1', guildId: source.guildId, gameId: source.gameId, revision, ...(removed ? { operation: 'remove' as const, data: null } : { operation: 'upsert' as const, data: { id: 'match-1', guildId: source.guildId, gameId: source.gameId, title: 'Synthetic three-faction match', kind: 'match', status: 'registration', startsAt: '2026-10-10T18:30:00Z', endsAt: '2026-10-10T20:30:00Z', updatedAt: null } }) });
const input = (expectedVersion: number, records: LogiSyncCommit['records'] = [], generation: string | null = 'shadow', promote = false): LogiSyncCommit => ({ expectedVersion, next: checkpoint(expectedVersion + 1, promote ? null : generation), records, targetGeneration: generation, promoteGeneration: promote ? generation : null, observedAt: new Date(clock).toISOString() });

beforeAll(async () => { database = await createTestDatabase(); });
afterAll(async () => { await database.drop(); });
beforeEach(async () => { clock = Date.parse('2026-10-02T12:00:00Z'); await database.db.delete(logiSyncScope); });

describe('real PostgreSQL Logi projection store', () => {
  it('fences people collections from the safe data purpose in both directions', async () => {
    const people = configuredLogiSources({ LOGI_SOURCES_JSON: JSON.stringify([{ sourceInstanceId: source.sourceInstanceId, origin: source.origin, guildId: source.guildId, gameId: source.gameId, syncPeople: true }]), LOGI_PEOPLE_API_KEY_WDG: 'synthetic-people-key-123456' }, 'people')[0]!;
    const peopleScope = { ...people, resources: LOGI_PEOPLE_RESOURCES };
    const peopleStore = createPostgresLogiSyncStore(database.db, people, () => clock);
    const dataStore = createPostgresLogiSyncStore(database.db, source, () => clock);
    await expect(peopleStore.acquire({ ...peopleScope, resources: LOGI_COLLECTION_RESOURCES }, clock, 60_000)).rejects.toThrow('Invalid sync scope');
    const peopleLease = (await peopleStore.acquire(peopleScope, clock, 60_000))!;
    const dataLease = (await dataStore.acquire(scope, clock, 60_000))!;
    const member: LogiSyncRecord<'member-summaries'> = { resource: 'member-summaries', id: peopleFixture.member.id, guildId: people.guildId, gameId: people.gameId, revision: '1', operation: 'upsert', data: { ...peopleFixture.member, guildId: people.guildId, gameId: people.gameId, schemaVersion: 1, identityState: 'resolved', type: 'member', status: 'active' } };
    await expect(dataStore.commit(dataLease, input(0, [member], 'data', true))).rejects.toThrow('Invalid projection scope');
    await expect(peopleStore.commit(peopleLease, input(0, [record('1')], 'people', true))).rejects.toThrow('Invalid projection scope');
    expect(await peopleStore.commit(peopleLease, input(0, [member], 'people', true))).toBe(true);
    expect(await readActiveLogiProjections(database.db, source)).toEqual([]);
    expect(await readActiveLogiProjections(database.db, people)).toMatchObject([{ resource: 'member-summaries', externalId: member.id }]);
  });
  it('lets exactly one concurrent worker acquire a scope', async () => {
    const workers = [createPostgresLogiSyncStore(database.db, source, () => clock), createPostgresLogiSyncStore(database.db, source, () => clock)];
    const leases = await Promise.all(workers.map((worker) => worker.acquire(scope, clock, 60_000)));
    expect(leases.filter(Boolean)).toHaveLength(1);
  });
  it('rejects another guild, game, source and a subset of resources', async () => {
    const store = createPostgresLogiSyncStore(database.db, source, () => clock);
    for (const change of [{ guildId: '100000000000000099' }, { gameId: 'hell_let_loose' as const }, { sourceInstanceId: 'other' }, { resources: ['event-summaries'] as const }]) {
      await expect(store.acquire({ ...scope, ...change }, clock, 60_000)).rejects.toThrow('Invalid sync scope');
    }
  });
  it('keeps partial bootstrap invisible, then promotes records and cursor atomically', async () => {
    const store = createPostgresLogiSyncStore(database.db, source, () => clock);
    const lease = (await store.acquire(scope, clock, 60_000))!;
    expect(await store.commit(lease, input(0, [record('1')]))).toBe(true);
    expect(await readActiveLogiProjections(database.db, source)).toEqual([]);
    expect(await store.commit(lease, input(1, [], 'shadow', true))).toBe(true);
    expect(await readActiveLogiProjections(database.db, source)).toMatchObject([{ externalId: 'match-1', revision: '1' }]);
    expect(await database.db.select().from(logiSyncScope)).toMatchObject([{ version: 2, activeGeneration: 'shadow', checkpoint: { cursor: 'cursor-2', mode: 'live' } }]);
  });
  it('keeps last complete generation visible during a reset and survives process restart', async () => {
    const first = createPostgresLogiSyncStore(database.db, source, () => clock);
    const lease = (await first.acquire(scope, clock, 60_000))!;
    await first.commit(lease, input(0, [record('5')], 'first', true));
    await first.commit(lease, input(1, [record('6')], 'replacement'));
    await first.release(lease);
    expect(await readActiveLogiProjections(database.db, source)).toMatchObject([{ revision: '5' }]);
    const second = createPostgresLogiSyncStore(database.db, source, () => clock);
    const resumed = (await second.acquire(scope, clock, 60_000))!;
    expect(resumed.checkpoint).toMatchObject({ generation: 'replacement', version: 2 });
    await second.commit(resumed, input(2, [], 'replacement', true));
    expect(await readActiveLogiProjections(database.db, source)).toMatchObject([{ revision: '6' }]);
    expect(await database.db.select().from(logiProjection)).toHaveLength(1);
  });
  it('uses exact decimal revisions and retains tombstones against older upserts', async () => {
    const store = createPostgresLogiSyncStore(database.db, source, () => clock);
    const lease = (await store.acquire(scope, clock, 60_000))!;
    await store.commit(lease, input(0, [record('9007199254740993')], 'shadow', true));
    await store.commit(lease, input(1, [record('9007199254740992')], null));
    expect(await readActiveLogiProjections(database.db, source)).toMatchObject([{ revision: '9007199254740993' }]);
    await store.commit(lease, input(2, [record('9007199254740994', true)], null));
    await store.commit(lease, input(3, [record('9007199254740993')], null));
    expect(await readActiveLogiProjections(database.db, source)).toMatchObject([{ operation: 'remove', data: null, revision: '9007199254740994' }]);
  });
  it('rolls back projection writes when a later write in the same commit fails', async () => {
    const store = createPostgresLogiSyncStore(database.db, source, () => clock);
    const lease = (await store.acquire(scope, clock, 60_000))!;
    await expect(store.commit(lease, { ...input(0, [record('1')], 'shadow', true), next: checkpoint(2_147_483_648, null), expectedVersion: 2_147_483_647 })).resolves.toBe(false);
    // A database check fails after the projection INSERT, proving transaction rollback.
    await database.db.update(logiSyncScope).set({ version: 2_147_483_647 }).where(eq(logiSyncScope.scopeKey, source.scopeKey));
    await expect(store.commit(lease, { ...input(0, [record('1')], 'shadow', true), next: checkpoint(2_147_483_648, null), expectedVersion: 2_147_483_647 })).rejects.toThrow();
    expect(await database.db.select().from(logiProjection)).toEqual([]);
    expect(await database.db.select().from(logiSyncScope)).toMatchObject([{ version: 2_147_483_647, activeGeneration: null }]);
  });
  it('rejects expired workers and wrong checkpoint versions without changing data', async () => {
    const store = createPostgresLogiSyncStore(database.db, source, () => clock);
    const lease = (await store.acquire(scope, clock, 60_000))!;
    expect(await store.commit(lease, input(1, [record('2')]))).toBe(false);
    clock += 60_001;
    expect(await store.commit(lease, input(0, [record('2')]))).toBe(false);
    expect(await database.db.select().from(logiProjection)).toEqual([]);
  });
  it('does not let an old worker release or mark failed a new attempt', async () => {
    const old = createPostgresLogiSyncStore(database.db, source, () => clock);
    const oldLease = (await old.acquire(scope, clock, 60_000))!;
    clock += 60_001;
    const fresh = createPostgresLogiSyncStore(database.db, source, () => clock);
    const newLease = (await fresh.acquire(scope, clock, 60_000))!;
    await old.release(oldLease);
    await old.recordFailure('timeout', 90_000);
    expect(await database.db.select().from(logiSyncScope)).toMatchObject([{ leaseToken: newLease.token, errorCode: null, nextAttemptAt: null }]);
    await fresh.release(newLease);
    await old.recordFailure('timeout', 90_000);
    expect(await database.db.select().from(logiSyncScope)).toMatchObject([{ errorCode: null }]);
    await fresh.recordFailure('rate_limited', 90_000);
    expect(await fresh.acquire(scope, clock, 60_000)).toBeNull();
    clock += 90_001;
    expect(await fresh.acquire(scope, clock, 60_000)).not.toBeNull();
  });
});
