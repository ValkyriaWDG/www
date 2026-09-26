import { randomBytes } from 'node:crypto';
import { runMigrations } from '@valkyria/db/migrate';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { resolveMigrationsFolder } from '../../src/cli/paths';

const adminUrl = () => inject('adminDatabaseUrl');

async function freshDatabase(): Promise<{ url: string; drop: () => Promise<void> }> {
  const name = `${new URL(adminUrl()).pathname.slice(1)}_w${randomBytes(4).toString('hex')}`;
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  await admin.query(`create database "${name}"`);
  await admin.end();
  const url = new URL(adminUrl());
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: async () => {
      const client = new pg.Client({ connectionString: adminUrl() });
      await client.connect();
      await client.query(`drop database if exists "${name}" with (force)`);
      await client.end();
    },
  };
}

describe('migration runner', () => {
  let target: Awaited<ReturnType<typeof freshDatabase>>;
  const migrationsFolder = resolveMigrationsFolder();

  beforeAll(async () => {
    target = await freshDatabase();
  });
  afterAll(async () => {
    await target.drop();
  });

  it('applies the full chain to an empty database, then is a no-op on rerun', async () => {
    const first = await runMigrations(target.url, { migrationsFolder });
    expect(first.applied.length).toBe(first.total);
    expect(first.total).toBeGreaterThan(0);
    const second = await runMigrations(target.url, { migrationsFolder });
    expect(second.applied).toEqual([]);
    expect(second.alreadyApplied).toBe(first.total);
  });

  it('serializes concurrent runners without duplicating journal rows', async () => {
    const other = await freshDatabase();
    try {
      const results = await Promise.all([
        runMigrations(other.url, { migrationsFolder }),
        runMigrations(other.url, { migrationsFolder }),
        runMigrations(other.url, { migrationsFolder }),
      ]);
      const appliedTotal = results.reduce((sum, result) => sum + result.applied.length, 0);
      expect(appliedTotal).toBe(results[0]!.total);
      const client = new pg.Client({ connectionString: other.url });
      await client.connect();
      const rows = await client.query('select count(*)::int as n from drizzle.__drizzle_migrations');
      await client.end();
      expect(rows.rows[0].n).toBe(results[0]!.total);
    } finally {
      await other.drop();
    }
  });

  it('reports failures without credentials', async () => {
    const bad = new URL(adminUrl());
    bad.password = 'definitely-wrong-password';
    bad.pathname = '/does_not_exist_db';
    await expect(runMigrations(bad.toString(), { migrationsFolder, lockWaitMs: 1000 })).rejects.toThrow(/Migration failed/);
    await runMigrations(bad.toString(), { migrationsFolder, lockWaitMs: 1000 }).catch((error: Error) => {
      expect(error.message).not.toContain('definitely-wrong-password');
    });
  });
});
