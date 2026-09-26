import { randomBytes } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

  it('upgrades populated pre-role-sync storage without losing observations, then safely reruns', async () => {
    const other = await freshDatabase();
    const baseline = await mkdtemp(path.join(tmpdir(), 'valkyria-migration-'));
    const client = new pg.Client({ connectionString: other.url });
    try {
      await mkdir(path.join(baseline, 'meta'));
      const journal = JSON.parse(await readFile(path.join(migrationsFolder, 'meta/_journal.json'), 'utf8'));
      journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx === 0);
      await writeFile(path.join(baseline, 'meta/_journal.json'), JSON.stringify(journal));
      await copyFile(path.join(migrationsFolder, '0000_initial_schema.sql'), path.join(baseline, '0000_initial_schema.sql'));
      await runMigrations(other.url, { migrationsFolder: baseline });
      await client.connect();
      await client.query("insert into guild_membership(guild_id,discord_user_id,state,role_ids,observed_at,source) values('111111111111111111','222222222222222222','present',array['333333333333333333'],now(),'rest_refresh')");
      const upgrade = await runMigrations(other.url, { migrationsFolder });
      expect(upgrade.applied).toHaveLength(1);
      expect((await client.query('select state,role_ids,source,authorization_generation::text as generation from guild_membership')).rows).toEqual([{ state: 'present', role_ids: ['333333333333333333'], source: 'rest_refresh', generation: '0' }]);
      expect((await runMigrations(other.url, { migrationsFolder })).applied).toEqual([]);
    } finally {
      await client.end().catch(() => undefined);
      await other.drop();
      // Only the fresh directory returned by mkdtemp is removed.
      await rm(baseline, { recursive: true, force: true });
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
