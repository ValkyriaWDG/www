import type { Database } from '@valkyria/db';
import { describe, expect, it, vi } from 'vitest';
import { receiveRoleSync } from './receiver';
import { ROLE_SYNC_PATH, type ReceiverConfig } from './protocol';

const config: ReceiverConfig = { enabled: true, producer: 'fixture', guildId: '111111111111111111', keys: { current: 'x'.repeat(32) } };
const transaction = vi.fn(async () => { throw new Error('Database must not be touched'); });
const db = { transaction } as unknown as Database;

describe('receiver HTTP boundary', () => {
  it('rejects unsigned, oversized and wrong-media requests before persistence and returns no-store', async () => {
    const cases = [
      new Request(`http://127.0.0.1${ROLE_SYNC_PATH}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
      new Request(`http://127.0.0.1${ROLE_SYNC_PATH}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(65_537) }),
      new Request(`http://127.0.0.1${ROLE_SYNC_PATH}`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }),
    ];
    const responses = await Promise.all(cases.map((request) => receiveRoleSync(request, { db, config })));
    expect(responses.map((response) => response.status)).toEqual([401, 413, 400]);
    for (const response of responses) expect(response.headers.get('cache-control')).toContain('no-store');
    expect(transaction).not.toHaveBeenCalled();
  });
  it('bounds a stalled body and cancels its stream', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    try {
      const request = new Request(`http://127.0.0.1${ROLE_SYNC_PATH}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: new ReadableStream({ cancel }), duplex: 'half' } as RequestInit);
      const response = receiveRoleSync(request, { db, config });
      await vi.advanceTimersByTimeAsync(5001);
      expect((await response).status).toBe(408);
      expect(cancel).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
});
