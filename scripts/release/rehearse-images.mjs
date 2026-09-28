// Owns only randomly named disposable Docker resources. Never accepts a database URL,
// host path for persistent data, remote Docker target, registry credentials or production action.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rehearsalDiagnostic } from './rehearsal-diagnostics.mjs';
import { waitForFixtureDatabase } from './fixture-readiness.mjs';
import { containerHttp } from './container-http.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(readFileSync(new URL('./runtime-policy.json', import.meta.url), 'utf8'));
const candidate = process.env.CANDIDATE_IMAGE || 'valkyria-web:ci';
const baseline = process.env.BASELINE_IMAGE || 'valkyria-web:bookworm';
for (const image of [candidate, baseline])
  assert(/^valkyria-web:[a-z0-9-]+$/.test(image), 'Only local rehearsal image tags are accepted');
assert(
  /^[a-z0-9/.-]+@sha256:[a-f0-9]{64}$/.test(policy.previousImage),
  'Previous image must be immutable',
);
assert(
  !process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT,
  'Do not override the local Docker endpoint for rehearsal',
);
const output = path.join(root, '.local/release-hardening/images');
mkdirSync(output, { recursive: true });
const prefix = `vlk-rehearsal-${randomBytes(6).toString('hex')}`;
const network = `${prefix}-net`;
const postgres = `${prefix}-pg`;
const volume = `${prefix}-media`;
const cache = `${prefix}-cache`;
const containers = new Set();
const volumes = new Set();
let networkCreated = false;
const dbName = 'valkyria_rollback_test';
const password = randomBytes(20).toString('hex');
const databaseUrl = (name) => `postgresql://test:${password}@database:5432/${name}`;
const fixtureCli = path.join(root, 'apps/web/dist/dev-cli/fixtures.mjs');
assert(existsSync(fixtureCli), 'Build the application and its dev-only fixture CLI first');
const socialRoutePresent = existsSync(
  path.join(root, 'apps/web/src/app/api/social/[locale]/[kind]/[[...slug]]/route.ts'),
);
const expectedRevision =
  process.env.GITHUB_SHA ||
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
assert.match(expectedRevision, /^[a-f0-9]{40}$/);
const report = {
  schemaVersion: 1,
  status: 'running',
  startedAt: new Date().toISOString(),
  policy,
  steps: [],
  cleanup: {},
  limits: [
    'Disposable synthetic data only; no production DB, media, registry publication or deployment.',
    'Applied production migration count is recorded in the candidate migration step. Synthetic nullable-column expansion is a separate test probe, never bundled as application schema.',
    'Image rollback compatibility must be rerun for every release; passing this candidate does not qualify future destructive migrations.',
  ],
};
const save = () =>
  writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
function docker(args, options = {}) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  }).trim();
}
async function step(id, fn) {
  report.activeStep = id;
  save();
  console.log(`START ${id}`);
  try {
    const observed = await fn();
    report.steps.push({ id, status: 'passed', observed });
    console.log(`PASS ${id}`);
    return observed;
  } catch (error) {
    const diagnostic = rehearsalDiagnostic(error, [
      password,
      'disposable-rehearsal-not-production-00000000',
    ]);
    report.steps.push({
      id,
      status: 'failed',
      reason: 'Docker operation or verification assertion failed.',
      errorType: error.name,
      exitStatus: error.status ?? null,
      signal: error.signal ?? null,
      diagnostic,
    });
    console.error(`FAIL ${id}: ${diagnostic}`);
    throw new Error(id);
  } finally {
    report.activeStep = null;
    save();
  }
}
const pg = (sql, database = dbName) =>
  docker([
    'exec',
    postgres,
    'psql',
    '-U',
    'test',
    '-d',
    database,
    '-v',
    'ON_ERROR_STOP=1',
    '-tA',
    '-c',
    sql,
  ]);
const runtimeEnv = (name) => [
  '-e',
  `DATABASE_URL=${databaseUrl(name)}`,
  '-e',
  'BETTER_AUTH_SECRET=disposable-rehearsal-not-production-00000000',
  '-e',
  'APP_URL=http://127.0.0.1:3000',
  '-e',
  'BETTER_AUTH_URL=http://127.0.0.1:3000',
  '-e',
  'LOCAL_ADMIN_LOGIN_ENABLED=false',
];
function cli(image, file, name = dbName, extra = []) {
  const container = `${prefix}-cli-${randomBytes(4).toString('hex')}`;
  containers.add(container);
  const result = docker([
    'run',
    '--name',
    container,
    '--network',
    network,
    '--read-only',
    '--tmpfs',
    '/tmp',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--mount',
    `type=volume,src=${volume},dst=/app/storage/editorial`,
    ...runtimeEnv(name),
    ...extra,
    image,
    'node',
    file,
    ...(file.endsWith('rehearsal-fixtures.mjs') ? ['--allow-fixtures'] : []),
  ]);
  docker(['rm', container]);
  containers.delete(container);
  return result;
}
async function start(image, name, database = dbName) {
  const container = `${prefix}-${name}`;
  containers.add(container);
  docker([
    'run',
    '-d',
    '--name',
    container,
    '--network',
    network,
    '--read-only',
    '--tmpfs',
    '/tmp',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--mount',
    `type=volume,src=${volume},dst=/app/storage/editorial`,
    '--mount',
    `type=volume,src=${cache},dst=/app/apps/web/.next/cache`,
    ...runtimeEnv(database),
    image,
  ]);
  let ready;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await containerHttp(docker, container, '/api/health/ready', { timeoutMs: 4000 });
      if (response.ok) {
        ready = await response.json();
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(ready?.status, 'ready');
  assert(Object.values(ready.checks).every((value) => value === 'ok'));
  return { container, readiness: ready };
}
function stop(app) {
  docker(['rm', '-f', app.container]);
  containers.delete(app.container);
}
async function serveProof(app) {
  const pages = [];
  for (const route of ['/cs', '/en', '/cs/news', '/cs/news/ukazka-obrazky-tabulka-a-odkazy']) {
    const response = await containerHttp(docker, app.container, route, { timeoutMs: 15000 });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert(text.includes('<main'));
    if (route.endsWith('ukazka-obrazky-tabulka-a-odkazy')) assert(text.includes('Ukázka'));
    pages.push({ route, status: response.status });
  }
  const media = await containerHttp(docker, app.container, '/api/media/f1c7a0e0-0000-4000-8000-00000000a001/full', {
    timeoutMs: 15000,
  });
  assert.equal(media.status, 200);
  assert.match(media.headers.get('content-type'), /^image\/webp/);
  const bytes = Buffer.from(await media.arrayBuffer());
  return {
    pages,
    media: { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
  };
}
function nativeRuntimeProof(app) {
  return JSON.parse(
    docker([
      'exec',
      app.container,
      'node',
      '-e',
      `
    const fs=require('node:fs'); const {createRequire}=require('node:module');
    const requireApp=createRequire('/app/apps/web/package.json');
    if(process.getuid()!==10001) throw Error('uid');
    let protectedRoot=false; try{fs.writeFileSync('/app/forbidden-probe','x')}catch(e){protectedRoot=['EROFS','EACCES'].includes(e.code)}
    if(!protectedRoot) throw Error('writable root');
    for(const dir of ['/app/storage/editorial','/app/apps/web/.next/cache']){fs.writeFileSync(dir+'/probe','x');fs.unlinkSync(dir+'/probe')}
    for(const file of ['/usr/local/bin/npm','/usr/local/bin/npx','/usr/local/bin/corepack','/usr/local/bin/yarn','/usr/local/bin/yarnpkg'])if(fs.existsSync(file))throw Error('package manager');
    requireApp('sharp')({create:{width:8,height:8,channels:3,background:'#ff8000'}}).webp().toBuffer().then(async buffer=>{
      const metadata=await requireApp('sharp')(buffer).metadata();if(metadata.width!==8||metadata.height!==8)throw Error('sharp');
      const socialImages=${socialRoutePresent} ? {status:'passed',renders:[]} : {status:'not-applicable',reason:'Social image source route is absent from this revision'};
      if(${socialRoutePresent})for(const locale of ['cs','en']){
        const response=await fetch('http://127.0.0.1:3000/api/social/'+locale+'/site',{signal:AbortSignal.timeout(15000)});
        if(response.status!==200||!/^image\\/png(?:;|$)/i.test(response.headers.get('content-type')||''))throw Error('social '+locale+' response');
        const png=Buffer.from(await response.arrayBuffer());if(png.length>5*1024*1024)throw Error('social '+locale+' size');
        const image=await requireApp('sharp')(png).metadata();
        if(image.format!=='png'||image.width!==1200||image.height!==630)throw Error('social '+locale+' dimensions');
        const decoded=await requireApp('sharp')(png).raw().toBuffer();if(!decoded.length)throw Error('social '+locale+' decode');
        socialImages.renders.push({locale,status:200,format:image.format,width:image.width,height:image.height,bytes:png.length,sha256:require('node:crypto').createHash('sha256').update(png).digest('hex'),decoded:true});
      }
      console.log(JSON.stringify({uid:process.getuid(),node:process.version,protectedRoot,writableMediaAndCache:true,packageManagersAbsent:true,sharp:{format:metadata.format,width:metadata.width,height:metadata.height},socialImages}))
    }).catch(error=>{console.error(String(error.message||'native runtime probe failed').slice(0,1000));process.exit(1)});
  `,
    ]),
  );
}
function fingerprints(database) {
  const tables = JSON.parse(
    pg(
      "select json_agg(format('%I.%I', schemaname, tablename) order by schemaname,tablename) from pg_tables where schemaname not in ('pg_catalog','information_schema')",
      database,
    ),
  );
  return Object.fromEntries(
    tables.map((table) => [
      table,
      pg(
        `select count(*) || ':' || coalesce(md5(string_agg(to_jsonb(t)::text, '|' order by to_jsonb(t)::text)), '') from ${table} t`,
        database,
      ),
    ]),
  );
}
try {
  await step('local-docker-only', () => {
    const context = JSON.parse(docker(['context', 'inspect']))[0];
    assert.match(context.Endpoints.docker.Host, /^(?:unix:\/\/|npipe:\/\/)/);
    return {
      serverVersion: JSON.parse(docker(['version', '--format', '{{json .Server}}'])).Version,
      endpoint: 'local-only',
    };
  });
  await step('immutable-previous-image', () => {
    docker(['pull', policy.previousImage]);
    const data = JSON.parse(docker(['image', 'inspect', policy.previousImage]))[0];
    assert.equal(data.Config.Labels['org.opencontainers.image.revision'], policy.previousRevision);
    return { imageId: data.Id, sourceRevision: policy.previousRevision };
  });
  await step('matching-candidate-source-revisions', () => {
    for (const image of [candidate, baseline]) {
      const data = JSON.parse(docker(['image', 'inspect', image]))[0];
      assert.equal(data.Config.Labels['org.opencontainers.image.revision'], expectedRevision);
    }
    return { sourceRevision: expectedRevision, bothRuntimeVariantsMatch: true };
  });
  await step('create-disposable-internal-fixture', async () => {
    networkCreated = true;
    docker(['network', 'create', '--internal', network]);
    for (const name of [volume, cache]) {
      volumes.add(name);
      docker(['volume', 'create', name]);
    }
    containers.add(postgres);
    docker([
      'run',
      '-d',
      '--name',
      postgres,
      '--network',
      network,
      '--network-alias',
      'database',
      '--tmpfs',
      '/var/lib/postgresql/data',
      '-e',
      'POSTGRES_USER=test',
      '-e',
      `POSTGRES_PASSWORD=${password}`,
      '-e',
      `POSTGRES_DB=${dbName}`,
      policy.postgresImage,
    ]);
    await waitForFixtureDatabase(docker, postgres, dbName);
    return {
      database: 'tmpfs PostgreSQL with no published port',
      network: 'internal',
      uniqueDisposableVolumes: 2,
    };
  });
  await step('previous-schema-and-synthetic-fixtures', () => {
    cli(policy.previousImage, 'scripts/migrate.mjs');
    cli(policy.previousImage, 'scripts/seed.mjs');
    cli(candidate, '/app/apps/web/rehearsal-fixtures.mjs', dbName, [
      '--mount',
      `type=bind,src=${fixtureCli},dst=/app/apps/web/rehearsal-fixtures.mjs,readonly`,
    ]);
    return {
      fixtureArticle: '/cs/news/ukazka-obrazky-tabulka-a-odkazy',
      productionFixtures: false,
    };
  });
  const before = await step('previous-image-before-upgrade', async () => {
    const app = await start(policy.previousImage, 'previous-before');
    try {
      return await serveProof(app);
    } finally {
      stop(app);
    }
  });
  const backup = await step('pre-upgrade-backup', () => {
    docker([
      'exec',
      postgres,
      'pg_dump',
      '-U',
      'test',
      '-d',
      dbName,
      '-Fc',
      '--no-owner',
      '--no-privileges',
      '-f',
      '/tmp/pre-upgrade.dump',
    ]);
    return { tables: fingerprints(dbName), media: before.media };
  });
  await step('candidate-migrations-and-expansion-probe', () => {
    const first = cli(candidate, 'scripts/migrate.mjs');
    const second = cli(candidate, 'scripts/migrate.mjs');
    assert.match(second, /Applied 0 migration/);
    const applied = Number(/Applied (\d+) migration/.exec(first)?.[1]);
    assert(Number.isInteger(applied));
    pg('ALTER TABLE content_document ADD COLUMN release_rehearsal_nullable_probe text');
    return {
      appliedProductionMigrations: applied,
      repeatApplied: 0,
      syntheticExpansion:
        'Nullable text column on content_document; test-only, outside migration journal.',
    };
  });
  const postMigrationTables = fingerprints(dbName);
  for (const [name, image] of [
    ['bookworm', baseline],
    ['trixie', candidate],
  ])
    await step(`runtime-${name}`, async () => {
      const app = await start(image, name);
      try {
        const imageInfo = JSON.parse(docker(['image', 'inspect', image]))[0];
        const proof = await serveProof(app);
        assert.deepEqual(proof.media, before.media);
        const native = nativeRuntimeProof(app);
        assert.match(native.node, /^v24\./);
        const health = imageInfo.Config.Healthcheck.Test;
        assert.equal(health[0], 'CMD');
        docker(['exec', app.container, ...health.slice(1)]);
        if (name === 'trixie') {
          docker(['network', 'disconnect', network, postgres]);
          try {
            const live = await containerHttp(docker, app.container, '/api/health/live', {
              timeoutMs: 5000,
            });
            const ready = await containerHttp(docker, app.container, '/api/health/ready', {
              timeoutMs: 8000,
            });
            assert.equal(live.status, 200);
            assert.equal(ready.status, 503);
          } finally {
            docker(['network', 'connect', '--alias', 'database', network, postgres]);
          }
          let recovered = false;
          for (let i = 0; i < 30; i++) {
            if (
              (await containerHttp(docker, app.container, '/api/health/ready', { timeoutMs: 8000 })).ok
            ) {
              recovered = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          assert(recovered);
        }
        return {
          imageId: imageInfo.Id,
          imageBytes: imageInfo.Size,
          sourceRevision: imageInfo.Config.Labels['org.opencontainers.image.revision'],
          native,
          proof,
          healthCommandPassed: true,
          databaseFailureRecovery: name === 'trixie' ? 'passed' : 'not-run',
        };
      } finally {
        stop(app);
      }
    });
  await step('previous-image-after-candidate-migrations', async () => {
    const app = await start(policy.previousImage, 'rollback');
    try {
      const proof = await serveProof(app);
      assert.deepEqual(proof.media, before.media);
      assert.deepEqual(fingerprints(dbName), postMigrationTables);
      return { ...proof, dataUnchanged: true };
    } finally {
      stop(app);
    }
  });
  await step('restore-based-rollback', async () => {
    pg('CREATE DATABASE valkyria_rollback_restore');
    docker([
      'exec',
      postgres,
      'pg_restore',
      '-U',
      'test',
      '-d',
      'valkyria_rollback_restore',
      '--no-owner',
      '--no-privileges',
      '--exit-on-error',
      '/tmp/pre-upgrade.dump',
    ]);
    assert.deepEqual(fingerprints('valkyria_rollback_restore'), backup.tables);
    const app = await start(policy.previousImage, 'restore', 'valkyria_rollback_restore');
    try {
      const proof = await serveProof(app);
      assert.deepEqual(proof.media, backup.media);
      return {
        ...proof,
        allRestoredTableContentsMatch: true,
        media: 'Unchanged retained fixture volume; no media-write migration was exercised.',
      };
    } finally {
      stop(app);
    }
  });
  report.status = 'passed';
} catch {
  report.status = 'failed';
  process.exitCode = 1;
} finally {
  for (const name of containers) {
    try {
      docker(['rm', '-f', name]);
    } catch {
      report.cleanup[name.replace(prefix, 'fixture')] = 'failed';
    }
  }
  for (const name of volumes) {
    try {
      docker(['volume', 'rm', name]);
    } catch {
      report.cleanup[name.replace(prefix, 'fixture')] = 'failed';
    }
  }
  if (networkCreated) {
    try {
      docker(['network', 'rm', network]);
    } catch {
      report.cleanup.network = 'failed';
    }
  }
  report.cleanup.status = Object.keys(report.cleanup).length ? 'failed' : 'passed';
  if (report.cleanup.status !== 'passed') {
    report.status = 'failed';
    process.exitCode = 1;
  }
  report.finishedAt = new Date().toISOString();
  save();
}
console.log(
  JSON.stringify({
    status: report.status,
    steps: report.steps.length,
    cleanup: report.cleanup.status,
  }),
);
