import { randomUUID } from 'node:crypto';
import { authSession, contentTranslation, guildMembership, localAdminGrant, publicationSchedule } from '@valkyria/db';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readMembership, recordMembershipObservation } from '@/modules/access/membership';
import { resolveActor } from '@/modules/access/resolve-actor';
import { resetRoleMappingCacheForTests } from '@/modules/access/role-mapping';
import { testPrincipal } from '@/modules/access/testing';
import { createDocument, saveDraft } from '@/modules/content/editor';
import { publishTranslation } from '@/modules/content/publication';
import { runPublisher } from '@/modules/content/publisher';
import { scheduleTranslation } from '@/modules/content/schedule';
import { sampleBody } from '@/modules/content/testing';
import { createTestDatabase, type TestDatabase } from '../support/test-db';
import { GUILD_ID, insertDiscordUser, insertLocalAdmin, ROLE, testAccessEnv } from './auth-harness';

let database: TestDatabase;
beforeAll(async () => { database = await createTestDatabase(); });
afterAll(async () => { await database?.drop(); });
afterEach(() => { vi.unstubAllEnvs(); });

/** Real database lock barrier: no guessed sleep or external provider calls. */
async function waitForBlockedQuery(table: string) {
  await vi.waitFor(async () => {
    const blocked = await database.pool.query("select 1 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and query like $1", [`%\"${table}\"%`]);
    expect(blocked.rowCount).toBeGreaterThan(0);
  }, { timeout: 3000, interval: 10 });
}

function configurePublisher() {
  const env = testAccessEnv();
  vi.stubEnv('DISCORD_GUILD_ID', GUILD_ID);
  vi.stubEnv('DISCORD_BOT_TOKEN', env.DISCORD_BOT_TOKEN);
  vi.stubEnv('DISCORD_ROLE_MAPPING_JSON', env.DISCORD_ROLE_MAPPING_JSON);
}

async function observe(user: { userId: string; discordUserId: string }, at: Date) {
  await recordMembershipObservation(database.db, { guildId: GUILD_ID, discordUserId: user.discordUserId, userId: user.userId,
    state: 'present', roleIds: [ROLE.editor], observedAt: at, receivedAt: at, source: 'rest_refresh' });
}

describe('authority after awaited database work', () => {
  it.each(['departure', 'role-removal', 'same-timestamp-aba', 'session-revocation'] as const)(
    'denies cached interactive authority after %s commits during mapping work', async (change) => {
      const now = new Date();
      const user = await insertDiscordUser(database.db);
      const session = { id: randomUUID(), userId: user.userId, assurance: 'discord', expiresAt: new Date(now.getTime() + 60_000) };
      await database.db.insert(authSession).values({ ...session, token: randomUUID() });
      await observe(user, now);
      const before = await readMembership(database.db, GUILD_ID, user.discordUserId);
      resetRoleMappingCacheForTests();
      const blocker = await database.pool.connect();
      await blocker.query('begin');
      await blocker.query('lock table role_mapping_version in access exclusive mode');
      const resolving = resolveActor(database.db, { session, user: { id: user.userId, name: 'Synthetic editor' }, intent: 'write', env: testAccessEnv(), now });
      try {
        await waitForBlockedQuery('role_mapping_version');
        if (change === 'session-revocation') await database.db.delete(authSession).where(eq(authSession.id, session.id));
        else if (change === 'same-timestamp-aba') {
          // One committed transaction restores all application observation fields;
          // timestamp/value equality alone must not reuse the earlier authority.
          await database.db.transaction(async (tx) => {
            await tx.update(guildMembership).set({ state: 'left', roleIds: [] }).where(eq(guildMembership.discordUserId, user.discordUserId));
            await tx.update(guildMembership).set({ state: 'present', roleIds: [ROLE.editor] }).where(eq(guildMembership.discordUserId, user.discordUserId));
          });
          const after = await readMembership(database.db, GUILD_ID, user.discordUserId);
          expect(after).toMatchObject({ observedAt: before!.observedAt, receivedAt: before!.receivedAt, state: 'present', roleIds: [ROLE.editor] });
        } else await database.db.update(guildMembership).set({ state: change === 'departure' ? 'left' : 'present', roleIds: [] }).where(eq(guildMembership.discordUserId, user.discordUserId));
      } finally {
        await blocker.query('rollback');
        blocker.release();
      }
      const actor = await resolving;
      expect(actor.kind === 'principal' && actor.capabilities.has('content.publish')).toBe(false);
    },
  );

  it('changes the ephemeral row token for a same-value update within one transaction', async () => {
    const user = await insertDiscordUser(database.db);
    await observe(user, new Date());
    await database.db.transaction(async (tx) => {
      await tx.update(guildMembership).set({ state: 'present' }).where(eq(guildMembership.discordUserId, user.discordUserId));
      const before = await readMembership(tx, GUILD_ID, user.discordUserId);
      await tx.update(guildMembership).set({ state: 'present' }).where(eq(guildMembership.discordUserId, user.discordUserId));
      const after = await readMembership(tx, GUILD_ID, user.discordUserId);
      expect(after!.rowVersion).not.toBe(before!.rowVersion);
      expect(after).toMatchObject({ observedAt: before!.observedAt, roleIds: before!.roleIds });
    });
  });
});

describe('transactional scheduled-publication authority', () => {
  it.each([false, true])('preserves local recovery and fences grant changes (changed=%s)', async (changed) => {
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

  it.each(['departure', 'role-removal', 'same-timestamp-aba'] as const)('blocks publication after %s commits while waiting for content', async (change) => {
    configurePublisher();
    const user = await insertDiscordUser(database.db);
    const editor = testPrincipal(['editor'], { userId: user.userId });
    const runAt = new Date();
    const createdAt = new Date(runAt.getTime() - 60_000);
    const post = await createDocument(database.db, editor, { kind: 'news', locale: 'cs', title: 'Original live title', slug: `authority-fence-${randomUUID()}`, fields: { excerpt: 'Synthetic excerpt', body: sampleBody('Synthetic content') } });
    const published = await publishTranslation(database.db, editor, { translationId: post.translationId, expectedVersion: post.version }, { now: () => createdAt });
    const [before] = await database.db.select().from(contentTranslation).where(eq(contentTranslation.id, post.translationId));
    await saveDraft(database.db, editor, { translationId: post.translationId, expectedVersion: published.version, fields: { title: 'Must remain a draft' } });
    const schedule = await scheduleTranslation(database.db, editor, { translationId: post.translationId, dueAt: new Date(runAt.getTime() - 1000).toISOString() }, { now: () => createdAt });
    await observe(user, runAt);
    const blocker = await database.pool.connect();
    await blocker.query('begin');
    await blocker.query('select id from content_translation where id=$1 for update', [post.translationId]);
    const publishing = runPublisher(database.db, { now: () => runAt });
    try {
      await waitForBlockedQuery('content_translation');
      await database.db.update(guildMembership).set({ state: change === 'role-removal' ? 'present' : 'left', roleIds: [] }).where(eq(guildMembership.discordUserId, user.discordUserId));
      if (change === 'same-timestamp-aba') await database.db.update(guildMembership).set({ state: 'present', roleIds: [ROLE.editor] }).where(eq(guildMembership.discordUserId, user.discordUserId));
    } finally {
      await blocker.query('rollback');
      blocker.release();
    }
    expect(await publishing).toMatchObject({ completed: 0, blocked: 1 });
    expect((await database.db.select().from(publicationSchedule).where(eq(publicationSchedule.id, schedule.id)))[0]).toMatchObject({ state: 'blocked', lastError: 'issuer_revoked' });
    expect((await database.db.select().from(contentTranslation).where(eq(contentTranslation.id, post.translationId)))[0]?.publishedRevisionId).toBe(before?.publishedRevisionId);
  });

  it('rolls back publication when the membership observation expires during its audit write', async () => {
    configurePublisher();
    const user = await insertDiscordUser(database.db);
    const editor = testPrincipal(['editor'], { userId: user.userId });
    const initialClock = new Date();
    let clock = initialClock;
    const post = await createDocument(database.db, editor, { kind: 'news', locale: 'cs', title: 'Snapshot must stay fresh', slug: `expiry-fence-${randomUUID()}`, fields: { excerpt: 'Synthetic excerpt', body: sampleBody('Synthetic content') } });
    const schedule = await scheduleTranslation(database.db, editor, { translationId: post.translationId, dueAt: new Date(clock.getTime() - 1000).toISOString() }, { now: () => new Date(clock.getTime() - 120_000) });
    await observe(user, new Date(clock.getTime() - 59_000));
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
    expect(await publishing).toMatchObject({ completed: 0, blocked: 1 });
    expect((await database.db.select().from(publicationSchedule).where(eq(publicationSchedule.id, schedule.id)))[0]).toMatchObject({ state: 'blocked', lastError: 'issuer_unknown' });
    expect((await database.db.select().from(contentTranslation).where(eq(contentTranslation.id, post.translationId)))[0]?.publishedRevisionId).toBeNull();
  });
});
