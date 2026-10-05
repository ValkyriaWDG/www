import { logiProjection, logiSyncScope } from '@valkyria/db';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { configuredLogiSources } from '@/modules/integrations/logi-config';
import { runLogiSync } from '@/modules/integrations/logi-runner';
import { readActiveLogiProjections } from '@/modules/integrations/logi-store';
import { LOGI_COLLECTION_RESOURCES, type LogiSyncRecord } from '@/modules/integrations/logi/contracts';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let database: TestDatabase;
beforeAll(async () => { database = await createTestDatabase(); });
afterAll(async () => { await database.drop(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('purpose-independent bounded Logi runner', () => {
  it('synchronizes people after a missing safe-data key without borrowing credentials', async () => {
    const env = { LOGI_SOURCES_JSON: JSON.stringify([{ sourceInstanceId: 'synthetic', guildId: '910000000000000001', gameId: 'wardogs', origin: 'https://logi.example.test', syncPeople: true }]), LOGI_PEOPLE_API_KEY_WDG: 'synthetic-people-key-123456' };
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
      const url = new URL(input);
      calls.push(url.pathname);
      expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${env.LOGI_PEOPLE_API_KEY_WDG}`);
      return Response.json(url.pathname.endsWith('/changes') ? { data: [], page: { nextCursor: 'synthetic-boundary', hasMore: false, limit: 10 } } : { data: [], page: { nextCursor: null, limit: 1 } });
    });
    expect(await runLogiSync(database.db, env)).toMatchObject([{ state: 'failed', error: 'configuration' }, { state: 'caught_up' }]);
    expect(calls).toContain('/api/v1/clan/member-summaries');
    expect(calls).not.toContain('/api/v1/clan/event-summaries');
    expect(await database.db.select().from(logiSyncScope)).toMatchObject([{ scopeKey: configuredLogiSources(env, 'people')[0]!.scopeKey, checkpoint: { mode: 'live', reconciledAt: expect.any(String) } }]);
  });

  it('resumes a persisted data replay through more than eight filtered pages and promotes only at the terminal cursor', async () => {
    const env = { LOGI_SOURCES_JSON: JSON.stringify([{ sourceInstanceId: 'synthetic-data-replay', guildId: '910000000000000002', gameId: 'wardogs', origin: 'https://logi.example.test' }]), LOGI_DATA_API_KEY_WDG: 'synthetic-data-key-123456' };
    const source = configuredLogiSources(env, 'data')[0]!;
    await database.db.insert(logiSyncScope).values({
      scopeKey: source.scopeKey, sourceInstanceId: source.sourceInstanceId, guildId: source.guildId, gameId: source.gameId, version: 1,
      checkpoint: { version: 1, mode: 'replay', generation: 'persisted-shadow', resourceIndex: 5, listCursor: null, boundaryCursor: 'scan-0', cursor: 'scan-0', bootstrapStartedAt: new Date().toISOString() },
    });
    let pages = 0;
    vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
      const url = new URL(input);
      expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${env.LOGI_DATA_API_KEY_WDG}`);
      expect(url.pathname).toBe('/api/v1/clan/changes');
      expect(url.searchParams.has('start')).toBe(false);
      const offset = Number(url.searchParams.get('cursor')!.slice(5));
      const limit = Number(url.searchParams.get('limit'));
      const end = Math.min(offset + limit, 2100);
      pages++;
      return Response.json({ data: [], page: { nextCursor: `scan-${end}`, hasMore: end < 2100, limit } });
    });
    expect(await runLogiSync(database.db, env)).toMatchObject([{ state: 'caught_up', records: 0 }]);
    expect(pages).toBeGreaterThan(8);
    expect(pages).toBeLessThanOrEqual(25);
    expect(await database.db.select().from(logiSyncScope).where(eq(logiSyncScope.scopeKey, source.scopeKey))).toMatchObject([{
      activeGeneration: 'persisted-shadow', lastSuccessAt: expect.any(Date), leaseExpiresAt: null,
      checkpoint: { mode: 'live', cursor: 'scan-2100', generation: null },
    }]);
  });

  it.each(['legacy', 'expired'])('rebuilds a %s persisted shadow through every collection while keeping active data until replay commits', async (kind) => {
    const env = { LOGI_SOURCES_JSON: JSON.stringify([{ sourceInstanceId: `synthetic-renew-${kind}`, guildId: '910000000000000003', gameId: 'wardogs', origin: 'https://logi.example.test' }]), LOGI_DATA_API_KEY_WDG: 'synthetic-data-key-123456' };
    const source = configuredLogiSources(env, 'data')[0]!;
    const value: LogiSyncRecord<'event-summaries'> = { resource: 'event-summaries', id: 'fresh-event', guildId: source.guildId, gameId: source.gameId, revision: '101', operation: 'upsert', data: { id: 'fresh-event', guildId: source.guildId, gameId: source.gameId, title: 'Current source event', kind: 'match', status: 'concluded', startsAt: null, endsAt: '2026-01-01T20:00:00Z', updatedAt: null } };
    await database.db.insert(logiSyncScope).values({
      scopeKey: source.scopeKey, sourceInstanceId: source.sourceInstanceId, guildId: source.guildId, gameId: source.gameId, version: 7, activeGeneration: 'complete',
      checkpoint: { version: 7, mode: 'replay', generation: 'abandoned-shadow', resourceIndex: 5, listCursor: null, boundaryCursor: 'old-boundary', cursor: 'old-cursor', ...(kind === 'expired' ? { bootstrapStartedAt: new Date(Date.now() - 31 * 60_000).toISOString() } : {}) },
    });
    await database.db.insert(logiProjection).values(['complete', 'abandoned-shadow'].map((generation) => ({ scopeKey: source.scopeKey, generation, resource: value.resource, externalId: 'old-event', revision: '1', operation: 'upsert', data: { ...value.data, id: 'old-event' }, observedAt: new Date() })));
    const listed: string[] = [];
    let boundaryCaptured = false;
    let replayed = false;
    vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
      const url = new URL(input);
      expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${env.LOGI_DATA_API_KEY_WDG}`);
      expect(await readActiveLogiProjections(database.db, source)).toMatchObject([{ externalId: 'old-event', revision: '1' }]);
      if (url.searchParams.has('start')) {
        boundaryCaptured = true;
        return Response.json({ data: [], page: { nextCursor: 'fresh-boundary', hasMore: false, limit: 10 } });
      }
      expect(boundaryCaptured).toBe(true);
      if (url.pathname.includes('/sync-records/')) return Response.json({ data: value });
      if (url.pathname.endsWith('/changes')) {
        expect(url.searchParams.get('cursor')).toBe('fresh-boundary');
        expect(listed).toEqual([...LOGI_COLLECTION_RESOURCES].sort());
        replayed = true;
        return Response.json({ data: [], page: { nextCursor: 'replayed-current', hasMore: false, limit: 10 } });
      }
      const resource = url.pathname.split('/').at(-1)!;
      listed.push(resource);
      expect(url.searchParams.has('cursor')).toBe(false);
      return Response.json({ data: resource === value.resource ? [value.data] : [], page: { nextCursor: null, limit: 10 } });
    });
    expect(await runLogiSync(database.db, env)).toMatchObject([{ state: 'caught_up', reset: true, committedPages: 7 }]);
    expect(replayed).toBe(true);
    const [state] = await database.db.select().from(logiSyncScope).where(eq(logiSyncScope.scopeKey, source.scopeKey));
    expect(state).toMatchObject({ version: 14, leaseExpiresAt: null, checkpoint: { mode: 'live', generation: null, cursor: 'replayed-current', bootstrapStartedAt: expect.any(String) } });
    expect(state!.activeGeneration).not.toBe('complete');
    expect(state!.activeGeneration).not.toBe('abandoned-shadow');
    expect(await readActiveLogiProjections(database.db, source)).toMatchObject([{ externalId: value.id, revision: value.revision }]);
    expect(await database.db.select({ generation: logiProjection.generation }).from(logiProjection).where(eq(logiProjection.scopeKey, source.scopeKey))).toEqual([{ generation: state!.activeGeneration }]);
  });
});
