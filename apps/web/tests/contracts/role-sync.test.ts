import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { createDb, type Database } from '@valkyria/db';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readMembership } from '@/modules/access/membership';
import { receiveRoleSync } from '@/modules/role-sync/receiver';
import { ROLE_SYNC_PATH, type ReceiverConfig, type RoleSyncEvent } from '@/modules/role-sync/protocol';
import { createTestDatabase, type TestDatabase } from '../support/test-db';
import { loadBotSource } from '../support/bot-source';

/** Actual public bot source is compiled locally; nothing is copied or rewritten as a fake sender. */
type Member = { guildId: string; userId: string; state: 'present' | 'left'; roleIds: string[]; observedAt: string };
type BotStore = { saveMembership(member: Member): Promise<RoleSyncEvent>; claimOutbox(now: Date, limit: number): Promise<{ event: RoleSyncEvent; leaseId: string }[]> };
type BotService = { observe(member: Member): Promise<RoleSyncEvent>; depart(userId: string): Promise<RoleSyncEvent>; tick(): Promise<void>; reconcile(): Promise<{ processed: number; failed: number }> };
type BotExports = {
  PostgresStore: new (pool: Pool, guildId: string) => BotStore;
  RoleSyncService: new (config: { guildId: string; url: string; keyId: string; secret: string; enabled: boolean }, store: BotStore, provider: { fetch(guildId: string, userId: string): Promise<Member> }, options: { now: () => Date; allowLoopbackHttp: boolean }) => BotService;
  signEvent(event: RoleSyncEvent, options: { url: string; keyId: string; secret: string; now: Date }): { body: string; headers: Record<string, string> };
  migrate(pool: Pool, directory: string): Promise<void>;
};

const guildId = '111111111111111111';
const userId = '222222222222222222';
const roleId = '333333333333333333';
const secret = 'synthetic-cross-repo-key-not-a-live-secret';
const config: ReceiverConfig = { enabled: true, producer: 'fixture-bot', guildId, keys: { current: secret, previous: `${secret}-old` } };
let web: TestDatabase;
let sender: TestDatabase;
let receiverDb: Database;
let bot: BotExports;
let server: Server;
let url: string;
let source: Awaited<ReturnType<typeof loadBotSource<BotExports>>>;
let clock: Date;
let delivery: 'normal' | 'drop-ack' | 'rate-limit';
let acknowledgements: number[];
let bodies: RoleSyncEvent[];
const member = (state: 'present' | 'left' = 'present'): Member => ({ guildId, userId, roleIds: state === 'present' ? [roleId] : [], state, observedAt: clock.toISOString() });
const store = () => new bot.PostgresStore(sender.pool, guildId);
const service = (keyId = 'current', provider = { fetch: async () => member() }) => new bot.RoleSyncService({ guildId, url, keyId, secret: config.keys[keyId]!, enabled: true }, store(), provider, { now: () => clock, allowLoopbackHttp: true });
const rows = async () => (await sender.pool.query('select event_id,status,event,last_code from role_outbox order by sequence')).rows;

beforeAll(async () => {
  source = await loadBotSource<BotExports>({ PostgresStore: 'src/persistence/store.ts', migrate: 'src/persistence/migrations.ts', RoleSyncService: 'src/rolesync/service.ts', signEvent: 'src/rolesync/signing.ts' });
  bot = source.api;
  web = await createTestDatabase();
  sender = await createTestDatabase();
  receiverDb = web.db;
  await bot.migrate(sender.pool, resolve(source.sourceDirectory, 'migrations'));
  server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      bodies.push(JSON.parse(body.toString('utf8')) as RoleSyncEvent);
      if (delivery === 'rate-limit') { acknowledgements.push(429); outgoing.writeHead(429, { 'Retry-After': '60' }).end(); return; }
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) if (typeof value === 'string') headers.set(key, value);
      const response = await receiveRoleSync(new Request(url, { method: incoming.method, headers, body }), { db: receiverDb, config, now: () => clock });
      acknowledgements.push(response.status);
      if (response.status === 204) {
        // The SQL receipt is visible on another pooled connection before the ACK leaves.
        expect((await web.pool.query('select count(*)::int as count from discord_role_sync_receipt where event_id=$1', [bodies.at(-1)!.eventId])).rows[0].count).toBe(1);
      }
      if (delivery === 'drop-ack') { outgoing.destroy(); return; }
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch { outgoing.writeHead(500).end(); }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture address missing');
  url = `http://127.0.0.1:${address.port}${ROLE_SYNC_PATH}`;
});

beforeEach(async () => {
  clock = new Date(Date.now() + 1000);
  delivery = 'normal'; acknowledgements = []; bodies = [];
  await sender.pool.query('truncate memberships,role_outbox');
  await web.pool.query('truncate discord_role_sync_nonce,discord_role_sync_receipt,discord_role_sync_member,guild_membership');
});
afterAll(async () => {
  if (server) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  await sender?.drop(); await web?.drop();
  await source?.cleanup();
});

describe('actual bot sender and website receiver over loopback HTTP + real PostgreSQL', () => {
  it('delivers an immutable outbox event and commits its receipt before ACK without creating a web session', async () => {
    const worker = service();
    const message = await worker.observe(member());
    await worker.tick();
    expect(acknowledgements).toEqual([204]);
    expect(await rows()).toMatchObject([{ status: 'delivered', event: message }]);
    expect(await readMembership(web.db, guildId, userId)).toMatchObject({ state: 'unknown', roleIds: [], authorizationGeneration: 1n });
    expect((await web.pool.query('select count(*)::int as count from auth_session')).rows[0].count).toBe(0);
  });
  it('recovers a lost ACK using the same event after sender/receiver reconstruction and signing-key rotation', async () => {
    const worker = service('previous');
    const message = await worker.observe(member());
    delivery = 'drop-ack'; await worker.tick();
    expect(await rows()).toMatchObject([{ status: 'pending', event: message }]);
    const reconstructed = createDb(web.url);
    receiverDb = reconstructed.db;
    try {
      clock = new Date(clock.getTime() + 5000); delivery = 'normal';
      await service('current').tick();
      expect(acknowledgements).toEqual([204, 409]);
      expect(await rows()).toMatchObject([{ status: 'delivered', event: message }]);
      expect(bodies).toEqual([message, message]);
      expect(await readMembership(receiverDb, guildId, userId)).toMatchObject({ authorizationGeneration: 1n });
    } finally { receiverDb = web.db; await reconstructed.close(); }
  });
  it('recovers an expired outbox lease after receiver commit and sender crash before completing the lease', async () => {
    const message = await service().observe(member());
    await store().claimOutbox(clock, 1);
    const signed = bot.signEvent(message, { url, keyId: 'current', secret, now: clock });
    expect((await fetch(url, { method: 'POST', ...signed })).status).toBe(204);
    expect(await rows()).toMatchObject([{ status: 'leased' }]);
    clock = new Date(clock.getTime() + 121_000);
    await service().tick();
    expect(await rows()).toMatchObject([{ status: 'delivered', event: message }]);
    expect(await readMembership(web.db, guildId, userId)).toMatchObject({ authorizationGeneration: 1n });
  });
  it('acknowledges reordered old events as stale while a permanent departure tombstone survives retries', async () => {
    const worker = service();
    await worker.observe(member());
    const departure = await worker.depart(userId);
    const signed = bot.signEvent(departure, { url, keyId: 'current', secret, now: clock });
    expect((await fetch(url, { method: 'POST', ...signed })).status).toBe(204);
    await worker.tick();
    expect(acknowledgements).toEqual([204, 409, 409]);
    expect((await rows()).every((row) => row.status === 'delivered')).toBe(true);
    expect(await readMembership(web.db, guildId, userId)).toMatchObject({ state: 'left', authorizationGeneration: 1n });
  });
  it('honors Retry-After without freshening observation time or creating another logical event', async () => {
    const worker = service();
    const message = await worker.observe(member());
    delivery = 'rate-limit'; await worker.tick();
    clock = new Date(clock.getTime() + 59_000); delivery = 'normal'; await worker.tick();
    expect(acknowledgements).toEqual([429]);
    clock = new Date(clock.getTime() + 1001); await worker.tick();
    expect(acknowledgements).toEqual([429, 204]);
    expect(bodies).toEqual([message, message]);
    expect(await rows()).toMatchObject([{ status: 'delivered', event: message }]);
  });
  it('reconciliation invalidates a missed departure without interpreting a provider outage as empty membership', async () => {
    const worker = service();
    await worker.observe(member()); await worker.tick();
    clock = new Date(clock.getTime() + 1000);
    const offline = service('current', { fetch: async () => { throw new Error('synthetic Discord REST outage'); } });
    expect(await offline.reconcile()).toEqual({ processed: 0, failed: 1 });
    expect(await rows()).toHaveLength(1);
    const reconciler = service('current', { fetch: async () => member('left') });
    expect(await reconciler.reconcile()).toEqual({ processed: 1, failed: 0 });
    await reconciler.tick();
    expect(await readMembership(web.db, guildId, userId)).toMatchObject({ state: 'left', roleIds: [] });
  });
  it('keeps an unacknowledged event for operator inspection after bounded receiver-outage retries', async () => {
    const worker = service();
    const message = await worker.observe(member());
    // Actual persistence failure inside the real HTTP receiver; no fake success response.
    await web.pool.query('alter table discord_role_sync_receipt rename to fixture_unavailable_receipt');
    try {
      for (let attempt = 0; attempt < 8; attempt++) {
        await worker.tick();
        clock = new Date(clock.getTime() + 4_000_000);
      }
      expect(acknowledgements).toEqual(Array.from({ length: 8 }, () => 503));
      expect(await rows()).toMatchObject([{ status: 'failed', last_code: 'ROLE_SYNC_ATTEMPTS_EXHAUSTED', event: message }]);
      expect((await web.pool.query('select count(*)::int as count from discord_role_sync_nonce')).rows[0].count).toBe(0);
      expect(await readMembership(web.db, guildId, userId)).toBeNull();
      await worker.tick();
      expect(acknowledgements).toHaveLength(8);
    } finally { await web.pool.query('alter table fixture_unavailable_receipt rename to discord_role_sync_receipt'); }
  });
});
