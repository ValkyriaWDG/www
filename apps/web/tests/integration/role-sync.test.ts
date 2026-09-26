import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { authSession, contentTranslation, guildMembership, localAdminGrant, publicationSchedule } from '@valkyria/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readMembership, recordMembershipObservation, refreshMembership } from '@/modules/access/membership';
import { resolveActor } from '@/modules/access/resolve-actor';
import { resetRoleMappingCacheForTests } from '@/modules/access/role-mapping';
import { testPrincipal } from '@/modules/access/testing';
import { createDocument, saveDraft } from '@/modules/content/editor';
import { publishTranslation } from '@/modules/content/publication';
import { runPublisher } from '@/modules/content/publisher';
import { scheduleTranslation } from '@/modules/content/schedule';
import { sampleBody } from '@/modules/content/testing';
import { receiveRoleSync } from '@/modules/role-sync/receiver';
import { ROLE_SYNC_PATH, type ReceiverConfig, type RoleSyncEvent } from '@/modules/role-sync/protocol';
import { createTestDatabase, type TestDatabase } from '../support/test-db';
import { GUILD_ID, insertDiscordUser, insertLocalAdmin, ROLE, testAccessEnv } from './auth-harness';

let database: TestDatabase;
const now = new Date('2026-09-26T12:00:00.000Z');
const secret = 'synthetic-role-sync-key-never-a-live-key';
const config: ReceiverConfig = { enabled: true, producer: 'fixture-bot', guildId: GUILD_ID, keys: { current: secret, previous: `${secret}-previous` } };
const event = (userId: string, sequence = '1', overrides: Partial<RoleSyncEvent> = {}): RoleSyncEvent => ({ schemaVersion: 1, eventId: randomUUID(), guildId: GUILD_ID, userId, roleIds: [ROLE.editor], membershipState: 'present', observedAt: now.toISOString(), sequence, ...overrides });
function request(value: RoleSyncEvent, keyId = 'current', nonce = randomBytes(16).toString('hex')) {
  const body = JSON.stringify(value);
  const timestamp = String(now.getTime() / 1000);
  const signature = createHmac('sha256', config.keys[keyId]!).update(`POST\n${ROLE_SYNC_PATH}\n${keyId}\n${timestamp}\n${nonce}\n${body}`).digest('hex');
  return new Request(`http://127.0.0.1${ROLE_SYNC_PATH}`, { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-valkyria-key-id': keyId, 'x-valkyria-timestamp': timestamp, 'x-valkyria-nonce': nonce, 'x-valkyria-signature': signature } });
}
const receive = (req: Request, cfg = config) => receiveRoleSync(req, { db: database.db, config: cfg, now: () => now });
beforeAll(async () => { database = await createTestDatabase(); });
afterAll(async () => { await database?.drop(); });

/** Wait for the real PostgreSQL lock barrier, not a guessed delay. */
async function waitForBlockedQuery(table: string) {
  await vi.waitFor(async () => {
    const blocked = await database.pool.query("select 1 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and query like $1", [`%\"${table}\"%`]);
    expect(blocked.rowCount).toBeGreaterThan(0);
  }, { timeout: 3000, interval: 10 });
}

describe('durable role-sync receiver', () => {
  it.each(['left', 'present'] as const)('denies a cached actor when %s invalidation commits during awaited mapping work', async (state) => {
    const user = await insertDiscordUser(database.db);
    const session = { id: randomUUID(), userId: user.userId, assurance: 'discord', expiresAt: new Date(now.getTime() + 60_000) };
    await database.db.insert(authSession).values({ ...session, token: randomUUID() });
    await recordMembershipObservation(database.db, { guildId: GUILD_ID, discordUserId: user.discordUserId, userId: user.userId, state: 'present', roleIds: [ROLE.editor], observedAt: now, source: 'rest_refresh' });
    resetRoleMappingCacheForTests();
    const blocker = await database.pool.connect();
    await blocker.query('begin');
    await blocker.query('lock table role_mapping_version in access exclusive mode');
    const resolving = resolveActor(database.db, { session, user: { id: user.userId, name: 'Synthetic editor' }, intent: 'write', env: testAccessEnv(), now });
    try {
      await waitForBlockedQuery('role_mapping_version');
      expect((await receive(request(event(user.discordUserId, '1', { membershipState: state, roleIds: state === 'left' ? [] : [ROLE.editor, ROLE.member] })))).status).toBe(204);
      // The positive invalidation keeps the session, proving that generation
      // fencing is required independently of departure-driven session deletion.
      expect((await database.db.select().from(authSession).where(eq(authSession.id, session.id))).length).toBe(state === 'left' ? 0 : 1);
    } finally {
      await blocker.query('rollback');
      blocker.release();
    }
    const actor = await resolving;
    expect(actor.kind === 'principal' && actor.capabilities.has('content.publish')).toBe(false);
  });

  it.each([false, true])('preserves independent local publication grants and fences grant changes (changed=%s)', async (changed) => {
    const local = await insertLocalAdmin(database.db);
    const editor = testPrincipal(['administrator'], { userId: local.userId, source: 'local_admin', assurance: 'mfa', localGrant: { id: local.grantId, version: 1 } });
    const runAt = new Date();
    const createdAt = new Date(runAt.getTime() - 60_000);
    const post = await createDocument(database.db, editor, { kind: 'news', locale: 'cs', title: 'Local recovery publication', slug: `local-fence-${randomUUID()}`, fields: { excerpt: 'Synthetic excerpt', body: sampleBody('Synthetic content') } });
    const schedule = await scheduleTranslation(database.db, editor, { translationId: post.translationId, dueAt: new Date(runAt.getTime() - 1000).toISOString() }, { now: () => createdAt });
    const blocker = await database.pool.connect();
    await blocker.query('begin');
    await blocker.query('select id from content_translation where id=$1 for update', [post.translationId]);
    const publishing = runPublisher(database.db, { now: () => runAt });
    try {
      await waitForBlockedQuery('content_translation');
      if (changed) await database.db.update(localAdminGrant).set({ version: 2, revokedAt: runAt }).where(eq(localAdminGrant.id, local.grantId));
    } finally {
      await blocker.query('rollback');
      blocker.release();
    }
    expect(await publishing).toMatchObject({ completed: changed ? 0 : 1, blocked: changed ? 1 : 0 });
    expect((await database.db.select().from(publicationSchedule).where(eq(publicationSchedule.id, schedule.id)))[0]?.state).toBe(changed ? 'blocked' : 'completed');
  });

  it('blocks a scheduled publication if revocation commits while it waits for the translation lock', async () => {
    const user = await insertDiscordUser(database.db);
    const editor = testPrincipal(['editor'], { userId: user.userId });
    const runAt = new Date();
    const createdAt = new Date(runAt.getTime() - 60_000);
    const post = await createDocument(database.db, editor, { kind: 'news', locale: 'cs', title: 'Original live title', slug: `role-fence-${randomUUID()}`, fields: { excerpt: 'Synthetic excerpt', body: sampleBody('Synthetic content') } });
    const published = await publishTranslation(database.db, editor, { translationId: post.translationId, expectedVersion: post.version }, { now: () => createdAt });
    const [before] = await database.db.select().from(contentTranslation).where(eq(contentTranslation.id, post.translationId));
    await saveDraft(database.db, editor, { translationId: post.translationId, expectedVersion: published.version, fields: { title: 'Must remain a draft' } });
    const schedule = await scheduleTranslation(database.db, editor, { translationId: post.translationId, dueAt: new Date(runAt.getTime() - 1000).toISOString() }, { now: () => createdAt });
    await recordMembershipObservation(database.db, { guildId: GUILD_ID, discordUserId: user.discordUserId, userId: user.userId, state: 'present', roleIds: [ROLE.editor], observedAt: runAt, source: 'rest_refresh' });
    const env = testAccessEnv();
    vi.stubEnv('DISCORD_GUILD_ID', GUILD_ID);
    vi.stubEnv('DISCORD_BOT_TOKEN', env.DISCORD_BOT_TOKEN);
    vi.stubEnv('DISCORD_ROLE_MAPPING_JSON', env.DISCORD_ROLE_MAPPING_JSON);
    const blocker = await database.pool.connect();
    await blocker.query('begin');
    await blocker.query('select id from content_translation where id=$1 for update', [post.translationId]);
    const publishing = runPublisher(database.db, { now: () => runAt });
    try {
      await waitForBlockedQuery('content_translation');
      expect((await receive(request(event(user.discordUserId, '1', { membershipState: 'left', roleIds: [] })))).status).toBe(204);
    } finally {
      await blocker.query('rollback');
      blocker.release();
    }
    try {
      expect(await publishing).toMatchObject({ completed: 0, blocked: 1 });
      expect((await database.db.select().from(publicationSchedule).where(eq(publicationSchedule.id, schedule.id)))[0]).toMatchObject({ state: 'blocked', lastError: 'issuer_revoked' });
      expect((await database.db.select().from(contentTranslation).where(eq(contentTranslation.id, post.translationId)))[0]?.publishedRevisionId).toBe(before?.publishedRevisionId);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('rolls back publication if the verified snapshot expires during the final audit write', async () => {
    const user = await insertDiscordUser(database.db);
    const editor = testPrincipal(['editor'], { userId: user.userId });
    const initialClock = new Date();
    let clock = initialClock;
    const createdAt = new Date(clock.getTime() - 120_000);
    const post = await createDocument(database.db, editor, { kind: 'news', locale: 'cs', title: 'Snapshot must stay fresh', slug: `expiry-fence-${randomUUID()}`, fields: { excerpt: 'Synthetic excerpt', body: sampleBody('Synthetic content') } });
    const schedule = await scheduleTranslation(database.db, editor, { translationId: post.translationId, dueAt: new Date(clock.getTime() - 1000).toISOString() }, { now: () => createdAt });
    await recordMembershipObservation(database.db, { guildId: GUILD_ID, discordUserId: user.discordUserId, userId: user.userId, state: 'present', roleIds: [ROLE.editor], observedAt: new Date(clock.getTime() - 59_000), source: 'rest_refresh' });
    const env = testAccessEnv();
    vi.stubEnv('DISCORD_GUILD_ID', GUILD_ID);
    vi.stubEnv('DISCORD_BOT_TOKEN', env.DISCORD_BOT_TOKEN);
    vi.stubEnv('DISCORD_ROLE_MAPPING_JSON', env.DISCORD_ROLE_MAPPING_JSON);
    const blocker = await database.pool.connect();
    await blocker.query('begin');
    await blocker.query('lock table audit_event in access exclusive mode');
    const publishing = runPublisher(database.db, { now: () => clock });
    try {
      await waitForBlockedQuery('audit_event');
      clock = new Date(initialClock.getTime() + 2000);
    } finally {
      await blocker.query('rollback');
      blocker.release();
    }
    try {
      expect(await publishing).toMatchObject({ completed: 0, blocked: 1 });
      expect((await database.db.select().from(publicationSchedule).where(eq(publicationSchedule.id, schedule.id)))[0]).toMatchObject({ state: 'blocked', lastError: 'issuer_unknown' });
      expect((await database.db.select().from(contentTranslation).where(eq(contentTranslation.id, post.translationId)))[0]?.publishedRevisionId).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('commits invalidation and receipt before acknowledgement, but never grants from an event', async () => {
    const user = await insertDiscordUser(database.db);
    const message = event(user.discordUserId);
    expect((await receive(request(message))).status).toBe(204);
    expect(await readMembership(database.db, GUILD_ID, user.discordUserId)).toMatchObject({ state: 'unknown', roleIds: [], source: 'role_sync', authorizationGeneration: 1n });
    const result = await database.pool.query('select outcome, body_digest from discord_role_sync_receipt where event_id=$1', [message.eventId]);
    expect(result.rows[0]).toMatchObject({ outcome: 'applied' });
    expect(result.rows[0].body_digest).toMatch(/^[a-f0-9]{64}$/);
    expect((await receive(request(message))).status).toBe(409);
    expect(await (await receive(request(message))).json()).toMatchObject({ code: 'DUPLICATE_EVENT', eventId: message.eventId });
    expect((await readMembership(database.db, GUILD_ID, user.discordUserId))?.authorizationGeneration).toBe(1n);
  });
  it('does not replay a nonce, reuse an event ID with different bytes, or bypass receipts by rotating keys', async () => {
    const user = await insertDiscordUser(database.db);
    const message = event(user.discordUserId);
    const nonce = randomBytes(16).toString('hex');
    expect((await receive(request(message, 'previous', nonce))).status).toBe(204);
    expect(await (await receive(request(message, 'current', nonce))).json()).toMatchObject({ code: 'REPLAYED_REQUEST' });
    expect(await (await receive(request(message, 'current'))).json()).toMatchObject({ code: 'DUPLICATE_EVENT' });
    expect(await (await receive(request({ ...message, roleIds: [] }))).json()).toMatchObject({ code: 'EVENT_CONFLICT' });
  });
  it('preserves a departure tombstone across huge decimal sequence values and delayed observations', async () => {
    const user = await insertDiscordUser(database.db);
    const departure = event(user.discordUserId, '900719925474099300002', { membershipState: 'left', roleIds: [] });
    expect((await receive(request(departure))).status).toBe(204);
    expect(await (await receive(request(event(user.discordUserId, '900719925474099300001')))).json()).toMatchObject({ code: 'STALE_EVENT' });
    expect(await (await receive(request(event(user.discordUserId, '900719925474099300003', { observedAt: '2026-01-01T00:00:00.000Z' })))).json()).toMatchObject({ code: 'STALE_EVENT' });
    expect(await readMembership(database.db, GUILD_ID, user.discordUserId)).toMatchObject({ state: 'left', roleIds: [] });
  });
  it('serializes simultaneous duplicates and concurrent revisions without double invalidation', async () => {
    const user = await insertDiscordUser(database.db);
    const message = event(user.discordUserId);
    expect((await Promise.all(Array.from({ length: 8 }, () => receive(request(message))))).map((r) => r.status).sort()).toEqual([204, 409, 409, 409, 409, 409, 409, 409]);
    await Promise.all([receive(request(event(user.discordUserId, '3', { membershipState: 'left', roleIds: [] }))), receive(request(event(user.discordUserId, '2')))]);
    expect(await readMembership(database.db, GUILD_ID, user.discordUserId)).toMatchObject({ state: 'left', roleIds: [] });
  });
  it('revokes affected Discord sessions while leaving local MFA sessions untouched', async () => {
    const user = await insertDiscordUser(database.db);
    await recordMembershipObservation(database.db, { guildId: GUILD_ID, discordUserId: user.discordUserId, userId: user.userId, state: 'present', roleIds: [ROLE.editor], observedAt: now, source: 'rest_refresh' });
    await database.db.insert(authSession).values(['discord', 'mfa'].map((assurance) => ({ id: randomUUID(), token: randomUUID(), userId: user.userId, assurance, expiresAt: new Date(now.getTime() + 60_000) })));
    expect((await receive(request(event(user.discordUserId, '1', { roleIds: [] })))).status).toBe(204);
    expect((await database.db.select().from(authSession).where(eq(authSession.userId, user.userId))).map((row) => row.assurance)).toEqual(['mfa']);
  });
  it('fences a REST response started before a role event, then permits a newly started authoritative refresh', async () => {
    const user = await insertDiscordUser(database.db);
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const discordConfig = { guildId: GUILD_ID, botToken: 'fixture-token', apiBaseUrl: 'http://127.0.0.1' };
    const refresh = refreshMembership(database.db, discordConfig, { discordUserId: user.discordUserId, userId: user.userId, source: 'rest_refresh' }, {
      now: () => now,
      fetchImpl: async () => { entered(); await blocked; return Response.json({ roles: [ROLE.editor] }); },
    });
    await started;
    expect((await receive(request(event(user.discordUserId, '1', { membershipState: 'left', roleIds: [] })))).status).toBe(204);
    release();
    expect(await refresh).toMatchObject({ ok: false, code: 'invalidated' });
    expect(await readMembership(database.db, GUILD_ID, user.discordUserId)).toMatchObject({ state: 'left', roleIds: [] });
    const fresh = await refreshMembership(database.db, discordConfig, { discordUserId: user.discordUserId, userId: user.userId, source: 'rest_refresh' }, { now: () => now, fetchImpl: async () => Response.json({ roles: [ROLE.editor] }) });
    expect(fresh).toMatchObject({ ok: true, snapshot: { source: 'rest_refresh', roleIds: [ROLE.editor] } });
    expect((await database.db.select().from(guildMembership).where(eq(guildMembership.discordUserId, user.discordUserId)))[0]?.authorizationGeneration).toBe(1n);
  });
  it('does not acknowledge on database failure and does not touch the database while disabled', async () => {
    const badDb = { transaction: async () => { throw new Error('synthetic database failure'); } } as unknown as typeof database.db;
    expect((await receiveRoleSync(request(event('888888888888888888')), { db: badDb, config, now: () => now })).status).toBe(503);
    expect((await receiveRoleSync(request(event('888888888888888888')), { db: badDb, config: { ...config, enabled: false }, now: () => now })).status).toBe(503);
  });
  it('rolls back receipts, nonce, generation and session revocation when the durable transaction fails', async () => {
    const user = await insertDiscordUser(database.db);
    const message = event(user.discordUserId, '1', { membershipState: 'left', roleIds: [] });
    const nonce = randomBytes(16).toString('hex');
    await recordMembershipObservation(database.db, { guildId: GUILD_ID, discordUserId: user.discordUserId, userId: user.userId, state: 'present', roleIds: [ROLE.editor], observedAt: now, source: 'rest_refresh' });
    await database.db.insert(authSession).values({ id: randomUUID(), token: randomUUID(), userId: user.userId, assurance: 'discord', expiresAt: new Date(now.getTime() + 60_000) });
    await database.pool.query("create function fail_role_sync_fixture() returns trigger language plpgsql as $$ begin raise exception 'synthetic commit boundary failure'; end $$");
    await database.pool.query('create trigger fail_role_sync_fixture before insert on discord_role_sync_member for each row execute function fail_role_sync_fixture()');
    try {
      expect((await receive(request(message, 'current', nonce))).status).toBe(503);
      expect((await database.pool.query('select 1 from discord_role_sync_receipt where event_id=$1', [message.eventId])).rowCount).toBe(0);
      expect((await database.pool.query('select 1 from discord_role_sync_nonce where nonce=$1', [nonce])).rowCount).toBe(0);
      expect(await readMembership(database.db, GUILD_ID, user.discordUserId)).toMatchObject({ state: 'present', roleIds: [ROLE.editor], authorizationGeneration: 0n });
      expect((await database.db.select().from(authSession).where(eq(authSession.userId, user.userId)))).toHaveLength(1);
    } finally {
      await database.pool.query('drop trigger fail_role_sync_fixture on discord_role_sync_member');
      await database.pool.query('drop function fail_role_sync_fixture()');
    }
    expect((await receive(request(message, 'current', nonce))).status).toBe(204);
    expect((await database.db.select().from(authSession).where(eq(authSession.userId, user.userId)))).toHaveLength(0);
  });
  it('does not turn a removal followed by an old positive replay into a grant after receipt retention cleanup', async () => {
    const user = await insertDiscordUser(database.db);
    const older = event(user.discordUserId, '1');
    await receive(request(older));
    await receive(request(event(user.discordUserId, '2', { membershipState: 'left', roleIds: [] })));
    // Simulates operator pruning old event receipts; member high-water marks never expire.
    await database.pool.query('delete from discord_role_sync_receipt where event_id=$1', [older.eventId]);
    expect(await (await receive(request(older))).json()).toMatchObject({ code: 'STALE_EVENT' });
    expect(await readMembership(database.db, GUILD_ID, user.discordUserId)).toMatchObject({ state: 'left', authorizationGeneration: 2n });
  });
});
