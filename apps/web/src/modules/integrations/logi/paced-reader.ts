import { LogiClientError, type LogiReader, type LogiRequestOptions } from './client';

/**
 * Requests per second one synchronization run may send to Logi. Logi limits each
 * clan key to 60 per second, shared by every reader of the website; a baseline
 * sweep (a list page, then one sync-record per item, four at a time) ran at that
 * ceiling on its own.
 */
export const LOGI_SYNC_REQUESTS_PER_SECOND = 10;

type PaceDependencies = { now?: () => number; sleep?: (ms: number, signal?: AbortSignal) => Promise<void> };

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new LogiClientError('timeout'));
  return new Promise((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); reject(new LogiClientError('timeout')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', aborted); resolve(); }, ms);
    signal?.addEventListener('abort', aborted, { once: true });
  });
}

/**
 * The reader with its requests spaced at least `1000 / requestsPerSecond` ms apart,
 * concurrent callers included: each call reserves the next free slot before it
 * waits. An aborted signal ends the wait as `timeout`, like the transport does.
 */
export function paceLogiReader(reader: LogiReader, requestsPerSecond = LOGI_SYNC_REQUESTS_PER_SECOND, dependencies: PaceDependencies = {}): LogiReader {
  if (!Number.isFinite(requestsPerSecond) || requestsPerSecond <= 0) throw new LogiClientError('configuration');
  const intervalMs = 1000 / requestsPerSecond;
  const now = dependencies.now ?? Date.now;
  const wait = dependencies.sleep ?? sleep;
  let nextSlot = Number.NEGATIVE_INFINITY;
  async function slot(options?: LogiRequestOptions): Promise<void> {
    const at = Math.max(now(), nextSlot);
    nextSlot = at + intervalMs;
    const delay = at - now();
    if (delay > 0) await wait(delay, options?.signal);
    else if (options?.signal?.aborted) throw new LogiClientError('timeout');
  }
  return {
    get scope() { return reader.scope; },
    get resources() { return reader.resources; },
    async list(resource, input) { await slot(input); return reader.list(resource, input); },
    async startChanges(resources, options) { await slot(options); return reader.startChanges(resources, options); },
    async changes(resources, cursor, options) { await slot(options); return reader.changes(resources, cursor, options); },
    async syncRecord(resource, id, options) { await slot(options); return reader.syncRecord(resource, id, options); },
    async membership(discordUserId, maxAgeMs, options) { await slot(options); return reader.membership(discordUserId, maxAgeMs, options); },
  };
}
