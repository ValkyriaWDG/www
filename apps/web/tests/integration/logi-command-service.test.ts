import { createHash, randomUUID } from 'node:crypto';
import { authAccount, authSession, logiCommand } from '@valkyria/db';
import { symmetricEncrypt } from 'better-auth/crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resolveActor } from '@/modules/access/resolve-actor';
import { resetRoleMappingCacheForTests } from '@/modules/access/role-mapping';
import type { Principal } from '@/modules/access/types';
import type { LogiCommandInput, LogiCommandReceipt, LogiEventCommand } from '@/modules/integrations/logi-command-contract';
import { loadLogiEventForEditor, pendingLogiEventCommands, submitLogiEventCommand } from '@/modules/integrations/logi-command-service';
import { createTestDatabase, type TestDatabase } from '../support/test-db';
import { GUILD_ID, insertDiscordUser, insertSession, ROLE, TEST_SECRET, testAccessEnv } from './auth-harness';

let database: TestDatabase;
const ORIGIN = 'https://logi.example.test';
const event = { kind: 'match' as const, name: 'Synthetic match', registrationEnd: '2026-10-10T18:00:00.000Z', meetingStart: '2026-10-10T18:15:00.000Z', gameStart: '2026-10-10T18:30:00.000Z', gameEnd: '2026-10-10T20:30:00.000Z' };
const createInput = (): LogiCommandInput => ({ requestId: randomUUID(), game: 'wardogs', command: { operation: 'create', event } });
type Posted = { requestId: string; body: string; key: string | null; token: string | null };
type Mode = 'normal' | 'policy_denied' | 'revision_conflict' | 'server_failure' | 'rate_limited';

/** Stateful provider boundary: mutations and idempotent receipts survive a lost reply. */
async function fixture(bothGames = false) {
  const id = await insertDiscordUser(database.db);
  await database.db.update(authAccount).set({ providerId: 'logi' }).where(eq(authAccount.userId, id.userId));
  const session = await insertSession(database.db, id.userId, 'logi');
  const token = `synthetic-opaque-${randomUUID()}`;
  const sid = randomUUID();
  const source = { sourceInstanceId: 'synthetic-logi', guildId: GUILD_ID, origin: ORIGIN, gameId: 'wardogs' };
  const env = testAccessEnv({
    NODE_ENV: 'test', LOGI_SSO_ENABLED: true, LOGI_ISSUER_URL: ORIGIN, LOGI_CLIENT_ID: 'synthetic-client', LOGI_CLIENT_SECRET: 'synthetic-client-secret', LOGI_GUILD_ID: GUILD_ID,
    LOGI_MEMBERSHIP_SOURCE: 'logi', LOGI_SOURCES_JSON: JSON.stringify(bothGames ? [source, { ...source, gameId: 'hell_let_loose' }] : [source]),
    LOGI_MEMBERSHIP_API_KEY_WDG: 'synthetic-membership-key-wdg', LOGI_MEMBERSHIP_API_KEY_HLL: 'synthetic-membership-key-hll',
    LOGI_EVENT_WRITE_ENABLED: true, LOGI_EVENT_API_KEY_WDG: 'synthetic-command-key-wardogs', LOGI_EVENT_API_KEY_HLL: 'synthetic-command-key-hll', BETTER_AUTH_SECRET: TEST_SECRET,
  });
  await database.db.update(authSession).set({ logiIssuer: ORIGIN, logiClientId: env.LOGI_CLIENT_ID, logiSubject: id.discordUserId, logiSid: sid, logiGuildId: GUILD_ID, logiAccessTokenCiphertext: await symmetricEncrypt({ key: TEST_SECRET, data: token }), logiAccessTokenExpiresAt: session.expiresAt }).where(eq(authSession.id, session.id));
  const upstream = {
    mode: 'normal' as Mode,
    revoked: false,
    loseNextReply: false,
    mutationCount: 0,
    userinfoCalls: 0,
    posts: [] as Posted[],
    receipts: new Map<string, { body: string; receipt: LogiCommandReceipt }>(),
    beforePost: undefined as ((post: Posted, index: number) => Promise<Response | null>) | undefined,
    afterPost: undefined as ((post: Posted, response: Response, index: number) => Promise<Response>) | undefined,
  };
  const fetchImpl: typeof fetch = async (input, options) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url);
    const headers = new Headers(options?.headers);
    if (url.origin !== ORIGIN) throw new Error('Unexpected synthetic destination');
    if (url.pathname === '/api/sso/userinfo') {
      upstream.userinfoCalls++;
      if (upstream.revoked || headers.get('authorization') !== `Bearer ${token}`) return new Response(null, { status: 401 });
      return Response.json({ sub: id.discordUserId, name: 'Synthetic Member', picture: null, guild_id: GUILD_ID, sid });
    }
    const gameId = url.searchParams.get('game') === 'hell_let_loose' ? 'hell_let_loose' : 'wardogs';
    if (url.pathname === `/api/v1/clan/membership-summaries/${id.discordUserId}`) {
      const at = new Date().toISOString();
      return Response.json({ data: { guildId: GUILD_ID, discordUserId: id.discordUserId, gameId, state: 'present', roleIds: [ROLE.matchManager], assignment: null, observedAt: at, receivedAt: at, epoch: '1', revision: '1', completeness: 'verified_member' } });
    }
    if (url.pathname.startsWith('/api/v1/clan/event-commands/') && options?.method === 'GET') {
      return Response.json({ data: { eventId: url.pathname.split('/').at(-1), guildId: GUILD_ID, gameId, revision: '9007199254740993', event, canEdit: true, canCancel: true } });
    }
    if (url.pathname !== '/api/v1/clan/event-commands' || options?.method !== 'POST') throw new Error('Unexpected synthetic API operation');
    const post = { requestId: headers.get('idempotency-key')!, body: String(options.body), key: headers.get('authorization'), token: headers.get('x-logi-actor-token') };
    upstream.posts.push(post);
    const index = upstream.posts.length;
    const intercepted = await upstream.beforePost?.(post, index);
    if (intercepted) return intercepted;
    if (upstream.mode === 'rate_limited') return Response.json({ error: { code: 'rate_limited' } }, { status: 429, headers: { 'retry-after': '120' } });
    if (upstream.mode !== 'normal') return Response.json({ error: { code: upstream.mode } }, { status: upstream.mode === 'policy_denied' ? 403 : upstream.mode === 'revision_conflict' ? 409 : 503 });
    if (post.token !== token || upstream.revoked) return Response.json({ error: { code: 'unauthorized' } }, { status: 401 });
    const previous = upstream.receipts.get(post.requestId);
    if (previous && previous.body !== post.body) return Response.json({ error: { code: 'idempotency_conflict' } }, { status: 409 });
    const body = JSON.parse(post.body) as LogiEventCommand;
    const receipt: LogiCommandReceipt = previous ? { ...previous.receipt, replayed: true } : { eventId: body.operation === 'create' ? `event-${++upstream.mutationCount}` : body.eventId, guildId: GUILD_ID, gameId, revision: '9007199254740993', operation: body.operation, receiptId: `receipt-${upstream.mutationCount}`, replayed: false };
    if (!previous) upstream.receipts.set(post.requestId, { body: post.body, receipt });
    if (upstream.loseNextReply) { upstream.loseNextReply = false; throw new TypeError('Synthetic connection reset after commit'); }
    const response = Response.json({ data: receipt });
    return upstream.afterPost ? upstream.afterPost(post, response, index) : response;
  };
  // Resolve the real actor from fresh membership + the persisted encrypted session.
  const actor = await resolveActor(database.db, { session, user: { id: id.userId, name: 'Synthetic Member' }, intent: 'write', env, fetchImpl });
  if (actor.kind !== 'principal' || actor.status !== 'verified' || !actor.capabilities.has('matches.edit')) throw new Error('Synthetic actor was not authorized');
  return { ...id, session, token, sid, env, actor, upstream, fetchImpl };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const submit = (value: Fixture, input = createInput()) => submitLogiEventCommand(database.db, value.actor, input, value.env, value.fetchImpl);
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; };

async function waitForJournalLock() {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await database.db.execute(sql`select 1 from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and wait_event_type = 'Lock' and query like '%logi_command%'`);
    if (result.rows.length) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Expected command transaction did not reach the held journal lock');
}

beforeAll(async () => { database = await createTestDatabase(); });
afterAll(async () => { await database.drop(); });
beforeEach(async () => { resetRoleMappingCacheForTests(); await database.db.delete(logiCommand); });

describe('Logi command journal with real PostgreSQL and authenticated sessions', () => {
  it('recovers a lost reply after reload with the original ID/body and exactly one upstream mutation', async () => {
    const value = await fixture(); const input = createInput(); value.upstream.loseNextReply = true;
    expect(await submit(value, input)).toMatchObject({ state: 'pending', requestId: input.requestId });
    const pending = await pendingLogiEventCommands(database.db, value.actor);
    expect(pending).toEqual([input]);
    expect(await submit(value, pending[0]!)).toMatchObject({ state: 'confirmed', receipt: { replayed: true, eventId: 'event-1' } });
    expect(value.upstream.mutationCount).toBe(1);
    expect(value.upstream.posts.map((post) => post.requestId)).toEqual([input.requestId, input.requestId]);
    expect(new Set(value.upstream.posts.map((post) => post.body)).size).toBe(1);
    expect(await database.db.select().from(logiCommand)).toMatchObject([{ id: input.requestId, state: 'confirmed', errorCode: null }]);
    expect(await pendingLogiEventCommands(database.db, value.actor)).toEqual([]);
  });

  it('keeps an unknown committed create recoverable when a later retry is denied, then resolves its original receipt', async () => {
    const value = await fixture(); const input = createInput(); value.upstream.loseNextReply = true;
    expect(await submit(value, input)).toMatchObject({ state: 'pending', requestId: input.requestId });
    expect(value.upstream.mutationCount).toBe(1);
    // A revoked role/policy denies this retry before receipt lookup. It cannot
    // establish that the earlier request did not commit upstream.
    value.upstream.mode = 'policy_denied';
    expect(await submit(value, input)).toMatchObject({ state: 'pending', requestId: input.requestId });
    expect(await database.db.select().from(logiCommand)).toMatchObject([{ id: input.requestId, state: 'pending', receipt: null }]);
    expect(await pendingLogiEventCommands(database.db, value.actor)).toEqual([input]);
    value.upstream.mode = 'normal';
    const resumed = (await pendingLogiEventCommands(database.db, value.actor))[0]!;
    expect(await submit(value, resumed)).toMatchObject({ state: 'confirmed', receipt: { replayed: true, eventId: 'event-1' } });
    expect(value.upstream.mutationCount).toBe(1);
    expect(new Set(value.upstream.posts.map((post) => post.requestId))).toEqual(new Set([input.requestId]));
    expect(new Set(value.upstream.posts.map((post) => post.body)).size).toBe(1);
    expect(await pendingLogiEventCommands(database.db, value.actor)).toEqual([]);
  });

  it('does not let a late definitive rejection erase a concurrent unknown committed request', async () => {
    const value = await fixture(); const input = createInput(); const arrived = deferred(); const release = deferred();
    value.upstream.beforePost = async (_post, index) => {
      if (index !== 1) return null;
      arrived.resolve(); await release.promise;
      return Response.json({ error: { code: 'policy_denied' } }, { status: 403 });
    };
    const first = submit(value, input); await arrived.promise;
    try {
      value.upstream.loseNextReply = true;
      expect(await submit(value, input)).toMatchObject({ state: 'pending' });
      expect(value.upstream.mutationCount).toBe(1);
    } finally { release.resolve(); }
    expect(await first).toMatchObject({ state: 'pending', requestId: input.requestId });
    expect(await pendingLogiEventCommands(database.db, value.actor)).toEqual([input]);
    expect(await submit(value, input)).toMatchObject({ state: 'confirmed', receipt: { replayed: true, eventId: 'event-1' } });
    expect(value.upstream.mutationCount).toBe(1);
  });

  it('never persists actor/service/client secrets or decrypted tokens in the command journal', async () => {
    const value = await fixture(); await submit(value);
    const rows = await database.db.select().from(logiCommand);
    const stored = JSON.stringify(rows);
    for (const secret of [value.token, value.env.LOGI_EVENT_API_KEY_WDG!, value.env.LOGI_CLIENT_SECRET!, TEST_SECRET]) expect(stored).not.toContain(secret);
    expect(rows[0]).toMatchObject({ body: { operation: 'create', event }, bodyHash: createHash('sha256').update(JSON.stringify({ operation: 'create', event })).digest('hex') });
  });

  it('rejects changed bodies, another user and another source reusing an existing request ID before POST', async () => {
    const value = await fixture(); const input = createInput(); await submit(value, input);
    const changed = { ...input, command: { operation: 'create' as const, event: { ...event, name: 'Changed intent' } } };
    await expect(submit(value, changed)).rejects.toMatchObject({ code: 'conflict' });
    const other = await fixture();
    await expect(submit(other, input)).rejects.toMatchObject({ code: 'conflict' });
    const source = JSON.parse(value.env.LOGI_SOURCES_JSON!)[0] as Record<string, unknown>;
    await expect(submitLogiEventCommand(database.db, value.actor, input, { ...value.env, LOGI_SOURCES_JSON: JSON.stringify([{ ...source, sourceInstanceId: 'another-source' }]) }, value.fetchImpl)).rejects.toMatchObject({ code: 'conflict' });
    expect(value.upstream.posts).toHaveLength(1); expect(other.upstream.posts).toHaveLength(0);
    expect(await database.db.select().from(logiCommand)).toHaveLength(1);
  });

  it('keeps source binding stable through an authorized service-key rotation', async () => {
    const value = await fixture(); const input = createInput(); value.upstream.loseNextReply = true;
    await submit(value, input);
    value.env.LOGI_EVENT_API_KEY_WDG = 'synthetic-rotated-command-key';
    expect(await submit(value, input)).toMatchObject({ state: 'confirmed', receipt: { replayed: true } });
    expect(value.upstream.posts[1]!.key).toBe('Bearer synthetic-rotated-command-key');
    expect(value.upstream.mutationCount).toBe(1);
  });

  it('denies another game/read-only actor and prevents one ID from targeting a second authorized game', async () => {
    const value = await fixture();
    await expect(submit(value, { ...createInput(), game: 'hll' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(submitLogiEventCommand(database.db, { ...value.actor, intent: 'read' }, createInput(), value.env, value.fetchImpl)).rejects.toMatchObject({ code: 'stale_authorization' });
    expect(value.upstream.posts).toHaveLength(0);
    const both = await fixture(true); const input = createInput(); await submit(both, input);
    await expect(submit(both, { ...input, game: 'hll' })).rejects.toMatchObject({ code: 'conflict' });
    expect(both.upstream.posts).toHaveLength(1);
  });

  it('rejects central revocation and local session deletion without an upstream mutation', async () => {
    const revoked = await fixture(); revoked.upstream.revoked = true;
    await expect(submit(revoked)).rejects.toMatchObject({ code: 'unavailable' });
    expect(await database.db.select().from(authSession).where(eq(authSession.id, revoked.session.id))).toEqual([]);
    const deleted = await fixture(); await database.db.delete(authSession).where(eq(authSession.id, deleted.session.id));
    await expect(submit(deleted)).rejects.toMatchObject({ code: 'unavailable' });
    expect(revoked.upstream.posts).toHaveLength(0); expect(deleted.upstream.posts).toHaveLength(0);
    expect(await database.db.select().from(logiCommand)).toEqual([]);
  });

  it('rechecks local session revocation after waiting for a real PostgreSQL journal lock', async () => {
    const value = await fixture(); const input = createInput(); value.upstream.loseNextReply = true; await submit(value, input);
    const locked = deferred(); const release = deferred();
    const holder = database.db.transaction(async (tx) => { await tx.select().from(logiCommand).where(eq(logiCommand.id, input.requestId)).for('update'); locked.resolve(); await release.promise; });
    await locked.promise;
    const retry = submit(value, input).then((outcome) => outcome, () => ({ state: 'denied' }));
    try {
      await waitForJournalLock();
      await database.db.delete(authSession).where(eq(authSession.id, value.session.id));
    } finally { release.resolve(); await holder; }
    expect((await retry).state).not.toBe('confirmed');
    expect(value.upstream.posts).toHaveLength(1);
  });

  it.each(['policy_denied', 'revision_conflict', 'server_failure'] as const)('journals definitive rejection versus unknown outcome for %s', async (mode) => {
    const value = await fixture(); value.upstream.mode = mode; const input = createInput();
    const state = mode === 'server_failure' ? 'pending' : 'rejected';
    expect(await submit(value, input)).toMatchObject({ state, requestId: input.requestId });
    expect(await database.db.select().from(logiCommand)).toMatchObject([{ state, receipt: null }]);
    expect(value.upstream.mutationCount).toBe(0);
  });

  it('persists rate-limit backoff and keeps the same pending ID until a later authorized retry', async () => {
    const value = await fixture(); const input = createInput(); value.upstream.mode = 'rate_limited';
    expect(await submit(value, input)).toMatchObject({ state: 'pending', code: 'rate_limited', requestId: input.requestId });
    const [row] = await database.db.select().from(logiCommand);
    expect(row!.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + 115_000);
    value.upstream.mode = 'normal';
    expect(await submit(value, input)).toMatchObject({ state: 'pending', code: 'rate_limited' });
    expect(value.upstream.posts).toHaveLength(1);
    await database.db.update(logiCommand).set({ nextAttemptAt: new Date(Date.now() - 1) }).where(eq(logiCommand.id, input.requestId));
    expect(await submit(value, input)).toMatchObject({ state: 'confirmed' });
    expect(value.upstream.posts.map((post) => post.requestId)).toEqual([input.requestId, input.requestId]);
    expect(value.upstream.mutationCount).toBe(1);
  });

  it('recovers when the upstream mutation succeeds but the receipt cannot be persisted', async () => {
    const value = await fixture(); const input = createInput();
    await database.db.execute(sql`create function command_test_reject() returns trigger language plpgsql as $$ begin if NEW.state = 'confirmed' then raise exception 'synthetic receipt persistence failure'; end if; return NEW; end $$`);
    await database.db.execute(sql`create trigger command_test_reject before update on logi_command for each row execute function command_test_reject()`);
    try {
      expect(await submit(value, input)).toMatchObject({ state: 'pending', requestId: input.requestId });
      expect(await database.db.select().from(logiCommand)).toMatchObject([{ state: 'pending', receipt: null }]);
    } finally {
      await database.db.execute(sql`drop trigger command_test_reject on logi_command`);
      await database.db.execute(sql`drop function command_test_reject()`);
    }
    expect(await submit(value, input)).toMatchObject({ state: 'confirmed', receipt: { replayed: true } });
    expect(value.upstream.mutationCount).toBe(1);
  });

  it.each(['lost_reply', 'late_rejection'] as const)('does not downgrade a concurrent confirmed receipt after %s', async (mode) => {
    const value = await fixture(); const input = createInput(); const arrived = deferred(); const release = deferred();
    if (mode === 'lost_reply') value.upstream.afterPost = async (_post, response, index) => { if (index !== 1) return response; arrived.resolve(); await release.promise; throw new TypeError('Synthetic lost first reply'); };
    else value.upstream.beforePost = async (_post, index) => { if (index !== 1) return null; arrived.resolve(); await release.promise; return Response.json({ error: { code: 'policy_denied' } }, { status: 403 }); };
    const first = submit(value, input); await arrived.promise;
    try { expect(await submit(value, input)).toMatchObject({ state: 'confirmed' }); }
    finally { release.resolve(); }
    expect(await first).toMatchObject({ state: 'confirmed' });
    expect(await database.db.select().from(logiCommand)).toMatchObject([{ state: 'confirmed', errorCode: null, receipt: { eventId: 'event-1' } }]);
    expect(value.upstream.mutationCount).toBe(1);
  });

  it('lists only this author\'s authorized pending requests and loads editor state without writing', async () => {
    const value = await fixture(); value.upstream.mode = 'server_failure'; const input = createInput(); await submit(value, input);
    const other = await fixture(); other.upstream.mode = 'server_failure'; await submit(other);
    expect(await pendingLogiEventCommands(database.db, value.actor)).toEqual([input]);
    const noGame: Principal = { ...value.actor, gameScopes: new Map() };
    expect(await pendingLogiEventCommands(database.db, noGame)).toEqual([]);
    expect(await loadLogiEventForEditor(database.db, { ...value.actor, intent: 'read' }, 'wardogs', 'event-1', value.env, value.fetchImpl)).toMatchObject({ eventId: 'event-1', revision: '9007199254740993', event });
    expect(value.upstream.posts).toHaveLength(1);
  });
});
