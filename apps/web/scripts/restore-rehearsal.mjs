// Disposable backup/restore rehearsal (docs/operations/backup-restore.md). Dumps a source
// database and editorial media root, restores both into disposable targets, re-runs the
// bundled migrations (expected no-op), verifies table row counts and every recorded media
// variant, then serves the restored copy and checks readiness and media delivery.
// Never point --target-db at a database that is not disposable: its name must end with
// `_restore`, and it is dropped and recreated.
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import pg from 'pg';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    'source-db': { type: 'string' },
    'target-db': { type: 'string' },
    'media-root': { type: 'string' },
    'work-dir': { type: 'string' },
    port: { type: 'string', default: '3400' },
  },
});
for (const name of ['source-db', 'target-db', 'media-root', 'work-dir']) {
  if (!values[name]) {
    console.error(`Usage: node scripts/restore-rehearsal.mjs --source-db <url> --target-db <url ending _restore> --media-root <dir> --work-dir <dir> [--port 3400]`);
    process.exit(2);
  }
}
const sourceUrl = new URL(values['source-db']);
const targetUrl = new URL(values['target-db']);
const targetName = targetUrl.pathname.slice(1);
if (!/^[a-z0-9_]+_restore$/.test(targetName)) throw new Error('Refusing: the target database name must end with _restore.');
if (targetName === sourceUrl.pathname.slice(1)) throw new Error('Refusing: source and target are the same database.');
const mediaRoot = path.resolve(values['media-root']);
const workDir = path.resolve(values['work-dir']);
rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const redact = (url) => `${url.protocol}//${url.hostname}:${url.port || 5432}/${url.pathname.slice(1)}`;
const report = { startedAt: new Date().toISOString(), source: redact(sourceUrl), target: redact(targetUrl), steps: {} };
const step = (name, data) => {
  report.steps[name] = data;
  console.log(`${name}: ${JSON.stringify(data)}`);
};

function listFiles(root) {
  const files = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.set(path.relative(root, full), { bytes: statSync(full).size, sha256: sha256(full) });
    }
  };
  if (existsSync(root)) walk(root);
  return files;
}

/** Row count and an order-independent content checksum for every table. */
async function tableFingerprints(url) {
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select table_schema, table_name from information_schema.tables
        where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')
        order by table_schema, table_name`,
    );
    const fingerprints = {};
    for (const { table_schema: schema, table_name: table } of rows) {
      const result = await client.query(
        `select count(*)::int as n, coalesce(md5(string_agg(t::text, '|' order by t::text)), '') as digest from "${schema}"."${table}" t`,
      );
      fingerprints[`${schema}.${table}`] = `${result.rows[0].n}:${result.rows[0].digest}`;
    }
    return fingerprints;
  } finally {
    await client.end();
  }
}

// 1. Backup: logical database dump plus an archive of the media root.
const dumpFile = path.join(workDir, 'database.dump');
execFileSync('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', dumpFile, sourceUrl.toString()], { stdio: 'inherit' });
const mediaArchive = path.join(workDir, 'editorial-media.tar.gz');
execFileSync('tar', ['-C', mediaRoot, '-czf', mediaArchive, '.'], { stdio: 'inherit' });
step('backup', {
  database: { bytes: statSync(dumpFile).size, sha256: sha256(dumpFile) },
  media: { bytes: statSync(mediaArchive).size, sha256: sha256(mediaArchive) },
});

// 2. Restore into a fresh disposable database and media directory.
const maintenance = new pg.Client({ connectionString: sourceUrl.toString() });
await maintenance.connect();
await maintenance.query(`drop database if exists "${targetName}" with (force)`);
await maintenance.query(`create database "${targetName}"`);
await maintenance.end();
execFileSync('pg_restore', ['--no-owner', '--no-privileges', '--exit-on-error', '--dbname', targetUrl.toString(), dumpFile], { stdio: 'inherit' });
const restoredMedia = path.join(workDir, 'editorial-media');
mkdirSync(restoredMedia, { recursive: true });
execFileSync('tar', ['-C', restoredMedia, '-xzf', mediaArchive], { stdio: 'inherit' });

// 3. The bundled migration runner must find nothing to apply on a restored database.
const migrateCli = path.join(appDir, 'dist', 'cli', 'migrate.mjs');
if (!existsSync(migrateCli)) throw new Error('dist/cli/migrate.mjs missing; run "pnpm build" first.');
const migrateOutput = execFileSync(process.execPath, [migrateCli], { env: { ...process.env, DATABASE_URL: targetUrl.toString() }, encoding: 'utf8', cwd: appDir });
const applied = /Applied (\d+) migration/.exec(migrateOutput)?.[1];
step('migrate', { output: migrateOutput.trim().split('\n').at(-1) });
if (applied !== '0') throw new Error('The restored database needed migrations; the dump was incomplete or from another revision.');

// 4. Every table's rows (content, not just counts) and all media bytes must match the source.
const [sourceTables, targetTables] = await Promise.all([tableFingerprints(sourceUrl), tableFingerprints(targetUrl)]);
const tableMismatches = Object.keys({ ...sourceTables, ...targetTables }).filter((key) => sourceTables[key] !== targetTables[key]);
const rowTotal = Object.values(sourceTables).reduce((sum, value) => sum + Number(value.split(':')[0]), 0);
step('rows', { tables: Object.keys(sourceTables).length, rows: rowTotal, contentMismatches: tableMismatches });
if (tableMismatches.length) throw new Error(`Table contents differ: ${tableMismatches.join(', ')}`);

const sourceFiles = listFiles(mediaRoot);
const restoredFiles = listFiles(restoredMedia);
const fileMismatches = [...new Set([...sourceFiles.keys(), ...restoredFiles.keys()])].filter(
  (key) => sourceFiles.get(key)?.sha256 !== restoredFiles.get(key)?.sha256,
);
const client = new pg.Client({ connectionString: targetUrl.toString() });
await client.connect();
// Soft-deleted assets keep their row for history; their files are removed on purpose.
const { rows: assets } = await client.query('select id, variants from asset where deleted_at is null order by id');
await client.end();
const missingVariants = [];
let variantCount = 0;
for (const { id, variants } of assets) {
  for (const [name, variant] of Object.entries(variants ?? {})) {
    variantCount += 1;
    const file = restoredFiles.get(path.join(id, `${name}.webp`));
    if (!file || file.bytes !== variant.bytes) missingVariants.push(`${id}/${name}`);
  }
}
step('media', { files: restoredFiles.size, fileMismatches, assets: assets.length, variants: variantCount, missingVariants });
if (fileMismatches.length || missingVariants.length) throw new Error('Restored media does not match the backup or the asset metadata.');

// 5. Serve the restored copy with the production build and check readiness and delivery.
const port = Number(values.port);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(appDir, 'scripts', 'serve-standalone.mjs')], {
  cwd: appDir,
  stdio: ['ignore', 'ignore', 'inherit'],
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    APP_URL: baseUrl,
    BETTER_AUTH_URL: baseUrl,
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    DATABASE_URL: targetUrl.toString(),
    EDITORIAL_MEDIA_ROOT: restoredMedia,
    NEXT_TELEMETRY_DISABLED: '1',
  },
});
try {
  let ready = null;
  for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    ready = await fetch(`${baseUrl}/api/health/ready`).then((response) => (response.ok ? response.status : null), () => null);
  }
  if (!ready) throw new Error('Restored application never became ready.');
  const delivered = [];
  for (const { id, variants } of assets) {
    if (!variants?.thumb) continue;
    const response = await fetch(`${baseUrl}/api/media/${id}/thumb`);
    const body = Buffer.from(await response.arrayBuffer());
    const expected = restoredFiles.get(path.join(id, 'thumb.webp'));
    delivered.push({ asset: id, status: response.status, matchesBackup: response.ok ? createHash('sha256').update(body).digest('hex') === expected?.sha256 : null });
  }
  const home = await fetch(`${baseUrl}/cs`);
  step('serve', { ready, homeStatus: home.status, mediaDelivery: delivered });
  if (home.status !== 200 || delivered.some((entry) => entry.status === 200 && !entry.matchesBackup)) throw new Error('Restored application served unexpected content.');
  if (!delivered.some((entry) => entry.status === 200)) throw new Error('No published media was delivered from the restored copy.');
} finally {
  server.kill('SIGTERM');
}

report.finishedAt = new Date().toISOString();
report.result = 'passed';
writeFileSync(path.join(workDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Restore rehearsal passed; report: ${path.join(workDir, 'report.json')}`);
