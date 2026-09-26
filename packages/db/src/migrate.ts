import { readMigrationFiles } from 'drizzle-orm/migrator';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { redactConnectionDetails } from './client.ts';

/** Stable advisory-lock key serializing competing migration runners ("VLKMIGR1"). */
export const MIGRATION_LOCK_KEY = 0x564c4b4d49475231n;

export type MigrationResult = { applied: string[]; alreadyApplied: number; total: number };

export type MigrateOptions = {
  migrationsFolder: string;
  /** Maximum time to wait for the advisory lock held by another runner. */
  lockWaitMs?: number;
  /** Lock timeout for DDL statements (avoid blocking live traffic indefinitely). */
  lockTimeoutMs?: number;
  statementTimeoutMs?: number;
  log?: (message: string) => void;
};

/**
 * Applies reviewed SQL migrations exactly once. Competing runners are serialized with a
 * session advisory lock; each migration file runs in Drizzle's transaction and is
 * recorded in `drizzle.__drizzle_migrations`. Errors are returned without credentials.
 */
export async function runMigrations(connectionString: string, options: MigrateOptions): Promise<MigrationResult> {
  const log = options.log ?? (() => undefined);
  const client = new pg.Client({ connectionString, application_name: 'valkyria-migrate' });
  try {
    await client.connect();
    await client.query(`set lock_timeout = ${Math.max(1000, Math.trunc(options.lockTimeoutMs ?? 10_000))}`);
    await client.query(`set statement_timeout = ${Math.max(1000, Math.trunc(options.statementTimeoutMs ?? 120_000))}`);
    await acquireLock(client, options.lockWaitMs ?? 60_000);

    const files = readMigrationFiles({ migrationsFolder: options.migrationsFolder });
    const before = await appliedHashes(client);
    const pending = files.filter((file) => !before.has(file.hash));
    log(`Migrations: ${files.length} total, ${files.length - pending.length} already applied, ${pending.length} pending.`);

    const db = drizzle(client);
    await migrate(db, { migrationsFolder: options.migrationsFolder });

    const after = await appliedHashes(client);
    const applied = pending.filter((file) => after.has(file.hash)).map((file) => String(file.folderMillis));
    if (applied.length !== pending.length) throw new Error('Migration journal does not contain every pending migration after execution.');
    return { applied, alreadyApplied: files.length - pending.length, total: files.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Migration failed: ${redactConnectionDetails(message)}`);
  } finally {
    await client.query('select pg_advisory_unlock_all()').catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

async function acquireLock(client: pg.Client, waitMs: number): Promise<void> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const result = await client.query<{ locked: boolean }>('select pg_try_advisory_lock($1::bigint) as locked', [
      MIGRATION_LOCK_KEY.toString(),
    ]);
    if (result.rows[0]?.locked) return;
    if (Date.now() >= deadline) throw new Error('Timed out waiting for another migration runner to finish.');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function appliedHashes(client: pg.Client): Promise<Set<string>> {
  const exists = await client.query<{ present: boolean }>(
    "select to_regclass('drizzle.__drizzle_migrations') is not null as present",
  );
  if (!exists.rows[0]?.present) return new Set();
  const rows = await client.query<{ hash: string }>('select hash from drizzle.__drizzle_migrations');
  return new Set(rows.rows.map((row) => row.hash));
}
