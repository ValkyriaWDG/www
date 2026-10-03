import { logiCommand, logiInbox, logiProjection, logiSyncScope } from '@valkyria/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureTestActors, type TestActors } from '@/fixtures/test-actors';
import { AccessDeniedError } from '@/modules/access/types';
import { getIntegrationHealthForAdmin, type IntegrationAdminEnv } from '@/modules/integrations/admin-health';
import { configuredLogiSources } from '@/modules/integrations/logi-config';
import fixtures from '@/modules/integrations/logi/fixtures/v0.5.json';
import type { ServerOverview } from '@/modules/integrations/servers/provider';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let database: TestDatabase;
let actors: TestActors;
const now = new Date('2026-10-03T12:00:00Z');
const minutes = (value: number) => new Date(now.getTime() + value * 60_000);

const HLL_KEY = 'synthetic-hll-data-key-0123456789';
const WDG_KEY = 'synthetic-wdg-data-key-0123456789';
const PEOPLE_KEY = 'synthetic-wdg-people-key-0123456789';
const MEMBERSHIP_KEY = 'synthetic-hll-membership-key-0123456789';
const CRCON_BASE = 'https://crcon-private.example.invalid';
const LOGI_ORIGIN = 'https://logi.example.test';
const sources = [
  { sourceInstanceId: 'primary-logi', origin: LOGI_ORIGIN, guildId: '100000000000000001', gameId: 'hell_let_loose', publishMatches: true },
  { sourceInstanceId: 'primary-logi', origin: LOGI_ORIGIN, guildId: '100000000000000001', gameId: 'wardogs', syncPeople: true, publicServers: [
    { connectionId: 'fixture-connection-1', publicId: 'community-one', name: 'Community one', published: true, address: 'play.example.invalid:27015', statsUrl: null },
    { connectionId: 'fixture-connection-2', publicId: 'community-two', name: 'Community two', published: false, address: null, statsUrl: 'https://stats.example.invalid/' },
  ] },
];
const env: IntegrationAdminEnv = {
  NODE_ENV: 'test',
  LOGI_SOURCES_JSON: JSON.stringify(sources),
  LOGI_DATA_API_KEY_HLL: HLL_KEY,
  LOGI_DATA_API_KEY_WDG: WDG_KEY,
  LOGI_PEOPLE_API_KEY_WDG: PEOPLE_KEY,
  LOGI_MEMBERSHIP_API_KEY_HLL: MEMBERSHIP_KEY,
  LOGI_MEMBERSHIP_SOURCE: 'logi',
  LOGI_EVENT_WRITE_ENABLED: false,
  LOGI_WEBHOOK_ENABLED: true,
  LOGI_SSO_ENABLED: true,
  LOGI_ISSUER_URL: LOGI_ORIGIN,
  LOGI_CLIENT_ID: 'synthetic-client',
  LOGI_CLIENT_SECRET: 'synthetic-client-secret-0123456789',
  LOGI_GUILD_ID: '100000000000000001',
  SERVER_STATUS_SOURCE: 'crcon',
  SERVER_STATUS_SOURCE_WDG: 'logi',
  HLL_SERVER_SOURCES_JSON: JSON.stringify([{ publicId: 'valkyria-1', name: 'Valkyria #1', baseUrl: CRCON_BASE, address: 'one.example.invalid:7777', statsApiKey: 'crcon-stats-key-0123456789' }]),
  DISCORD_ROLE_MAPPING_JSON: JSON.stringify({ '200000000000000001': ['member'], '200000000000000004': ['administrator'] }),
  DISCORD_GUILD_ID: '100000000000000001',
  DISCORD_BOT_TOKEN: 'synthetic-bot-token',
};
const overviews: Record<'hll' | 'wardogs', ServerOverview> = {
  hll: { state: 'ok', synthetic: false, partial: false, attemptedAt: now.toISOString(), servers: [{ ref: { source: 'crcon', sourceInstanceId: 'configured', guildId: null, game: 'hll', kind: 'server', externalId: 'valkyria-1' }, publicId: 'valkyria-1', name: 'Valkyria #1', reachability: 'online', map: 'Carentan', mode: 'Warfare', players: 80, capacity: 100, nextMap: null, timeRemainingSeconds: null, score: null, teams: null, observedAt: now.toISOString(), freshness: 'fresh', connect: { kind: 'address', address: 'one.example.invalid:7777' }, statsUrl: null }] },
  wardogs: { state: 'unavailable', attemptedAt: now.toISOString(), servers: [] },
};
const readOverview = async (game: 'hll' | 'wardogs') => overviews[game];

beforeAll(async () => {
  database = await createTestDatabase();
  actors = await ensureTestActors(database.db);
});
afterAll(async () => { await database.drop(); });
beforeEach(async () => {
  await database.db.delete(logiSyncScope);
  await database.db.delete(logiInbox);
  await database.db.delete(logiCommand);
});

function scopeFor(game: 'hell_let_loose' | 'wardogs', purpose: 'data' | 'people') {
  return configuredLogiSources(env, purpose).find((source) => source.gameId === game)!;
}

describe('integration health for administrators', () => {
  it('denies editors, match managers, members and anonymous visitors before any read', async () => {
    for (const actor of [actors.editor, actors.matchManager, actors.member, actors.anonymous]) {
      await expect(getIntegrationHealthForAdmin(database.db, actor, env, now, { overview: readOverview })).rejects.toBeInstanceOf(AccessDeniedError);
    }
    await expect(getIntegrationHealthForAdmin(database.db, { ...actors.administrator, status: 'stale' }, env, now, { overview: readOverview })).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it('reports configured sources that never ran, with producer health unknown rather than successful', async () => {
    const dto = await getIntegrationHealthForAdmin(database.db, actors.administrator, env, now, { overview: readOverview });
    expect(dto.logi.sso).toEqual({ enabled: true, configured: true, discordFallback: false });
    expect(dto.logi.membershipSource).toBe('logi');
    expect(dto.logi.sources.map((source) => [source.game, source.originHost, source.publicServers, source.publishedServers])).toEqual([['hll', 'logi.example.test', 0, 0], ['wardogs', 'logi.example.test', 2, 1]]);
    const hll = dto.logi.sources[0]!;
    expect(hll.purposes.map((purpose) => [purpose.purpose, purpose.enabled, purpose.configured, purpose.state, purpose.health])).toEqual([
      ['data', true, true, 'never_ran', null],
      ['people', false, false, 'not_configured', null],
      ['membership', true, true, 'configured', null],
      ['commands', false, false, 'not_configured', null],
    ]);
    const wardogs = dto.logi.sources[1]!;
    expect(wardogs.purposes.find((purpose) => purpose.purpose === 'people')).toMatchObject({ enabled: true, configured: true, state: 'never_ran' });
    expect(wardogs.purposes.find((purpose) => purpose.purpose === 'membership')).toMatchObject({ enabled: true, configured: false, state: 'not_configured' });
    expect(dto.logi.webhooks).toEqual({ enabled: true, pendingHints: 0, lastReceivedAt: null, lastProcessedAt: null });
    expect(dto.logi.commands).toEqual({ enabled: false, pending: 0, lastReceiptAt: null });
    expect(dto.discord).toEqual({ guildConfigured: true, roleMappingConfigured: true, mappedRoles: 2, roleMappingError: null, membershipSource: 'logi' });
  });

  it('derives fresh, stale, error and lease states from the stored checkpoints and surfaces producer health', async () => {
    const hllData = scopeFor('hell_let_loose', 'data');
    const wdgData = scopeFor('wardogs', 'data');
    const wdgPeople = scopeFor('wardogs', 'people');
    await database.db.insert(logiSyncScope).values([
      { scopeKey: hllData.scopeKey, sourceInstanceId: hllData.sourceInstanceId, guildId: hllData.guildId, gameId: hllData.gameId, checkpoint: { version: 3, mode: 'live', generation: null, resourceIndex: 0, listCursor: null, boundaryCursor: 'b', cursor: 'c' }, version: 3, activeGeneration: 'gen-1', lastAttemptAt: minutes(-1), lastSuccessAt: minutes(-1), leaseToken: 'lease', leaseExpiresAt: minutes(1) },
      { scopeKey: wdgData.scopeKey, sourceInstanceId: wdgData.sourceInstanceId, guildId: wdgData.guildId, gameId: wdgData.gameId, checkpoint: { version: 2, mode: 'live', generation: null, resourceIndex: 0, listCursor: null, boundaryCursor: 'b', cursor: 'c' }, version: 2, activeGeneration: 'gen-9', lastAttemptAt: minutes(-20), lastSuccessAt: minutes(-20), leaseExpiresAt: minutes(-19) },
      { scopeKey: wdgPeople.scopeKey, sourceInstanceId: wdgPeople.sourceInstanceId, guildId: wdgPeople.guildId, gameId: wdgPeople.gameId, checkpoint: { version: 1, mode: 'bootstrap', generation: 'shadow', resourceIndex: 1, listCursor: null, boundaryCursor: 'b', cursor: 'c' }, version: 1, lastAttemptAt: minutes(-2), lastSuccessAt: minutes(-3), nextAttemptAt: minutes(5), errorCode: 'unauthorized' },
    ]);
    const health = fixtures.health.data.map((row) => ({ ...row, guildId: hllData.guildId, gameId: 'hell_let_loose' as const }));
    await database.db.insert(logiProjection).values([
      { scopeKey: hllData.scopeKey, generation: 'gen-1', resource: 'integration-health', externalId: health[0]!.id, revision: '1', operation: 'upsert', data: health[0]!, observedAt: minutes(-1) },
      { scopeKey: hllData.scopeKey, generation: 'gen-1', resource: 'integration-health', externalId: 'removed', revision: '2', operation: 'remove', data: null, observedAt: minutes(-1) },
      { scopeKey: hllData.scopeKey, generation: 'gen-0', resource: 'integration-health', externalId: 'old-generation', revision: '1', operation: 'upsert', data: { ...health[1]!, id: 'old-generation' }, observedAt: minutes(-60) },
    ]);
    await database.db.insert(logiInbox).values([
      { sourceInstanceId: 'primary-logi', guildId: hllData.guildId, deliveryId: 'd1', receivedAt: minutes(-10), eventType: 'event.updated', bodyHash: 'h1', processedAt: minutes(-9) },
      { sourceInstanceId: 'primary-logi', guildId: hllData.guildId, deliveryId: 'd2', receivedAt: minutes(-4), eventType: 'event.updated', bodyHash: 'h2', processedAt: null },
      { sourceInstanceId: 'primary-logi', guildId: hllData.guildId, deliveryId: 'd3', receivedAt: minutes(-3), eventType: 'webhook.test', bodyHash: 'h3', processedAt: null },
    ]);
    await database.db.insert(logiCommand).values([
      { id: '0f000000-0000-4000-8000-0000000000c1', userId: actors.administrator.userId, scopeKey: 'command-scope', sourceInstanceId: 'primary-logi', guildId: hllData.guildId, gameId: 'hell_let_loose', bodyHash: 'b1', body: { op: 'create' }, state: 'confirmed', receipt: { id: 'event-1' }, updatedAt: minutes(-30) },
      { id: '0f000000-0000-4000-8000-0000000000c2', userId: actors.administrator.userId, scopeKey: 'command-scope', sourceInstanceId: 'primary-logi', guildId: hllData.guildId, gameId: 'hell_let_loose', bodyHash: 'b2', body: { op: 'update' }, state: 'pending', updatedAt: minutes(-1) },
    ]);

    const dto = await getIntegrationHealthForAdmin(database.db, actors.administrator, { ...env, LOGI_EVENT_WRITE_ENABLED: true, LOGI_EVENT_API_KEY_HLL: 'synthetic-hll-event-key-0123456789' }, now, { overview: readOverview });
    const [hll, wardogs] = dto.logi.sources;
    const data = hll!.purposes.find((purpose) => purpose.purpose === 'data')!;
    expect(data).toMatchObject({ state: 'healthy', scope: { mode: 'live', hasActiveGeneration: true, leaseActive: true, freshness: 'fresh', errorCode: null, lastSuccessAt: minutes(-1).toISOString() } });
    expect(data.health).toEqual([{ connectionId: 'fixture-connection-0', provider: 'hll_crcon', enabled: true, capabilities: ['server_snapshot', 'match_history'], lastAttemptAt: health[0]!.lastAttemptAt, lastSuccessAt: health[0]!.lastSuccessAt, nextAttemptAt: health[0]!.nextAttemptAt, errorCategory: null, freshness: 'fresh', collectedSessions: 12 }]);
    expect(hll!.purposes.find((purpose) => purpose.purpose === 'commands')).toMatchObject({ enabled: true, configured: true, state: 'configured', scope: null });
    expect(wardogs!.purposes.find((purpose) => purpose.purpose === 'data')).toMatchObject({ state: 'stale', scope: { leaseActive: false, freshness: 'stale' }, health: [] });
    expect(wardogs!.purposes.find((purpose) => purpose.purpose === 'people')).toMatchObject({ state: 'unavailable', scope: { mode: 'bootstrap', hasActiveGeneration: false, errorCode: 'unauthorized', nextAttemptAt: minutes(5).toISOString(), freshness: 'fresh' } });
    expect(dto.logi.webhooks).toEqual({ enabled: true, pendingHints: 2, lastReceivedAt: minutes(-3).toISOString(), lastProcessedAt: minutes(-9).toISOString() });
    expect(dto.logi.commands).toEqual({ enabled: true, pending: 1, lastReceiptAt: minutes(-30).toISOString() });
  });

  it('marks a persisted failure as unavailable even after a recent success', async () => {
    const hllData = scopeFor('hell_let_loose', 'data');
    await database.db.insert(logiSyncScope).values({ scopeKey: hllData.scopeKey, sourceInstanceId: hllData.sourceInstanceId, guildId: hllData.guildId, gameId: hllData.gameId, version: 0, lastAttemptAt: minutes(-1), lastSuccessAt: minutes(-1), nextAttemptAt: minutes(1), errorCode: 'rate_limited' });
    const dto = await getIntegrationHealthForAdmin(database.db, actors.administrator, env, now, { overview: readOverview });
    expect(dto.logi.sources[0]!.purposes[0]).toMatchObject({ purpose: 'data', state: 'unavailable', scope: { errorCode: 'rate_limited', freshness: 'fresh' }, health: null });
  });

  it('describes server sources per game with identities only and sanitized overviews', async () => {
    const dto = await getIntegrationHealthForAdmin(database.db, actors.administrator, env, now, { overview: readOverview });
    expect(dto.servers).toEqual([
      { game: 'hll', source: 'crcon', configError: null, configured: [{ publicId: 'valkyria-1', name: 'Valkyria #1', published: true, hasAddress: true, hasStatsUrl: false, origin: 'crcon' }], overview: { state: 'ok', attemptedAt: now.toISOString(), synthetic: false, partial: false, servers: [{ publicId: 'valkyria-1', name: 'Valkyria #1', reachability: 'online', freshness: 'fresh', observedAt: now.toISOString(), players: 80, capacity: 100, map: 'Carentan' }] } },
      { game: 'wardogs', source: 'logi', configError: null, configured: [
        { publicId: 'community-one', name: 'Community one', published: true, hasAddress: true, hasStatsUrl: false, origin: 'logi' },
        { publicId: 'community-two', name: 'Community two', published: false, hasAddress: false, hasStatsUrl: true, origin: 'logi' },
      ], overview: { state: 'unavailable', attemptedAt: now.toISOString(), servers: [] } },
    ]);
    const broken = await getIntegrationHealthForAdmin(database.db, actors.administrator, { ...env, HLL_SERVER_SOURCES_JSON: '{not json', SERVER_STATUS_SOURCE_WDG: 'synthetic-fixture' }, now, { overview: async () => { throw new Error('provider exploded'); } });
    expect(broken.servers[0]).toMatchObject({ source: 'crcon', configError: 'invalid_json', configured: [], overview: { state: 'unavailable', servers: [] } });
    expect(broken.servers[1]).toMatchObject({ source: 'synthetic-fixture', configured: [{ publicId: 'synthetic-wardogs', origin: 'synthetic' }] });
    const invalidLogi = await getIntegrationHealthForAdmin(database.db, actors.administrator, { ...env, LOGI_SOURCES_JSON: '[{"bad": true}]', DISCORD_ROLE_MAPPING_JSON: '{"abc": ["owner"]}' }, now, { overview: readOverview });
    expect(invalidLogi.logi).toMatchObject({ configError: true, sources: [] });
    expect(invalidLogi.servers[1]).toMatchObject({ source: 'logi', configError: 'invalid_config', configured: [] });
    expect(invalidLogi.discord).toMatchObject({ roleMappingConfigured: false, mappedRoles: 0, roleMappingError: 'invalid_role_id' });
  });

  it('never serializes keys, secrets, base URLs, addresses or raw provider errors', async () => {
    const hllData = scopeFor('hell_let_loose', 'data');
    await database.db.insert(logiSyncScope).values({ scopeKey: hllData.scopeKey, sourceInstanceId: hllData.sourceInstanceId, guildId: hllData.guildId, gameId: hllData.gameId, version: 0, lastAttemptAt: minutes(-1), errorCode: 'upstream' });
    const dto = await getIntegrationHealthForAdmin(database.db, actors.administrator, env, now, { overview: readOverview });
    const json = JSON.stringify(dto);
    for (const secret of [HLL_KEY, WDG_KEY, PEOPLE_KEY, MEMBERSHIP_KEY, CRCON_BASE, LOGI_ORIGIN, 'https://', 'crcon-stats-key', 'synthetic-client-secret', 'synthetic-bot-token', 'one.example.invalid:7777', 'play.example.invalid', hllData.scopeKey, 'leaseToken']) {
      expect(json, secret).not.toContain(secret);
    }
    expect(JSON.parse(json)).toEqual(dto);
  });
});
