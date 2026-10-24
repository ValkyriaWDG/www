import 'server-only';
import type { ConfiguredLogiSource } from '../logi-config';
import { createLogiClient, LogiClientError, type LogiReader } from '../logi/client';
import type { LogiCollectionPage, LogiServerSnapshot } from '../logi/contracts';

/** Live state is absent from Logi's change feed. Poll its current collection separately. */
export const LOGI_SERVER_REFRESH_MS = 15_000;
const MAX_PAGES = 5;
const MAX_ENTRIES = 8;
export type LogiServerRead = { rows: readonly LogiServerSnapshot[]; available: boolean };

export function createLogiServerCache(reader: Pick<LogiReader, 'list'>, clock: () => number = Date.now) {
  let rows: LogiServerSnapshot[] = [];
  let available = false;
  let nextAttemptAt = 0;
  let inflight: Promise<LogiServerRead> | undefined;

  async function refresh(): Promise<LogiServerRead> {
    try {
      const next: LogiServerSnapshot[] = [];
      const cursors = new Set<string>();
      const ids = new Set<string>();
      const signal = AbortSignal.timeout(8_000);
      let cursor: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        const response: LogiCollectionPage<'server-snapshots'> = await reader.list('server-snapshots', { cursor, limit: 100, signal });
        for (const row of response.data) {
          if (ids.has(row.id)) throw new LogiClientError('invalid_response');
          ids.add(row.id);
          next.push(row);
        }
        cursor = response.page.nextCursor;
        if (cursor === null) break;
        if (cursors.has(cursor) || page === MAX_PAGES - 1) throw new LogiClientError('invalid_response');
        cursors.add(cursor);
      }
      // Replace only after every page succeeded; missing/deleted connections vanish.
      rows = next;
      available = true;
      nextAttemptAt = clock() + LOGI_SERVER_REFRESH_MS;
    } catch (error) {
      available = false;
      if (error instanceof LogiClientError && ['unauthorized', 'forbidden', 'scope_mismatch', 'configuration'].includes(error.code)) rows = [];
      const retry = error instanceof LogiClientError ? error.retryAfterMs : null;
      nextAttemptAt = clock() + Math.min(5 * 60_000, Math.max(LOGI_SERVER_REFRESH_MS, retry ?? 30_000));
    }
    return { rows, available };
  }

  return {
    async read(): Promise<LogiServerRead> {
      if (inflight) return inflight;
      if (clock() < nextAttemptAt) return { rows, available };
      inflight = refresh();
      try { return await inflight; }
      finally { inflight = undefined; }
    },
  };
}

const caches = new Map<string, ReturnType<typeof createLogiServerCache>>();

export async function readCurrentLogiServers(source: ConfiguredLogiSource): Promise<LogiServerRead> {
  let cache = caches.get(source.scopeKey);
  if (!cache) {
    if (caches.size >= MAX_ENTRIES) caches.delete(caches.keys().next().value!);
    cache = createLogiServerCache(createLogiClient({ ...source, resources: ['server-snapshots'] }));
    caches.set(source.scopeKey, cache);
  }
  return cache.read();
}

export function resetLogiServerCacheForTests(): void { caches.clear(); }
