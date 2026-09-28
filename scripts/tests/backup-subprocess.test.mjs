import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { failureReport } from '../operations/backup-set.mjs';
import { runRestic, verifyResticBackup } from '../operations/verify-restic-backup.mjs';

const command = (source, overrides = {}) => runRestic(['--input-type=module', '--eval', source], {
  binary: process.execPath, env: process.env, timeoutMs: 1500, limit: 128, ...overrides,
});

test('captures bounded subprocess output and rejects nonzero status without raw diagnostics', async () => {
  assert.equal((await command("console.log('ok')")).toString(), 'ok\n');
  let error;
  try { await command("console.error('PASSWORD=private-fixture-value');process.exit(12)"); }
  catch (reason) { error = reason; }
  assert.deepEqual(failureReport(error), { status: 'failed', code: 'restic_failed' });
  assert(!JSON.stringify(failureReport(error)).includes('private-fixture-value'));
});

test('kills a real child that exceeds the output budget', async () => {
  await assert.rejects(command("process.stdout.write('x'.repeat(1024));setInterval(()=>{},1000)"), { code: 'restic_output_limit' });
});

test('hard timeout terminates even a child that ignores SIGTERM', async () => {
  const started = Date.now();
  await assert.rejects(command("process.on('SIGTERM',()=>{});setInterval(()=>{},1000)", { timeoutMs: 200 }), { code: 'restic_timeout' });
  assert(Date.now() - started < 5000);
});

test('invalid policy/selectors and missing binary have sanitized failure contracts', async () => {
  const result = await verifyResticBackup({ snapshot: 'latest', manifestSha256: 'x', target: 'unused' });
  assert.deepEqual(result, { status: 'failed', code: 'invalid_snapshot_pin', plaintextOutput: 'not-created' });
  let error;
  try { await runRestic([], { binary: 'valkyria-missing-secret-fixture-binary', env: process.env, timeoutMs: 500, limit: 128 }); }
  catch (reason) { error = reason; }
  assert.equal(failureReport(error).status, 'failed');
  assert(!JSON.stringify(failureReport(error)).includes('secret-fixture'));
});

test('actual CLI returns nonzero JSON-only diagnostics without echoing arbitrary arguments', () => {
  const cli = path.resolve(import.meta.dirname, '../operations/verify-restic-backup.mjs');
  const child = spawnSync(process.execPath, [cli, '--unrecognized=private-fixture-value'], { encoding: 'utf8' });
  assert.equal(child.status, 1);
  assert.equal(child.stderr, '');
  assert.deepEqual(JSON.parse(child.stdout), { status: 'failed', code: 'operation_failed', plaintextOutput: 'not-created' });
  assert(!child.stdout.includes('private-fixture-value'));
});
