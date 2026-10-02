import { createHash, createHmac, randomUUID } from 'node:crypto';
import { logiInbox, logiMembership, logiProjection } from '@valkyria/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LogiIntegrationEnv } from '@/modules/integrations/logi-config';
import { markLogiHintsProcessed, receiveLogiWebhook } from '@/modules/integrations/logi-webhook';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let database: TestDatabase;
const NOW = new Date('2026-10-02T12:00:00Z');
const SECRET = 'synthetic-webhook-signing-secret-0123456789';
const SOURCE = 'synthetic-logi';
const GUILD = '100000000000000001';
const config = { sourceInstanceId: SOURCE, origin: 'https://logi.example.test', guildId: GUILD, gameId: 'wardogs' };
const env: LogiIntegrationEnv = { LOGI_SOURCES_JSON: JSON.stringify([config]), LOGI_DATA_API_KEY_WDG: 'synthetic-data-key-0123456789', LOGI_WEBHOOK_ENABLED: true, LOGI_WEBHOOK_SIGNING_SECRETS_JSON: JSON.stringify({ [SOURCE]: SECRET }) };
const envelope = (overrides: Record<string, unknown> = {}) => ({ type: 'integration.changed', guildId: GUILD, createdAt: NOW.toISOString(), resource: { id: 'match-1', guildId: GUILD, gameId: 'wardogs', resource: 'event-summaries', revision: '9007199254740993', operation: 'upsert' }, ...overrides });
function request(body = JSON.stringify(envelope()), headers: Record<string, string> = {}, signingSecret = SECRET) {
  const timestamp = headers['x-logi-timestamp'] ?? String(NOW.getTime() / 1_000);
  return new Request(`https://valkyria.example.test/api/integrations/logi/${SOURCE}/webhook`, { method: 'POST', body, headers: {
    'content-type': 'application/json', 'x-logi-event': 'integration.changed', 'x-logi-delivery': 'convex-delivery-1', 'x-logi-timestamp': timestamp,
    'x-logi-signature': `sha256=${createHmac('sha256', signingSecret).update(`${timestamp}.${body}`).digest('hex')}`, ...headers,
  } });
}
const receive = (req = request(), configuration = env, sourceId = SOURCE) => receiveLogiWebhook(database.db, configuration, sourceId, req, { now: () => NOW });

beforeAll(async () => { database = await createTestDatabase(); });
afterAll(async () => { await database.drop(); });
beforeEach(async () => { await database.db.delete(logiInbox); });

describe('authenticated Logi webhook inbox in real PostgreSQL', () => {
  it('accepts the actual producer envelope without an ID and persists only an invalidation hint', async () => {
    const raw = JSON.stringify(envelope());
    const response = await receive(request(raw));
    expect(response.status).toBe(202);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const hash = createHash('sha256').update(raw).digest('hex');
    expect(await database.db.select().from(logiInbox)).toEqual([{ sourceInstanceId: SOURCE, guildId: GUILD, deliveryId: `body:${hash}`, eventType: 'integration.changed', bodyHash: hash, receivedAt: NOW, processedAt: null }]);
    expect(await database.db.select().from(logiProjection)).toEqual([]);
    expect(await database.db.select().from(logiMembership)).toEqual([]);
  });

  it('uses the signed legacy event ID and ignores the different unsigned delivery identity', async () => {
    const id = randomUUID();
    const raw = JSON.stringify(envelope({ id, type: 'event.updated', resource: { id: 'match-1', serverPassword: 'synthetic-private-value' } }));
    expect((await receive(request(raw, { 'x-logi-event': 'event.updated' }))).status).toBe(202);
    expect((await receive(request(raw, { 'x-logi-event': 'event.updated', 'x-logi-delivery': 'different-attempt', 'x-logi-timestamp': String(NOW.getTime() / 1_000 - 20) }))).status).toBe(204);
    const rows = await database.db.select().from(logiInbox);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deliveryId).toBe(`event:${id}`);
    expect(JSON.stringify(rows)).not.toContain('synthetic-private-value');
  });

  it('deduplicates concurrent deliveries durably across new handler calls', async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => receive(request())));
    expect(responses.filter((response) => response.status === 202)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 204)).toHaveLength(7);
    expect((await receive(request())).status).toBe(204);
    expect(await database.db.select().from(logiInbox)).toHaveLength(1);
  });

  it('rejects a signed replay with the same event ID and changed body without overwriting', async () => {
    const id = randomUUID();
    const first = JSON.stringify(envelope({ id }));
    expect((await receive(request(first))).status).toBe(202);
    expect((await receive(request(JSON.stringify(envelope({ id, createdAt: '2026-10-02T11:59:00Z' }))))).status).toBe(409);
    expect((await database.db.select().from(logiInbox))[0]!.bodyHash).toBe(createHash('sha256').update(first).digest('hex'));
  });

  it('rejects invalid secrets, tampered exact bytes and duplicated signature headers', async () => {
    const raw = JSON.stringify(envelope());
    const valid = request(raw);
    for (const req of [request(raw, {}, 'different-synthetic-secret'), request(`${raw}\n`, { 'x-logi-signature': valid.headers.get('x-logi-signature')! }), request(raw, { 'x-logi-signature': `${valid.headers.get('x-logi-signature')}, ${valid.headers.get('x-logi-signature')}` })]) {
      expect((await receive(req)).status).toBe(401);
    }
    expect(await database.db.select().from(logiInbox)).toEqual([]);
  });

  it('rejects old, future, millisecond and duplicated timestamps before storing anything', async () => {
    for (const timestamp of [String(NOW.getTime() / 1_000 - 301), String(NOW.getTime() / 1_000 + 31), String(NOW.getTime()), '1790942400, 1790942400']) {
      expect((await receive(request(undefined, { 'x-logi-timestamp': timestamp }))).status).toBe(401);
    }
    expect(await database.db.select().from(logiInbox)).toEqual([]);
  });

  it('rejects event-header mismatch, unsupported events and malformed JSON after signature verification', async () => {
    for (const req of [request(undefined, { 'x-logi-event': 'event.updated' }), request(JSON.stringify(envelope({ type: 'admin.promote' })), { 'x-logi-event': 'admin.promote' }), request('{')]) {
      expect((await receive(req)).status).toBe(400);
    }
    expect(await database.db.select().from(logiInbox)).toEqual([]);
  });

  it('binds the signed tenant and integration game to configured sources', async () => {
    for (const change of [envelope({ guildId: '100000000000000099' }), envelope({ resource: { ...envelope().resource, guildId: '100000000000000099' } }), envelope({ resource: { ...envelope().resource, gameId: 'hell_let_loose' } })]) {
      expect((await receive(request(JSON.stringify(change)))).status).toBe(403);
    }
    expect(await database.db.select().from(logiInbox)).toEqual([]);
  });

  it('accepts membership invalidation without granting roles or copying payload fields', async () => {
    const value = envelope({ type: 'membership.changed', resource: { ...envelope().resource, id: '200000000000000001', resource: 'membership-summaries' } });
    expect((await receive(request(JSON.stringify(value), { 'x-logi-event': 'membership.changed' }))).status).toBe(202);
    expect(await database.db.select().from(logiMembership)).toEqual([]);
  });

  it('is disabled by default, pins the source, rejects ambiguous groups and distinct-secret violations', async () => {
    expect((await receive(request(), { ...env, LOGI_WEBHOOK_ENABLED: false })).status).toBe(404);
    expect((await receive(request(), env, 'https://attacker.example.test')).status).toBe(404);
    expect((await receive(request(), env, 'unknown-source')).status).toBe(404);
    for (const invalid of [
      { ...env, LOGI_WEBHOOK_SIGNING_SECRETS_JSON: '{}' },
      { ...env, LOGI_WEBHOOK_SIGNING_SECRETS_JSON: '{' },
      { ...env, LOGI_DATA_API_KEY_WDG: SECRET },
      { ...env, LOGI_SOURCES_JSON: JSON.stringify([config, { ...config, gameId: 'hell_let_loose', guildId: '100000000000000099' }]), LOGI_DATA_API_KEY_HLL: 'synthetic-hll-data-key-0123456789' },
    ]) expect((await receive(request(), invalid)).status).toBe(503);
    expect(await database.db.select().from(logiInbox)).toEqual([]);
  });

  it('allows one configured instance/guild to notify both configured games', async () => {
    const both = { ...env, LOGI_SOURCES_JSON: JSON.stringify([config, { ...config, gameId: 'hell_let_loose' }]), LOGI_DATA_API_KEY_HLL: 'synthetic-hll-data-key-0123456789' };
    const value = envelope({ resource: { ...envelope().resource, gameId: 'hell_let_loose' } });
    expect((await receive(request(JSON.stringify(value)), both)).status).toBe(202);
  });

  it('bounds declared and streamed bodies, rejects encoding and enforces a body deadline', async () => {
    expect((await receive(request(undefined, { 'content-length': '65537' }))).status).toBe(413);
    expect((await receive(request(' '.repeat(65_537)))).status).toBe(413);
    expect((await receive(request(undefined, { 'content-encoding': 'gzip' }))).status).toBe(415);
    const hanging = new Request('https://valkyria.example.test/webhook', { method: 'POST', headers: request().headers, body: new ReadableStream(), duplex: 'half' } as RequestInit);
    expect((await receive(hanging)).status).toBe(408);
    expect(await database.db.select().from(logiInbox)).toEqual([]);
  });

  it('returns retryable failure when the real database rejects persistence', async () => {
    await database.db.execute(sql`create function webhook_test_reject() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$`);
    await database.db.execute(sql`create trigger webhook_test_reject before insert on logi_inbox for each row execute function webhook_test_reject()`);
    try {
      const response = await receive(request());
      expect(response.status).toBe(503);
      expect(response.headers.get('retry-after')).toBe('30');
      expect(await response.text()).not.toContain('synthetic failure');
    } finally {
      await database.db.execute(sql`drop trigger webhook_test_reject on logi_inbox`);
      await database.db.execute(sql`drop function webhook_test_reject()`);
    }
    expect(await database.db.select().from(logiInbox)).toEqual([]);
  });

  it('acknowledges only the bounded pending hints captured before a completed pull started', async () => {
    const before = new Date(NOW.getTime() - 1_000);
    await database.db.insert(logiInbox).values(Array.from({ length: 501 }, (_, index) => ({ sourceInstanceId: SOURCE, guildId: GUILD, deliveryId: `event-${index}`, eventType: 'integration.changed', bodyHash: 'a'.repeat(64), receivedAt: before })));
    await database.db.insert(logiInbox).values([
      { sourceInstanceId: SOURCE, guildId: GUILD, deliveryId: 'arrived-during-pull', eventType: 'integration.changed', bodyHash: 'b'.repeat(64), receivedAt: new Date(NOW.getTime() + 1) },
      { sourceInstanceId: 'other-source', guildId: GUILD, deliveryId: 'other', eventType: 'integration.changed', bodyHash: 'c'.repeat(64), receivedAt: before },
    ]);
    expect(await markLogiHintsProcessed(database.db, SOURCE, GUILD, NOW)).toBe(500);
    expect(await database.db.select().from(logiInbox).where(isNull(logiInbox.processedAt))).toHaveLength(3);
    expect(await markLogiHintsProcessed(database.db, SOURCE, GUILD, NOW)).toBe(1);
    expect(await database.db.select().from(logiInbox).where(and(eq(logiInbox.sourceInstanceId, SOURCE), isNull(logiInbox.processedAt)))).toMatchObject([{ deliveryId: 'arrived-during-pull' }]);
  });
});
