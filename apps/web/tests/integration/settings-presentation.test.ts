import { auditEvent } from '@valkyria/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureTestActors, type TestActors } from '@/fixtures/test-actors';
import { DomainError } from '@/lib/result';
import { AccessDeniedError } from '@/modules/access/types';
import { applyServerPresentation, readServerPresentation } from '@/modules/integrations/servers/presentation';
import type { ServerOverview } from '@/modules/integrations/servers/provider';
import { getSettingsForAdmin, updateSetting } from '@/modules/settings/service';
import { createTestDatabase, type TestDatabase } from '../support/test-db';

let t: TestDatabase;
let actors: TestActors;
const KEY = 'servers.presentation';

beforeAll(async () => {
  t = await createTestDatabase();
  actors = await ensureTestActors(t.db);
});
afterAll(async () => { await t.drop(); });

async function failure(promise: Promise<unknown>) {
  return promise.then(() => null, (error: unknown) => error);
}
async function expectValidation(promise: Promise<unknown>, field: string) {
  const error = await failure(promise);
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe('validation');
  expect(Object.keys((error as DomainError).fieldErrors ?? {}), field).toContain(field);
}

const overview: ServerOverview = {
  state: 'ok', synthetic: false, partial: false, attemptedAt: '2026-10-03T12:00:00.000Z',
  servers: ['valkyria-1', 'valkyria-2'].map((publicId) => ({
    ref: { source: 'crcon' as const, sourceInstanceId: 'configured', guildId: null, game: 'hll' as const, kind: 'server' as const, externalId: publicId },
    publicId, name: `Configured ${publicId}`, reachability: 'online' as const, map: null, mode: null, players: 1, capacity: 100, nextMap: null, timeRemainingSeconds: null,
    score: null, teams: null, observedAt: '2026-10-03T12:00:00.000Z', freshness: 'fresh' as const, connect: { kind: 'none' as const }, statsUrl: null,
  })),
};

describe('server presentation setting', () => {
  it('is denied to editors and match managers like every other setting', async () => {
    for (const actor of [actors.editor, actors.matchManager, actors.member, actors.anonymous]) {
      expect(await failure(updateSetting(t.db, actor, { key: KEY, expectedVersion: 0, value: [{ game: 'hll', publicId: 'valkyria-1', published: false }] }))).toBeInstanceOf(AccessDeniedError);
    }
    expect(await readServerPresentation(t.db)).toEqual([]);
  });

  it('rejects duplicates, bad identifiers and oversize lists with stable field codes', async () => {
    await expectValidation(updateSetting(t.db, actors.administrator, { key: KEY, expectedVersion: 0, value: [{ game: 'hll', publicId: 'valkyria-1' }, { game: 'hll', publicId: 'valkyria-1', name: 'Twice' }] }), '_');
    await expectValidation(updateSetting(t.db, actors.administrator, { key: KEY, expectedVersion: 0, value: [{ game: 'hll', publicId: 'Valkyria One' }] }), '0.publicId');
    await expectValidation(updateSetting(t.db, actors.administrator, { key: KEY, expectedVersion: 0, value: [{ game: 'csgo', publicId: 'valkyria-1' }] }), '0.game');
    await expectValidation(updateSetting(t.db, actors.administrator, { key: KEY, expectedVersion: 0, value: [{ game: 'hll', publicId: 'valkyria-1', sortOrder: 5000 }] }), '0.sortOrder');
    await expectValidation(updateSetting(t.db, actors.administrator, { key: KEY, expectedVersion: 0, value: Array.from({ length: 41 }, (_, index) => ({ game: 'hll', publicId: `server-${index}` })) }), '_');
    await expectValidation(updateSetting(t.db, actors.administrator, { key: KEY, expectedVersion: 0, value: { game: 'hll', publicId: 'valkyria-1' } }), '_');
    expect(await readServerPresentation(t.db)).toEqual([]);
  });

  it('stores overrides with versions, applies them to public overviews and audits only the shape', async () => {
    const rows = [{ game: 'hll', publicId: 'valkyria-2', name: '  Valkyria Main  ', sortOrder: 0 }, { game: 'hll', publicId: 'valkyria-1', published: false }];
    const saved = await updateSetting(t.db, actors.administrator, { key: KEY, expectedVersion: 0, value: rows });
    expect(saved).toMatchObject({ key: KEY, version: 1, invalid: false, value: [{ game: 'hll', publicId: 'valkyria-2', name: 'Valkyria Main', sortOrder: 0 }, { game: 'hll', publicId: 'valkyria-1', published: false }] });
    const stored = await readServerPresentation(t.db);
    const applied = applyServerPresentation('hll', overview, stored);
    if (applied.state !== 'ok') throw new Error('expected ok');
    expect(applied.servers.map((server) => server.name)).toEqual(['Valkyria Main']);
    expect(applyServerPresentation('wardogs', { ...overview, servers: overview.servers.map((server) => ({ ...server, ref: { ...server.ref, game: 'wardogs' as const } })) }, stored).state === 'ok' && applyServerPresentation('wardogs', overview, stored)).toMatchObject({ servers: overview.servers });
    const admin = (await getSettingsForAdmin(t.db, actors.administrator)).find((setting) => setting.key === KEY);
    expect(admin).toMatchObject({ version: 1, invalid: false });
    const events = await t.db.select().from(auditEvent).where(eq(auditEvent.entityId, KEY));
    expect(events).toHaveLength(1);
    expect(events[0]!.summary).toMatchObject({ key: KEY, version: 1, items: 2, kinds: ['hll', 'hll'] });
    expect(JSON.stringify(events[0]!.summary)).not.toContain('Valkyria Main');

    await expect(failure(updateSetting(t.db, actors.administrator, { key: KEY, expectedVersion: 0, value: null }))).resolves.toMatchObject({ code: 'conflict' });
    expect(await updateSetting(t.db, actors.administrator, { key: KEY, expectedVersion: 1, value: null })).toMatchObject({ value: null, version: 0 });
    expect(await readServerPresentation(t.db)).toEqual([]);
  });
});
