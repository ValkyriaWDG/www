import { logiSyncScope } from '@valkyria/db';
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
});
