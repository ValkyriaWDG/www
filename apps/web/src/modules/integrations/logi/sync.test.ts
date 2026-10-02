import { describe, expect, it } from 'vitest';
import { createLogiClient, type LogiFetch } from './client';
import { compareLogiRevisions, type LogiSyncRecord } from './contracts';
import { coalesceLogiRecords, logiSyncScopeKey, synchronizeLogiScope, type LogiSyncCheckpoint, type LogiSyncCommit, type LogiSyncLease, type LogiSyncStore } from './sync';
import fixture from './fixtures/v0.6.json';

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
