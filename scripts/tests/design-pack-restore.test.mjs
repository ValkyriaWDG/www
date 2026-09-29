import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const helper = new URL('../../assets/design-packs/valkyria-2026-09-29/restore.mjs', import.meta.url);
const digest = (data) => createHash('sha256').update(data).digest('hex');

function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'valkyria-restore-test-'));
  t.after(() => {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert(path.basename(resolved).startsWith('valkyria-restore-test-'));
    rmSync(resolved, { recursive: true, force: true });
  });
  const repository = path.join(directory, 'repo');
  const pack = path.join(repository, 'assets/design-packs/valkyria-2026-09-29');
  mkdirSync(path.join(pack, 'source'), { recursive: true });
  mkdirSync(path.join(pack, 'editor-parts'));
  copyFileSync(helper, path.join(pack, 'restore.mjs'));
  const originals = [];
  const entries = [];
  for (let index = 0; index < 497; index++) {
    // Text that must remain bytes, never evaluated as code during reconstruction.
    const data = Buffer.from(`throw new Error('reference ${index} must not execute');\r\n`);
    const entry = { path: `originals/${index}.js`, bytes: data.length, sha256: digest(data) };
    if (index === 0) {
      entry.parts = [data.subarray(0, 15), data.subarray(15)].map((part, partIndex) => {
        const relative = `editor-parts/test.part-${partIndex}`;
        writeFileSync(path.join(pack, relative), part);
        return { path: relative, bytes: part.length, sha256: digest(part) };
      });
    } else {
      entry.storedPath = `source/${index}.js`;
      writeFileSync(path.join(pack, entry.storedPath), data);
    }
    entries.push(entry);
    originals.push(data);
  }
  writeFileSync(path.join(pack, 'inventory.json'), JSON.stringify({
    schemaVersion: 1,
    archive: { uncompressedBytes: originals.reduce((sum, data) => sum + data.length, 0) },
    entries,
  }));
  const run = (mode) => spawnSync(process.execPath, [path.join(pack, 'restore.mjs'), mode], { encoding: 'utf8' });
  const output = path.join(repository, '.local/graphics-pack-2026-09-29/restored');
  return { directory, repository, pack, entries, originals, output, run };
}

test('archive helper verifies without writing, restores exact bytes and refuses overwrite', (t) => {
  const f = fixture(t);
  const verify = f.run('--verify');
  assert.equal(verify.status, 0, verify.stderr);
  assert.equal(JSON.parse(verify.stdout).verifiedOriginalFiles, 497);
  assert.equal(existsSync(path.join(f.repository, '.local')), false);
  const restore = f.run('--restore');
  assert.equal(restore.status, 0, restore.stderr);
  for (let index = 0; index < f.entries.length; index++) {
    assert.deepEqual(readFileSync(path.join(f.output, f.entries[index].path)), f.originals[index]);
  }
  const refusal = f.run('--restore');
  assert.notEqual(refusal.status, 0);
  assert.match(refusal.stderr, /Refusing to overwrite/);
});

test('archive helper rejects a corrupt editor part before creating output', (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.pack, f.entries[0].parts[0].path), Buffer.alloc(15));
  const result = f.run('--restore');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Hash mismatch/);
  assert.equal(existsSync(path.join(f.repository, '.local')), false);
});

for (const nested of [false, true]) {
  test(`archive helper refuses a ${nested ? 'nested' : 'root'} output junction before external writes`, (t) => {
    const f = fixture(t);
    const outside = path.join(f.directory, 'outside');
    mkdirSync(outside);
    const local = path.join(f.repository, '.local');
    if (nested) mkdirSync(local);
    const link = nested ? path.join(local, 'graphics-pack-2026-09-29') : local;
    symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    const result = f.run('--restore');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing a linked or non-directory output ancestor/);
    assert.deepEqual(readdirSync(outside), []);
  });
}
