import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createManifest, verifyBackupSet, validateManifest, checkFreshness, validateSnapshotEntries } from '../operations/backup-set.mjs';

const now = Date.parse('2026-09-28T12:00:00.000Z');
const provenance = { capturedAt: new Date(now).toISOString(), sourceRevision: 'a'.repeat(40), imageDigest: `sha256:${'b'.repeat(64)}`, operatorFrozen: true };
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'valkyria-backup-unit-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'set');
  await mkdir(directory);
  await writeFile(path.join(directory, 'database.dump'), 'synthetic-database');
  await writeFile(path.join(directory, 'editorial-media.tar.gz'), 'synthetic-media');
  return { root, directory };
}
const fails = (code) => (error) => error.code === code;

test('pins a complete frozen pair and verifies both exact byte streams', async (t) => {
  const { directory } = await fixture(t);
  const created = await createManifest(directory, { ...provenance, now });
  const result = await verifyBackupSet(directory, { manifestSha256: created.manifestSha256, now, maxAgeHours: 48 });
  assert.equal(result.status, 'passed');
  assert.equal(result.totalBytes, 33);
  assert.equal(result.sourceRevision, provenance.sourceRevision);
  assert.deepEqual(result.files.map((file) => file.name), ['database.dump', 'editorial-media.tar.gz']);
  assert.equal(created.manifestSha256, digest(await readFile(path.join(directory, 'backup-set.json'))));
});

test('requires an explicit frozen-input assertion and refuses manifest replacement', async (t) => {
  const { directory } = await fixture(t);
  await assert.rejects(createManifest(directory, { ...provenance, operatorFrozen: false, now }), fails('inputs_not_frozen'));
  await createManifest(directory, { ...provenance, now });
  const before = await readFile(path.join(directory, 'backup-set.json'));
  await assert.rejects(createManifest(directory, { ...provenance, now }), fails('unexpected_files'));
  assert.deepEqual(await readFile(path.join(directory, 'backup-set.json')), before);
});

test('rejects missing, extra, changed and oversized backup inputs', async (t) => {
  const { directory } = await fixture(t);
  await assert.rejects(createManifest(directory, { ...provenance, now, maxFileBytes: 2 }), fails('file_too_large'));
  const created = await createManifest(directory, { ...provenance, now });
  const options = { manifestSha256: created.manifestSha256, now };
  await writeFile(path.join(directory, 'database.dump'), 'tampered');
  await assert.rejects(verifyBackupSet(directory, options), fails('file_mismatch'));
  await writeFile(path.join(directory, 'extra.txt'), 'unexpected');
  await assert.rejects(verifyBackupSet(directory, options), fails('unexpected_files'));
  await rm(path.join(directory, 'extra.txt'));
  await rm(path.join(directory, 'editorial-media.tar.gz'));
  await assert.rejects(verifyBackupSet(directory, options), fails('unexpected_files'));
});

test('rejects stale capture before creating a manifest', async (t) => {
  const { directory } = await fixture(t);
  await assert.rejects(createManifest(directory, { ...provenance, now: now + 49 * 3600000 }), fails('stale_backup'));
  assert(!(await readdir(directory)).includes('backup-set.json'));
});

test('rejects a modified manifest even when the pair was not modified', async (t) => {
  const { directory } = await fixture(t);
  const created = await createManifest(directory, { ...provenance, now });
  const file = path.join(directory, 'backup-set.json');
  await writeFile(file, (await readFile(file, 'utf8')) + ' ');
  await assert.rejects(verifyBackupSet(directory, { manifestSha256: created.manifestSha256, now }), fails('manifest_mismatch'));
});

test('rejects real linked roots, ancestors and entries without reading their targets', async (t) => {
  const { root, directory } = await fixture(t);
  const alias = path.join(root, 'alias');
  const kind = process.platform === 'win32' ? 'junction' : 'dir';
  await symlink(directory, alias, kind);
  await assert.rejects(createManifest(alias, { ...provenance, now }), fails('unsafe_path'));
  const parentAlias = path.join(root, 'parent-alias');
  await symlink(root, parentAlias, kind);
  await assert.rejects(createManifest(path.join(parentAlias, 'set'), { ...provenance, now }), fails('unsafe_path'));
  await rm(path.join(directory, 'database.dump'));
  await symlink(root, path.join(directory, 'database.dump'), kind);
  await assert.rejects(createManifest(directory, { ...provenance, now }), fails('unsafe_path'));
});

test('validates only two fixed relative filenames, bounded sizes and strict provenance', async (t) => {
  const { directory } = await fixture(t);
  await createManifest(directory, { ...provenance, now });
  const manifest = JSON.parse(await readFile(path.join(directory, 'backup-set.json'), 'utf8'));
  for (const name of ['../database.dump', '/database.dump', 'D:/database.dump', '..\\database.dump', 'other.dump']) {
    const changed = structuredClone(manifest);
    changed.files[0].name = name;
    assert.throws(() => validateManifest(changed), fails('invalid_manifest'));
  }
  for (const mutation of [
    (m) => { m.files.push(m.files[0]); },
    (m) => { m.files[0].bytes = Number.MAX_SAFE_INTEGER; },
    (m) => { m.files[0].bytes = -1; },
    (m) => { m.sourceRevision = 'main'; },
    (m) => { m.imageDigest = 'latest'; },
    (m) => { m.capturedAt = 'not-a-date'; },
    (m) => { m.extra = 'unexpected'; },
  ]) {
    const changed = structuredClone(manifest);
    mutation(changed);
    assert.throws(() => validateManifest(changed), fails('invalid_manifest'));
  }
});

test('freshness accepts the exact boundary and rejects stale, future and invalid policy times', () => {
  assert.equal(checkFreshness(new Date(now - 48 * 3600000).toISOString(), { now, maxAgeHours: 48 }), 48 * 3600000);
  assert.throws(() => checkFreshness(new Date(now - 48 * 3600000 - 1).toISOString(), { now, maxAgeHours: 48 }), fails('stale_backup'));
  assert.throws(() => checkFreshness(new Date(now + 1).toISOString(), { now }), fails('future_backup'));
  for (const maxAgeHours of [0, -1, NaN, Infinity, 721]) assert.throws(() => checkFreshness(provenance.capturedAt, { now, maxAgeHours }), fails('invalid_policy'));
});

test('rejects restic snapshot extras, links, nested paths and oversized data before recovery', () => {
  const entries = [
    { struct_type: 'snapshot', id: 'c'.repeat(64) },
    ...['backup-set.json', 'database.dump', 'editorial-media.tar.gz'].map((name) => ({ struct_type: 'node', type: 'file', path: `/${name}`, size: 20 })),
  ];
  assert.equal(validateSnapshotEntries(entries).length, 3);
  for (const mutation of [
    (list) => { list.push({ struct_type: 'node', type: 'file', path: '/extra.txt', size: 1 }); },
    (list) => { list[1].type = 'symlink'; },
    (list) => { list[1].path = '/nested/backup-set.json'; },
    (list) => { list[1].path = '/../backup-set.json'; },
    (list) => { list[1].size = Number.MAX_SAFE_INTEGER; },
    (list) => { list.pop(); },
  ]) {
    const changed = structuredClone(entries);
    mutation(changed);
    assert.throws(() => validateSnapshotEntries(changed), fails('unsafe_snapshot'));
  }
});
