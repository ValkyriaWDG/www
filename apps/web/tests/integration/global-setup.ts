import { runMigrations } from '@valkyria/db/migrate';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { resolveMigrationsFolder } from '../../src/cli/paths';

/**
 * Integration tests require a disposable PostgreSQL server (`DATABASE_URL`). A missing
 * database fails the run: integration checks are never silently skipped.
 */
export default async function setup(project: TestProject) {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) throw new Error('DATABASE_URL must point to a disposable PostgreSQL database for integration tests.');
  const base = new URL(baseUrl);
  const baseName = base.pathname.slice(1) || 'valkyria_test';
  const templateName = `${baseName}_tpl`;
  const templateUrl = new URL(baseUrl);
  templateUrl.pathname = `/${templateName}`;

  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await dropWorkerDatabases(admin, baseName);
    await admin.query(`drop database if exists "${templateName}" with (force)`);
    await admin.query(`create database "${templateName}"`);
  } finally {
    await admin.end();
  }

  await runMigrations(templateUrl.toString(), { migrationsFolder: resolveMigrationsFolder() });

  project.provide('adminDatabaseUrl', baseUrl);
  project.provide('templateDatabaseUrl', templateUrl.toString());

  return async () => {
    const cleanup = new pg.Client({ connectionString: baseUrl });
    await cleanup.connect();
    try {
      await dropWorkerDatabases(cleanup, baseName);
      await cleanup.query(`drop database if exists "${templateName}" with (force)`);
    } finally {
      await cleanup.end();
    }
  };
}

async function dropWorkerDatabases(client: pg.Client, baseName: string) {
  const rows = await client.query<{ datname: string }>(
    "select datname from pg_database where datname like $1 escape '\\'",
    [`${baseName.replace(/[_%\\]/g, (c) => `\\${c}`)}\\_w%`],
  );
  for (const row of rows.rows) await client.query(`drop database if exists "${row.datname}" with (force)`);
}
