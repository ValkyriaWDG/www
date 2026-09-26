import 'server-only';
import { createDb, type Database, type DbHandle } from '@valkyria/db';
import { requireDatabaseUrl } from './env';

const globalForDb = globalThis as typeof globalThis & { __valkyriaDb?: DbHandle };

/**
 * Process-wide pooled database handle. Created lazily so builds and liveness checks
 * never require a database connection.
 */
export function getDb(): Database {
  if (!globalForDb.__valkyriaDb) {
    globalForDb.__valkyriaDb = createDb(requireDatabaseUrl(), { max: 10, applicationName: 'valkyria-web' });
  }
  return globalForDb.__valkyriaDb.db;
}

export function getDbPool(): DbHandle['pool'] {
  getDb();
  return globalForDb.__valkyriaDb!.pool;
}

/** Test helper: close and forget the process-wide pool. */
export async function resetDbForTests(): Promise<void> {
  const handle = globalForDb.__valkyriaDb;
  globalForDb.__valkyriaDb = undefined;
  await handle?.close().catch(() => undefined);
}
