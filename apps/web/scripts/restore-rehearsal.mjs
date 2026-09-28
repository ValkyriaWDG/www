// Frozen operator source -> NEW same-cluster disposable target. Never DROP.
// This captures its own inputs; it is not an encrypted-backup recovery interface.
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { constants, closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const MAX_BYTES = 20 * 1024 ** 3;
export class RehearsalError extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new RehearsalError(code); };
const check = (condition, code) => { if (!condition) fail(code); };
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const inside = (parent, child) => { const rel = path.relative(parent, child); return !rel || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)); };
const overlap = (a, b) => inside(a, b) || inside(b, a);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function directory(value) {
  const absolute = path.resolve(value);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = lstatSync(current);
    check(stat.isDirectory() && !stat.isSymbolicLink(), 'unsafe_directory');
  }
  check(samePath(realpathSync.native(absolute), absolute), 'path_alias');
  return absolute;
}
function regular(file) {
  const stat = lstatSync(file);
  check(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, 'unsafe_file');
  return stat;
}
function fileHash(file) {
  const before = regular(file);
  check(before.size <= MAX_BYTES, 'media_limit');
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    check(opened.ino === before.ino && opened.dev === before.dev, 'input_changed');
    const hash = createHash('sha256'), buffer = Buffer.alloc(65536);
    let count = 0, size;
    while ((size = readSync(fd, buffer)) > 0) { count += size; check(count <= MAX_BYTES, 'media_limit'); hash.update(buffer.subarray(0, size)); }
    const after = fstatSync(fd);
    check(count === before.size && after.size === before.size && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs, 'input_changed');
    return { bytes: count, sha256: hash.digest('hex') };
  } finally { closeSync(fd); }
}
function listFiles(root) {
  const files = new Map();
  let total = 0, entries = 0;
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      check(++entries <= 10000, 'media_limit');
      const full = path.join(dir, name), info = lstatSync(full);
      check(!info.isSymbolicLink(), 'unsafe_file');
      if (info.isDirectory()) walk(full);
      else { const value = fileHash(full); total += value.bytes; check(total <= MAX_BYTES, 'media_limit'); files.set(path.relative(root, full), value); }
    }
  };
  walk(directory(root));
  files.entryCount = entries;
  return files;
}
export function parseDatabaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { fail('invalid_database_url'); }
  check(['postgres:', 'postgresql:'].includes(url.protocol) && url.hostname && url.username && url.password && !url.hash, 'invalid_database_url');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  check(net.isIP(host) !== 0 || (host.length <= 253 && host.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part))), 'invalid_database_host');
  check(/^\/[a-z][a-z0-9_]{0,62}$/.test(url.pathname), 'invalid_database_name');
  check(!url.port || (Number(url.port) >= 1 && Number(url.port) <= 65535), 'invalid_database_port');
  const params = [...url.searchParams];
  check(params.length <= 1 && params.every(([key, value]) => key === 'sslmode' && ['disable', 'verify-full'].includes(value)), 'unsupported_database_options');
  try { check(![url.username, url.password].some(value => decodeURIComponent(value).includes('\0')), 'invalid_database_url'); } catch { fail('invalid_database_url'); }
  url.protocol = 'postgresql:';
  url.port ||= '5432';
  // Node pg and libpq have different implicit TLS defaults and require/verify-ca
  // semantics. Normalize to their shared explicit policies before any connection.
  if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'disable');
  return url;
}
export function assertCleanPgEnvironment(env = process.env) {
  check(!Object.keys(env).some(key => /^PG/i.test(key)), 'ambient_database_configuration');
}
export function parseOptions(argv, env = process.env) {
  assertCleanPgEnvironment(env);
  const { values } = parseArgs({ args: argv, options: {
    'media-root': { type: 'string' }, 'work-dir': { type: 'string' }, port: { type: 'string', default: '3400' },
    'public-asset': { type: 'string', multiple: true }, 'private-asset': { type: 'string', multiple: true }, 'operator-frozen': { type: 'boolean' },
  } });
  return { sourceDb: env.REHEARSAL_SOURCE_DATABASE_URL, targetDb: env.REHEARSAL_TARGET_DATABASE_URL,
    mediaRoot: values['media-root'], workDir: values['work-dir'], port: Number(values.port),
    publicAssets: values['public-asset'] ?? [], privateAssets: values['private-asset'] ?? [], operatorFrozen: values['operator-frozen'] === true };
}
/** Reads only: no SQL, directory creation or subprocess may precede this. */
export function preflight(options, appDir = APP) {
  assertCleanPgEnvironment();
  check(options.operatorFrozen === true, 'source_not_frozen');
  check(typeof options.mediaRoot === 'string' && options.mediaRoot && typeof options.workDir === 'string' && options.workDir, 'invalid_paths');
  check(Number.isInteger(options.port) && options.port >= 1024 && options.port <= 65535, 'invalid_port');
  const source = parseDatabaseUrl(options.sourceDb), target = parseDatabaseUrl(options.targetDb);
  check(source.pathname !== target.pathname && /_restore$/.test(target.pathname), 'invalid_target_database');
  check(['hostname', 'port', 'username', 'password', 'search'].every(key => source[key] === target[key]), 'database_connection_mismatch');
  const workDir = path.resolve(options.workDir), mediaRoot = directory(options.mediaRoot);
  check(!existsSync(workDir), 'work_directory_exists');
  directory(path.dirname(workDir));
  const canonicalWork = path.join(realpathSync.native(path.dirname(workDir)), path.basename(workDir));
  check(samePath(workDir, canonicalWork), 'path_alias');
  const repo = path.resolve(appDir, '../..');
  check(!overlap(workDir, repo) && !overlap(canonicalWork, realpathSync.native(repo)) && !overlap(workDir, mediaRoot), 'path_overlap');
  const publicAssets = options.publicAssets ?? [], privateAssets = options.privateAssets ?? [];
  check([...publicAssets, ...privateAssets].every(id => UUID.test(id)) && !publicAssets.some(id => privateAssets.includes(id)), 'invalid_asset_expectation');
  const files = listFiles(mediaRoot);
  const migrate = path.join(appDir, 'dist/cli/migrate.mjs');
  const server = path.join(appDir, '.next/standalone/apps/web/server.js');
  for (const file of [migrate, server]) { directory(path.dirname(file)); regular(file); }
  return { ...options, publicAssets, privateAssets, source, target, targetName: target.pathname.slice(1), mediaRoot, workDir, files, migrate, server, appDir };
}

// Children never receive ambient database/provider credentials or raw URL arguments.
function systemEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|pathext|systemroot|windir|comspec|temp|tmp|home|userprofile|lang|lc_all)$/i.test(key)));
}
function pgEnv(url) {
  return { ...systemEnv(), PGHOST: url.hostname.replace(/^\[|\]$/g, ''), PGPORT: url.port, PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.slice(1), PGCONNECT_TIMEOUT: '10', PGSSLMODE: url.searchParams.get('sslmode') };
}
export async function stopOwnedProcess(child, graceMs = 2000) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const ended = new Promise(resolve => { child.once('close', resolve); child.once('error', resolve); });
  child.kill('SIGTERM');
  if (await Promise.race([ended.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), graceMs))])) return;
  child.kill('SIGKILL');
  check(await Promise.race([ended.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 2000))]), 'app_cleanup_failed');
}
export async function runCommand(binary, args, { env, cwd, signal, timeoutMs = 120000, limit = 1024 * 1024 } = {}) {
  check(!signal?.aborted, 'interrupted');
  const child = spawn(binary, args, { env, cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const ended = new Promise(resolve => { child.once('error', () => resolve(null)); child.once('close', code => resolve(code)); });
  let reason, bytes = 0;
  const chunks = [];
  const abort = code => { reason ||= code; child.kill('SIGKILL'); };
  const interrupt = () => abort('interrupted');
  signal?.addEventListener('abort', interrupt, { once: true });
  const timer = setTimeout(() => abort('command_timeout'), timeoutMs);
  child.stderr.on('data', data => { bytes += data.length; if (bytes > limit) abort('command_output_limit'); });
  child.stdout.on('data', data => { bytes += data.length; if (bytes > limit) abort('command_output_limit'); else chunks.push(data); });
  try { const code = await ended; if (reason) fail(reason); check(code === 0, 'command_failed'); return Buffer.concat(chunks).toString('utf8'); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', interrupt); }
}
const quote = name => `"${name.replaceAll('"', '""')}"`;
async function withClient(factory, url, action) {
  const client = factory(url);
  try { await client.connect(); return await action(client); } finally { await client.end(); }
}
async function fingerprints(factory, url) {
  return withClient(factory, url, async client => {
    const { rows } = await client.query("select table_schema, table_name from information_schema.tables where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema') order by table_schema, table_name");
    const values = {};
    for (const { table_schema: schema, table_name: table } of rows) {
      const result = await client.query(`select count(*)::int as n, coalesce(md5(string_agg(t::text, '|' order by t::text)), '') as digest from ${quote(schema)}.${quote(table)} t`);
      values[`${schema}.${table}`] = `${result.rows[0].n}:${result.rows[0].digest}`;
    }
    return values;
  });
}
async function availablePort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new RehearsalError('port_unavailable')));
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => server.close(resolve));
  });
}
export async function launchApp(config, env, signal) {
  // Direct standalone entrypoint: no wrapper/grandchild and no source directory copy.
  const child = spawn(process.execPath, [config.server], { cwd: path.dirname(config.server), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stderr.resume();
  let output = '', ready = false, failed = false, closed = false;
  child.stdout.on('data', data => { output = (output + data.toString()).slice(-1024); if (/Ready in \d+ms/.test(output)) ready = true; });
  child.on('error', () => { failed = true; });
  child.on('close', () => { closed = true; });
  return { stop: () => stopOwnedProcess(child), alive: () => !failed && !closed && child.exitCode === null && child.signalCode === null,
    waitReady: async () => {
      const deadline = Date.now() + 60000;
      while (!ready && Date.now() < deadline) {
        check(!signal?.aborted, 'interrupted'); check(!failed && !closed && child.exitCode === null && child.signalCode === null, 'app_start_failed');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      check(ready, 'app_start_timeout');
    } };
}
export async function request(url, signal) {
  const timeout = AbortSignal.timeout(5000);
  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.any([timeout, ...(signal ? [signal] : [])]) });
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) { bytes += chunk.length; check(bytes <= 32 * 1024 ** 2, 'http_limit'); chunks.push(chunk); }
    return { status: response.status, body: Buffer.concat(chunks) };
  } catch (error) {
    if (error instanceof RehearsalError) throw error;
    fail(timeout.aborted ? 'http_timeout' : 'http_request_failed');
  }
}

/** Injectable I/O proves refusal before writes; production CLI always uses real adapters. */
export async function rehearse(options, adapters = {}) {
  const report = { schemaVersion: 1, startedAt: new Date().toISOString(), status: 'failed', steps: {}, ownership: { workDirectory: 'not-created', database: 'not-created', appProcess: 'not-started' } };
  let config, app;
  const signal = adapters.signal;
  try {
    config = preflight(options, adapters.appDir ?? APP);
    check(!signal?.aborted, 'interrupted');
    let factory = adapters.client;
    if (!factory) {
      const { Client } = (await import('pg')).default;
      factory = url => new Client({ connectionString: url.toString(), connectionTimeoutMillis: 10000, query_timeout: 10000, statement_timeout: 10000, lock_timeout: 10000 });
    }
    const run = adapters.run ?? runCommand;
    await (adapters.availablePort ?? availablePort)(config.port);
    await withClient(factory, config.source, async client => {
      check((await client.query('select 1 from pg_database where datname = $1', [config.targetName])).rows.length === 0, 'target_database_exists');
      check(!signal?.aborted, 'interrupted');
      // Protected parents/source remain operator-frozen; recheck before exclusive creation.
      preflight(options, adapters.appDir ?? APP);
      try { mkdirSync(config.workDir, { mode: 0o700 }); } catch { fail('work_directory_creation_failed'); }
      report.ownership.workDirectory = 'created-retained';
      report.ownership.database = 'creation-outcome-unknown';
      try { await client.query(`create database ${quote(config.targetName)}`); }
      catch (error) { if (['42P04', '42501'].includes(error.code)) report.ownership.database = 'not-created'; fail(error.code === '42P04' ? 'target_database_collision' : 'target_database_creation_failed'); }
      report.ownership.database = 'created-retained';
    });
    const sourceTables = await fingerprints(factory, config.source);
    const dump = path.join(config.workDir, 'database.dump'), archive = path.join(config.workDir, 'editorial-media.tar.gz');
    const command = (binary, args, env = systemEnv()) => run(binary, args, { env, cwd: config.appDir, signal });
    await command('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', dump], pgEnv(config.source));
    await command('tar', ['-C', config.mediaRoot, '-czf', archive, '.']);
    report.steps.backup = { database: fileHash(dump), media: fileHash(archive) };
    await command('pg_restore', ['--no-owner', '--no-privileges', '--exit-on-error', '--dbname', config.targetName, dump], pgEnv(config.target));
    const media = path.join(config.workDir, 'editorial-media');
    mkdirSync(media, { mode: 0o700 });
    await command('tar', ['-C', media, '-xzf', archive]);
    const origin = `http://127.0.0.1:${config.port}`;
    const env = { ...systemEnv(), DATABASE_URL: config.target.toString(), NODE_ENV: 'production', PORT: String(config.port), HOSTNAME: '127.0.0.1',
      APP_URL: origin, BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: randomBytes(32).toString('hex'), EDITORIAL_MEDIA_ROOT: media, NEXT_TELEMETRY_DISABLED: '1',
      DISCORD_CLIENT_ID: '', DISCORD_CLIENT_SECRET: '', DISCORD_BOT_TOKEN: '', DISCORD_GUILD_ID: '', LOCAL_ADMIN_LOGIN_ENABLED: 'false' };
    const migration = await command(process.execPath, [config.migrate], env);
    const applied = Number(/Applied (\d+) migration/.exec(migration)?.[1]);
    report.steps.migrate = { applied: Number.isInteger(applied) ? applied : null };
    check(applied === 0, 'migration_not_noop');
    const targetTables = await fingerprints(factory, config.target), sourceAfter = await fingerprints(factory, config.source);
    const equalTables = JSON.stringify(sourceTables) === JSON.stringify(targetTables) && JSON.stringify(sourceTables) === JSON.stringify(sourceAfter);
    report.steps.rows = { tables: Object.keys(sourceTables).length, contentMatches: equalTables };
    check(equalTables, 'table_fingerprint_mismatch');
    const after = listFiles(config.mediaRoot), restored = listFiles(media);
    const equalFiles = (a, b) => a.entryCount === b.entryCount && a.size === b.size && [...a].every(([name, value]) => value.sha256 === b.get(name)?.sha256);
    check(equalFiles(config.files, after) && equalFiles(config.files, restored), 'media_fingerprint_mismatch');
    const assets = await withClient(factory, config.target, async client => (await client.query('select id, variants from asset where deleted_at is null order by id')).rows);
    let variants = 0;
    for (const asset of assets) for (const [name, variant] of Object.entries(asset.variants ?? {})) {
      check(UUID.test(asset.id) && ['full', 'thumb'].includes(name), 'invalid_asset_metadata');
      const file = restored.get(path.join(asset.id, `${name}.webp`));
      check(file && file.bytes === variant.bytes, 'missing_media_variant'); variants++;
    }
    if (!assets.length) check(restored.entryCount === 0, 'unexpected_empty_media_files');
    else check(config.publicAssets.length > 0, 'public_media_expectation_required');
    for (const id of [...config.publicAssets, ...config.privateAssets]) check(assets.some(asset => asset.id === id && asset.variants?.thumb), 'asset_expectation_missing');
    report.steps.media = { files: restored.size, assets: assets.length, variants, byteHashesMatch: true };
    app = await (adapters.launchApp ?? launchApp)(config, env, signal);
    report.ownership.appProcess = 'running';
    await app.waitReady();
    const fetch = url => (adapters.request ?? request)(url, signal);
    report.steps.serve = { phase: 'readiness' };
    const ready = await fetch(`${origin}/api/health/ready`);
    report.steps.serve = { phase: 'home', ready: ready.status };
    const home = await fetch(`${origin}/cs`);
    check(ready.status === 200 && home.status === 200 && app.alive(), 'app_not_ready');
    report.steps.serve = { phase: 'media', ready: ready.status, home: home.status };
    let delivered = 0, privateDenied = 0;
    for (const asset of assets) {
      if (!asset.variants?.thumb) continue;
      const response = await fetch(`${origin}/api/media/${asset.id}/thumb`);
      if (config.privateAssets.includes(asset.id)) { check(response.status === 404, 'private_media_exposed'); privateDenied++; }
      else if (config.publicAssets.includes(asset.id)) check(response.status === 200, 'public_media_unavailable');
      else check([200, 404].includes(response.status), 'unexpected_media_status');
      if (response.status === 200) { check(digest(response.body) === restored.get(path.join(asset.id, 'thumb.webp'))?.sha256, 'served_media_mismatch'); delivered++; }
    }
    check(app.alive() && !signal?.aborted, 'interrupted');
    report.steps.serve = { ready: ready.status, home: home.status, mediaDelivery: assets.length ? 'verified' : 'not-applicable-empty', delivered, privateDenied };
    report.status = 'passed';
  } catch (error) { report.code = signal?.aborted ? 'interrupted' : error instanceof RehearsalError ? error.code : 'operation_failed'; }
  finally {
    if (app) { try { await app.stop(); report.ownership.appProcess = 'stopped'; } catch { report.status = 'failed'; report.code = 'app_cleanup_failed'; report.ownership.appProcess = 'cleanup-failed'; } }
    report.finishedAt = new Date().toISOString();
    report.cleanup = 'Retain owned work directory/database for inspection; remove only after confirming ownership. No automatic database or directory deletion.';
    if (report.ownership.workDirectory === 'created-retained') {
      try { writeFileSync(path.join(config.workDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 }); }
      catch { report.status = 'failed'; report.code = 'report_write_failed'; }
    }
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const abort = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => abort.abort());
  let report;
  try { report = await rehearse(parseOptions(process.argv.slice(2)), { signal: abort.signal }); }
  catch (error) { report = { status: 'failed', code: error instanceof RehearsalError ? error.code : 'invalid_arguments', ownership: { workDirectory: 'not-created', database: 'not-created', appProcess: 'not-started' } }; }
  console.log(JSON.stringify(report));
  if (report.status !== 'passed') process.exitCode = 1;
}
