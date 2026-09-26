import { randomBytes } from 'node:crypto';
import { createDb, type DbHandle } from '@valkyria/db';
import pg from 'pg';
import { inject } from 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    templateDatabaseUrl: string;
    adminDatabaseUrl: string;
  }
}

export type TestDatabase = DbHandle & { url: string; drop: () => Promise<void> };

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/**
 * Creates an isolated PostgreSQL database cloned from the migrated template. Every test
 * file gets its own real database; nothing is mocked at the persistence boundary.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const adminUrl = inject('adminDatabaseUrl');
  const templateUrl = inject('templateDatabaseUrl');
  const template = new URL(templateUrl).pathname.slice(1);
  const name = `${template.replace(/_tpl$/, '')}_w${randomBytes(4).toString('hex')}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`create database "${name}" template "${template}"`);
  } finally {
    await admin.end();
  }
  const url = withDatabase(adminUrl, name);
  const handle = createDb(url, { max: 5, applicationName: 'valkyria-test' });
  return {
    ...handle,
    url,
    drop: async () => {
      await handle.close().catch(() => undefined);
      const client = new pg.Client({ connectionString: adminUrl });
      await client.connect();
      try {
        await client.query(`drop database if exists "${name}" with (force)`);
      } finally {
        await client.end();
      }
    },
  };
}
