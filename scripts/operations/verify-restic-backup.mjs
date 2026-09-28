// Does not create/delete snapshots or prune. Recovered plaintext needs operator cleanup.
import { spawn } from 'node:child_process';
import { lstat, mkdir, open, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { BackupError, DEFAULT_MAX_FILE_BYTES, MANIFEST_MAX_BYTES, MANIFEST_NAME, checkFreshness,
  failureReport, maxFileBytes, safeDirectory, sha256, validateManifest, validateSnapshotEntries, verifyBackupSet } from './backup-set.mjs';

const fullHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function requireValue(value, code) { if (!value) throw new BackupError(code); }

export async function runRestic(args, { env, binary, timeoutMs, limit, file } = {}) {
  // Passwords/repository credentials stay in the operator environment. Never echo
  // child output/errors: even a repository path or backend error can contain secrets.
  const child = spawn(binary, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const ended = new Promise((resolve) => {
    child.once('error', () => resolve({ code: null }));
    child.once('close', (code) => resolve({ code }));
  });
  child.stderr.resume();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
  const chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of child.stdout) {
      bytes += chunk.length;
      requireValue(bytes <= limit, 'restic_output_limit');
      if (file) await file.writeFile(chunk);
      else chunks.push(chunk);
    }
    const { code } = await ended;
    requireValue(!timedOut, 'restic_timeout');
    requireValue(code === 0, 'restic_failed');
    return file ? bytes : Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) child.kill('SIGKILL');
    await ended;
  }
}
function parseJson(bytes) {
  try { return JSON.parse(bytes); } catch { throw new BackupError('invalid_restic_metadata'); }
}
export function localRepository(repository) {
  if (repository.startsWith('local:')) return path.resolve(repository.slice(6));
  if (path.isAbsolute(repository) || /^[a-z]:[\\/]/i.test(repository) || !/^[a-z][a-z0-9+.-]*:/i.test(repository)) return path.resolve(repository);
  return null;
}
function inside(base, target) {
  const relative = path.relative(base, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export async function verifyResticBackup(options) {
  let createdTarget = false;
  try {
    requireValue(fullHash(options.snapshot) && fullHash(options.manifestSha256), 'invalid_snapshot_pin');
    requireValue(typeof options.target === 'string' && options.target.length > 0, 'invalid_target');
    const limit = maxFileBytes(options.maxFileBytes);
    const now = options.now ?? Date.now();
    requireValue(Number.isFinite(now), 'invalid_policy');
    const maxAgeHours = options.maxAgeHours ?? 48;
    checkFreshness(new Date(now).toISOString(), { now, maxAgeHours });
    const timeoutMs = options.timeoutMs ?? 900000;
    requireValue(Number.isSafeInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 3600000, 'invalid_policy');
    const env = options.env ?? process.env;
    requireValue(env.RESTIC_REPOSITORY && !env.RESTIC_REPOSITORY_FILE && !env.RESTIC_PASSWORD_COMMAND
      && Boolean(env.RESTIC_PASSWORD) !== Boolean(env.RESTIC_PASSWORD_FILE), 'invalid_restic_configuration');
    const target = path.resolve(options.target);
    await safeDirectory(path.dirname(target));
    try { await lstat(target); throw new BackupError('target_exists'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const repository = localRepository(env.RESTIC_REPOSITORY);
    if (repository) {
      await safeDirectory(repository);
      requireValue(!inside(repository, target) && !inside(target, repository), 'unsafe_target');
      const canonicalRepository = await realpath(repository);
      const canonicalTarget = path.join(await realpath(path.dirname(target)), path.basename(target));
      requireValue(!inside(canonicalRepository, canonicalTarget) && !inside(canonicalTarget, canonicalRepository), 'unsafe_target');
    }
    const run = (args, extra = {}) => runRestic(['--no-cache', ...args], { env, binary: options.binary ?? env.RESTIC_BIN ?? 'restic', timeoutMs, limit: 128 * 1024, ...extra });
    const snapshots = parseJson(await run(['snapshots', '--json', options.snapshot]));
    requireValue(Array.isArray(snapshots) && snapshots.length === 1 && snapshots[0].id === options.snapshot, 'snapshot_not_found');
    // Restic uses RFC3339 with nanosecond precision. Normalize only after checking
    // that the external value is a valid timestamp; the manifest itself is strict UTC.
    const snapshotTime = Date.parse(snapshots[0].time);
    requireValue(Number.isFinite(snapshotTime), 'invalid_restic_metadata');
    checkFreshness(new Date(snapshotTime).toISOString(), { now, maxAgeHours });
    const listed = (await run(['ls', '--json', options.snapshot])).toString('utf8').trim().split('\n').map(parseJson);
    const entries = validateSnapshotEntries(listed, { maxFileBytes: limit });
    requireValue(listed.find((entry) => entry.struct_type === 'snapshot').id === options.snapshot, 'snapshot_not_found');
    const content = await run(['dump', options.snapshot, `/${MANIFEST_NAME}`], { limit: MANIFEST_MAX_BYTES });
    requireValue(sha256(content) === options.manifestSha256, 'manifest_mismatch');
    const manifest = validateManifest(parseJson(content), { maxFileBytes: limit });
    checkFreshness(manifest.capturedAt, { now, maxAgeHours });
    requireValue(Date.parse(manifest.capturedAt) <= snapshotTime, 'capture_after_snapshot');
    for (const file of manifest.files) requireValue(entries.find((entry) => entry.path === `/${file.name}`)?.size === file.bytes, 'file_mismatch');

    // Only a brand-new destination is accepted, even if an existing directory is empty.
    // No restic archive/path extraction: dump exactly the validated fixed filenames.
    try { await mkdir(target, { mode: 0o700 }); }
    catch (error) { if (error.code === 'EEXIST') throw new BackupError('target_exists'); throw error; }
    createdTarget = true;
    await writeFile(path.join(target, MANIFEST_NAME), content, { flag: 'wx', mode: 0o600 });
    for (const file of manifest.files) {
      const handle = await open(path.join(target, file.name), 'wx', 0o600);
      try { await run(['dump', options.snapshot, `/${file.name}`], { limit: file.bytes, file: handle }); }
      finally { await handle.close(); }
    }
    const verified = await verifyBackupSet(target, { manifestSha256: options.manifestSha256, now: options.now ?? Date.now(), maxAgeHours, maxFileBytes: limit });
    const finished = options.now ?? Date.now();
    const ageMs = checkFreshness(manifest.capturedAt, { now: finished, maxAgeHours });
    checkFreshness(new Date(snapshotTime).toISOString(), { now: finished, maxAgeHours });
    return { ...verified, ageMs, snapshotId: options.snapshot, verifiedAt: new Date(finished).toISOString(),
      plaintextOutput: 'retained-at-requested-target', verification: 'encrypted-snapshot-bytes-only' };
  } catch (error) {
    return { ...failureReport(error), plaintextOutput: createdTarget ? 'partial-at-requested-target' : 'not-created' };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let result;
  try {
    const { values } = parseArgs({ options: {
      snapshot: { type: 'string' }, 'manifest-sha256': { type: 'string' }, target: { type: 'string' },
      'max-age-hours': { type: 'string', default: '48' }, 'max-file-bytes': { type: 'string', default: String(DEFAULT_MAX_FILE_BYTES) },
      'timeout-seconds': { type: 'string', default: '900' },
    } });
    result = await verifyResticBackup({ snapshot: values.snapshot, manifestSha256: values['manifest-sha256'], target: values.target,
      maxAgeHours: Number(values['max-age-hours']), maxFileBytes: Number(values['max-file-bytes']), timeoutMs: Number(values['timeout-seconds']) * 1000 });
  } catch (error) { result = { ...failureReport(error), plaintextOutput: 'not-created' }; }
  console.log(JSON.stringify(result));
  if (result.status !== 'passed') process.exitCode = 1;
}
