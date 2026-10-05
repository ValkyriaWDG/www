// Prepares the disposable e2e database with the same bundled CLIs used in the image,
// then serves the standalone build. Never point this at a non-disposable database.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = new URL(process.env.DATABASE_URL);
const name = target.pathname.slice(1);
if (!name.endsWith('_e2e')) throw new Error('Refusing to reset a database whose name does not end with _e2e.');

const admin = new pg.Client({ connectionString: process.env.E2E_ADMIN_DATABASE_URL || process.env.DATABASE_URL });
await admin.connect();
await admin.query(`drop database if exists "${name}" with (force)`);
await admin.query(`create database "${name}"`);
await admin.end();

const cli = (file, args = [], dir = 'cli') => {
  const script = path.join(appDir, 'dist', dir, file);
  if (!existsSync(script)) return false;
  execFileSync(process.execPath, [script, ...args], { stdio: 'inherit', env: process.env, cwd: appDir });
  return true;
};
if (!cli('migrate.mjs')) throw new Error('dist/cli/migrate.mjs missing; run "pnpm build" first.');
cli('seed.mjs');
cli('fixtures.mjs', ['--allow-fixtures'], 'dev-cli');

// The separate Logi browser suite adds only synthetic, publication-scoped projections.
// Resolve archive UUIDs after the ordinary fixtures; no operational Logi request runs.
if (process.env.E2E_LOGI_PUBLIC_FIXTURES === '1') {
  const fixtureEnv = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', path.join(appDir, 'e2e', 'support', 'seed-logi-public.ts')], {
    cwd: appDir, env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
  }));
  Object.assign(process.env, fixtureEnv);
}

const children = [];
const discordMock = path.join(appDir, 'e2e', 'support', 'discord-mock.mjs');
if (existsSync(discordMock)) {
  children.push(spawn(process.execPath, [discordMock], { stdio: 'inherit', env: process.env }));
}
if (process.env.E2E_CRCON_MOCK_PORT) {
  children.push(spawn(process.execPath, [path.join(appDir, 'e2e', 'support', 'crcon-mock.mjs')], { stdio: 'inherit', env: process.env }));
}
const server = spawn(process.execPath, [path.join(appDir, 'scripts', 'serve-standalone.mjs')], { stdio: 'inherit', env: process.env });
children.push(server);
const stop = (signal) => children.forEach((child) => child.kill(signal));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal));
server.on('exit', (code) => {
  stop('SIGTERM');
  process.exit(code ?? 0);
});
