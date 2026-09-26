import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.ts';

export type Schema = typeof schema;
export type Database = NodePgDatabase<Schema>;
/** A Drizzle transaction or database handle usable by repositories. */
export type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export type DbHandle = { db: Database; pool: pg.Pool; close: () => Promise<void> };

export type CreateDbOptions = {
  /** Maximum pooled connections (default 10). */
  max?: number;
  /** Per-statement timeout in milliseconds applied to every pooled connection. */
  statementTimeoutMs?: number;
  applicationName?: string;
};

/** Creates a pooled Drizzle instance. The caller owns `close()`. */
export function createDb(connectionString: string, options: CreateDbOptions = {}): DbHandle {
  const pool = new pg.Pool({
    connectionString,
    max: options.max ?? 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: options.statementTimeoutMs ?? 15_000,
    application_name: options.applicationName ?? 'valkyria-web',
  });
  // An idle client error (e.g. database restart) must not crash the process.
  pool.on('error', () => undefined);
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

/** Removes credentials from a connection string or error text before logging. */
export function redactConnectionDetails(value: string): string {
  return value.replace(/(postgres(?:ql)?:\/\/)[^@\s]*@/gi, '$1***@').replace(/password=[^\s&]+/gi, 'password=***');
}
