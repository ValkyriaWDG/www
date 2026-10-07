import { describe, expect, it, vi } from 'vitest';
import { createLogiClient, LogiClientError, type LogiFetch } from './client';
import { compareLogiRevisions, logiResourceSchemas, type LogiSyncRecord } from './contracts';
import { coalesceLogiRecords, logiSyncScopeKey, synchronizeLogiScope, type LogiSyncCheckpoint, type LogiSyncCommit, type LogiSyncLease, type LogiSyncStore } from './sync';
import fixture from './fixtures/v0.6.json';
import peopleFixture from './fixtures/v0.14-people.json';

const now = Date.parse('2026-10-02T12:00:00Z');
const options = { resources: ['event-summaries'] as const, now: () => now, newGeneration: () => 'rebuild-1' };
const record = (revision = '9007199254740993', title = 'Current source', id = 'fixture-event-1'): LogiSyncRecord<'event-summaries'> => ({
  guildId: 'fixture-guild-a', gameId: 'wardogs', resource: 'event-summaries', id, revision, operation: 'upsert',
  data: { id, guildId: 'fixture-guild-a', gameId: 'wardogs', title, kind: 'match', status: null, startsAt: null, endsAt: '2030-01-01T20:00:00Z', updatedAt: null },
});
const json = (body: unknown, status = 200) => Response.json(body, { status });
const changed = (cursor: string, hasMore = false, data: unknown[] = []) => ({ data, page: { nextCursor: cursor, hasMore, limit: 10 } });
const list = (data: unknown[], cursor: string | null = null) => ({ data, page: { nextCursor: cursor, limit: 10 } });
const hint = (value: LogiSyncRecord) => ({ guildId: value.guildId, gameId: value.gameId, resource: value.resource, id: value.id, revision: value.revision, operation: value.operation });
const client = (fetchImpl: LogiFetch) => createLogiClient({ origin: 'https://logi.example', apiKey: 'synthetic-api-key-not-valid', sourceInstanceId: 'instance', guildId: 'fixture-guild-a', gameId: 'wardogs', resources: ['event-summaries'] }, { fetchImpl });

/** Behavioral model of the required transactional port, not PostgreSQL acceptance. */
class MemoryStore implements LogiSyncStore {
  checkpoint: LogiSyncCheckpoint | null = null;
  active = new Map<string, LogiSyncRecord>();
  shadows = new Map<string, Map<string, LogiSyncRecord>>();
  commits: LogiSyncCommit[] = [];
  leased = false;
  rejectCommit = false;
  failCommit = false;
  releases = 0;
  async acquire(): Promise<LogiSyncLease | null> {
    if (this.leased) return null;
    this.leased = true;
    return { token: 'fence', checkpoint: structuredClone(this.checkpoint) };
  }
  async commit(lease: LogiSyncLease, input: LogiSyncCommit): Promise<boolean> {
    if (this.failCommit) throw new Error('synthetic database failure');
    if (this.rejectCommit || !this.leased || lease.token !== 'fence' || input.expectedVersion !== (this.checkpoint?.version ?? 0)) return false;
    const rows = input.targetGeneration === null ? this.active : (this.shadows.get(input.targetGeneration) ?? new Map<string, LogiSyncRecord>());
    for (const next of input.records) {
      const previous = rows.get(next.id);
      if (!previous || compareLogiRevisions(next.revision, previous.revision) > 0) rows.set(next.id, next);
    }
    if (input.targetGeneration !== null) this.shadows.set(input.targetGeneration, rows);
    if (input.promoteGeneration !== null) this.active = new Map(this.shadows.get(input.promoteGeneration));
    this.checkpoint = structuredClone(input.next);
    this.commits.push(input);
    return true;
  }
  async release() { this.leased = false; this.releases++; }
}

function live(cursor = 'old-cursor'): LogiSyncCheckpoint {
  return { version: 1, mode: 'live', generation: null, resourceIndex: 1, listCursor: null, boundaryCursor: 'original-boundary', cursor };
}

describe('revision-aware bootstrap and replay', () => {
  it('catches up a sparse guild feed across bounded passes without replacing the last complete generation early', async () => {
    const store = new MemoryStore();
    store.checkpoint = { ...live('scan-0'), mode: 'replay', generation: 'rebuild-1', bootstrapStartedAt: new Date(now).toISOString() };
    store.active.set('old', record('9', 'Last complete generation', 'old'));
    const fresh = record('24001');
    let pages = 0;
    const reader = client(async (input) => {
      const url = new URL(input);
      if (url.pathname.includes('/sync-records/')) return json({ data: fresh });
      expect(url.searchParams.has('start')).toBe(false);
      const offset = Number(url.searchParams.get('cursor')!.slice(5));
      const limit = Number(url.searchParams.get('limit'));
      const end = Math.min(offset + limit, 24001);
      pages++;
      return json({ data: end === 24001 ? [hint(fresh)] : [], page: { nextCursor: `scan-${end}`, hasMore: end < 24001, limit } });
    });
    const states: string[] = [];
    for (let pass = 0; pass < 3; pass++) {
      const outcome = await synchronizeLogiScope(reader, store, { ...options, maxSteps: 100 });
      states.push(outcome.state);
      if (outcome.state !== 'caught_up') expect([...store.active.keys()]).toEqual(['old']);
    }
    expect(states).toEqual(['pending', 'pending', 'caught_up']);
    expect(pages).toBeLessThanOrEqual(250);
    expect([...store.active.values()]).toEqual([fresh]);
    expect(store.checkpoint).toMatchObject({ mode: 'live', cursor: 'scan-24001', generation: null });
  });

  it('rereads a dense expanded page from the unchanged cursor in small atomic batches without skipping identities', async () => {
    const store = new MemoryStore();
    store.checkpoint = { ...live('scan-0'), mode: 'replay', generation: 'rebuild-1', bootstrapStartedAt: new Date(now).toISOString() };
    const values = Array.from({ length: 100 }, (_, index) => record(String(index + 11), 'Synthetic event', `event-${index + 11}`));
    const requests: { offset: number; limit: number }[] = [];
    const readIds: string[] = [];
    const reader = client(async (input) => {
      const url = new URL(input);
      if (url.pathname.includes('/sync-records/')) {
        const id = url.pathname.split('/').at(-1)!;
        readIds.push(id);
        return json({ data: values.find((value) => value.id === id)! });
      }
      const offset = Number(url.searchParams.get('cursor')!.slice(5));
      const limit = Number(url.searchParams.get('limit'));
      requests.push({ offset, limit });
      const end = Math.min(offset + limit, 110);
      const data = values.filter((value) => Number(value.revision) > offset && Number(value.revision) <= end).map(hint);
      return json({ data, page: { nextCursor: `scan-${end}`, hasMore: end < 110, limit } });
    });
    expect(await synchronizeLogiScope(reader, store, { ...options, maxSteps: 6 })).toMatchObject({ state: 'pending', records: 50 });
    expect(store.active.size).toBe(0);
    expect(store.checkpoint?.cursor).toBe('scan-60');
    expect(requests.slice(0, 3)).toEqual([{ offset: 0, limit: 10 }, { offset: 10, limit: 100 }, { offset: 10, limit: 10 }]);
    expect(await synchronizeLogiScope(reader, store, { ...options, maxSteps: 6 })).toMatchObject({ state: 'caught_up', records: 50 });
    expect(new Set(readIds).size).toBe(100);
    expect(readIds).toHaveLength(100);
    expect(store.active.size).toBe(100);
    expect(store.commits.every((commit) => commit.records.length <= 10)).toBe(true);
  });

  it.each([[429, 'rate_limited'], [503, 'upstream']] as const)('preserves the checkpoint when the dense-page reread returns %s', async (status, error) => {
    const store = new MemoryStore();
    store.checkpoint = live('scan-0');
    const reader = client(async (input) => {
      const url = new URL(input);
      const cursor = url.searchParams.get('cursor');
      const limit = Number(url.searchParams.get('limit'));
      if (cursor === 'scan-0') return json(changed('scan-10', true));
      if (limit === 100) return json({ data: Array.from({ length: 11 }, (_, i) => hint(record(String(i + 11), 'Synthetic', `event-${i}`))), page: { nextCursor: 'scan-110', hasMore: true, limit } });
      return json({}, status);
    });
    expect(await synchronizeLogiScope(reader, store, options)).toMatchObject({ state: 'failed', error, committedPages: 1, records: 0 });
    expect(store.checkpoint?.cursor).toBe('scan-10');
    expect(store.active.size).toBe(0);
  });

  it.each([1, 10])('processes an expanded page containing 100 hints for %s identities without rereading or skipping revisions', async (identityCount) => {
    const store = new MemoryStore();
    store.checkpoint = live('scan-0');
    const requests: { offset: number; limit: number }[] = [];
    const readIds: string[] = [];
    const values = Array.from({ length: identityCount }, (_, index) => record(String(110 - index), 'Latest atomic value', `hot-${index}`));
    const reader = client(async (input) => {
      const url = new URL(input);
      if (url.pathname.includes('/sync-records/')) {
        const id = url.pathname.split('/').at(-1)!;
        readIds.push(id);
        return json({ data: values.find((value) => value.id === id)! });
      }
      const offset = Number(url.searchParams.get('cursor')!.slice(5));
      const limit = Number(url.searchParams.get('limit'));
      requests.push({ offset, limit });
      const end = Math.min(offset + limit, 110);
      // A nonempty low-cardinality page should expand too; ten distinct hints
      // become cheap only after coalescing the following repeated updates.
      const data = offset === 0 && identityCount === 10 ? [] : Array.from({ length: end - offset }, (_, index) => {
        const revision = offset + index + 1;
        return hint(record(String(revision), 'Change hint', `hot-${(110 - revision) % identityCount}`));
      });
      return json({ data, page: { nextCursor: `scan-${end}`, hasMore: end < 110, limit } });
    });
    expect(await synchronizeLogiScope(reader, store, { ...options, maxSteps: 2 })).toMatchObject({ state: 'caught_up', committedPages: 2 });
    expect(requests).toEqual([{ offset: 0, limit: 10 }, { offset: 10, limit: 100 }]);
    expect(readIds).toHaveLength(identityCount === 1 ? 2 : 10);
    expect(store.checkpoint?.cursor).toBe('scan-110');
    expect([...store.active.values()].sort((a, b) => a.id.localeCompare(b.id))).toEqual(values.sort((a, b) => a.id.localeCompare(b.id)));
    expect(store.commits.every((commit) => commit.records.length <= 10)).toBe(true);
  });

  it('does not commit an expanded continuation when an atomic record is older than the latest duplicate hint', async () => {
    const store = new MemoryStore();
    store.checkpoint = live('scan-0');
    const reader = client(async (input) => {
      const url = new URL(input);
      if (url.pathname.includes('/sync-records/')) return json({ data: record('50') });
      const offset = Number(url.searchParams.get('cursor')!.slice(5));
      const limit = Number(url.searchParams.get('limit'));
      const end = Math.min(offset + limit, 110);
      return json({ data: offset === 0 ? [] : Array.from({ length: end - offset }, (_, i) => hint(record(String(offset + i + 1)))), page: { nextCursor: `scan-${end}`, hasMore: end < 110, limit } });
    });
    expect(await synchronizeLogiScope(reader, store, { ...options, maxSteps: 2 })).toMatchObject({ state: 'failed', error: 'invalid_response', committedPages: 1 });
    expect(store.checkpoint?.cursor).toBe('scan-10');
    expect(store.active.size).toBe(0);
  });

  it.each(['bootstrap', 'replay'] as const)('replaces a legacy incomplete %s checkpoint with a fresh full bootstrap exactly once', async (mode) => {
    const store = new MemoryStore();
    store.checkpoint = { ...live(), mode, generation: 'legacy-shadow', listCursor: mode === 'bootstrap' ? 'old-list' : null };
    store.active.set('old', record('1', 'Last complete', 'old'));
    const calls: string[] = [];
    const reader = client(async (input) => {
      const url = new URL(input);
      calls.push(`${url.pathname.split('/').at(-1)}:${url.searchParams.get('cursor') ?? url.searchParams.get('start') ?? 'first'}`);
      return json(url.pathname.endsWith('/changes') ? changed('fresh-boundary') : list([]));
    });
    expect(await synchronizeLogiScope(reader, store, { ...options, maxSteps: 1 })).toMatchObject({ state: 'pending', reset: true, committedPages: 1 });
    expect(store.checkpoint).toMatchObject({ mode: 'bootstrap', resourceIndex: 0, listCursor: null, generation: 'rebuild-1', boundaryCursor: 'fresh-boundary', cursor: 'fresh-boundary', bootstrapStartedAt: new Date(now).toISOString() });
    expect([...store.active.keys()]).toEqual(['old']);
    expect(await synchronizeLogiScope(reader, store, options)).toMatchObject({ state: 'caught_up', reset: false });
    expect(calls).toEqual(['changes:now', 'event-summaries:first', 'changes:fresh-boundary']);
  });

  it.each(['bootstrap', 'replay'] as const)('resumes %s below 30 minutes and restarts it at the exact age boundary', async (mode) => {
    const store = new MemoryStore();
    let clock = now + 30 * 60_000 - 1;
    store.checkpoint = { ...live('saved-cursor'), mode, resourceIndex: mode === 'bootstrap' ? 0 : 1, generation: 'old-shadow', listCursor: mode === 'bootstrap' ? 'saved-list' : null, bootstrapStartedAt: new Date(now).toISOString() };
    const calls: string[] = [];
    const reader = client(async (input) => {
      const url = new URL(input);
      calls.push(url.searchParams.get('cursor') ?? url.searchParams.get('start') ?? 'first');
      if (url.searchParams.has('start')) return json(changed('fresh-boundary'));
      return json(mode === 'bootstrap' ? list([], 'continued-list') : changed('continued-replay', true));
    });
    const ageOptions = { ...options, now: () => clock, maxSteps: 1 };
    expect(await synchronizeLogiScope(reader, store, ageOptions)).toMatchObject({ state: 'pending', reset: false });
    expect(store.checkpoint?.bootstrapStartedAt).toBe(new Date(now).toISOString());
    clock++;
    expect(await synchronizeLogiScope(reader, store, ageOptions)).toMatchObject({ state: 'pending', reset: true });
    expect(calls).toEqual([mode === 'bootstrap' ? 'saved-list' : 'saved-cursor', 'now']);
    expect(store.checkpoint).toMatchObject({ mode: 'bootstrap', resourceIndex: 0, listCursor: null, boundaryCursor: 'fresh-boundary', bootstrapStartedAt: new Date(clock).toISOString() });
  });

  it.each([undefined, '2026-09-01T00:00:00.000Z'])('keeps a healthy live checkpoint incremental regardless of bootstrap timestamp %s', async (bootstrapStartedAt) => {
    const store = new MemoryStore();
    store.checkpoint = { ...live(), ...(bootstrapStartedAt ? { bootstrapStartedAt } : {}) };
    const reader = client(async (input) => {
      const url = new URL(input);
      expect(url.searchParams.has('start')).toBe(false);
      expect(url.searchParams.get('cursor')).toBe('old-cursor');
      return json(changed('current-cursor'));
    });
    expect(await synchronizeLogiScope(reader, store, options)).toMatchObject({ state: 'caught_up', reset: false, committedPages: 1 });
  });

  it.each([[429, 'rate_limited'], [503, 'upstream']] as const)('retains the expired generation and active data when fresh boundary capture returns %s', async (status, error) => {
    const store = new MemoryStore();
    store.checkpoint = { ...live(), mode: 'replay', generation: 'expired-shadow', bootstrapStartedAt: new Date(now - 30 * 60_000).toISOString() };
    store.active.set('old', record('1', 'Last complete', 'old'));
    const saved = structuredClone(store.checkpoint);
    const reader = client(async (input) => {
      expect(new URL(input).searchParams.get('start')).toBe('now');
      return new Response(null, { status, headers: { 'retry-after': '65' } });
    });
    expect(await synchronizeLogiScope(reader, store, options)).toMatchObject({ state: 'failed', error, committedPages: 0, ...(status === 429 ? { retryAfterMs: 65_000 } : {}) });
    expect(store.checkpoint).toEqual(saved);
    expect([...store.active.keys()]).toEqual(['old']);
  });

  it('does not replace an expired checkpoint after losing its lease during boundary capture', async () => {
    const store = new MemoryStore();
    store.checkpoint = { ...live(), mode: 'replay', generation: 'expired-shadow', bootstrapStartedAt: new Date(now - 30 * 60_000).toISOString() };
    const saved = structuredClone(store.checkpoint);
    const reader = client(async (input) => {
      expect(new URL(input).searchParams.get('start')).toBe('now');
      store.rejectCommit = true;
      return json(changed('fresh-boundary'));
    });
    expect(await synchronizeLogiScope(reader, store, options)).toMatchObject({ state: 'lease_lost', committedPages: 0 });
    expect(store.checkpoint).toEqual(saved);
  });

  it('rebuilds all identities after expiry and reconciles concurrent create, update and removal before promotion', async () => {
    const store = new MemoryStore();
    store.checkpoint = { ...live('old-replay'), mode: 'replay', generation: 'expired-shadow', bootstrapStartedAt: new Date(now - 30 * 60_000).toISOString() };
    store.active.set('legacy', record('1', 'Last complete', 'legacy'));
    const updated = record('103', 'Updated after capture', 'existing');
    const created = record('104', 'Created after enumeration', 'created');
    const removed: LogiSyncRecord<'event-summaries'> = { ...hint(record('105', 'Removed after enumeration', 'removed')), resource: 'event-summaries', gameId: 'wardogs', operation: 'remove', data: null };
    const calls: string[] = [];
    const reader = client(async (input) => {
      const url = new URL(input);
      const id = url.pathname.split('/').at(-1)!;
      calls.push(`${id}:${url.searchParams.get('cursor') ?? url.searchParams.get('start') ?? 'first'}`);
      expect([...store.active.keys()]).toEqual(['legacy']);
      if (url.searchParams.has('start')) return json(changed('fresh-boundary'));
      if (id === 'event-summaries') return json(list([record('101', 'Listed before update', 'existing').data, record('101', 'Listed before removal', 'removed').data]));
      if (id === 'changes') {
        expect(url.searchParams.get('cursor')).toBe('fresh-boundary');
        return json(changed('fully-replayed', false, [hint(record('102', 'Update hint', 'existing')), hint(created), hint(removed)]));
      }
      return json({ data: id === 'existing' ? updated : id === 'created' ? created : removed });
    });
    expect(await synchronizeLogiScope(reader, store, options)).toMatchObject({ state: 'caught_up', reset: true, committedPages: 3 });
    expect(calls[0]).toBe('changes:now');
    expect(calls[1]).toBe('event-summaries:first');
    expect(store.active.get('existing')).toEqual(updated);
    expect(store.active.get('created')).toEqual(created);
    expect(store.active.get('removed')).toEqual(removed);
    expect(store.active.has('legacy')).toBe(false);
    expect(store.commits.slice(0, -1).every((commit) => commit.promoteGeneration === null)).toBe(true);
    expect(store.checkpoint).toMatchObject({ mode: 'live', cursor: 'fully-replayed', bootstrapStartedAt: new Date(now).toISOString() });
  });

  it('rejects a malformed bootstrap timestamp before reading or committing source data', async () => {
    const store = new MemoryStore();
    store.checkpoint = { ...live(), mode: 'replay', generation: 'malformed', bootstrapStartedAt: 'not-an-instant' };
    const fetchImpl = vi.fn<LogiFetch>();
    expect(await synchronizeLogiScope(client(fetchImpl), store, options)).toMatchObject({ state: 'failed', error: 'persistence', committedPages: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('resumes committed pages after the run budget expires without publishing an incomplete generation', async () => {
    const store = new MemoryStore();
    const budget = new AbortController();
    const timer = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(budget.signal);
    const value = record();
    try {
      const reader = client(async (input) => {
        const url = new URL(input);
        if (url.pathname.endsWith('/changes')) return json(changed('boundary'));
        if (url.pathname.includes('/sync-records/')) return json({ data: value });
        if (!url.searchParams.has('cursor')) return json(list([value.data], 'next-page'));
        budget.abort();
        return json(list([]));
      });
      await expect(synchronizeLogiScope(reader, store, options)).resolves.toMatchObject({
        state: 'pending', committedPages: 2, records: 1, error: null,
      });
      expect(store.checkpoint).toMatchObject({ mode: 'bootstrap', listCursor: 'next-page' });
      expect(store.active.size).toBe(0);
      expect(store.releases).toBe(1);
    } finally { timer.mockRestore(); }

    const resumedPaths: string[] = [];
    const resumed = client(async (input) => {
      const url = new URL(input);
      resumedPaths.push(url.pathname);
      if (url.pathname.endsWith('/changes')) return json(changed('caught-up'));
      expect(url.searchParams.get('cursor')).toBe('next-page');
      return json(list([]));
    });
    await expect(synchronizeLogiScope(resumed, store, options)).resolves.toMatchObject({ state: 'caught_up', error: null });
    expect(store.active.get(value.id)).toEqual(value);
    expect(resumedPaths.some((path) => path.includes('/sync-records/'))).toBe(false);
  });

  it('keeps a request timeout as failure while the run budget is still available', async () => {
    const store = new MemoryStore();
    const reader = client(async () => { throw new LogiClientError('timeout'); });
    await expect(synchronizeLogiScope(reader, store, options)).resolves.toMatchObject({
      state: 'failed', error: 'timeout', committedPages: 0,
    });
    expect(store.active.size).toBe(0);
    expect(store.releases).toBe(1);
  });

  it('finishes more than fifty empty people scan pages within the larger bounded pass', async () => {
    let clock = now;
    let pages = 0;
    const store = new MemoryStore();
    const reader = createLogiClient({ origin: 'https://logi.example', apiKey: 'synthetic-people-key-12345', sourceInstanceId: 'instance', guildId: '910000000000000001', gameId: 'wardogs', resources: ['roster-summaries'] }, { fetchImpl: async (input) => {
      clock += 100;
      if (new URL(input).pathname.endsWith('/changes')) return json(changed('boundary'));
      pages++;
      return json({ data: [], page: { nextCursor: pages < 55 ? `scan-${pages}` : null, limit: 1 } });
    } });
    const result = await synchronizeLogiScope(reader, store, { resources: ['roster-summaries'], now: () => clock, fullRefreshMs: 300_000, maxSteps: 100, maxRunMs: 50_000, leaseMs: 60_000 });
    expect(result).toMatchObject({ state: 'caught_up', records: 0, committedPages: 57 });
    expect(pages).toBe(55);
    expect(clock - now).toBeLessThan(50_000);
    expect(store.checkpoint).toMatchObject({ mode: 'live', reconciledAt: new Date(clock).toISOString() });
  });
  it('periodically rebuilds identity facts even when incremental pulls stay idle', async () => {
    let clock = now;
    let captures = 0;
    const store = new MemoryStore();
    const reader = client(async (input) => {
      const url = new URL(input);
      if (url.pathname.endsWith('/changes')) {
        if (url.searchParams.has('start')) captures++;
        return json(changed(`boundary-${captures}`));
      }
      return json(list([]));
    });
    const refresh = { ...options, now: () => clock, fullRefreshMs: 300_000, newGeneration: () => `refresh-${captures}` };
    expect((await synchronizeLogiScope(reader, store, refresh)).state).toBe('caught_up');
    expect(captures).toBe(1);
    const completed = store.checkpoint!.reconciledAt;
    clock += 299_999;
    expect((await synchronizeLogiScope(reader, store, refresh)).state).toBe('caught_up');
    expect(captures).toBe(1);
    expect(store.checkpoint!.reconciledAt).toBe(completed);
    clock++;
    expect((await synchronizeLogiScope(reader, store, refresh)).state).toBe('caught_up');
    expect(captures).toBe(2);
    expect(store.checkpoint!.reconciledAt).not.toBe(completed);
  });
  it('captures the boundary before lists, follows empty continuations, refetches atomic data and promotes only after replay', async () => {
    const calls: string[] = [];
    const store = new MemoryStore();
    store.active.set('old-event', record('9', 'Old active', 'old-event'));
    const fresh = record();
    const reader = client(async (input) => {
      const url = new URL(input);
      const kind = url.pathname.split('/').at(-1)!;
      calls.push(`${kind}:${url.searchParams.get('cursor') ?? url.searchParams.get('start') ?? 'first'}`);
      if (kind === 'changes') return json(changed(url.searchParams.has('start') ? 'boundary' : 'after-replay'));
      if (kind === 'event-summaries') {
        expect(store.active.has('old-event')).toBe(true);
        return json(url.searchParams.has('cursor') ? list([fresh.data]) : list([], 'empty-continuation'));
      }
      return json({ data: fresh });
    });
    const result = await synchronizeLogiScope(reader, store, options);
    expect(result).toMatchObject({ state: 'caught_up', committedPages: 4, records: 1 });
    expect(calls).toEqual(['changes:now', 'event-summaries:first', 'event-summaries:empty-continuation', 'fixture-event-1:first', 'changes:boundary']);
    expect(store.active.get(fresh.id)).toEqual(fresh);
    expect(store.active.has('old-event')).toBe(false);
    expect(store.checkpoint).toMatchObject({ mode: 'live', cursor: 'after-replay', generation: null });
    expect(store.commits.at(-1)?.promoteGeneration).toBe('rebuild-1');
  });

  it('persists partial bootstrap checkpoints while retaining the last complete projection', async () => {
    const store = new MemoryStore();
    store.active.set('old', record('9', 'Still visible', 'old'));
    let failNext = false;
    const fresh = record();
    const reader = client(async (input) => {
      const url = new URL(input);
      if (url.pathname.endsWith('/changes')) return json(changed('boundary'));
      if (url.pathname.endsWith('/event-summaries')) {
        if (url.searchParams.has('cursor') && failNext) return json({ error: 'upstream' }, 503);
        return json(url.searchParams.has('cursor') ? list([]) : list([fresh.data], 'second-page'));
      }
      return json({ data: fresh });
    });
    expect((await synchronizeLogiScope(reader, store, { ...options, maxSteps: 2 })).state).toBe('pending');
    expect(store.checkpoint).toMatchObject({ mode: 'bootstrap', listCursor: 'second-page' });
    expect(store.active.has('old')).toBe(true);
    failNext = true;
    expect((await synchronizeLogiScope(reader, store, options)).state).toBe('failed');
    expect(store.active.has('old')).toBe(true);
    expect(store.checkpoint?.listCursor).toBe('second-page');
    failNext = false;
    expect((await synchronizeLogiScope(reader, store, options)).state).toBe('caught_up');
    expect(store.active.has('old')).toBe(false);
    expect(store.active.has(fresh.id)).toBe(true);
    expect(store.releases).toBe(3);
  });

  it('does not replace a page checkpoint when any atomic refetch fails', async () => {
    const store = new MemoryStore();
    const first = record();
    const second = record('9007199254740994', 'Second', 'second-event');
    const reader = client(async (input) => {
      const path = new URL(input).pathname;
      if (path.endsWith('/changes')) return json(changed('boundary'));
      if (path.endsWith('/event-summaries')) return json(list([first.data, second.data]));
      if (path.endsWith('/second-event')) return json({}, 503);
      return json({ data: first });
    });
    expect(await synchronizeLogiScope(reader, store, options)).toMatchObject({ state: 'failed', error: 'upstream', committedPages: 1 });
    expect(store.checkpoint).toMatchObject({ mode: 'bootstrap', listCursor: null, resourceIndex: 0 });
    expect(store.shadows.get('rebuild-1')?.size).toBe(0);
  });

  it('restarts an invalidated people list from a new boundary across passes before promoting', async () => {
    const store = new MemoryStore();
    const former: LogiSyncRecord<'roster-summaries'> = {
      guildId: '910000000000000001', gameId: 'wardogs', resource: 'roster-summaries', id: 'roster-example', revision: '1', operation: 'upsert',
      data: logiResourceSchemas['roster-summaries'].parse(peopleFixture.roster),
    };
    const prior: LogiSyncRecord<'roster-summaries'> = { ...former, id: 'prior-roster', data: { ...former.data, id: 'prior-roster' } };
    const current: LogiSyncRecord<'member-summaries'> = {
      guildId: '910000000000000001', gameId: 'wardogs', resource: 'member-summaries', id: 'assignment-example', revision: '2', operation: 'upsert',
      data: logiResourceSchemas['member-summaries'].parse(peopleFixture.member),
    };
    store.active.set(prior.id, prior);
    let generation = 0;
    const calls: string[] = [];
    const resources = ['member-summaries', 'roster-summaries'] as const;
    const reader = createLogiClient({ origin: 'https://logi.example', apiKey: 'synthetic-people-key-12345', sourceInstanceId: 'instance', guildId: '910000000000000001', gameId: 'wardogs', resources }, { fetchImpl: async (input) => {
      const url = new URL(input);
      const resource = url.pathname.split('/').at(-1)!;
      calls.push(`${resource}:${url.searchParams.get('cursor') ?? url.searchParams.get('start') ?? 'first'}`);
      if (resource === 'changes') {
        if (url.searchParams.has('start')) generation++;
        return json(changed(`boundary-${generation}`));
      }
      if (url.pathname.includes('/sync-records/')) return json({ data: resource === former.id ? former : current });
      if (resource === 'member-summaries') return json(list(generation === 1 ? [] : [current.data]));
      if (url.searchParams.has('cursor')) return json(fixture.reset, 410);
      return json({ data: generation === 1 ? [former.data] : [], page: { nextCursor: generation === 1 ? 'invalidated-page' : null, limit: 1 } });
    } });
    const syncOptions = { resources, now: () => now, newGeneration: () => `people-${generation}` };

    expect(await synchronizeLogiScope(reader, store, { ...syncOptions, maxSteps: 3 })).toMatchObject({ state: 'pending', reset: false });
    expect(store.checkpoint).toMatchObject({ mode: 'bootstrap', resourceIndex: 1, listCursor: 'invalidated-page', generation: 'people-1' });
    expect(store.shadows.get('people-1')?.has(former.id)).toBe(true);

    expect(await synchronizeLogiScope(reader, store, { ...syncOptions, maxSteps: 1 })).toMatchObject({ state: 'pending', reset: true });
    expect(store.checkpoint).toMatchObject({ mode: 'bootstrap', resourceIndex: 0, listCursor: null, boundaryCursor: 'boundary-2', cursor: 'boundary-2', generation: 'people-2' });
    expect([...store.active.keys()]).toEqual(['prior-roster']);
    expect(store.commits.every((commit) => commit.promoteGeneration === null)).toBe(true);

    expect(await synchronizeLogiScope(reader, store, syncOptions)).toMatchObject({ state: 'caught_up', reset: false });
    expect(calls).toEqual([
      'changes:now', 'member-summaries:first', 'roster-summaries:first', 'roster-example:first',
      'roster-summaries:invalidated-page', 'changes:now', 'member-summaries:first', 'assignment-example:first', 'roster-summaries:first', 'changes:boundary-2',
    ]);
    expect([...store.active.keys()]).toEqual(['assignment-example']);
    expect(store.checkpoint).toMatchObject({ mode: 'live', generation: null });
    expect(store.commits.at(-1)?.promoteGeneration).toBe('people-2');
    expect(store.releases).toBe(3);
  });

  it('applies newer atomic state after a hint and duplicate delivery cannot regress a tombstone', async () => {
    const store = new MemoryStore();
    store.checkpoint = live();
    const tombstone: LogiSyncRecord<'event-summaries'> = { ...hint(record('9007199254740995')), resource: 'event-summaries', gameId: 'wardogs', operation: 'remove', data: null };
    store.active.set(tombstone.id, tombstone);
    const older = record('9007199254740994', 'Late response');
    const reader = client(async (input) => new URL(input).pathname.endsWith('/changes')
      ? json(changed('next', false, [hint(record()), hint(record())]))
      : json({ data: older }));
    expect((await synchronizeLogiScope(reader, store, options)).state).toBe('caught_up');
    expect(store.active.get(tombstone.id)).toEqual(tombstone);
    expect(store.commits[0]?.records).toHaveLength(1);
  });

  it('refetches a remove hint and retains a subsequent higher revision resurrection', async () => {
    const store = new MemoryStore();
    store.checkpoint = live();
    const newer = record('9007199254740999', 'Restored in source');
    const reader = client(async (input) => new URL(input).pathname.endsWith('/changes')
      ? json(changed('next', false, [{ ...hint(record()), operation: 'remove' }])) : json({ data: newer }));
    expect((await synchronizeLogiScope(reader, store, options)).state).toBe('caught_up');
    expect(store.active.get(newer.id)).toEqual(newer);
  });

  it('handles empty change continuations without stopping early', async () => {
    const store = new MemoryStore();
    store.checkpoint = live();
    const cursors: string[] = [];
    const reader = client(async (input) => {
      const cursor = new URL(input).searchParams.get('cursor')!;
      cursors.push(cursor);
      return json(changed(cursor === 'old-cursor' ? 'scan-cursor' : 'tail-cursor', cursor === 'old-cursor'));
    });
    expect((await synchronizeLogiScope(reader, store, options)).state).toBe('caught_up');
    expect(cursors).toEqual(['old-cursor', 'scan-cursor']);
    expect(store.checkpoint?.cursor).toBe('tail-cursor');
  });

  it.each([410, 404])('rebuilds on expired cursor or missing retained record (%s), preserving active rows until promotion', async (status) => {
    const store = new MemoryStore();
    store.checkpoint = live();
    store.active.set('old', record('9', 'Still active', 'old'));
    const reader = client(async (input) => {
      const url = new URL(input);
      if (url.searchParams.has('start')) return json(changed('new-boundary'));
      if (url.pathname.includes('/sync-records/')) return json({}, 404);
      return status === 410 ? json(fixture.reset, 410) : json(changed('next', false, [hint(record())]));
    });
    expect(await synchronizeLogiScope(reader, store, { ...options, maxSteps: 1 })).toMatchObject({ state: 'pending', reset: true });
    expect(store.checkpoint).toMatchObject({ mode: 'bootstrap', boundaryCursor: 'new-boundary' });
    expect(store.active.has('old')).toBe(true);
  });

  it('does not commit a cursor when atomic data is older than its hint', async () => {
    const store = new MemoryStore();
    store.checkpoint = live();
    const reader = client(async (input) => new URL(input).pathname.endsWith('/changes')
      ? json(changed('next', false, [hint(record('9007199254740999'))])) : json({ data: record() }));
    expect(await synchronizeLogiScope(reader, store, options)).toMatchObject({ state: 'failed', error: 'invalid_response' });
    expect(store.checkpoint.cursor).toBe('old-cursor');
  });

  it('preserves progress on 429 and returns the producer retry boundary', async () => {
    const store = new MemoryStore();
    store.checkpoint = live();
    const reader = client(async () => new Response(null, { status: 429, headers: { 'retry-after': '65' } }));
    expect(await synchronizeLogiScope(reader, store, options)).toMatchObject({ state: 'failed', error: 'rate_limited', retryAfterMs: 65_000 });
    expect(store.checkpoint.cursor).toBe('old-cursor');
  });

  it('fences concurrent workers and rejected commits; persistence failure cannot advance the cursor', async () => {
    const store = new MemoryStore();
    store.checkpoint = live();
    const reader = client(async () => json(changed('next')));
    store.leased = true;
    expect((await synchronizeLogiScope(reader, store, options)).state).toBe('busy');
    store.leased = false;
    store.rejectCommit = true;
    expect((await synchronizeLogiScope(reader, store, options)).state).toBe('lease_lost');
    store.rejectCommit = false;
    store.failCommit = true;
    expect(await synchronizeLogiScope(reader, store, options)).toMatchObject({ state: 'failed', error: 'persistence' });
    expect(store.checkpoint.cursor).toBe('old-cursor');
    expect(store.releases).toBe(2);
  });

  it('rejects nonadvancing continuations instead of looping', async () => {
    const store = new MemoryStore();
    store.checkpoint = live();
    const reader = client(async () => json(changed('old-cursor', true)));
    expect(await synchronizeLogiScope(reader, store, options)).toMatchObject({ state: 'failed', error: 'invalid_response', committedPages: 0 });
  });

  it('compares full decimal revisions and isolates source, guild, game and resource scope keys', () => {
    expect(compareLogiRevisions('9007199254740993', '9007199254740992')).toBe(1);
    expect(compareLogiRevisions('10', '9')).toBe(1);
    expect(compareLogiRevisions('9'.repeat(128), '1'.repeat(128))).toBe(1);
    expect(() => compareLogiRevisions('01', '1')).toThrow();
    expect(coalesceLogiRecords([record('9'), record('10'), record('9')]).map((row) => row.revision)).toEqual(['10']);
    const scope = { sourceInstanceId: 'instance', guildId: 'guild', gameId: 'wardogs' as const, resources: ['event-summaries'] as const };
    expect(new Set([logiSyncScopeKey(scope), logiSyncScopeKey({ ...scope, guildId: 'another' }), logiSyncScopeKey({ ...scope, gameId: 'hell_let_loose' }), logiSyncScopeKey({ ...scope, sourceInstanceId: 'another' }), logiSyncScopeKey({ ...scope, resources: ['result-summaries'] })]).size).toBe(5);
  });
});

describe('a producer without a replay log', () => {
  it('promotes a completed baseline when every change cursor is 410, then makes one request a run until the full refresh', async () => {
    let clock = now;
    let captures = 0;
    const calls: string[] = [];
    const store = new MemoryStore();
    store.active.set('old-event', record('9', 'Old active', 'old-event'));
    const fresh = record();
    const reader = client(async (input) => {
      const url = new URL(input);
      const kind = url.pathname.split('/').at(-1)!;
      calls.push(`${kind}:${url.searchParams.get('cursor') ?? url.searchParams.get('start') ?? 'first'}`);
      if (kind === 'changes') {
        if (!url.searchParams.has('start')) return json(fixture.reset, 410);
        captures++;
        return json(changed(`boundary-${captures}`));
      }
      if (kind === 'event-summaries') return json(list([fresh.data]));
      return json({ data: fresh });
    });
    const refresh = { ...options, now: () => clock, fullRefreshMs: 900_000, newGeneration: () => `refresh-${captures}` };

    expect(await synchronizeLogiScope(reader, store, refresh)).toMatchObject({ state: 'caught_up', reset: false });
    expect(calls).toEqual(['changes:now', 'event-summaries:first', 'fixture-event-1:first', 'changes:boundary-1']);
    expect([...store.active.keys()]).toEqual([fresh.id]);
    expect(store.checkpoint).toMatchObject({ mode: 'live', generation: null, cursor: 'boundary-1', reconciledAt: new Date(now).toISOString() });
    expect(store.commits.at(-1)?.promoteGeneration).toBe('refresh-1');

    for (const minutes of [1, 5, 14]) {
      calls.length = 0;
      clock = now + minutes * 60_000;
      const version = store.checkpoint!.version;
      // One request, and one checkpoint commit recording the successful contact.
      expect(await synchronizeLogiScope(reader, store, refresh)).toMatchObject({ state: 'caught_up', reset: false, committedPages: 1, records: 0 });
      expect(calls).toEqual(['changes:boundary-1']);
      expect(store.checkpoint).toMatchObject({ mode: 'live', cursor: 'boundary-1', version: version + 1, reconciledAt: new Date(now).toISOString() });
      expect(store.commits.at(-1)).toMatchObject({ records: [], promoteGeneration: null, targetGeneration: null });
    }
    expect(captures).toBe(1);

    calls.length = 0;
    clock = now + 900_000;
    expect((await synchronizeLogiScope(reader, store, refresh)).state).toBe('caught_up');
    expect(captures).toBe(2);
    expect(calls).toEqual(['changes:now', 'event-summaries:first', 'fixture-event-1:first', 'changes:boundary-2']);
  });

  it('keeps the last complete generation when the replay promotion is not accepted', async () => {
    const store = new MemoryStore();
    store.checkpoint = { ...live('boundary'), mode: 'replay', generation: 'rebuild-1', bootstrapStartedAt: new Date(now).toISOString() };
    store.active.set('old', record('9', 'Last complete generation', 'old'));
    store.rejectCommit = true;
    const reader = client(async () => json(fixture.reset, 410));
    expect((await synchronizeLogiScope(reader, store, { ...options, fullRefreshMs: 900_000 })).state).toBe('lease_lost');
    expect([...store.active.keys()]).toEqual(['old']);
    expect(store.checkpoint).toMatchObject({ mode: 'replay', generation: 'rebuild-1' });
  });
});
