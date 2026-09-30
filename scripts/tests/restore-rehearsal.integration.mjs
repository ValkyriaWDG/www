// Opt-in real PostgreSQL/client/standalone proof; every resource is randomly named and local.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { assertCleanPgEnvironment, parseDatabaseUrl, rehearse } from '../../apps/web/scripts/restore-rehearsal.mjs';

const execute = promisify(execFile), appDir = path.resolve('apps/web');
assertCleanPgEnvironment();
const input = parseDatabaseUrl(process.env.REHEARSAL_TEST_DATABASE_URL);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(input.hostname) && /^[a-z0-9_]+_test$/.test(input.pathname.slice(1)), 'Explicit loopback _test administration database required');
const proofReport = process.env.REHEARSAL_PROOF_REPORT_PATH ? path.resolve(process.env.REHEARSAL_PROOF_REPORT_PATH) : null;
assert(!proofReport || !existsSync(proofReport), 'Evidence report already exists; choose a fresh report filename');
const pg = createRequire(path.join(appDir, 'package.json'))('pg');
const url = name => { const value = new URL(input); value.pathname = `/${name}`; return value; };
const prefix = `vlk_restore45_${randomBytes(5).toString('hex')}`;
const sourceName = `${prefix}_test`, owned = new Set(), roles = new Set();
const temp = mkdtempSync(path.join(realpathSync(os.tmpdir()), 'vlk-rehearsal-integration-'));
const mediaRoot = path.join(temp, 'source-media');
mkdirSync(mediaRoot);
const reports = { result: 'failed', context: { scope: 'Synthetic loopback PostgreSQL and standalone HTTP only', node: process.version }, sourceFiles: Object.fromEntries([
  'apps/web/scripts/restore-rehearsal.mjs', 'scripts/tests/restore-rehearsal.test.mjs', 'scripts/tests/restore-rehearsal.integration.mjs',
].map(file => [file, { sha256Lf: createHash('sha256').update(readFileSync(file, 'utf8').replaceAll('\r\n', '\n')).digest('hex') }])) };
const accepted = [];
const port = Number(process.env.REHEARSAL_TEST_PORT || 3349);
const quote = name => { assert(/^[a-z0-9_]+$/.test(name)); return `"${name}"`; };
async function connection(value, action) {
  const client = new pg.Client({ connectionString: value.toString(), connectionTimeoutMillis: 5000 });
  try { await client.connect(); return await action(client); } finally { await client.end(); }
}
async function create(name) { await connection(input, client => client.query(`create database ${quote(name)}`)); owned.add(name); }
function options(target, work) { return { sourceDb: url(sourceName).toString(), targetDb: url(target).toString(), mediaRoot, workDir: path.join(temp, work), port, operatorFrozen: true, publicAssets: [], privateAssets: [] }; }
async function cli(config, extra = []) {
  const args = [path.join(appDir, 'scripts/restore-rehearsal.mjs'), '--operator-frozen', '--media-root', config.mediaRoot, '--work-dir', config.workDir, '--port', String(port), ...extra];
  const env = { ...process.env, REHEARSAL_SOURCE_DATABASE_URL: config.sourceDb, REHEARSAL_TARGET_DATABASE_URL: config.targetDb };
  let result;
  try { result = { ...(await execute(process.execPath, args, { env, timeout: 180000, maxBuffer: 1024 * 1024, windowsHide: true })), exitCode: 0 }; }
  catch (error) { result = { stdout: error.stdout || '', stderr: error.stderr || '', exitCode: error.code }; }
  for (const value of [input, new URL(config.sourceDb)]) assert(!`${result.stdout}${result.stderr}`.includes(decodeURIComponent(value.password)), 'Connection secret leaked');
  assert.equal(result.stderr, '', 'CLI stderr must remain sanitized/empty');
  const report = JSON.parse(result.stdout);
  if (report.ownership.database === 'created-retained') owned.add(new URL(config.targetDb).pathname.slice(1));
  return { report, exitCode: result.exitCode };
}
async function initialize(script, args = []) {
  try {
    reports.context.postgresql = await connection(input, async client => (await client.query('show server_version')).rows[0].server_version);
    for (const binary of ['pg_dump', 'pg_restore']) reports.context[binary] = (await execute(binary, ['--version'], { windowsHide: true })).stdout.trim();
    await execute(process.execPath, [path.join(appDir, 'dist', script), ...args], { cwd: appDir, windowsHide: true, timeout: 60000,
      env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: url(sourceName).toString(), EDITORIAL_MEDIA_ROOT: mediaRoot } });
  } catch { throw Error('Synthetic source preparation failed'); }
}
async function sentinel(name) {
  await connection(url(name), async client => { await client.query('create table sentinel(value text not null)'); await client.query("insert into sentinel values ('owned-by-competing-test')"); });
}
async function assertSentinel(name) { assert.equal(await connection(url(name), async client => (await client.query('select value from sentinel')).rows[0].value), 'owned-by-competing-test'); }

test('real same-cluster rehearsal ownership and restore contract', async t => {
  try {
    await create(sourceName);
    await initialize('cli/migrate.mjs');
    await t.test('existing target CLI preserves its sentinel and never creates work directory', async () => {
      const target = `${prefix}_existing_restore`; await create(target); await sentinel(target);
      const config = options(target, 'existing');
      const { report, exitCode } = await cli(config);
      assert.equal(exitCode, 1); assert.equal(report.code, 'target_database_exists'); assert(!existsSync(config.workDir)); await assertSentinel(target);
      reports.existing = report;
      accepted.push('existing');
    });
    await t.test('real CREATE collision preserves the competitor database and never captures', async () => {
      const target = `${prefix}_race_restore`, config = options(target, 'race'); let captureCalls = 0;
      const report = await rehearse(config, {
        client: value => {
          const client = new pg.Client({ connectionString: value.toString() });
          const query = client.query.bind(client);
          client.query = async (...args) => {
            if (args[0].startsWith('create database')) { await create(target); await sentinel(target); }
            return query(...args);
          };
          return client;
        },
        run: async () => { captureCalls++; throw Error('Capture must not run after collision'); },
      });
      assert.equal(report.code, 'target_database_collision'); assert.equal(report.ownership.database, 'not-created'); assert.equal(captureCalls, 0); await assertSentinel(target);
      reports.race = report;
      accepted.push('race');
    });
    await t.test('permission-denied CREATE leaves no target and records no database ownership', async () => {
      const role = `${prefix}_limited`, password = randomBytes(16).toString('hex');
      await connection(input, client => client.query(`create role ${quote(role)} login nocreatedb password '${password}'`)); roles.add(role);
      const target = `${prefix}_denied_restore`, config = options(target, 'denied');
      const source = new URL(config.sourceDb), destination = new URL(config.targetDb);
      for (const value of [source, destination]) { value.username = role; value.password = password; }
      const { report } = await cli({ ...config, sourceDb: source.toString(), targetDb: destination.toString() });
      assert.equal(report.code, 'target_database_creation_failed'); assert.equal(report.ownership.database, 'not-created');
      assert.equal(await connection(input, async client => (await client.query('select 1 from pg_database where datname=$1', [target])).rows.length), 0);
      reports.denied = report;
      accepted.push('denied');
    });
    await t.test('empty editorial source round trip succeeds without inventing public media', async () => {
      const { report, exitCode } = await cli(options(`${prefix}_empty_restore`, 'empty'));
      reports.empty = report;
      assert.equal(exitCode, 0, report.code); assert.equal(report.status, 'passed'); assert.equal(report.steps.migrate.applied, 0);
      assert.equal(report.steps.rows.contentMatches, true); assert.equal(report.steps.media.files, 0); assert.equal(report.steps.serve.mediaDelivery, 'not-applicable-empty');
      assert.equal(report.ownership.appProcess, 'stopped');
      accepted.push('empty');
    });
    await initialize('cli/seed.mjs');
    await initialize('dev-cli/fixtures.mjs', ['--allow-fixtures']);
    const cover = 'f1c7a0e0-0000-4000-8000-00000000a001', privateId = 'f1c7a0e0-0000-4000-8000-00000000a099';
    cpSync(path.join(mediaRoot, cover), path.join(mediaRoot, privateId), { recursive: true });
    await connection(url(sourceName), client => client.query(`insert into asset(id,scope,state,original_filename,source_format,width,height,bytes,sha256,variants) select $1,scope,state,'synthetic-private.webp',source_format,width,height,bytes,sha256,variants from asset where id=$2`, [privateId, cover]));
    await t.test('published and private media round trip preserves table/variant hashes and HTTP policy', async () => {
      const { report, exitCode } = await cli(options(`${prefix}_media_restore`, 'media'), ['--public-asset', cover, '--private-asset', privateId]);
      reports.media = report;
      assert.equal(exitCode, 0, report.code); assert.equal(report.status, 'passed'); assert.equal(report.steps.migrate.applied, 0);
      // Eight synthetic fixture images (two variants each) plus the private copy made above.
      assert.equal(report.steps.rows.contentMatches, true); assert.equal(report.steps.media.assets, 9); assert.equal(report.steps.media.variants, 18);
      assert(report.steps.serve.delivered >= 1); assert.equal(report.steps.serve.privateDenied, 1); assert.equal(report.ownership.appProcess, 'stopped');
      accepted.push('media');
    });
    reports.result = accepted.length === 5 ? 'passed' : 'failed';
    reports.acceptedCases = accepted;
  } finally {
    // Test harness alone owns these random names. No FORCE/termination or deletion
    // of a pre-existing operator target is allowed, even during test cleanup.
    for (const name of [...owned].reverse()) await connection(input, client => client.query(`drop database ${quote(name)}`));
    for (const role of roles) await connection(input, client => client.query(`drop role ${quote(role)}`));
    reports.cleanup = { databases: owned.size, roles: roles.size, method: 'Only successful test-owned CREATE names; DROP without FORCE; no backend termination' };
    if (proofReport) writeFileSync(proofReport, `${JSON.stringify(reports, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    assert(path.basename(temp).startsWith('vlk-rehearsal-integration-')); rmSync(temp, { recursive: true, force: true });
  }
});
