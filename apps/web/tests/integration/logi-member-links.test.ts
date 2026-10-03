import { randomUUID } from 'node:crypto';
import {
  authAccount,
  authSession,
  authUser,
  localAdminGrant,
  logiMemberLink,
  logiProjection,
  logiSyncScope,
  memberProfile,
} from '@valkyria/db';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testPrincipal } from '@/modules/access/testing';
import type { Principal } from '@/modules/access/types';
import { configuredLogiSources, type LogiIntegrationEnv } from '@/modules/integrations/logi-config';
import { readLogiMemberLinks, removeLogiMemberLink, saveLogiMemberLink } from '@/modules/integrations/logi-member-links';
import { readPublicLogiMemberEnrichment } from '@/modules/integrations/logi-people';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;
let actor: Principal;
let profileId: string;
const at = new Date('2026-10-03T10:00:00.000Z');
const now = () => at;
const env: LogiIntegrationEnv = {
  NODE_ENV: 'test',
  LOGI_SOURCES_JSON: JSON.stringify([
    {
      sourceInstanceId: 'synthetic',
      origin: 'https://logi.example.test',
      guildId: '910000000000000001',
      gameId: 'wardogs',
      syncPeople: true,
    },
  ]),
  LOGI_PEOPLE_API_KEY_WDG: 'synthetic-people-key-for-tests',
};
const source = configuredLogiSources(env, 'people')[0]!;
const member = {
  schemaVersion: 1,
  id: 'assignment',
  guildId: source.guildId,
  gameId: source.gameId,
  updatedAt: at.toISOString(),
  identityId: 'immutable-user',
  discordSubject: '910000000000000002',
  identityState: 'resolved',
  displayName: 'Private synthetic name',
  type: 'member',
  status: 'active',
  paused: false,
  groups: [],
};
const input = () => ({
  profileId,
  game: 'wardogs' as const,
  expectedVersion: 0,
  scopeKey: source.scopeKey,
  memberId: member.id,
  identityId: member.identityId,
  allowStats: false,
  allowRoster: false,
});
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
beforeEach(async () => {
  await t.db.delete(logiMemberLink);
  await t.db.delete(logiSyncScope);
  await t.db.delete(memberProfile);
  await t.db.delete(authUser);
  const userId = randomUUID();
  await t.db.insert(authUser).values({ id: userId, name: 'Synthetic editor', email: `${userId}@accounts.invalid` });
  await t.db
    .insert(authAccount)
    .values({ id: randomUUID(), userId, accountId: userId, providerId: 'credential', password: 'synthetic-unused' });
  const [grant] = await t.db
    .insert(localAdminGrant)
    .values({ userId, roles: ['editor'], games: ['wardogs'], provisionedBy: 'test' })
    .returning();
  actor = testPrincipal(['editor'], {
    userId,
    source: 'local_admin',
    assurance: 'mfa',
    games: ['wardogs'],
    localGrant: { id: grant!.id, version: 1 },
  });
  await t.db
    .insert(authSession)
    .values({ id: actor.sessionId, userId, token: randomUUID(), assurance: 'mfa', expiresAt: new Date(at.getTime() + 3_600_000) });
  const [profile] = await t.db
    .insert(memberProfile)
    .values({
      slug: 'synthetic-member',
      displayName: 'Approved name',
      games: ['wardogs'],
      state: 'published',
      consentConfirmedAt: at,
      publishedAt: at,
    })
    .returning();
  profileId = profile!.id;
  await t.db
    .insert(logiSyncScope)
    .values({
      scopeKey: source.scopeKey,
      sourceInstanceId: source.sourceInstanceId,
      guildId: source.guildId,
      gameId: source.gameId,
      version: 1,
      activeGeneration: 'fixture',
      lastSuccessAt: at,
      checkpoint: {
        version: 1,
        mode: 'live',
        generation: null,
        resourceIndex: 3,
        listCursor: null,
        boundaryCursor: 'fixture-cursor',
        cursor: 'fixture-cursor',
        reconciledAt: at.toISOString(),
      },
    });
  await t.db
    .insert(logiProjection)
    .values({
      scopeKey: source.scopeKey,
      generation: 'fixture',
      resource: 'member-summaries',
      externalId: member.id,
      revision: '1',
      operation: 'upsert',
      data: member,
      observedAt: at,
    });
});

describe('explicit Logi profile publication associations', () => {
  it.each(['save', 'remove'] as const)('fences %s against logout while waiting for the profile lock', async (operation) => {
    if (operation === 'remove') await saveLogiMemberLink(t.db, env, actor, input(), { now });
    let unlock!: () => void;
    let locked!: () => void;
    const gate = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const lockReady = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const blocker = t.db.transaction(async (tx) => {
      await tx.select().from(memberProfile).where(eq(memberProfile.id, profileId)).for('update');
      locked();
      await gate;
    });
    await lockReady;
    const pending = (
      operation === 'save'
        ? saveLogiMemberLink(t.db, env, actor, input(), { now })
        : removeLogiMemberLink(t.db, env, actor, { profileId, game: 'wardogs', expectedVersion: 1 }, { now })
    ).then(
      () => null,
      (error: unknown) => error,
    );
    try {
      const deadline = Date.now() + 5_000;
      let waiting = false;
      while (Date.now() < deadline) {
        const query = await t.db.execute(
          sql`select 1 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%member_profile%'`,
        );
        if (query.rows.length) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await t.db.delete(authSession).where(eq(authSession.id, actor.sessionId));
    } finally {
      unlock();
      await blocker;
    }
    expect(await pending).toMatchObject({ code: 'stale_authorization' });
    expect(await t.db.select().from(logiMemberLink)).toHaveLength(operation === 'save' ? 0 : 1);
  });
  it.each(['expired', 'assurance'] as const)('rejects a %s interactive session even with a valid grant', async (mode) => {
    await t.db
      .update(authSession)
      .set(mode === 'expired' ? { expiresAt: at } : { assurance: 'password' })
      .where(eq(authSession.id, actor.sessionId));
    await expect(saveLogiMemberLink(t.db, env, actor, input(), { now })).rejects.toMatchObject({ code: 'stale_authorization' });
  });
  it('keeps publication opt-ins off and accepts only the current exact immutable identity', async () => {
    await saveLogiMemberLink(t.db, env, actor, input(), { now });
    expect(await readPublicLogiMemberEnrichment(t.db, env, 'synthetic-member', { now })).toEqual([]);
    const [link] = await readLogiMemberLinks(t.db, actor, profileId);
    expect(link).toMatchObject({ version: 1, identityId: 'immutable-user', allowStats: false, allowRoster: false });
    await expect(
      saveLogiMemberLink(t.db, env, actor, { ...input(), expectedVersion: 1, identityId: 'another-user' }, { now }),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('requires current durable grant authority even when the principal object claims editor', async () => {
    await t.db.update(localAdminGrant).set({ revokedAt: at }).where(eq(localAdminGrant.id, actor.localGrant!.id));
    await expect(saveLogiMemberLink(t.db, env, actor, input(), { now })).rejects.toMatchObject({ code: 'forbidden' });
    expect(await t.db.select().from(logiMemberLink)).toHaveLength(0);
  });
  it('rejects cross-game profiles, ordinary members, stale authority and invalid inputs', async () => {
    await expect(
      saveLogiMemberLink(t.db, env, testPrincipal(['member'], { userId: actor.userId }), input(), { now }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(saveLogiMemberLink(t.db, env, { ...actor, status: 'stale' }, input(), { now })).rejects.toMatchObject({
      code: 'stale_authorization',
    });
    await expect(saveLogiMemberLink(t.db, env, actor, { ...input(), scopeKey: 'not-a-source' }, { now })).rejects.toMatchObject({
      code: 'validation',
    });
    await t.db
      .update(memberProfile)
      .set({ games: ['hell-let-loose', 'wardogs'] })
      .where(eq(memberProfile.id, profileId));
    await expect(saveLogiMemberLink(t.db, env, actor, input(), { now })).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('requires the current version and prevents one source member from attaching to two profiles', async () => {
    await saveLogiMemberLink(t.db, env, actor, input(), { now });
    await expect(saveLogiMemberLink(t.db, env, actor, input(), { now })).rejects.toMatchObject({ code: 'conflict' });
    const [second] = await t.db
      .insert(memberProfile)
      .values({ slug: 'second', displayName: 'Same nickname', games: ['wardogs'] })
      .returning();
    await expect(saveLogiMemberLink(t.db, env, actor, { ...input(), profileId: second!.id }, { now })).rejects.toMatchObject({
      code: 'conflict',
    });
    await saveLogiMemberLink(t.db, env, actor, { ...input(), expectedVersion: 1, allowRoster: true }, { now });
    expect((await readLogiMemberLinks(t.db, actor, profileId))[0]!.version).toBe(2);
  });
  it('requires fresh source evidence and suppresses consent withdrawal immediately', async () => {
    await saveLogiMemberLink(t.db, env, actor, { ...input(), allowRoster: true }, { now });
    expect(await readPublicLogiMemberEnrichment(t.db, env, 'synthetic-member', { now })).toHaveLength(1);
    await t.db.update(memberProfile).set({ consentConfirmedAt: null, state: 'hidden' }).where(eq(memberProfile.id, profileId));
    expect(await readPublicLogiMemberEnrichment(t.db, env, 'synthetic-member', { now })).toEqual([]);
    await t.db.update(logiSyncScope).set({ errorCode: 'forbidden' }).where(eq(logiSyncScope.scopeKey, source.scopeKey));
    await expect(saveLogiMemberLink(t.db, env, actor, { ...input(), expectedVersion: 1 }, { now })).rejects.toMatchObject({
      code: 'unavailable',
    });
    // Removal does not need a source that is now disabled/revoked.
    await removeLogiMemberLink(t.db, {}, actor, { profileId, game: 'wardogs', expectedVersion: 1 }, { now });
    expect(await t.db.select().from(logiMemberLink)).toHaveLength(0);
  });
});
