import { auditEvent, guildMembership, roleMappingVersion } from '@valkyria/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { recordMembershipObservation, readMembership } from '@/modules/access/membership';
import { can, denialCode } from '@/modules/access/policy';
import { resolveActor, type ActorSession } from '@/modules/access/resolve-actor';
import { ensureRoleMappingVersion, parseRoleMapping, resetRoleMappingCacheForTests } from '@/modules/access/role-mapping';
import type { Actor, Principal } from '@/modules/access/types';
import { createTestDatabase, type TestDatabase } from '../support/test-db';
import { createDiscordFetch, GUILD_ID, insertDiscordUser, ROLE, testAccessEnv, type DiscordMemberState } from './auth-harness';

let database: TestDatabase;
const members = new Map<string, DiscordMemberState>();
const calls: string[] = [];
const fetchImpl = createDiscordFetch(members, calls);
const waits: number[] = [];
const sleep = async (ms: number) => {
  waits.push(ms);
};
const NOW = new Date('2026-09-26T10:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

beforeAll(async () => {
  database = await createTestDatabase();
});

afterAll(async () => {
  await database.drop();
});

beforeEach(() => {
  calls.length = 0;
  waits.length = 0;
  resetRoleMappingCacheForTests();
});

async function discordIdentity() {
  const identity = await insertDiscordUser(database.db);
  const session: ActorSession = { id: crypto.randomUUID(), userId: identity.userId, assurance: 'discord', expiresAt: new Date(NOW.getTime() + 3_600_000) };
  const user = { id: identity.userId, name: 'Synthetic Member', twoFactorEnabled: false };
  return { ...identity, session, user };
}

async function seedSnapshot(discordUserId: string, userId: string, roleIds: string[], observedAt: Date, state: 'present' | 'left' = 'present', guildId = GUILD_ID) {
  await recordMembershipObservation(database.db, {
    guildId,
    discordUserId,
    userId,
    state,
    roleIds,
    observedAt,
    receivedAt: observedAt,
    source: 'rest_refresh',
  });
}

function resolve(identity: Awaited<ReturnType<typeof discordIdentity>>, intent: 'read' | 'write', env = testAccessEnv()) {
  return resolveActor(database.db, { session: identity.session, user: identity.user, intent, env, now: NOW, fetchImpl, discord: { sleep } });
}

function principal(actor: Actor): Principal {
  if (actor.kind !== 'principal') throw new Error(`expected principal, got ${actor.kind}`);
  return actor;
}

describe('snapshot freshness', () => {
  it('serves private reads from a snapshot up to 5 minutes old without calling Discord', async () => {
    const id = await discordIdentity();
    await seedSnapshot(id.discordUserId, id.userId, [ROLE.editor], ago(4 * 60_000));
    members.set(id.discordUserId, { status: 'error', httpStatus: 503 });
    const actor = principal(await resolve(id, 'read'));
    expect(actor).toMatchObject({ status: 'verified', roles: ['editor'] });
    expect(calls).toHaveLength(0);
  });

  it('refreshes a snapshot older than 60 seconds for write intent and applies the new roles', async () => {
    const id = await discordIdentity();
    await seedSnapshot(id.discordUserId, id.userId, [ROLE.editor], ago(2 * 60_000));
    members.set(id.discordUserId, { status: 'present', roles: [] });
    const actor = principal(await resolve(id, 'write'));
    expect(calls).toHaveLength(1);
    expect(actor).toMatchObject({ status: 'verified', roles: [] });
    expect(can(actor, 'content.edit')).toBe(false);
    const stored = await readMembership(database.db, GUILD_ID, id.discordUserId);
    expect(stored).toMatchObject({ roleIds: [], source: 'rest_refresh', lastRefreshError: null });
  });

  it('uses a snapshot at most 60 seconds old for writes', async () => {
    const id = await discordIdentity();
    await seedSnapshot(id.discordUserId, id.userId, [ROLE.matchManager], ago(30_000));
    const actor = principal(await resolve(id, 'write'));
    expect(calls).toHaveLength(0);
    expect(can(actor, 'matches.publish')).toBe(true);
  });

  it('honours Retry-After on 429 within the bounded budget', async () => {
    const id = await discordIdentity();
    let attempt = 0;
    const flaky = (async () => {
      attempt += 1;
      if (attempt === 1) return new Response(JSON.stringify({ retry_after: 0.4 }), { status: 429, headers: { 'Retry-After': '0.4' } });
      return Response.json({ roles: [ROLE.administrator], user: { id: id.discordUserId } });
    }) as typeof fetch;
    const actor = principal(
      await resolveActor(database.db, { session: id.session, user: id.user, intent: 'write', env: testAccessEnv(), now: NOW, fetchImpl: flaky, discord: { sleep } }),
    );
    expect(waits).toEqual([400]);
    expect(actor).toMatchObject({ status: 'verified', roles: ['administrator'] });
  });

  it('fails closed as stale when a 429 wait exceeds the budget', async () => {
    const id = await discordIdentity();
    members.set(id.discordUserId, { status: 'error', httpStatus: 429, retryAfter: '60' });
    const actor = principal(await resolve(id, 'write'));
    expect(actor.status).toBe('stale');
    expect(waits).toEqual([]);
  });

  it('denies writes but allows recent reads during a Discord outage', async () => {
    const id = await discordIdentity();
    await seedSnapshot(id.discordUserId, id.userId, [ROLE.editor], ago(2 * 60_000));
    members.set(id.discordUserId, { status: 'error', httpStatus: 503 });

    const writer = principal(await resolve(id, 'write'));
    expect(writer).toMatchObject({ status: 'stale', roles: [] });
    expect(denialCode(writer, 'content.edit')).toBe('stale_authorization');

    const reader = principal(await resolve(id, 'read'));
    expect(reader).toMatchObject({ status: 'verified', roles: ['editor'] });

    const stored = await readMembership(database.db, GUILD_ID, id.discordUserId);
    expect(stored?.lastRefreshError).toBe('unavailable');
    expect(stored?.roleIds).toEqual([ROLE.editor]);
  });

  it('denies reads with a snapshot older than 5 minutes when Discord is down', async () => {
    const id = await discordIdentity();
    await seedSnapshot(id.discordUserId, id.userId, [ROLE.administrator], ago(6 * 60_000));
    members.set(id.discordUserId, { status: 'error', httpStatus: 500 });
    const actor = principal(await resolve(id, 'read'));
    expect(actor.status).toBe('stale');
    expect(can(actor, 'admin.access')).toBe(false);
  });

  it('treats a 404 Unknown Member as a departure', async () => {
    const id = await discordIdentity();
    await seedSnapshot(id.discordUserId, id.userId, [ROLE.administrator], ago(10 * 60_000));
    members.set(id.discordUserId, { status: 'absent' });
    const actor = principal(await resolve(id, 'write'));
    expect(actor).toMatchObject({ status: 'not_member', roles: [] });
    expect(denialCode(actor, 'admin.access')).toBe('not_member');
    expect(await readMembership(database.db, GUILD_ID, id.discordUserId)).toMatchObject({ state: 'left', roleIds: [] });
  });

  it('ignores snapshots for any other guild', async () => {
    const id = await discordIdentity();
    await seedSnapshot(id.discordUserId, id.userId, [ROLE.administrator], ago(1_000), 'present', '100000000000000777');
    members.set(id.discordUserId, { status: 'error', httpStatus: 503 });
    const actor = principal(await resolve(id, 'read'));
    expect(actor.status).toBe('stale');
    // Only the configured guild is queried (5xx is retried with bounded backoff).
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls.length).toBeLessThanOrEqual(3);
    expect(calls.every((path) => path.includes(`/guilds/${GUILD_ID}/`))).toBe(true);
  });

  it('reports unavailable (not zero roles) when guild or bot token is not configured', async () => {
    const id = await discordIdentity();
    const actor = principal(await resolve(id, 'read', testAccessEnv({ DISCORD_BOT_TOKEN: undefined })));
    expect(actor.status).toBe('unavailable');
    expect(denialCode(actor, 'admin.access')).toBe('verification_unavailable');
    expect(calls).toHaveLength(0);
  });

  it('refuses a Discord user whose session was not established by Discord', async () => {
    const id = await discordIdentity();
    await seedSnapshot(id.discordUserId, id.userId, [ROLE.administrator], ago(1_000));
    const actor = principal(
      await resolveActor(database.db, { session: { ...id.session, assurance: 'unknown' }, user: id.user, intent: 'read', env: testAccessEnv(), now: NOW, fetchImpl }),
    );
    expect(actor.status).toBe('unavailable');
  });

  it('treats expired or mismatched sessions as anonymous', async () => {
    const id = await discordIdentity();
    const expired = await resolveActor(database.db, {
      session: { ...id.session, expiresAt: ago(1) },
      user: id.user,
      intent: 'read',
      env: testAccessEnv(),
      now: NOW,
      fetchImpl,
    });
    expect(expired.kind).toBe('anonymous');
    const mismatched = await resolveActor(database.db, {
      session: { ...id.session, userId: crypto.randomUUID() },
      user: id.user,
      intent: 'read',
      env: testAccessEnv(),
      now: NOW,
      fetchImpl,
    });
    expect(mismatched.kind).toBe('anonymous');
  });

  it('throttles user-requested refreshes but honours them after the interval', async () => {
    const id = await discordIdentity();
    members.set(id.discordUserId, { status: 'present', roles: [ROLE.editor] });
    await resolveActor(database.db, { session: id.session, user: id.user, intent: 'write', env: testAccessEnv(), now: NOW, fetchImpl, forceRefresh: true });
    expect(calls).toHaveLength(1);
    await resolveActor(database.db, { session: id.session, user: id.user, intent: 'write', env: testAccessEnv(), now: new Date(NOW.getTime() + 5_000), fetchImpl, forceRefresh: true });
    expect(calls).toHaveLength(1);
    await resolveActor(database.db, { session: id.session, user: id.user, intent: 'write', env: testAccessEnv(), now: new Date(NOW.getTime() + 11_000), fetchImpl, forceRefresh: true });
    expect(calls).toHaveLength(2);
  });
});

describe('observation ordering', () => {
  it('never lets an older observation overwrite a newer one', async () => {
    const id = await discordIdentity();
    await seedSnapshot(id.discordUserId, id.userId, [], ago(1_000), 'left');
    const applied = await recordMembershipObservation(database.db, {
      guildId: GUILD_ID,
      discordUserId: id.discordUserId,
      userId: id.userId,
      state: 'present',
      roleIds: [ROLE.administrator],
      observedAt: ago(60_000),
      source: 'role_sync',
      sequence: 99,
    });
    expect(applied).toBe(false);
    expect(await readMembership(database.db, GUILD_ID, id.discordUserId)).toMatchObject({ state: 'left', roleIds: [] });
  });

  it('orders equal observation times by sequence', async () => {
    const id = await discordIdentity();
    const at = ago(5_000);
    const base = { guildId: GUILD_ID, discordUserId: id.discordUserId, userId: id.userId, observedAt: at, source: 'role_sync' as const };
    expect(await recordMembershipObservation(database.db, { ...base, state: 'present', roleIds: [ROLE.editor], sequence: 5 })).toBe(true);
    expect(await recordMembershipObservation(database.db, { ...base, state: 'present', roleIds: [ROLE.administrator], sequence: 4 })).toBe(false);
    expect(await recordMembershipObservation(database.db, { ...base, state: 'present', roleIds: [ROLE.matchManager], sequence: 6 })).toBe(true);
    expect((await readMembership(database.db, GUILD_ID, id.discordUserId))?.roleIds).toEqual([ROLE.matchManager]);
  });

  it('rejects non-snowflake identifiers', async () => {
    const id = await discordIdentity();
    expect(
      await recordMembershipObservation(database.db, {
        guildId: GUILD_ID,
        discordUserId: id.discordUserId,
        userId: id.userId,
        state: 'present',
        roleIds: ['moderators'],
        observedAt: NOW,
        source: 'role_sync',
      }),
    ).toBe(false);
    const rows = await database.db.select().from(guildMembership).where(eq(guildMembership.discordUserId, id.discordUserId));
    expect(rows).toHaveLength(0);
  });
});

describe('role mapping', () => {
  it('applies mapping changes immediately to stored role IDs', async () => {
    const id = await discordIdentity();
    await seedSnapshot(id.discordUserId, id.userId, [ROLE.editor], ago(1_000));
    const asEditor = principal(await resolve(id, 'write'));
    expect(asEditor.roles).toEqual(['editor']);
    const remapped = principal(await resolve(id, 'write', testAccessEnv({ DISCORD_ROLE_MAPPING_JSON: JSON.stringify({ [ROLE.editor]: 'match_manager' }) })));
    expect(remapped.roles).toEqual(['match_manager']);
    expect(can(remapped, 'content.edit')).toBe(false);
    expect(can(remapped, 'matches.edit')).toBe(true);
  });

  it('fails closed (no roles) for an invalid mapping such as an owner grant', async () => {
    const id = await discordIdentity();
    await seedSnapshot(id.discordUserId, id.userId, [ROLE.administrator], ago(1_000));
    const actor = principal(await resolve(id, 'write', testAccessEnv({ DISCORD_ROLE_MAPPING_JSON: JSON.stringify({ [ROLE.administrator]: 'owner' }) })));
    expect(actor).toMatchObject({ status: 'verified', roles: [] });
    expect(can(actor, 'admin.access')).toBe(false);
  });

  it('records a new version and audit event only when the digest changes', async () => {
    const before = await database.db.select().from(roleMappingVersion);
    const firstJson = JSON.stringify({ '210000000000000001': 'editor' });
    const secondJson = JSON.stringify({ '210000000000000001': ['editor', 'match_manager'] });
    const first = await ensureRoleMappingVersion(database.db, parseRoleMapping(firstJson), GUILD_ID);
    resetRoleMappingCacheForTests();
    const again = await ensureRoleMappingVersion(database.db, parseRoleMapping(firstJson), GUILD_ID);
    const second = await ensureRoleMappingVersion(database.db, parseRoleMapping(secondJson), GUILD_ID);
    expect(again).toBe(first);
    expect(second).toBe((first ?? 0) + 1);
    expect(await ensureRoleMappingVersion(database.db, parseRoleMapping('{"210000000000000001":"owner"}'), GUILD_ID)).toBeNull();

    const rows = await database.db.select().from(roleMappingVersion);
    expect(rows.length).toBe(before.length + 2);
    const audits = await database.db.select().from(auditEvent).where(eq(auditEvent.action, 'access.role_mapping_changed'));
    const versions = audits.map((event) => event.summary.version);
    expect(versions).toContain(first);
    expect(versions).toContain(second);
    expect(audits.every((event) => event.actorKind === 'system' && event.outcome === 'success')).toBe(true);
  });
});
