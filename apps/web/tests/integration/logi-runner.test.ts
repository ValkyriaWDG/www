import { logiSyncScope } from '@valkyria/db';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { configuredLogiSources } from '@/modules/integrations/logi-config';
import { runLogiSync } from '@/modules/integrations/logi-runner';
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
      checkpoint: { version: 1, mode: 'replay', generation: 'persisted-shadow', resourceIndex: 5, listCursor: null, boundaryCursor: 'scan-0', cursor: 'scan-0' },
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
});
