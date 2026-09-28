import { randomBytes } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { contentDocument, createDb, type DbHandle } from '@valkyria/db';
import { runMigrations } from '@valkyria/db/migrate';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { FixtureSchemaError, loadFixtures } from '@/fixtures/index';
import { resolveMigrationsFolder } from '../../src/cli/paths';

// The release rollback rehearsal loads the candidate fixture CLI into the previous image's
// schema. This reproduces that older schema by applying only the initial migration.
const adminUrl = () => inject('adminDatabaseUrl');
let name: string;
let handle: DbHandle;
let url: string;
let folders: string[] = [];

function migrationsUpTo(count: number): string {
  const source = resolveMigrationsFolder();
  const target = mkdtempSync(path.join(tmpdir(), 'valkyria-migrations-'));
  folders.push(target);
  cpSync(source, target, { recursive: true });
  const journalPath = path.join(target, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: unknown[] };
  writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, count) }));
  return target;
}

beforeAll(async () => {
  name = `${new URL(adminUrl()).pathname.slice(1)}_w${randomBytes(4).toString('hex')}`;
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  await admin.query(`create database "${name}"`);
  await admin.end();
  const parsed = new URL(adminUrl());
  parsed.pathname = `/${name}`;
  url = parsed.toString();
  await runMigrations(url, { migrationsFolder: migrationsUpTo(1) });
  handle = createDb(url, { max: 2, applicationName: 'valkyria-test' });
});
afterAll(async () => {
  await handle?.close();
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  await admin.query(`drop database if exists "${name}" with (force)`);
  await admin.end();
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
  folders = [];
});

describe('fixtures on the schema that predates the field manual', () => {
  const mediaRoot = () => path.join(tmpdir(), `valkyria-fixture-compat-${name}`);

  it('fails with a schema error unless schema-compatible loading is requested', async () => {
    await expect(loadFixtures(handle.db, { mediaRoot: mediaRoot() })).rejects.toBeInstanceOf(FixtureSchemaError);
    expect(await handle.db.select().from(contentDocument)).toHaveLength(0);
  });

  it('loads every group the older schema stores and names the skipped field manual', async () => {
    const report = await loadFixtures(handle.db, { mediaRoot: mediaRoot(), schemaCompatible: true });
    expect(report).toMatchObject({ manual: 0, manualTranslations: 0, skipped: ['field manual'] });
    expect(report.news).toBeGreaterThan(0);
    expect(await handle.db.select().from(contentDocument).where(eq(contentDocument.kind, 'news'))).toHaveLength(report.news);
  });

  it('loads the complete set, field manual included, after the remaining migrations', async () => {
    await runMigrations(url, { migrationsFolder: resolveMigrationsFolder() });
    const report = await loadFixtures(handle.db, { mediaRoot: mediaRoot() });
    expect(report.skipped).toEqual([]);
    expect(report.manual).toBeGreaterThan(0);
    rmSync(mediaRoot(), { recursive: true, force: true });
  });
});
