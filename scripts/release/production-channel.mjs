import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const digestPattern = /^sha256:[a-f0-9]{64}$/;
const revisionPattern = /^[a-f0-9]{40}$/;
const indexType = 'application/vnd.oci.image.index.v1+json';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) => JSON.stringify(sortObject(value));

function parseJson(bytes, label) {
  try { return JSON.parse(bytes); } catch { throw new Error(`Invalid JSON in ${label}`); }
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
  return value;
}

// Validate registry data rather than treating unavailable/malformed aliases as bootstrap.
export function validateIndex(value) {
  assert(value && value.schemaVersion === 2 && value.mediaType === indexType, 'Expected a complete OCI image index');
  assert(digestPattern.test(value.digest), 'Invalid registry index digest');
  assert(Array.isArray(value.manifests) && value.manifests.length > 0, 'Missing index manifests');
  assert(value.manifests.every((item) => digestPattern.test(item.digest)), 'Invalid child manifest digest');
  const runtime = value.manifests.filter((item) => item.platform?.os === 'linux' && item.platform?.architecture === 'amd64');
  assert(runtime.length === 1, 'Expected exactly one linux/amd64 runtime');
  return { digest: value.digest, runtimeDigest: runtime[0].digest };
}

// Hash every migration file, including journal and snapshots; reject symlinks,
// devices and hardlinks. Nothing from the image is executed during comparison.
export function migrationFingerprint(directory) {
  const migrations = path.join(directory, 'migrations');
  assert(lstatSync(migrations).isDirectory() && !lstatSync(migrations).isSymbolicLink(), 'Invalid migration directory');
  const entries = [];
  let totalBytes = 0;
  function visit(filename, relative) {
    assert(entries.length < 2000, 'Migration bundle exceeds file limit');
    const stat = lstatSync(filename);
    assert(!stat.isSymbolicLink(), 'Symlinks are not allowed in the migration bundle');
    if (stat.isDirectory()) {
      entries.push([relative, 'directory']);
      for (const name of readdirSync(filename).sort()) visit(path.join(filename, name), `${relative}/${name}`);
      return;
    }
    assert(stat.isFile() && stat.nlink === 1, 'Only regular non-linked migration files are supported');
    assert(relative === 'migrate.mjs' || /\.(sql|json)$/.test(relative), 'Unknown migration bundle file type');
    totalBytes += stat.size;
    assert(totalBytes <= 64 * 1024 * 1024, 'Migration bundle exceeds byte limit');
    const bytes = readFileSync(filename);
    if (relative.endsWith('.json')) parseJson(bytes, 'migration metadata');
    entries.push([relative, 'file', stat.size, hash(bytes)]);
  }
  visit(migrations, 'migrations');
  const runner = path.join(directory, 'migrate.mjs');
  assert(lstatSync(runner).isFile() && !lstatSync(runner).isSymbolicLink(), 'Invalid migration runner');
  visit(runner, 'migrate.mjs');
  assert(lstatSync(runner).size > 0, 'Empty migration runner');
  const journal = parseJson(readFileSync(path.join(migrations, 'meta', '_journal.json'), 'utf8'), 'migration journal');
  assert(journal.dialect === 'postgresql' && Array.isArray(journal.entries) && journal.entries.length > 0, 'Invalid PostgreSQL migration journal');
  const tags = journal.entries.map((entry, index) => {
    assert(entry.idx === index && /^[a-zA-Z0-9_-]+$/.test(entry.tag), 'Invalid migration journal entry');
    assert(entries.some(([name, type, size]) => name === `migrations/${entry.tag}.sql` && type === 'file' && size > 0), 'Journal references a missing or empty SQL file');
    return entry.tag;
  });
  assert(new Set(tags).size === tags.length, 'Duplicate migration journal entries');
  assert(entries.filter(([name, type]) => type === 'file' && name.endsWith('.sql')).length === tags.length, 'SQL files must exactly match the journal');
  return { sha256: hash(canonical(entries)), fileCount: entries.filter(([, type]) => type === 'file').length, migrations: tags };
}

export function runtimeContract(image) {
  assert(image?.Os === 'linux' && image.Architecture === 'amd64', 'Unexpected runtime platform');
  const config = image.Config;
  assert(config && typeof config.User === 'string' && config.User.length > 0 && typeof config.WorkingDir === 'string', 'Missing runtime configuration');
  assert(config.User !== 'root' && !/^0(?::|$)/.test(config.User), 'Root runtime is not eligible for automatic promotion');
  for (const key of ['Entrypoint', 'Cmd', 'Env']) {
    assert(config[key] === null || (Array.isArray(config[key]) && config[key].every((value) => typeof value === 'string')), `Invalid runtime ${key}`);
  }
  assert(config.Healthcheck && Array.isArray(config.Healthcheck.Test) && config.Healthcheck.Test.length > 0, 'Missing runtime healthcheck');
  return hash(canonical(Object.fromEntries([
    'Entrypoint', 'Cmd', 'User', 'Env', 'WorkingDir', 'ExposedPorts', 'Healthcheck',
    'Volumes', 'StopSignal', 'Shell', 'OnBuild',
  ].map((key) => [key, config[key] ?? null]))));
}

export function dockerAdapter(run = (args) => {
  try {
    return execFileSync('docker', args, { encoding: 'utf8', timeout: 300_000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    // Do not emit arbitrary image/config/registry output in public build logs.
    throw new Error(`Docker ${args[0]} ${args[1] ?? ''} failed (exit ${error.status ?? 'unavailable'})`);
  }
}) {
  return {
    resolve(reference) {
      return validateIndex(parseJson(run(['buildx', 'imagetools', 'inspect', reference, '--format', '{{json .Manifest}}']), 'registry index'));
    },
    evidence(reference) {
      run(['pull', '--platform', 'linux/amd64', reference]);
      const images = parseJson(run(['image', 'inspect', reference]), 'image inspection');
      assert(Array.isArray(images) && images.length === 1, 'Ambiguous pulled image');
      const image = images[0];
      assert(image.RepoDigests?.some((item) => item.endsWith(reference.slice(reference.lastIndexOf('@')))), 'Pulled image does not match the pinned digest');
      const revision = image.Config?.Labels?.['org.opencontainers.image.revision'];
      assert(revisionPattern.test(revision), 'Missing image source revision');
      const runtime = runtimeContract(image);
      const directory = mkdtempSync(path.join(tmpdir(), 'valkyria-promotion-'));
      const name = `valkyria-promotion-${randomUUID()}`;
      let created = false;
      try {
        run(['create', '--name', name, '--network', 'none', '--read-only', '--entrypoint', '/bin/true', reference]);
        created = true;
        run(['cp', `${name}:/app/migrations`, path.join(directory, 'migrations')]);
        run(['cp', `${name}:/app/scripts/migrate.mjs`, path.join(directory, 'migrate.mjs')]);
        return { revision, runtime, bundle: migrationFingerprint(directory) };
      } finally {
        try {
          if (created) run(['rm', '-v', name]);
        } finally {
          assert(path.dirname(directory) === path.resolve(tmpdir()) && path.basename(directory).startsWith('valkyria-promotion-'), 'Refusing cleanup outside the owned temporary directory');
          rmSync(directory, { recursive: true, force: true });
        }
      }
    },
    copy(source, target) {
      // A single full OCI index is copied without annotations/platform filtering;
      // this preserves its manifest bytes, SBOM and provenance references.
      run(['buildx', 'imagetools', 'create', '--tag', target, source]);
    },
  };
}

export function promoteProduction({ image, candidateDigest, sourceSha, expectedSha }, adapter) {
  assert(/^(?:docker\.io\/)?[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(image), 'Invalid DockerHub image repository');
  assert(digestPattern.test(candidateDigest), 'Invalid candidate digest');
  assert(revisionPattern.test(sourceSha) && sourceSha === expectedSha, 'Candidate is not the accepted workflow revision');
  const production = `${image}:production`;
  const candidate = `${image}@${candidateDigest}`;
  const before = adapter.resolve(production);
  const candidateIndex = adapter.resolve(candidate);
  assert(candidateIndex.digest === candidateDigest, 'Candidate registry digest mismatch');
  const previous = adapter.evidence(`${image}@${before.digest}`);
  const next = adapter.evidence(candidate);
  assert(next.revision === sourceSha, 'Candidate image source revision mismatch');
  const result = {
    image, candidateDigest, sourceSha, previousDigest: before.digest,
    previousRevision: previous.revision,
    previousMigrationFingerprint: previous.bundle.sha256,
    candidateMigrationFingerprint: next.bundle.sha256,
    previousRuntimeFingerprint: previous.runtime,
    candidateRuntimeFingerprint: next.runtime,
  };
  const reasons = [];
  if (previous.bundle.sha256 !== next.bundle.sha256) reasons.push('migration-bundle-changed');
  if (previous.runtime !== next.runtime) reasons.push('runtime-contract-changed');
  if (reasons.length > 0) return { ...result, status: 'held', reasons };
  // Registry tags have no compare-and-swap. Workflow concurrency serializes CI;
  // operators must not manually promote this tag concurrently. Recheck as the
  // last registry operation before copying to catch earlier external changes.
  assert(adapter.resolve(production).digest === before.digest, 'Production alias changed during qualification; no promotion performed');
  if (before.digest === candidateDigest) return { ...result, status: 'unchanged', reasons: [] };
  adapter.copy(candidate, production);
  assert(adapter.resolve(production).digest === candidateDigest, 'Production alias was written but exact candidate digest could not be verified; operator inspection required');
  return { ...result, status: 'promoted', reasons: [] };
}

export function promotionSummary(result) {
  const detail = result.status === 'held'
    ? `Automatic production promotion HELD: ${result.reasons.join(', ')}. The immutable candidate remains published. Operator migration/configuration review and explicit promotion are required.`
    : result.status === 'promoted'
      ? 'Production alias promoted and registry digest verified. Watchtower replacement and application readiness have not been verified by this workflow.'
      : 'Production alias already points to this candidate; no registry mutation performed.';
  return `${detail}\n\nImage: \`${result.image}@${result.candidateDigest}\`\n\nSource: \`${result.sourceSha}\`\n\nPrevious production digest: \`${result.previousDigest}\`\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = promoteProduction({ image: process.env.IMAGE_NAME, candidateDigest: process.env.IMAGE_DIGEST, sourceSha: process.env.SOURCE_SHA, expectedSha: process.env.EXPECTED_SHA }, dockerAdapter());
    console.log(JSON.stringify(result));
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${promotionSummary(result)}\n`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `status=${result.status}\n`);
  } catch (error) {
    const message = `Production promotion failed closed: ${error.message}`;
    console.error(message);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${message}\n\nThe immutable image may already be published. A failure after copying requires registry inspection; no automatic rollback was attempted.\n`);
    process.exitCode = 1;
  }
}
