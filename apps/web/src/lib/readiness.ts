import 'server-only';
import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import journal from '@valkyria/db/journal';
import { getDbPool } from './db';
import { getServerEnv } from './env';

export type ReadinessReport = {
  status: 'ready' | 'not_ready';
  checks: {
    config: 'ok' | 'invalid';
    database: 'ok' | 'unavailable' | 'not_configured';
    schema: 'ok' | 'outdated' | 'unknown';
    media: 'ok' | 'unwritable';
  };
};

const TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/** Latest migration timestamp bundled with this build (Drizzle journal `when`). */
export function expectedMigrationMillis(): number {
  const entries = (journal as { entries: { when: number }[] }).entries;
  return Math.max(0, ...entries.map((entry) => entry.when));
}

export async function checkReadiness(): Promise<ReadinessReport> {
  const checks: ReadinessReport['checks'] = { config: 'ok', database: 'unavailable', schema: 'unknown', media: 'unwritable' };
  let mediaRoot = '.local/editorial-media';
  try {
    const env = getServerEnv();
    mediaRoot = env.EDITORIAL_MEDIA_ROOT;
    if (!env.DATABASE_URL) checks.database = 'not_configured';
  } catch {
    checks.config = 'invalid';
  }

  if (checks.config === 'ok' && checks.database !== 'not_configured') {
    try {
      const pool = getDbPool();
      await withTimeout(pool.query('select 1'), TIMEOUT_MS);
      checks.database = 'ok';
    } catch {
      checks.database = 'unavailable';
    }
  }

  if (checks.database === 'ok') {
    try {
      const pool = getDbPool();
      const table = await withTimeout(
        pool.query<{ present: boolean }>("select to_regclass('drizzle.__drizzle_migrations') is not null as present"),
        TIMEOUT_MS,
      );
      if (!table.rows[0]?.present) {
        checks.schema = 'outdated';
      } else {
        const result = await withTimeout(
          pool.query<{ latest: string | null }>('select max(created_at)::text as latest from drizzle.__drizzle_migrations'),
          TIMEOUT_MS,
        );
        const latest = Number(result.rows[0]?.latest ?? 0);
        checks.schema = latest >= expectedMigrationMillis() ? 'ok' : 'outdated';
      }
    } catch {
      checks.schema = 'unknown';
    }
  }

  try {
    const resolved = path.resolve(/*turbopackIgnore: true*/ mediaRoot);
    await mkdir(resolved, { recursive: true });
    await access(resolved, constants.W_OK);
    checks.media = 'ok';
  } catch {
    checks.media = 'unwritable';
  }

  const ready = checks.config === 'ok' && checks.database === 'ok' && checks.schema === 'ok';
  return { status: ready ? 'ready' : 'not_ready', checks };
}
