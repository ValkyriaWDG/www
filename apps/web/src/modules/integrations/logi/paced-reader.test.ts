import { describe, expect, it } from 'vitest';
import { LogiClientError, type LogiReader } from './client';
import { LOGI_SYNC_REQUESTS_PER_SECOND, paceLogiReader } from './paced-reader';

function fakeReader(calls: string[]): LogiReader {
  return {
    scope: { sourceInstanceId: 'instance', guildId: 'guild', gameId: 'wardogs' },
    resources: ['event-summaries'],
    list: async (resource) => { calls.push(`list:${resource}`); return { data: [], page: { nextCursor: null, limit: 10 } }; },
    startChanges: async () => { calls.push('start'); return { data: [], page: { nextCursor: 'c', hasMore: false, limit: 10 } }; },
    changes: async (_resources, cursor) => { calls.push(`changes:${cursor}`); return { data: [], page: { nextCursor: cursor, hasMore: false, limit: 10 } }; },
    syncRecord: async (_resource, id) => { calls.push(`record:${id}`); return {} as never; },
    membership: async (id) => { calls.push(`membership:${id}`); return {} as never; },
  } as LogiReader;
}

describe('paced Logi reader', () => {
  it('spaces concurrent requests one slot apart and keeps the reader scope', async () => {
    let clock = 0;
    const delays: number[] = [];
    const calls: string[] = [];
    const reader = paceLogiReader(fakeReader(calls), 10, {
      now: () => clock,
      sleep: async (ms) => { delays.push(ms); },
    });
    expect(reader.scope.guildId).toBe('guild');
    expect(reader.resources).toEqual(['event-summaries']);
    await Promise.all(['a', 'b', 'c', 'd'].map((id) => reader.syncRecord('event-summaries', id)));
    expect(delays).toEqual([100, 200, 300]);
    expect(calls).toEqual(['record:a', 'record:b', 'record:c', 'record:d']);
    clock = 1_000;
    await reader.list('event-summaries');
    await reader.changes(['event-summaries'], 'cursor');
    expect(delays).toEqual([100, 200, 300, 100]);
    expect(calls.slice(4)).toEqual(['list:event-summaries', 'changes:cursor']);
  });

  it('ends a wait on an aborted signal as a timeout without sending the request', async () => {
    const calls: string[] = [];
    const reader = paceLogiReader(fakeReader(calls), 1);
    const controller = new AbortController();
    await reader.startChanges(['event-summaries'], { signal: controller.signal });
    const waiting = reader.syncRecord('event-summaries', 'late', { signal: controller.signal });
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ code: 'timeout' });
    expect(calls).toEqual(['start']);
  });

  it('defaults to a rate below the producer ceiling and rejects an invalid rate', () => {
    expect(LOGI_SYNC_REQUESTS_PER_SECOND).toBeLessThan(60);
    expect(() => paceLogiReader(fakeReader([]), 0)).toThrow(LogiClientError);
    expect(() => paceLogiReader(fakeReader([]), Number.NaN)).toThrow(LogiClientError);
  });
});
