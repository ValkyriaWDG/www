// Verifies opaque backup bytes. Database/media consistency requires operator-frozen inputs.
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, opendir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const PAIR_NAMES = ['database.dump', 'editorial-media.tar.gz'];
export const MANIFEST_NAME = 'backup-set.json';
export const DEFAULT_MAX_FILE_BYTES = 20 * 1024 ** 3;
export const MANIFEST_MAX_BYTES = 4096;
const HASH = /^[a-f0-9]{64}$/;
export class BackupError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const requireValue = (value, code) => { if (!value) throw new BackupError(code); };
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function maxFileBytes(value = DEFAULT_MAX_FILE_BYTES) {
  requireValue(Number.isSafeInteger(value) && value > 0 && value <= 1024 ** 4, 'invalid_policy');
  return value;
}
function exactKeys(object, keys) {
  return object && typeof object === 'object' && !Array.isArray(object)
    && Object.keys(object).sort().join('|') === [...keys].sort().join('|');
}
function validTime(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
export function checkFreshness(capturedAt, { now = Date.now(), maxAgeHours = 48 } = {}) {
  requireValue(Number.isFinite(now) && Number.isFinite(maxAgeHours) && maxAgeHours > 0 && maxAgeHours <= 720, 'invalid_policy');
  requireValue(validTime(capturedAt), 'invalid_manifest');
  const age = now - Date.parse(capturedAt);
  requireValue(age >= 0, 'future_backup');
  requireValue(age <= maxAgeHours * 3600000, 'stale_backup');
  return age;
}
export function validateManifest(manifest, { maxFileBytes: limit } = {}) {
  limit = maxFileBytes(limit);
  requireValue(exactKeys(manifest, ['schemaVersion', 'setId', 'capturedAt', 'sourceRevision', 'imageDigest', 'consistency', 'files']), 'invalid_manifest');
  requireValue(manifest.schemaVersion === 1 && /^[a-f0-9-]{36}$/.test(manifest.setId)
    && validTime(manifest.capturedAt) && /^[a-f0-9]{40}$/.test(manifest.sourceRevision)
    && /^sha256:[a-f0-9]{64}$/.test(manifest.imageDigest)
    && manifest.consistency === 'operator-frozen-pair', 'invalid_manifest');
  requireValue(Array.isArray(manifest.files) && manifest.files.length === 2, 'invalid_manifest');
  for (const [index, file] of manifest.files.entries()) {
    requireValue(exactKeys(file, ['name', 'bytes', 'sha256']) && file.name === PAIR_NAMES[index]
      && Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= limit
      && HASH.test(file.sha256), 'invalid_manifest');
  }
  return manifest;
}

/** Refuse linked roots/ancestors; callers supply an operator-controlled directory. */
export async function safeDirectory(directory) {
  const absolute = path.resolve(directory);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const info = await lstat(current);
    requireValue(info.isDirectory() && !info.isSymbolicLink(), 'unsafe_path');
  }
  return absolute;
}
async function exactContents(directory, names) {
  await safeDirectory(directory);
  const entries = [];
  for await (const entry of await opendir(directory)) {
    entries.push(entry.name);
    requireValue(entries.length <= names.length, 'unexpected_files');
  }
  requireValue(entries.sort().join('|') === [...names].sort().join('|'), 'unexpected_files');
}
async function readRegular(file, limit, { collect = false } = {}) {
  const before = await lstat(file);
  requireValue(before.isFile() && !before.isSymbolicLink() && before.nlink === 1, 'unsafe_path');
  requireValue(before.size > 0 && before.size <= limit, 'file_too_large');
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    requireValue(opened.isFile() && opened.ino === before.ino && opened.dev === before.dev, 'input_changed');
    const hash = createHash('sha256');
    const chunks = [];
    let bytes = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      bytes += chunk.length;
      requireValue(bytes <= limit, 'file_too_large');
      hash.update(chunk);
      if (collect) chunks.push(chunk);
    }
    const after = await handle.stat();
    requireValue(bytes === before.size && after.size === before.size
      && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs, 'input_changed');
    return { bytes, sha256: hash.digest('hex'), ...(collect ? { content: Buffer.concat(chunks) } : {}) };
  } finally { await handle.close(); }
}
export async function readPinnedManifest(directory, manifestSha256, options = {}) {
  requireValue(typeof manifestSha256 === 'string' && HASH.test(manifestSha256), 'invalid_manifest_pin');
  const read = await readRegular(path.join(directory, MANIFEST_NAME), MANIFEST_MAX_BYTES, { collect: true });
  requireValue(read.sha256 === manifestSha256, 'manifest_mismatch');
  let manifest;
  try { manifest = JSON.parse(read.content); } catch { throw new BackupError('invalid_manifest'); }
  return validateManifest(manifest, options);
}
export async function createManifest(directory, options) {
  requireValue(options.operatorFrozen === true, 'inputs_not_frozen');
  const limit = maxFileBytes(options.maxFileBytes);
  checkFreshness(options.capturedAt, options);
  await exactContents(directory, PAIR_NAMES);
  const files = [];
  for (const name of PAIR_NAMES) files.push({ name, ...await readRegular(path.join(directory, name), limit) });
  const manifest = validateManifest({ schemaVersion: 1, setId: randomUUID(), capturedAt: options.capturedAt,
    sourceRevision: options.sourceRevision, imageDigest: options.imageDigest,
    consistency: 'operator-frozen-pair', files }, { maxFileBytes: limit });
  requireValue(Date.parse(manifest.capturedAt) <= (options.now ?? Date.now()), 'future_backup');
  const content = JSON.stringify(manifest, null, 2) + '\n';
  await writeFile(path.join(directory, MANIFEST_NAME), content, { flag: 'wx', mode: 0o600 });
  // Frozen input is still required: no userspace check locks another writer out.
  const manifestSha256 = sha256(content);
  await verifyBackupSet(directory, { ...options, manifestSha256 });
  return { status: 'created', setId: manifest.setId, manifestSha256 };
}
export async function verifyBackupSet(directory, options) {
  await exactContents(directory, [...PAIR_NAMES, MANIFEST_NAME]);
  const manifest = await readPinnedManifest(directory, options.manifestSha256, options);
  const ageMs = checkFreshness(manifest.capturedAt, options);
  for (const file of manifest.files) {
    const observed = await readRegular(path.join(directory, file.name), maxFileBytes(options.maxFileBytes));
    requireValue(observed.bytes === file.bytes && observed.sha256 === file.sha256, 'file_mismatch');
  }
  return { status: 'passed', setId: manifest.setId, capturedAt: manifest.capturedAt, ageMs,
    sourceRevision: manifest.sourceRevision, imageDigest: manifest.imageDigest,
    manifestSha256: options.manifestSha256, totalBytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0), files: manifest.files };
}
export function validateSnapshotEntries(entries, { maxFileBytes: limit } = {}) {
  limit = maxFileBytes(limit);
  requireValue(Array.isArray(entries) && entries.length <= 4, 'unsafe_snapshot');
  const nodes = entries.filter((entry) => entry.struct_type === 'node');
  requireValue(nodes.length === 3 && entries.filter((entry) => entry.struct_type === 'snapshot').length === 1, 'unsafe_snapshot');
  const expected = [...PAIR_NAMES, MANIFEST_NAME].map((name) => `/${name}`).sort();
  requireValue(nodes.map((entry) => entry.path).sort().join('|') === expected.join('|'), 'unsafe_snapshot');
  for (const entry of nodes) requireValue(entry.type === 'file' && Number.isSafeInteger(entry.size) && entry.size > 0
    && entry.size <= (entry.path === `/${MANIFEST_NAME}` ? MANIFEST_MAX_BYTES : limit), 'unsafe_snapshot');
  return nodes;
}
export function failureReport(error) {
  return { status: 'failed', code: error instanceof BackupError ? error.code : 'operation_failed' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: {
      directory: { type: 'string' }, 'captured-at': { type: 'string' }, 'source-revision': { type: 'string' },
      'image-digest': { type: 'string' }, 'operator-frozen': { type: 'boolean' }, 'manifest-sha256': { type: 'string' },
      'max-age-hours': { type: 'string', default: '48' }, 'max-file-bytes': { type: 'string', default: String(DEFAULT_MAX_FILE_BYTES) },
    } });
    requireValue(values.directory && positionals.length === 1 && ['create', 'verify'].includes(positionals[0]), 'invalid_arguments');
    const options = { capturedAt: values['captured-at'], sourceRevision: values['source-revision'], imageDigest: values['image-digest'],
      operatorFrozen: values['operator-frozen'], manifestSha256: values['manifest-sha256'],
      maxAgeHours: Number(values['max-age-hours']), maxFileBytes: Number(values['max-file-bytes']) };
    console.log(JSON.stringify(await (positionals[0] === 'create' ? createManifest(values.directory, options) : verifyBackupSet(values.directory, options))));
  } catch (error) { console.log(JSON.stringify(failureReport(error))); process.exitCode = 1; }
}
