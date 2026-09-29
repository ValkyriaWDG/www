import assert from 'node:assert/strict';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { dockerAdapter, migrationFingerprint, promoteProduction, promotionSummary, runtimeContract, validateIndex } from '../release/production-channel.mjs';

const previousDigest = `sha256:${'a'.repeat(64)}`;
const candidateDigest = `sha256:${'b'.repeat(64)}`;
const otherDigest = `sha256:${'c'.repeat(64)}`;
const sourceSha = '1'.repeat(40);
const previousRevision = '2'.repeat(40);
const image = 'majorluk/valkyria-www';
const input = { image, candidateDigest, sourceSha, expectedSha: sourceSha };
const index = (digest = candidateDigest) => ({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.index.v1+json', digest, manifests: [{ digest: otherDigest, platform: { os: 'linux', architecture: 'amd64' } }, { digest: previousDigest, platform: { os: 'unknown', architecture: 'unknown' } }] });
const imageConfig = () => ({
  Os: 'linux', Architecture: 'amd64', RepoDigests: [`${image}@${candidateDigest}`],
  Config: { User: 'valkyria:valkyria', WorkingDir: '/app', Entrypoint: ['docker-entrypoint.sh'], Cmd: ['node', 'apps/web/server.js'], Env: ['NODE_ENV=production', 'PORT=3000'], ExposedPorts: { '3000/tcp': {} }, Healthcheck: { Test: ['CMD', 'node', '-e', 'process.exit(0)'], Interval: 30_000_000_000 }, Labels: { 'org.opencontainers.image.revision': sourceSha } },
});

function makeBundle(directory) {
  mkdirSync(path.join(directory, 'migrations', 'meta'), { recursive: true });
  writeFileSync(path.join(directory, 'migrations', '0000_initial.sql'), 'CREATE TABLE example (id integer);\n');
  writeFileSync(path.join(directory, 'migrations', 'meta', '_journal.json'), JSON.stringify({ dialect: 'postgresql', version: '7', entries: [{ idx: 0, tag: '0000_initial' }] }));
  writeFileSync(path.join(directory, 'migrations', 'meta', '0000_snapshot.json'), '{"version":"7"}\n');
  writeFileSync(path.join(directory, 'migrate.mjs'), 'import process from "node:process";\n');
}

function bundleFixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'valkyria-channel-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  makeBundle(directory);
  return directory;
}

function fakeAdapter(overrides = {}) {
  const calls = [];
  let alias = previousDigest;
  const evidence = { revision: previousRevision, runtime: 'runtime-a', bundle: { sha256: 'bundle-a', migrations: ['0000_initial'] } };
  const adapter = {
    resolve(reference) { calls.push(['resolve', reference]); return { digest: reference.endsWith(':production') ? alias : candidateDigest }; },
    evidence(reference) { calls.push(['evidence', reference]); return { ...evidence, revision: reference.endsWith(candidateDigest) ? sourceSha : previousRevision }; },
    copy(source, target) { calls.push(['copy', source, target]); alias = candidateDigest; },
    ...overrides,
  };
  return { adapter, calls };
}

test('equal complete bundles have deterministic fingerprints independent of directory', (t) => {
  const first = bundleFixture(t);
  const second = bundleFixture(t);
  assert.deepEqual(migrationFingerprint(first), migrationFingerprint(second));
  assert.equal(migrationFingerprint(first).fileCount, 4);
});

for (const file of ['migrations/0000_initial.sql', 'migrations/meta/_journal.json', 'migrations/meta/0000_snapshot.json', 'migrate.mjs']) {
  test(`changing bytes in ${file} changes the migration fingerprint`, (t) => {
    const directory = bundleFixture(t);
    const before = migrationFingerprint(directory).sha256;
    const filename = path.join(directory, file);
    writeFileSync(filename, `${readFileSync(filename, 'utf8')}\n`);
    assert.notEqual(migrationFingerprint(directory).sha256, before);
  });
}

test('new empty directories are included in the bundle fingerprint', (t) => {
  const directory = bundleFixture(t);
  const before = migrationFingerprint(directory).sha256;
  mkdirSync(path.join(directory, 'migrations', 'additional'));
  assert.notEqual(migrationFingerprint(directory).sha256, before);
});

for (const file of ['migrations/meta/_journal.json', 'migrations/0000_initial.sql', 'migrate.mjs']) {
  test(`missing ${file} fails closed`, (t) => {
    const directory = bundleFixture(t);
    rmSync(path.join(directory, file));
    assert.throws(() => migrationFingerprint(directory));
  });
}

test('invalid journals, extra SQL, empty runner and unknown extensions are rejected', (t) => {
  for (const mutation of [
    (directory) => writeFileSync(path.join(directory, 'migrations', 'meta', '_journal.json'), '{}'),
    (directory) => writeFileSync(path.join(directory, 'migrations', 'other.sql'), 'SELECT 1;'),
    (directory) => writeFileSync(path.join(directory, 'migrate.mjs'), ''),
    (directory) => writeFileSync(path.join(directory, 'migrations', 'unexpected.js'), 'process.exit(0)'),
    (directory) => writeFileSync(path.join(directory, 'migrations', 'meta', '0000_snapshot.json'), 'not json'),
    (directory) => { rmSync(path.join(directory, 'migrate.mjs')); mkdirSync(path.join(directory, 'migrate.mjs')); },
  ]) {
    const directory = bundleFixture(t);
    mutation(directory);
    assert.throws(() => migrationFingerprint(directory));
  }
});

test('malformed registry JSON is not echoed into build logs', () => {
  const adapter = dockerAdapter(() => '{"SENSITIVE_IMAGE_CONFIG":');
  assert.throws(() => adapter.resolve(`${image}:production`), (error) => error.message === 'Invalid JSON in registry index');
});

test('nested symbolic directory and root junction/symlink are rejected without traversing them', (t) => {
  const directory = bundleFixture(t);
  const outside = bundleFixture(t);
  symlinkSync(outside, path.join(directory, 'migrations', 'external'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => migrationFingerprint(directory), /Symlinks/);
  const root = mkdtempSync(path.join(tmpdir(), 'valkyria-channel-link-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  symlinkSync(path.join(outside, 'migrations'), path.join(root, 'migrations'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => migrationFingerprint(root), /Invalid migration directory/);
});

test('hardlinked migration files are rejected', (t) => {
  const directory = bundleFixture(t);
  linkSync(path.join(directory, 'migrate.mjs'), path.join(directory, 'migration-copy.mjs'));
  assert.throws(() => migrationFingerprint(directory), /non-linked/);
});

test('registry lookup requires a complete unambiguous linux/amd64 OCI index', () => {
  assert.deepEqual(validateIndex(index()), { digest: candidateDigest, runtimeDigest: otherDigest });
  for (const invalid of [null, {}, { ...index(), digest: 'latest' }, { ...index(), mediaType: 'application/vnd.oci.image.manifest.v1+json' }, { ...index(), manifests: [] }, { ...index(), manifests: [index().manifests[0], index().manifests[0]] }, { ...index(), manifests: [{ digest: 'invalid', platform: { os: 'linux', architecture: 'amd64' } }] }]) {
    assert.throws(() => validateIndex(invalid));
  }
});

test('runtime source/revision labels may change without changing the runtime contract', () => {
  const before = imageConfig();
  const after = imageConfig();
  after.Config.Labels['org.opencontainers.image.revision'] = previousRevision;
  assert.equal(runtimeContract(before), runtimeContract(after));
});

for (const [field, value] of [
  ['Entrypoint', ['other-entrypoint']], ['Cmd', ['node', 'other.js']], ['User', '10002:10002'],
  ['Env', ['NODE_ENV=production', 'PORT=3001']], ['WorkingDir', '/other'],
  ['ExposedPorts', { '3001/tcp': {} }], ['Healthcheck', { Test: ['CMD', 'node', 'health.mjs'] }],
  ['Volumes', { '/data': {} }], ['StopSignal', 'SIGQUIT'], ['Shell', ['/bin/bash']], ['OnBuild', ['RUN echo new']],
]) {
  test(`changed runtime ${field} requires operator review`, () => {
    const before = imageConfig();
    const after = imageConfig();
    after.Config[field] = value;
    assert.notEqual(runtimeContract(before), runtimeContract(after));
  });
}

test('runtime contract rejects root, unknown platform and invalid configuration', () => {
  for (const mutate of [
    (value) => { value.Config.User = 'root'; },
    (value) => { value.Config.User = '0:0'; },
    (value) => { value.Architecture = 'arm64'; },
    (value) => { value.Config.Env = undefined; },
    (value) => { value.Config.Healthcheck = undefined; },
  ]) {
    const value = imageConfig();
    mutate(value);
    assert.throws(() => runtimeContract(value));
  }
});

test('compatible promotion copies the exact index only to production and verifies it', () => {
  const { adapter, calls } = fakeAdapter();
  const result = promoteProduction(input, adapter);
  assert.equal(result.status, 'promoted');
  assert.deepEqual(calls.slice(-3), [
    ['resolve', `${image}:production`],
    ['copy', `${image}@${candidateDigest}`, `${image}:production`],
    ['resolve', `${image}:production`],
  ]);
  assert.match(promotionSummary(result), /readiness have not been verified/);
  assert(!calls.some((call) => call.some((value) => String(value).includes(':sha-'))));
});

for (const difference of ['bundle', 'runtime']) {
  test(`${difference} differences hold a published image without touching production`, () => {
    const base = fakeAdapter();
    const { adapter, calls } = fakeAdapter({
      evidence(reference) {
        const evidence = base.adapter.evidence(reference);
        if (reference.endsWith(candidateDigest)) {
          if (difference === 'bundle') evidence.bundle = { sha256: 'changed' };
          else evidence.runtime = 'changed';
        }
        return evidence;
      },
    });
    const result = promoteProduction(input, adapter);
    assert.equal(result.status, 'held');
    assert.deepEqual(result.reasons, [difference === 'bundle' ? 'migration-bundle-changed' : 'runtime-contract-changed']);
    assert(!calls.some(([operation]) => operation === 'copy'));
    assert.match(promotionSummary(result), /HELD/);
  });
}

test('missing/unavailable production aliases fail rather than bootstrap', () => {
  const { adapter, calls } = fakeAdapter({ resolve() { throw new Error('registry unavailable or alias absent'); } });
  assert.throws(() => promoteProduction(input, adapter), /registry unavailable/);
  assert.equal(calls.length, 0);
});

test('source mismatch fails before any registry operation', () => {
  const { adapter, calls } = fakeAdapter();
  assert.throws(() => promoteProduction({ ...input, expectedSha: previousRevision }, adapter), /accepted workflow revision/);
  assert.equal(calls.length, 0);
});

test('image source mismatch fails before alias mutation', () => {
  const { adapter, calls } = fakeAdapter({ evidence() { return { revision: previousRevision, runtime: 'runtime-a', bundle: { sha256: 'bundle-a' } }; } });
  assert.throws(() => promoteProduction(input, adapter), /image source revision mismatch/);
  assert(!calls.some(([operation]) => operation === 'copy'));
});

test('candidate registry digest mismatch fails before extraction or mutation', () => {
  const { adapter, calls } = fakeAdapter({ resolve() { return { digest: otherDigest }; } });
  assert.throws(() => promoteProduction(input, adapter), /Candidate registry digest mismatch/);
  assert.equal(calls.length, 0);
});

test('alias changes during qualification abort at the final pre-write check', () => {
  let checks = 0;
  const { adapter, calls } = fakeAdapter({ resolve(reference) { return { digest: reference.endsWith(':production') ? (++checks === 1 ? previousDigest : otherDigest) : candidateDigest }; } });
  assert.throws(() => promoteProduction(input, adapter), /changed during qualification/);
  assert(!calls.some(([operation]) => operation === 'copy'));
});

test('index copy failures are not reported as success or automatically rolled back', () => {
  let writes = 0;
  const { adapter } = fakeAdapter({ copy() { writes++; throw new Error('copy failed'); } });
  assert.throws(() => promoteProduction(input, adapter), /copy failed/);
  assert.equal(writes, 1);
});

test('a copied alias resolving to the wrong digest fails with operator inspection required', () => {
  let copied = false;
  const { adapter } = fakeAdapter({ resolve(reference) { return { digest: reference.endsWith(':production') ? (copied ? otherDigest : previousDigest) : candidateDigest }; }, copy() { copied = true; } });
  assert.throws(() => promoteProduction(input, adapter), /written but exact candidate digest could not be verified/);
});

test('identical candidate validates evidence but does not rewrite its tag', () => {
  const { adapter, calls } = fakeAdapter({ resolve() { return { digest: candidateDigest }; } });
  assert.equal(promoteProduction(input, adapter).status, 'unchanged');
  assert.equal(calls.filter(([operation]) => operation === 'evidence').length, 2);
  assert(!calls.some(([operation]) => operation === 'copy'));
});

test('Docker extraction does not start image code and removes container and temporary files', () => {
  const commands = [];
  let temporaryDirectory;
  const adapter = dockerAdapter((args) => {
    commands.push(args);
    if (args[0] === 'image') return JSON.stringify([imageConfig()]);
    if (args[0] === 'cp') {
      temporaryDirectory = path.dirname(args[2]);
      makeBundle(temporaryDirectory);
    }
    return '';
  });
  const result = adapter.evidence(`${image}@${candidateDigest}`);
  assert.equal(result.revision, sourceSha);
  assert(result.bundle.sha256);
  assert(!commands.some(([command]) => ['start', 'run', 'exec'].includes(command)));
  assert.deepEqual(commands.find(([command]) => command === 'create').slice(3, 9), ['--network', 'none', '--read-only', '--entrypoint', '/bin/true', `${image}@${candidateDigest}`]);
  assert.equal(commands.at(-1)[0], 'rm');
  assert(!existsSync(temporaryDirectory));
});

test('failed Docker copy still removes the stopped container and temporary directory', () => {
  const commands = [];
  let temporaryDirectory;
  const adapter = dockerAdapter((args) => {
    commands.push(args);
    if (args[0] === 'image') return JSON.stringify([imageConfig()]);
    if (args[0] === 'cp') { temporaryDirectory = path.dirname(args[2]); throw new Error('copy unavailable'); }
    return '';
  });
  assert.throws(() => adapter.evidence(`${image}@${candidateDigest}`), /copy unavailable/);
  assert.equal(commands.at(-1)[0], 'rm');
  assert(!existsSync(temporaryDirectory));
});

test('pulled digest mismatch never creates a container', () => {
  const commands = [];
  const adapter = dockerAdapter((args) => {
    commands.push(args);
    if (args[0] === 'image') return JSON.stringify([{ ...imageConfig(), RepoDigests: [`${image}@${otherDigest}`] }]);
    return '';
  });
  assert.throws(() => adapter.evidence(`${image}@${candidateDigest}`), /pinned digest/);
  assert(!commands.some(([command]) => command === 'create'));
});

test('Docker registry copy uses a single digest source without filtering its OCI index', () => {
  const commands = [];
  dockerAdapter((args) => { commands.push(args); return ''; }).copy(`${image}@${candidateDigest}`, `${image}:production`);
  assert.deepEqual(commands, [['buildx', 'imagetools', 'create', '--tag', `${image}:production`, `${image}@${candidateDigest}`]]);
});
