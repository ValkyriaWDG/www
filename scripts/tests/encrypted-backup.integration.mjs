// Explicit integration gate: requires a real pinned restic binary; never skips.
// Uses synthetic opaque backup bytes, not a production dump or a database connection.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createManifest, sha256 } from '../operations/backup-set.mjs';
import { verifyResticBackup } from '../operations/verify-restic-backup.mjs';

const binary = process.env.RESTIC_TEST_BIN;
assert(binary && path.isAbsolute(binary), 'Set RESTIC_TEST_BIN to the verified absolute restic 0.19.1 executable.');
assert.match(execFileSync(binary, ['version'], { encoding: 'utf8' }), /^restic 0\.19\.1 /);
const cli = path.resolve(import.meta.dirname, '../operations/verify-restic-backup.mjs');
const fixedCapture = new Date(Date.now() - 60000).toISOString();
const source = { capturedAt: fixedCapture, sourceRevision: 'a'.repeat(40), imageDigest: `sha256:${'b'.repeat(64)}`, operatorFrozen: true };

test('real encrypted snapshot recovery and fail-closed operator cases', async (t) => {
  const started = Date.now();
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'valkyria-restic-fixture-'));
  t.after(async () => {
    // Delete only this test-owned temp directory; never an input/operator target.
    assert.equal(path.dirname(scratch), path.resolve(os.tmpdir()));
    assert(path.basename(scratch).startsWith('valkyria-restic-fixture-'));
    await rm(scratch, { recursive: true, force: true });
  });
  const repo = path.join(scratch, 'encrypted-repository');
  const password = randomBytes(32).toString('hex');
  const passwordFile = path.join(scratch, 'password.txt');
  await writeFile(passwordFile, password, { mode: 0o600 });
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RESTIC_'))),
    RESTIC_REPOSITORY: repo, RESTIC_PASSWORD_FILE: passwordFile, RESTIC_BIN: binary };
  const restic = (args, cwd = scratch) => execFileSync(binary, ['--no-cache', ...args], { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
  restic(['init']);
  const cases = [];
  async function pair(name, options = {}) {
    const directory = path.join(scratch, name);
    await mkdir(directory);
    await writeFile(path.join(directory, 'database.dump'), 'SYNTHETIC DATABASE BYTES\n');
    await writeFile(path.join(directory, 'editorial-media.tar.gz'), 'SYNTHETIC MEDIA ARCHIVE BYTES\n');
    const created = await createManifest(directory, { ...source, ...options });
    return { directory, ...created };
  }
  function snapshot(directory, extra = []) {
    const records = restic(['backup', '--json', '--host', 'valkyria-synthetic-recovery', ...extra, '.'], directory).trim().split('\n').map((line) => JSON.parse(line));
    const id = records.find((record) => record.message_type === 'summary').snapshot_id;
    assert.match(id, /^[a-f0-9]{64}$/);
    return id;
  }
  function verify(id, manifest, targetName, overrides = {}, extra = []) {
    const target = path.join(scratch, targetName);
    const child = spawnSync(process.execPath, [cli, '--snapshot', id, '--manifest-sha256', manifest, '--target', target, ...extra],
      { env: { ...env, ...overrides }, encoding: 'utf8', timeout: 60000 });
    assert.equal(child.error, undefined);
    assert(!`${child.stdout}${child.stderr}`.includes(password));
    assert(!`${child.stdout}${child.stderr}`.includes(passwordFile));
    assert.equal(child.stderr, '');
    const result = JSON.parse(child.stdout);
    cases.push({ name: targetName, exitCode: child.status, status: result.status, code: result.code ?? null, plaintextOutput: result.plaintextOutput });
    return { result, target, exitCode: child.status };
  }

  const good = await pair('good');
  const id = snapshot(good.directory);
  await t.test('decrypts exact snapshot and restores both pinned byte streams', async () => {
    const { result, target, exitCode } = verify(id, good.manifestSha256, 'recovered');
    assert.equal(exitCode, 0, JSON.stringify(result));
    assert.equal(result.snapshotId, id);
    assert.equal(result.verification, 'encrypted-snapshot-bytes-only');
    for (const file of ['database.dump', 'editorial-media.tar.gz', 'backup-set.json'])
      assert.deepEqual(await readFile(path.join(target, file)), await readFile(path.join(good.directory, file)));
  });
  await t.test('refuses existing destinations without overwriting their contents', async () => {
    const file = path.join(scratch, 'recovered', 'database.dump');
    const before = await readFile(file);
    const { result, exitCode } = verify(id, good.manifestSha256, 'recovered');
    assert.equal(exitCode, 1);
    assert.equal(result.code, 'target_exists');
    assert.deepEqual(await readFile(file), before);
  });
  await t.test('never writes recovered plaintext into the encrypted repository', async () => {
    const { result } = verify(id, good.manifestSha256, 'encrypted-repository/plaintext');
    assert.equal(result.code, 'unsafe_target');
    assert.equal(result.plaintextOutput, 'not-created');
    assert(!(await readdir(repo)).includes('plaintext'));
  });
  await t.test('wrong password is sanitized and creates no plaintext destination', async () => {
    const wrongFile = path.join(scratch, 'wrong.txt');
    await writeFile(wrongFile, 'SYNTHETIC-WRONG-PASSWORD', { mode: 0o600 });
    const { result, exitCode } = verify(id, good.manifestSha256, 'wrong-password', { RESTIC_PASSWORD_FILE: wrongFile });
    assert.equal(exitCode, 1);
    assert.equal(result.code, 'restic_failed');
    assert.equal(result.plaintextOutput, 'not-created');
    assert(!JSON.stringify(result).includes('SYNTHETIC-WRONG-PASSWORD'));
    assert(!(await readdir(scratch)).includes('wrong-password'));
  });
  await t.test('rejects mutable and unknown snapshot selectors', () => {
    assert.equal(verify('latest', good.manifestSha256, 'mutable-selector').result.code, 'invalid_snapshot_pin');
    assert.equal(verify('f'.repeat(64), good.manifestSha256, 'missing-snapshot').exitCode, 1);
  });
  await t.test('rejects wrong manifest pin before recovering large files', () => {
    const { result } = verify(id, 'f'.repeat(64), 'wrong-manifest');
    assert.equal(result.code, 'manifest_mismatch');
    assert.equal(result.plaintextOutput, 'not-created');
  });
  await t.test('detects a tampered pair and retains partial plaintext for explicit cleanup', async () => {
    const changed = await pair('tampered-set');
    // Same byte count ensures the digest comparison, not only size, catches this.
    await writeFile(path.join(changed.directory, 'database.dump'), 'TYNTHETIC DATABASE BYTES\n');
    const { result } = verify(snapshot(changed.directory), changed.manifestSha256, 'tampered-output');
    assert.equal(result.code, 'file_mismatch');
    assert.equal(result.plaintextOutput, 'partial-at-requested-target');
  });
  await t.test('rejects a missing half or extra snapshot file before recovery', async () => {
    const missing = await pair('missing-pair');
    await rm(path.join(missing.directory, 'editorial-media.tar.gz'));
    assert.equal(verify(snapshot(missing.directory), missing.manifestSha256, 'missing-output').result.code, 'unsafe_snapshot');
    const extra = await pair('extra-set');
    await writeFile(path.join(extra.directory, 'extra.txt'), 'not allowed');
    assert.equal(verify(snapshot(extra.directory), extra.manifestSha256, 'extra-output').result.code, 'unsafe_snapshot');
  });
  await t.test('old source capture cannot become fresh through a new snapshot', async () => {
    const stale = await pair('stale-set');
    const file = path.join(stale.directory, 'backup-set.json');
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    manifest.capturedAt = new Date(Date.now() - 49 * 3600000).toISOString();
    const content = JSON.stringify(manifest);
    await writeFile(file, content);
    assert.equal(verify(snapshot(stale.directory), sha256(content), 'stale-output').result.code, 'stale_backup');
  });
  await t.test('future capture and future snapshot timestamps both fail closed', async () => {
    const future = await pair('future-set');
    const file = path.join(future.directory, 'backup-set.json');
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    manifest.capturedAt = new Date(Date.now() + 3600000).toISOString();
    const content = JSON.stringify(manifest);
    await writeFile(file, content);
    assert.equal(verify(snapshot(future.directory), sha256(content), 'future-capture').result.code, 'future_backup');
    const time = new Date(Date.now() + 86400000).toISOString().slice(0, 19).replace('T', ' ');
    assert.equal(verify(snapshot(good.directory, ['--time', time]), good.manifestSha256, 'future-snapshot').result.code, 'future_backup');
  });
  await t.test('repository integrity succeeds for the untouched synthetic encrypted repository', () => {
    assert.match(restic(['check', '--read-data']), /no errors were found/);
    cases.push({ name: 'repository-integrity', exitCode: 0, status: 'passed', code: null });
  });
  await t.test('freshness is checked again when recovery completes', async (subtest) => {
    const initial = Date.now();
    let clockReads = 0;
    subtest.mock.method(Date, 'now', () => ++clockReads === 1 ? initial : initial + 49 * 3600000);
    const result = await verifyResticBackup({ snapshot: id, manifestSha256: good.manifestSha256,
      target: path.join(scratch, 'expired-during-recovery'), env, binary });
    assert.equal(result.code, 'stale_backup');
    assert.equal(result.plaintextOutput, 'partial-at-requested-target');
    assert(clockReads >= 2);
    cases.push({ name: 'completion-freshness', status: 'passed', observedCode: result.code, mechanism: 'real-restic-with-injected-clock' });
  });
  if (process.env.BACKUP_PROOF_REPORT_PATH) {
    const output = path.resolve(process.env.BACKUP_PROOF_REPORT_PATH);
    await mkdir(path.dirname(output), { recursive: true });
    const sourceFiles = ['scripts/operations/backup-set.mjs', 'scripts/operations/verify-restic-backup.mjs',
      'scripts/tests/backup-set.test.mjs', 'scripts/tests/backup-subprocess.test.mjs', 'scripts/tests/encrypted-backup.integration.mjs'];
    const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, sha256(await readFile(file))])));
    await writeFile(output, JSON.stringify({ schemaVersion: 1, resticVersion: '0.19.1', platform: process.platform,
      node: process.version, observedAt: new Date().toISOString(), environment: 'disposable-local-repository',
      durationMs: Date.now() - started, binarySha256: sha256(await readFile(binary)), sourceHashes,
      sourceData: 'synthetic opaque bytes; not a PostgreSQL dump or tar validation', cases }, null, 2) + '\n', { flag: 'wx' });
  }
});
