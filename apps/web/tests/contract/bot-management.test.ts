import { resolve } from 'node:path';
import type { Server } from 'node:http';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureTestActors } from '@/fixtures/test-actors';
import { recordAudit } from '@/modules/audit/audit';
import { ManagementClient, type ManagementConfig } from '@/modules/bot-management/client';
import { handleBotRequest, type BotDependencies } from '@/modules/bot-management/handler';
import type { BotSettings } from '@/modules/bot-management/contracts';
import { createTestDatabase, type TestDatabase } from '../support/test-db';
import { loadBotSource } from '../support/bot-source';

const base = new URL(process.env.DATABASE_URL ?? 'invalid');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || !/test/.test(base.pathname)) throw new Error('Joint tests require an explicit disposable loopback test database.');
type Store = { initialize(): Promise<void>; readSettings(): Promise<BotSettings['desired']> };
type BotApi = { migrate(pool: pg.Pool, directory: string): Promise<void>; createManagementServer(options: Record<string, unknown>): Server; closeManagementServer(server: Server): Promise<void>; PostgresManagementStore: new (pool: pg.Pool, config: Record<string, unknown>) => Store };
let source: Awaited<ReturnType<typeof loadBotSource<BotApi>>>;
let t: TestDatabase, pool: pg.Pool, server: Server, closeServer: (server: Server) => Promise<void>, open: () => Promise<void>, deps: BotDependencies, clientConfig: ManagementConfig;
let store: Store;
let effective: BotSettings['effective'];
let grant = true, staleMember = false, observedOld = false, failApply = false, reads = 0, revokeOnRead = Infinity;
const guildId = '100000000000000001', actorId = '300000000000000004', roleId = '200000000000000004', secret = 'joint-contract-synthetic-secret-0000000000';
const initial = { revision: '0', settings: { defaultLocale: 'cs' as const, serverLabels: { primary: 'Original' } } };
const update = { expectedRevision: '0', settings: { defaultLocale: 'en', serverLabels: { primary: 'Valkyria test' } }, reason: 'Synthetic contract test' };
const request = (body = update) => new Request('https://website.invalid/api/admin/bot', { method: 'PATCH', headers: { Origin: 'https://website.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

beforeAll(async () => {
  t = await createTestDatabase();
  pool = new pg.Pool({ connectionString: t.url, options: '-c search_path=bot_contract', max: 6 });
  await pool.query('CREATE SCHEMA bot_contract');
  source = await loadBotSource<BotApi>({ migrate: 'src/persistence/migrations.ts', createManagementServer: 'src/management/server.ts', closeManagementServer: 'src/management/server.ts', PostgresManagementStore: 'src/management/store.ts' });
  const management = source.api;
  await management.migrate(pool, resolve(source.sourceDirectory, 'migrations'));
  const config = { guildId, applicationId: '100000000000000099', defaultLocale: 'cs', websiteUrl: 'https://website.invalid', servers: [{ id: 'primary', label: 'Original', baseUrl: 'https://private-provider.invalid', tokenEnv: 'PRIVATE_GAME_TOKEN', grants: {} }], roleSync: { enabled: false, url: 'https://website.invalid/api/integrations/discord/role-sync', keyId: 'roles', secretEnv: 'PRIVATE_ROLE_KEY', reconcileSeconds: 60 } };
  store = new management.PostgresManagementStore(pool, config);
  closeServer = management.closeManagementServer;
  const actors = await ensureTestActors(t.db);
  deps = { origin: 'https://website.invalid', identity: async () => ({ actor: actors.administrator, discordUserId: actorId }), audit: (event) => recordAudit(t.db, event), client: null };
  open = async () => {
    server = management.createManagementServer({ pool, botConfig: config, config: { keys: { website: { secret, scopes: ['bot.read', 'bot.configure'] } }, grants: { 'bot.read': [roleId], 'bot.configure': [roleId] } },
      members: { fetch: async () => { reads++; return { guildId, userId: actorId, state: 'present', roleIds: grant && reads < revokeOnRead ? [roleId] : [], observedAt: new Date(Date.now() - (staleMember ? 61000 : 0)).toISOString() }; } },
      getRuntime: () => ({ build: { version: '1.0.0', revision: 'a'.repeat(40) }, startedAt: new Date().toISOString(), observedAt: new Date(Date.now() - (observedOld ? 31000 : 0)).toISOString(), discord: 'connected', database: 'available', lease: 'held', effective }),
      applySettings: (value: BotSettings['desired']) => { if (failApply) throw new Error('PRIVATE_APPLY_ERROR'); effective = value; }, requestTimeoutMs: 2000, rateLimitPerMinute: 600,
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    clientConfig = { origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`, keyId: 'website', secret, guildId };
    deps.client = new ManagementClient(clientConfig);
  };
  await open();
});
beforeEach(async () => {
  grant = true; staleMember = false; observedOld = false; failApply = false; reads = 0; revokeOnRead = Infinity; effective = structuredClone(initial);
  await pool.query('TRUNCATE management_settings, management_replay, management_audit, role_outbox');
  await store.initialize();
});
afterAll(async () => { if (server) await closeServer(server); if (pool) await pool.end(); if (t) await t.drop(); if (source) await source.cleanup(); });

describe('web handler → signed client → production bot handler → PostgreSQL', () => {
  it('returns strict status/settings DTOs without endpoints/secrets and keeps role delivery disabled', async () => {
    const response = await handleBotRequest(new Request('https://website.invalid/api/admin/bot'), deps);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toMatch(/PRIVATE_|private-provider|joint-contract-synthetic/);
    expect(JSON.parse(body).view.status).toMatchObject({ runtime: { state: 'healthy' }, roleSync: { enabled: false, state: 'disabled', pending: 0, failed: 0, lastDeliveredAt: null } });
    observedOld = true;
    expect((await deps.client!.status(actorId)).runtime.state).toBe('stale');
  });
  it('interoperates with the bot verifier and persists desired/effective settings and independent web/bot audit', async () => {
    expect((await handleBotRequest(request(), deps)).status).toBe(200);
    expect(await store.readSettings()).toMatchObject({ revision: '1', settings: update.settings });
    expect((await pool.query("SELECT count(*)::int n FROM management_audit WHERE code='MANAGEMENT_SETTINGS_UPDATED'")).rows[0].n).toBe(1);
    expect((await t.pool.query("SELECT count(*)::int n FROM audit_event WHERE action='bot.settings.accepted'")).rows[0].n).toBeGreaterThan(0);
    await closeServer(server); await store.initialize(); effective = await store.readSettings(); await open();
    expect(await deps.client!.settings(actorId)).toMatchObject({ desired: { revision: '1' }, effective: { revision: '1' }, applyState: 'applied' });
  });
  it('returns one success and one conflict for concurrent updates at the same revision', async () => {
    const results = await Promise.all([handleBotRequest(request(), deps), handleBotRequest(request(), deps)]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
    expect((await store.readSettings()).revision).toBe('1');
  });
  it('denies wrong service key, wrong guild, revoked and stale actor with no mutation', async () => {
    await expect(new ManagementClient({ ...clientConfig, secret: 'wrong-synthetic-secret-000000000000000' }).settings(actorId)).rejects.toMatchObject({ code: 'unavailable' });
    await expect(new ManagementClient({ ...clientConfig, guildId: '100000000000000002' }).settings(actorId)).rejects.toMatchObject({ code: 'forbidden' });
    grant = false; expect((await handleBotRequest(request(), deps)).status).toBe(403);
    grant = true; staleMember = true; expect((await handleBotRequest(request(), deps)).status).toBe(403);
    expect((await store.readSettings()).revision).toBe('0');
  });
  it('reauthorizes after row locking, so revocation before application cannot save', async () => {
    revokeOnRead = 2;
    expect((await handleBotRequest(request(), deps)).status).toBe(403);
    expect((await store.readSettings()).revision).toBe('0');
  });
  it('does not send when the actual web audit table fails', async () => {
    await t.pool.query('ALTER TABLE audit_event RENAME TO audit_event_unavailable');
    try { expect((await handleBotRequest(request(), deps)).status).toBe(503); expect(reads).toBe(0); expect((await store.readSettings()).revision).toBe('0'); }
    finally { await t.pool.query('ALTER TABLE audit_event_unavailable RENAME TO audit_event'); }
  });
  it('bot audit failure rolls back settings; client reports uncertainty until a fresh read', async () => {
    await pool.query('ALTER TABLE management_audit RENAME TO management_audit_unavailable');
    try { const response = await handleBotRequest(request(), deps); expect(await response.json()).toMatchObject({ ok: false, code: 'unknown_outcome' }); expect((await store.readSettings()).revision).toBe('0'); }
    finally { await pool.query('ALTER TABLE management_audit_unavailable RENAME TO management_audit'); }
    expect((await deps.client!.settings(actorId)).desired.revision).toBe('0');
  });
  it('records actual apply failure instead of inferring success from a stored revision', async () => {
    failApply = true;
    const response = await handleBotRequest(request(), deps);
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ ok: true, settings: { desired: { revision: '1' }, effective: { revision: '0' }, applyState: 'error' } });
  });
  it('a dropped response after COMMIT is unknown and reconciled without a second PATCH', async () => {
    let writes = 0;
    const transport: typeof fetch = async (url, init) => { const response = await fetch(url, init); if (init?.method === 'PATCH') { writes++; await response.arrayBuffer(); throw new Error('lost response'); } return response; };
    const response = await handleBotRequest(request(), { ...deps, client: new ManagementClient(clientConfig, transport) });
    expect(await response.json()).toEqual({ ok: false, code: 'unknown_outcome' });
    expect((await deps.client!.settings(actorId)).desired.revision).toBe('1'); expect(writes).toBe(1);
  });
});
