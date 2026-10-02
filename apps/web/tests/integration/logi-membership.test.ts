import { authAccount, authSession, logiMembership } from '@valkyria/db';
import { symmetricEncrypt } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadLogiMembershipEvidence, revalidateLogiMembership } from '@/modules/access/logi-membership';
import { authorizeIssuer, revalidateIssuerFence } from '@/modules/access/issuer';
import { canForGame, can } from '@/modules/access/policy';
import { resolveActor } from '@/modules/access/resolve-actor';
import { resetRoleMappingCacheForTests } from '@/modules/access/role-mapping';
import type { LogiMembership } from '@/modules/integrations/logi/contracts';
import { createTestDatabase, type TestDatabase } from '../support/test-db';
import { GUILD_ID, insertDiscordUser, insertSession, ROLE, TEST_SECRET, testAccessEnv } from './auth-harness';

let database: TestDatabase;
const NOW = new Date('2026-10-02T12:00:00Z');
const source = { sourceInstanceId: 'local', guildId: GUILD_ID, origin: 'https://logi.example.test', gameId: 'wardogs' as const };
const env = testAccessEnv({ LOGI_SSO_ENABLED: true, LOGI_ISSUER_URL: source.origin, LOGI_CLIENT_ID: 'valkyria', LOGI_CLIENT_SECRET: 'synthetic-client-secret', LOGI_GUILD_ID: GUILD_ID, LOGI_MEMBERSHIP_SOURCE: 'logi', LOGI_SOURCES_JSON: JSON.stringify([source]), LOGI_MEMBERSHIP_API_KEY_WDG: 'synthetic-membership-key-012345', BETTER_AUTH_SECRET: TEST_SECRET });
beforeAll(async () => { database = await createTestDatabase(); });
afterAll(async () => { await database.drop(); });
beforeEach(() => { resetRoleMappingCacheForTests(); });

async function identity() {
  const id = await insertDiscordUser(database.db);
  await database.db.update(authAccount).set({ providerId: 'logi' }).where(eq(authAccount.userId, id.userId));
  const session = await insertSession(database.db, id.userId, 'logi');
  session.expiresAt = new Date(NOW.getTime() + 3_600_000);
  const sid = crypto.randomUUID();
  await database.db.update(authSession).set({ expiresAt: session.expiresAt, logiIssuer: env.LOGI_ISSUER_URL, logiClientId: env.LOGI_CLIENT_ID, logiSubject: id.discordUserId, logiSid: sid, logiGuildId: GUILD_ID, logiAccessTokenCiphertext: await symmetricEncrypt({ key: TEST_SECRET, data: 'synthetic-opaque-token' }), logiAccessTokenExpiresAt: session.expiresAt }).where(eq(authSession.id, session.id));
  const member: LogiMembership = { guildId: source.guildId, discordUserId: id.discordUserId, gameId: 'wardogs', state: 'present', roleIds: [ROLE.matchManager], assignment: null, observedAt: NOW.toISOString(), receivedAt: NOW.toISOString(), epoch: '1', revision: '1', completeness: 'verified_member' };
  const calls: string[] = [];
  const fetchImpl = (async (raw: string | URL | Request) => {
    const url = new URL(typeof raw === 'string' ? raw : raw instanceof URL ? raw.href : raw.url);
    calls.push(url.pathname);
    if (url.pathname === '/api/sso/userinfo') return Response.json({ sub: id.discordUserId, name: 'Synthetic Member', guild_id: GUILD_ID, sid });
    return Response.json({ data: member });
  }) as typeof fetch;
  return { ...id, sid, session, member, calls, fetchImpl, user: { id: id.userId, name: 'Synthetic Member' } };
}
const resolve = (id: Awaited<ReturnType<typeof identity>>, overrides: Partial<Parameters<typeof resolveActor>[1]> = {}) => resolveActor(database.db, { session: id.session, user: id.user, intent: 'write', env, now: NOW, fetchImpl: id.fetchImpl, ...overrides });

describe('Logi authorization with real database sessions and observations', () => {
  it('grants only the explicitly observed game and checks central session on every request', async () => {
    const id = await identity();
    const actor = await resolve(id);
    expect(actor).toMatchObject({ kind: 'principal', assurance: 'logi', status: 'verified', roles: ['match_manager'] });
    expect(canForGame(actor, 'matches.edit', 'wardogs')).toBe(true);
    expect(canForGame(actor, 'matches.edit', 'hell-let-loose')).toBe(false);
    await resolve(id);
    expect(id.calls.filter((path) => path.endsWith('/userinfo'))).toHaveLength(2);
    expect(id.calls.filter((path) => path.includes('membership'))).toHaveLength(2);
  });
  it('denies stale write roles while allowing a recent read and never treats login as owner', async () => {
    const id = await identity();
    id.member.observedAt = new Date(NOW.getTime() - 120_000).toISOString();
    expect(can(await resolve(id), 'matches.edit')).toBe(false);
    const reader = await resolve(id, { intent: 'read' });
    expect(canForGame(reader, 'matches.edit', 'wardogs')).toBe(true);
    expect(reader.kind === 'principal' && reader.roles).not.toContain('owner');
  });
  it('denies a departed member and remembers the newer removal against stale responses', async () => {
    const id = await identity();
    expect(can(await resolve(id), 'matches.edit')).toBe(true);
    Object.assign(id.member, { revision: '9007199254740994', epoch: '2', state: 'left', completeness: 'verified_absent', roleIds: [] });
    expect(can(await resolve(id), 'matches.edit')).toBe(false);
    Object.assign(id.member, { revision: '9007199254740993', epoch: '1', state: 'present', completeness: 'verified_member', roleIds: [ROLE.matchManager] });
    expect(can(await resolve(id), 'matches.edit')).toBe(false);
  });
  it('does not reuse cached roles when the membership service key is revoked', async () => {
    const id = await identity();
    expect(can(await resolve(id), 'matches.edit')).toBe(true);
    expect(can(await resolve(id, { fetchImpl: (async () => new Response(null, { status: 403 })) as typeof fetch }), 'matches.edit')).toBe(false);
  });
  it('deletes the web session after central logout and denies access', async () => {
    const id = await identity();
    const fetchImpl = (async (url, init) => String(url).endsWith('/userinfo') ? new Response(null, { status: 401 }) : id.fetchImpl(url, init)) as typeof fetch;
    expect(can(await resolve(id, { fetchImpl }), 'matches.edit')).toBe(false);
    expect(await database.db.select().from(authSession).where(eq(authSession.id, id.session.id))).toEqual([]);
  });
  it('fails closed on a provider outage without fabricating a membership departure', async () => {
    const id = await identity();
    const fetchImpl = (async (url, init) => String(url).endsWith('/userinfo') ? new Response(null, { status: 503 }) : id.fetchImpl(url, init)) as typeof fetch;
    expect(can(await resolve(id, { fetchImpl }), 'matches.edit')).toBe(false);
    expect(await database.db.select().from(authSession).where(eq(authSession.id, id.session.id))).toHaveLength(1);
  });
  it('rejects roles from another subject, guild or game', async () => {
    for (const change of [{ discordUserId: '399999999999999999' }, { guildId: '199999999999999999' }, { gameId: 'hell_let_loose' as const }]) {
      const id = await identity(); Object.assign(id.member, change);
      expect(can(await resolve(id), 'matches.edit')).toBe(false);
    }
  });
  it('denies mixed identities and old Discord fallback sessions when SSO is required', async () => {
    const id = await identity();
    await database.db.insert(authAccount).values({ id: crypto.randomUUID(), userId: id.userId, providerId: 'discord', accountId: id.discordUserId });
    expect(can(await resolve(id), 'matches.edit')).toBe(false);
    const fallback = await insertDiscordUser(database.db);
    const session = await insertSession(database.db, fallback.userId, 'discord');
    expect(can(await resolveActor(database.db, { session, user: { id: fallback.userId, name: 'Fallback' }, intent: 'write', env, now: NOW }), 'matches.edit')).toBe(false);
  });
  it('catches session deletion during the central userinfo await', async () => {
    const id = await identity();
    const fetchImpl = (async (url, init) => {
      if (String(url).endsWith('/userinfo')) await database.db.delete(authSession).where(eq(authSession.id, id.session.id));
      return id.fetchImpl(url, init);
    }) as typeof fetch;
    expect(can(await resolve(id, { fetchImpl }), 'matches.edit')).toBe(false);
  });
  it('catches a role invalidation after membership fetch but before userinfo completes', async () => {
    const id = await identity();
    const fetchImpl = (async (url, init) => {
      if (String(url).endsWith('/userinfo')) await database.db.update(logiMembership).set({ state: 'left', roleIds: [], revision: '2' }).where(eq(logiMembership.subject, id.discordUserId));
      return id.fetchImpl(url, init);
    }) as typeof fetch;
    expect(can(await resolve(id, { fetchImpl }), 'matches.edit')).toBe(false);
  });
  it('rechecks row versions inside the scheduled publication transaction without replaying a login', async () => {
    const id = await identity();
    const result = await authorizeIssuer(database.db, { issuerKind: 'discord', issuerUserId: id.userId, grantId: null, grantVersion: null, capability: 'matches.publish', game: 'wardogs' }, { env, now: () => NOW, fetchImpl: id.fetchImpl });
    expect(result.verdict).toBe('authorized');
    if (result.verdict !== 'authorized') throw new Error('Missing issuer proof');
    expect(id.calls.some((path) => path.endsWith('/userinfo'))).toBe(false);
    await database.db.update(logiMembership).set({ state: 'left', roleIds: [], revision: '2' }).where(eq(logiMembership.subject, id.discordUserId));
    expect(await database.db.transaction((tx) => revalidateIssuerFence(tx, result.fence, () => NOW))).toBe('revoked');
  });
  it('keeps a fence when the same member is re-confirmed concurrently', async () => {
    const id = await identity();
    const first = await loadLogiMembershipEvidence(database.db, { env, subject: id.discordUserId, maxAgeMs: 60_000, now: () => NOW, fetchImpl: id.fetchImpl });
    // A second request (header next to page, another tab) re-persists the same observation.
    const second = await loadLogiMembershipEvidence(database.db, { env, subject: id.discordUserId, maxAgeMs: 60_000, now: () => NOW, fetchImpl: id.fetchImpl });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(await revalidateLogiMembership(database.db, first!, 60_000, () => NOW)).toBe(true);
    await database.db.update(logiMembership).set({ roleIds: [], revision: '2' }).where(eq(logiMembership.subject, id.discordUserId));
    expect(await revalidateLogiMembership(database.db, first!, 60_000, () => NOW)).toBe(false);
  });
  it('keeps scheduled authority while the issuer keeps browsing', async () => {
    const id = await identity();
    const result = await authorizeIssuer(database.db, { issuerKind: 'discord', issuerUserId: id.userId, grantId: null, grantVersion: null, capability: 'matches.publish', game: 'wardogs' }, { env, now: () => NOW, fetchImpl: id.fetchImpl });
    if (result.verdict !== 'authorized') throw new Error('Missing issuer proof');
    expect(can(await resolve(id), 'matches.edit')).toBe(true);
    expect(await database.db.transaction((tx) => revalidateIssuerFence(tx, result.fence, () => NOW))).toBe('authorized');
  });
  it('orders observations by epoch before revision', async () => {
    const id = await identity();
    id.member.revision = '900';
    expect(can(await resolve(id), 'matches.edit')).toBe(true);
    // A provider reset starts a new epoch with low revisions; its departure must win.
    Object.assign(id.member, { epoch: '2', revision: '3', state: 'left', completeness: 'verified_absent', roleIds: [] });
    expect(can(await resolve(id), 'matches.edit')).toBe(false);
    // A later return in the same new epoch is accepted instead of locking the member out.
    Object.assign(id.member, { revision: '4', state: 'present', completeness: 'verified_member', roleIds: [ROLE.matchManager] });
    expect(can(await resolve(id), 'matches.edit')).toBe(true);
  });
  it('tolerates a provider clock slightly ahead of the website', async () => {
    const id = await identity();
    id.member.observedAt = new Date(NOW.getTime() + 2_000).toISOString();
    expect(can(await resolve(id), 'matches.edit')).toBe(true);
    id.member.observedAt = new Date(NOW.getTime() + 10_000).toISOString();
    id.member.revision = '2';
    expect(can(await resolve(id), 'matches.edit')).toBe(false);
  });
  it('checks age again after the evidence was loaded', async () => {
    const id = await identity();
    const evidence = await loadLogiMembershipEvidence(database.db, { env, subject: id.discordUserId, maxAgeMs: 60_000, now: () => NOW, fetchImpl: id.fetchImpl });
    expect(evidence).not.toBeNull();
    expect(await revalidateLogiMembership(database.db, evidence!, 60_000, () => new Date(NOW.getTime() + 60_001))).toBe(false);
  });
  it('revokes scheduled authority when its bound website account is deleted or changed', async () => {
    for (const mutation of ['delete', 'rebind']) {
      const id = await identity();
      const result = await authorizeIssuer(database.db, { issuerKind: 'discord', issuerUserId: id.userId, grantId: null, grantVersion: null, capability: 'matches.publish', game: 'wardogs' }, { env, now: () => NOW, fetchImpl: id.fetchImpl });
      if (result.verdict !== 'authorized') throw new Error('Missing issuer proof');
      if (mutation === 'delete') await database.db.delete(authAccount).where(eq(authAccount.userId, id.userId));
      else await database.db.update(authAccount).set({ accountId: '399999999999999999' }).where(eq(authAccount.userId, id.userId));
      expect(await database.db.transaction((tx) => revalidateIssuerFence(tx, result.fence, () => NOW))).toBe('revoked');
    }
  });
});
