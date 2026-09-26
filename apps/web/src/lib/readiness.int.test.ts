import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, afterEach, describe, expect, inject, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../../tests/support/test-db';
import { resetDbForTests } from './db';
import { resetServerEnvForTests } from './env';
import { checkReadiness } from './readiness';

const originalUrl = process.env.DATABASE_URL;
const cleanups: (() => Promise<void>)[] = [];

async function useDatabase(url: string | undefined) {
  await resetDbForTests();
  resetServerEnvForTests();
  if (url === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = url;
}

afterEach(async () => {
  await resetDbForTests();
});
afterAll(async () => {
  await useDatabase(originalUrl);
  for (const cleanup of cleanups) await cleanup();
});

describe('readiness', () => {
  it('is ready for a migrated database and reports no connection details', async () => {
    const db: TestDatabase = await createTestDatabase();
    cleanups.push(db.drop);
    await useDatabase(db.url);
    const report = await checkReadiness();
    expect(report).toMatchObject({ status: 'ready', checks: { config: 'ok', database: 'ok', schema: 'ok' } });
    expect(JSON.stringify(report)).not.toContain('postgres');
  });

  it('is not ready when the schema has not been migrated', async () => {
    const admin = inject('adminDatabaseUrl');
    const name = `${new URL(admin).pathname.slice(1)}_w${randomBytes(4).toString('hex')}`;
    const client = new pg.Client({ connectionString: admin });
    await client.connect();
    await client.query(`create database "${name}"`);
    await client.end();
    cleanups.push(async () => {
      const c = new pg.Client({ connectionString: admin });
      await c.connect();
      await c.query(`drop database if exists "${name}" with (force)`);
      await c.end();
    });
    const url = new URL(admin);
    url.pathname = `/${name}`;
    await useDatabase(url.toString());
    const report = await checkReadiness();
    expect(report).toMatchObject({ status: 'not_ready', checks: { database: 'ok', schema: 'outdated' } });
  });

  it('is not ready when the database is unreachable', async () => {
    await useDatabase('postgresql://nobody:secret-value@127.0.0.1:1/none');
    const report = await checkReadiness();
    expect(report).toMatchObject({ status: 'not_ready', checks: { database: 'unavailable' } });
    expect(JSON.stringify(report)).not.toContain('secret-value');
  });

  it('reports a missing DATABASE_URL as not configured', async () => {
    await useDatabase(undefined);
    const report = await checkReadiness();
    expect(report.checks.database).toBe('not_configured');
    expect(report.status).toBe('not_ready');
  });
});
