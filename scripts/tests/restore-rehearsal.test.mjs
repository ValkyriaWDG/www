import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { launchApp, parseDatabaseUrl, parseOptions, rehearse, RehearsalError, request, runCommand, stopOwnedProcess } from '../../apps/web/scripts/restore-rehearsal.mjs';

const PUBLIC = '10000000-0000-4000-8000-000000000001';
const PRIVATE = '10000000-0000-4000-8000-000000000002';
const SECRET = 'synthetic-password-must-not-appear';
function fixture(t, options = {}) {
  const root = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'vlk-rehearsal-test-'));
  t.after(() => { assert(path.basename(root).startsWith('vlk-rehearsal-test-')); rmSync(root, { recursive: true, force: true }); });
  const appDir = path.join(root, 'repo/apps/web'), mediaRoot = path.join(root, 'source-media');
  for (const dir of [mediaRoot, path.join(appDir, 'dist/cli'), path.join(appDir, '.next/standalone/apps/web')]) mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(appDir, 'dist/cli/migrate.mjs'), '// synthetic');
  writeFileSync(path.join(appDir, '.next/standalone/apps/web/server.js'), '// synthetic');
  const input = { sourceDb: `postgresql://test:${SECRET}@127.0.0.1:5432/source`, targetDb: `postgresql://test:${SECRET}@127.0.0.1:5432/proof_restore`,
    mediaRoot, workDir: path.join(root, 'new-output'), port: 3349, operatorFrozen: true, publicAssets: [], privateAssets: [] };
  const calls = [], sentinel = { value: 'keep-database-sentinel' };
  let stopped = 0;
  const assets = options.media ? [PUBLIC, PRIVATE].map(id => ({ id, variants: { thumb: { bytes: 5 } } })) : [];
  if (options.media) {
    for (const { id } of assets) { mkdirSync(path.join(mediaRoot, id)); writeFileSync(path.join(mediaRoot, id, 'thumb.webp'), 'bytes'); }
    input.publicAssets = [PUBLIC]; input.privateAssets = [PRIVATE];
  }
  const adapters = { appDir, availablePort: async () => { options.beforeSql?.(input); },
    client: url => ({ connect: async () => { calls.push('connect'); }, end: async () => {}, query: async (sql) => {
      calls.push(sql);
      if (sql.startsWith('select 1 from pg_database')) return { rows: options.exists ? [sentinel] : [] };
      if (sql.startsWith('create database')) { if (options.createError) throw Object.assign(new Error(SECRET), { code: options.createError }); return { rows: [] }; }
      if (sql.includes('information_schema.tables')) return { rows: [{ table_schema: 'public', table_name: 'asset' }] };
      if (sql.startsWith('select count')) return { rows: [{ n: assets.length, digest: options.tableMismatch && url.pathname.endsWith('_restore') ? 'changed' : 'same' }] };
      if (sql.startsWith('select id, variants')) return { rows: assets };
      throw Error(`Unexpected query: ${sql}`);
    } }),
    run: async (binary, args, commandOptions) => {
      calls.push(binary);
      assert(!args.some(arg => arg.includes(SECRET)));
      if (binary === 'pg_dump') {
        if (options.dumpError) throw Error(`postgresql://test:${SECRET}@private-host/token`);
        assert.equal(commandOptions.env.PGPASSWORD, SECRET);
        writeFileSync(args[args.indexOf('--file') + 1], 'synthetic dump');
      } else if (binary === 'pg_restore') assert.equal(args[args.indexOf('--dbname') + 1], 'proof_restore');
      else if (binary === 'tar' && args.includes('-czf')) writeFileSync(args[args.indexOf('-czf') + 1], 'synthetic archive');
      else if (binary === 'tar') { cpSync(mediaRoot, args[1], { recursive: true }); options.afterExtract?.(args[1]); }
      else if (binary === process.execPath) return options.migration || 'Applied 0 migration(s); 1 already applied; 1 total.';
      return '';
    },
    launchApp: async () => { calls.push('app'); return { waitReady: async () => { if (options.startError) throw new RehearsalError('app_start_timeout'); }, alive: () => true, stop: async () => { stopped++; } }; },
    request: async url => {
      if (options.httpError) throw Error(`timeout ${SECRET}`);
      if (url.includes(PRIVATE)) return { status: options.exposePrivate ? 200 : 404, body: Buffer.from('bytes') };
      if (url.includes('/api/media/')) return { status: 200, body: Buffer.from('bytes') };
      return { status: 200, body: Buffer.from('ok') };
    },
  };
  return { root, appDir, input, calls, sentinel, adapters, stopped: () => stopped };
}

test('invalid paths and database contracts refuse all SQL/subprocesses and preserve sentinels', async t => {
  const cases = {
    'existing nonempty work directory': f => { mkdirSync(f.input.workDir); writeFileSync(path.join(f.input.workDir, 'sentinel'), 'untouched'); },
    'existing empty work directory': f => mkdirSync(f.input.workDir),
    'filesystem root': f => { f.input.workDir = path.parse(f.root).root; },
    'repository root': f => { f.input.workDir = path.join(f.root, 'repo'); },
    'repository child': f => { f.input.workDir = path.join(f.root, 'repo/new'); },
    'source media root': f => { f.input.workDir = f.input.mediaRoot; },
    'source child': f => { f.input.workDir = path.join(f.input.mediaRoot, 'new'); },
    'source ancestor': f => { f.input.workDir = f.root; },
    'lexical alias of source': f => { f.input.workDir = `${f.input.mediaRoot}/../source-media`; },
    'linked parent': f => { const alias = path.join(f.root, 'alias'); symlinkSync(f.root, alias, process.platform === 'win32' ? 'junction' : 'dir'); f.input.workDir = path.join(alias, 'new'); },
    'linked source root': f => { const alias = path.join(f.root, 'alias'); symlinkSync(f.input.mediaRoot, alias, process.platform === 'win32' ? 'junction' : 'dir'); f.input.mediaRoot = alias; },
    'nested media junction': f => symlinkSync(path.join(f.root, 'repo'), path.join(f.input.mediaRoot, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'),
    'hard-linked source file': f => { const file = path.join(f.root, 'sentinel'); writeFileSync(file, 'untouched'); linkSync(file, path.join(f.input.mediaRoot, 'hard-link')); },
    'same database': f => { f.input.sourceDb = f.input.targetDb; },
    'missing restore suffix': f => { f.input.targetDb = f.input.sourceDb.replace('/source', '/target'); },
    'malformed URL': f => { f.input.targetDb = SECRET; },
    'unsupported protocol': f => { f.input.targetDb = f.input.targetDb.replace('postgresql:', 'https:'); },
    'invalid database port': f => { f.input.targetDb = f.input.targetDb.replace(':5432', ':99999'); },
    'different host alias': f => { f.input.targetDb = f.input.targetDb.replace('127.0.0.1', 'localhost'); },
    ...Object.fromEntries(['%2Ftmp', 'host1,host2', 'host%2eexample', '-invalid'].map(host => [`unsupported host ${host}`, f => { f.input.sourceDb = f.input.sourceDb.replace('127.0.0.1', host); f.input.targetDb = f.input.targetDb.replace('127.0.0.1', host); }])),
    'different port': f => { f.input.targetDb = f.input.targetDb.replace(':5432', ':5433'); },
    'different user': f => { f.input.targetDb = f.input.targetDb.replace('//test:', '//other:'); },
    'different password': f => { f.input.targetDb = f.input.targetDb.replace(SECRET, 'other'); },
    'different SSL option': f => { f.input.targetDb += '?sslmode=require'; },
    'host URL option': f => { f.input.sourceDb += '?host=other'; f.input.targetDb += '?host=other'; },
    ...Object.fromEntries(['database', 'dbname', 'user', 'password', 'service', 'options', '%64atabase', 'hostaddr', 'sslcert', 'sslmode=require&sslmode'].map(key => [`query override ${key}`, f => { f.input.sourceDb += `?${key}=require`; f.input.targetDb += `?${key}=require`; }])),
    ...Object.fromEntries(['/%70roof_restore', '/foo%2fproof_restore', '//proof_restore', '/proof_restore%00'].map(value => [`database path alias ${value}`, f => { f.input.targetDb = f.input.targetDb.replace('/proof_restore', value); }])),
    'implicit password file': f => { f.input.sourceDb = f.input.sourceDb.replace(`:${SECRET}@`, '@'); f.input.targetDb = f.input.targetDb.replace(`:${SECRET}@`, '@'); },
    'invalid HTTP port': f => { f.input.port = 0; },
    'unfrozen source': f => { f.input.operatorFrozen = false; },
    'invalid asset expectation': f => { f.input.publicAssets = ['../private']; },
  };
  for (const [name, prepare] of Object.entries(cases)) await t.test(name, async t => {
    const f = fixture(t); prepare(f);
    const result = await rehearse(f.input, f.adapters);
    assert.equal(result.status, 'failed'); assert.deepEqual(f.calls, []);
    assert.equal(result.ownership.workDirectory, 'not-created');
    assert(!JSON.stringify(result).includes(SECRET));
    for (const sentinel of [path.join(f.root, 'sentinel'), path.join(f.root, 'new-output/sentinel')]) if (existsSync(sentinel)) assert.equal(readFileSync(sentinel, 'utf8'), 'untouched');
  });
});

test('existing database refuses before work creation and preserves database sentinel', async t => {
  const f = fixture(t, { exists: true });
  const result = await rehearse(f.input, f.adapters);
  assert.equal(result.code, 'target_database_exists'); assert(!existsSync(f.input.workDir));
  assert.equal(f.sentinel.value, 'keep-database-sentinel'); assert(!f.calls.some(sql => /create|drop|pg_dump/i.test(sql)));
});
for (const code of ['42P04', '42501', 'ECONNRESET']) test(`CREATE ${code} never DROP/disconnects or starts capture`, async t => {
  const f = fixture(t, { createError: code });
  const result = await rehearse(f.input, f.adapters);
  assert.equal(result.status, 'failed'); assert.equal(result.ownership.database, code === 'ECONNRESET' ? 'creation-outcome-unknown' : 'not-created');
  assert.equal(f.sentinel.value, 'keep-database-sentinel'); assert(!f.calls.some(sql => /drop|terminate_backend|pg_dump/i.test(sql)));
  assert.equal(JSON.parse(readFileSync(path.join(f.input.workDir, 'report.json'))).code, result.code);
  assert(!readFileSync(path.join(f.input.workDir, 'report.json'), 'utf8').includes(SECRET));
});
test('work-directory creation race leaves the competing sentinel untouched', async t => {
  const f = fixture(t, { beforeSql: input => { mkdirSync(input.workDir); writeFileSync(path.join(input.workDir, 'sentinel'), 'race-owner'); } });
  const result = await rehearse(f.input, f.adapters);
  assert.equal(result.ownership.workDirectory, 'not-created'); assert(!f.calls.some(sql => /create|drop|pg_dump/i.test(sql)));
  assert.equal(readFileSync(path.join(f.input.workDir, 'sentinel'), 'utf8'), 'race-owner'); assert(!existsSync(path.join(f.input.workDir, 'report.json')));
});
test('empty media succeeds with explicit not-applicable delivery and owned app cleanup', async t => {
  const f = fixture(t), result = await rehearse(f.input, f.adapters);
  assert.equal(result.status, 'passed'); assert.equal(result.steps.serve.mediaDelivery, 'not-applicable-empty'); assert.equal(f.stopped(), 1);
  assert.equal(result.ownership.database, 'created-retained'); assert.equal(result.ownership.appProcess, 'stopped');
});
test('empty asset table refuses a media tree containing even an empty directory', async t => {
  const f = fixture(t); mkdirSync(path.join(f.input.mediaRoot, 'orphan'));
  const result = await rehearse(f.input, f.adapters);
  assert.equal(result.code, 'unexpected_empty_media_files'); assert.equal(f.stopped(), 0);
});
test('published bytes and private denial are both checked', async t => {
  const f = fixture(t, { media: true }), result = await rehearse(f.input, f.adapters);
  assert.equal(result.status, 'passed'); assert.equal(result.steps.serve.delivered, 1); assert.equal(result.steps.serve.privateDenied, 1); assert.equal(f.stopped(), 1);
});
for (const [name, fault, expected] of [
  ['dump failure', { dumpError: true }, 'operation_failed'],
  ['migration applies changes', { migration: 'Applied 1 migration' }, 'migration_not_noop'],
  ['table mismatch', { tableMismatch: true }, 'table_fingerprint_mismatch'],
  ['tampered media', { media: true, afterExtract: root => writeFileSync(path.join(root, PUBLIC, 'thumb.webp'), 'wrong') }, 'media_fingerprint_mismatch'],
  ['missing variant', { media: true, afterExtract: root => rmSync(path.join(root, PUBLIC, 'thumb.webp')) }, 'media_fingerprint_mismatch'],
  ['readiness timeout', { startError: true }, 'app_start_timeout'],
  ['HTTP timeout', { httpError: true }, 'operation_failed'],
  ['private exposure', { media: true, exposePrivate: true }, 'private_media_exposed'],
]) test(`${name} retains sanitized failure proof and only cleans its app`, async t => {
  const f = fixture(t, fault), result = await rehearse(f.input, f.adapters);
  assert.equal(result.code, expected); assert.equal(result.status, 'failed'); assert.equal(result.ownership.database, 'created-retained');
  assert.equal(f.stopped(), f.calls.includes('app') ? 1 : 0); assert(!f.calls.some(sql => /drop|terminate_backend/i.test(sql)));
  assert(!JSON.stringify(result).includes(SECRET)); assert.equal(JSON.parse(readFileSync(path.join(f.input.workDir, 'report.json'))).code, expected);
});
test('real CLI rejects existing directory before loading PostgreSQL and never prints URL secrets', t => {
  const f = fixture(t); mkdirSync(f.input.workDir); writeFileSync(path.join(f.input.workDir, 'sentinel'), 'untouched');
  const result = spawnSync(process.execPath, [path.resolve('apps/web/scripts/restore-rehearsal.mjs'), '--operator-frozen', '--media-root', f.input.mediaRoot, '--work-dir', f.input.workDir], {
    env: { ...process.env, REHEARSAL_SOURCE_DATABASE_URL: f.input.sourceDb, REHEARSAL_TARGET_DATABASE_URL: f.input.targetDb }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).code, 'work_directory_exists');
  assert(!`${result.stdout}${result.stderr}`.includes(SECRET)); assert.equal(readFileSync(path.join(f.input.workDir, 'sentinel'), 'utf8'), 'untouched');
});
test('real commands bound timeout/output and redact child errors', async () => {
  for (const [args, policy, code] of [
    [['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'], { timeoutMs: 100 }, 'command_timeout'],
    [['-e', 'process.stdout.write("x".repeat(4096))'], { limit: 1024 }, 'command_output_limit'],
    [['-e', `console.error('${SECRET}');process.exit(1)`], {}, 'command_failed'],
  ]) await assert.rejects(runCommand(process.execPath, args, { timeoutMs: 5000, ...policy }), error => error.code === code && !error.message.includes(SECRET));
});
test('ambient PostgreSQL configuration and service aliases fail before writes', async t => {
  for (const key of ['PGDATABASE', 'PGHOST', 'PGPASSWORD', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS', 'PGPASSFILE', 'PGSSLMODE', 'pgservice']) {
    assert.throws(() => parseOptions([], { [key]: SECRET }), error => error.code === 'ambient_database_configuration' && !error.message.includes(SECRET));
  }
  const f = fixture(t);
  const result = spawnSync(process.execPath, [path.resolve('apps/web/scripts/restore-rehearsal.mjs'), '--operator-frozen', '--media-root', f.input.mediaRoot, '--work-dir', f.input.workDir], {
    env: { ...process.env, REHEARSAL_SOURCE_DATABASE_URL: f.input.sourceDb, REHEARSAL_TARGET_DATABASE_URL: f.input.targetDb, PGSERVICE: SECRET }, encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).code, 'ambient_database_configuration');
  assert(!existsSync(f.input.workDir)); assert(!`${result.stdout}${result.stderr}`.includes(SECRET));
});
test('Node pg and libpq use the same explicit TLS policy', () => {
  const base = `postgresql://test:${SECRET}@127.0.0.1/source`;
  assert.equal(parseDatabaseUrl(base).search, '?sslmode=disable');
  assert.equal(parseDatabaseUrl(`${base}?sslmode=verify-full`).search, '?sslmode=verify-full');
  for (const mode of ['require', 'verify-ca', 'prefer', 'allow']) assert.throws(() => parseDatabaseUrl(`${base}?sslmode=${mode}`), error => error.code === 'unsupported_database_options');
});
test('real integration CLI refuses URL/environment/report overrides before any network or filesystem write', t => {
  const f = fixture(t), base = `postgresql://test:${SECRET}@127.0.0.1:5432/admin_test`;
  const guard = 'import net from "node:net";import fs from "node:fs";import {syncBuiltinESMExports} from "node:module";net.Socket.prototype.connect=()=>{throw Error("UNEXPECTED_NETWORK_CALL")};for(const key of ["mkdirSync","mkdtempSync","writeFileSync"])fs[key]=()=>{throw Error("UNEXPECTED_FILESYSTEM_WRITE")};syncBuiltinESMExports();';
  const report = path.join(f.root, 'existing-report.json'); writeFileSync(report, 'keep-evidence');
  for (const [value, extra, expected] of [
    [`${base}?host=remote.invalid`, {}, 'unsupported_database_options'],
    [`${base}?service=other`, {}, 'unsupported_database_options'],
    [base.replace('127.0.0.1', '%2Ftmp'), {}, 'invalid_database_host'],
    [base.replace('postgresql:', 'https:'), {}, 'invalid_database_url'],
    [base.replace('/admin_test', '/%61dmin_test'), {}, 'invalid_database_name'],
    [base, { PGHOST: 'remote.invalid' }, 'ambient_database_configuration'],
    [base, { REHEARSAL_PROOF_REPORT_PATH: report }, 'Evidence report already exists'],
  ]) {
    const result = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(guard)}`, path.resolve('scripts/tests/restore-rehearsal.integration.mjs')], {
      env: { ...process.env, REHEARSAL_TEST_DATABASE_URL: value, ...extra }, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 1); assert(result.stderr.includes(expected));
    assert(!/UNEXPECTED_NETWORK_CALL|UNEXPECTED_FILESYSTEM_WRITE/.test(result.stderr));
    assert(!`${result.stdout}${result.stderr}`.includes(SECRET)); assert.equal(readFileSync(report, 'utf8'), 'keep-evidence');
  }
});
test('HTTP timeout during streamed body is classified without exposing bytes', async () => {
  const server = http.createServer((_req, res) => { res.writeHead(200); res.write(SECRET); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await assert.rejects(request(`http://127.0.0.1:${server.address().port}`), error => error.code === 'http_timeout' && !error.message.includes(SECRET)); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
test('interrupted real command is terminated and redacted', async t => {
  const f = fixture(t), pidFile = path.join(f.root, 'child-pid'), controller = new AbortController();
  const running = runCommand(process.execPath, ['-e', 'require("node:fs").writeFileSync(process.argv[1], String(process.pid));process.on("SIGTERM",()=>{});console.error(process.argv[2]);setInterval(()=>{},1000)', pidFile, SECRET], { signal: controller.signal });
  for (let attempt = 0; !existsSync(pidFile) && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
  assert(existsSync(pidFile)); const pid = Number(readFileSync(pidFile)); controller.abort();
  await assert.rejects(running, error => error.code === 'interrupted' && !error.message.includes(SECRET));
  assert.throws(() => process.kill(pid, 0));
});
test('interruption before work and during serving preserves ownership and stops only its app', async t => {
  const early = fixture(t), earlyController = new AbortController(); earlyController.abort();
  const refused = await rehearse(early.input, { ...early.adapters, signal: earlyController.signal });
  assert.equal(refused.code, 'interrupted'); assert.deepEqual(early.calls, []); assert(!existsSync(early.input.workDir));
  const running = fixture(t), controller = new AbortController();
  const result = await rehearse(running.input, { ...running.adapters, signal: controller.signal, request: async () => { controller.abort(); throw Error(SECRET); } });
  assert.equal(result.code, 'interrupted'); assert.equal(running.stopped(), 1); assert.equal(result.ownership.appProcess, 'stopped');
});
test('failed app spawn/entrypoint returns promptly and cleanup tolerates absent process', async t => {
  const f = fixture(t), started = Date.now();
  for (const server of [path.join(f.root, 'absent-dir/server.js'), path.join(f.root, 'absent-entry.js')]) {
    const app = await launchApp({ server }, {});
    await assert.rejects(app.waitReady(), error => error.code === 'app_start_failed');
    await app.stop(); assert.equal(app.alive(), false);
  }
  assert(Date.now() - started < 3000);
});
test('owned real child ignoring SIGTERM is stopped within the hard bound', async () => {
  const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM",()=>{});console.log("ready");setInterval(()=>{},1000)'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise(resolve => child.stdout.once('data', resolve));
  const started = Date.now(); await stopOwnedProcess(child, 100);
  assert(Date.now() - started < 3000); assert(child.exitCode !== null || child.signalCode !== null);
});
