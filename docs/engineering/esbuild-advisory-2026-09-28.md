# Transitive esbuild advisory remediation

Reviewed 2026-09-28 against source `b37931393cd9b836415724d9572765f8615c31e8`
plus the scoped package/lockfile change. This is local source qualification; the
consolidated maintenance revision still requires its own complete CI and merge.

## Advisory and dependency path

[GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99)
affects esbuild through 0.24.2. Its development server allowed cross-origin reads;
0.25.0 changes that behavior. The [upstream fix](https://github.com/evanw/esbuild/commit/de85afd65edec9ebc44a11e245fd9e9a2e99760d)
also changes the serve API, so blindly overriding every esbuild consumer is unnecessary.

The affected installed chain was:

```text
drizzle-kit 0.31.11
  -> @esbuild-kit/esm-loader 2.6.5
    -> @esbuild-kit/core-utils 3.3.2
      -> esbuild 0.18.20
```

It is reachable through the database development tools and better-auth's optional
drizzle-kit peer. GitHub consequently classifies the lockfile dependency as runtime;
do not dismiss it as universally development-only. First-party code uses esbuild's
build API for operational CLI bundling; the legacy loader uses transform/transformSync.
No first-party esbuild serve invocation was found. This review establishes no live
development-server exposure or production exploitation, and no live service was probed.

Registry metadata still lists drizzle-kit 0.31.11, core-utils 3.3.2 and esm-loader
2.6.5 as their stable releases. The latter two are deprecated and retain the old edge.
The root pnpm override targets only `@esbuild-kit/core-utils@3.3.2>esbuild`, selecting
**0.25.12**, already present through drizzle-kit's direct dependency. The application's
direct esbuild 0.28.2 stays unchanged. The generated lockfile removes 0.18.20 and its
optional platform binaries, with no unrelated package upgrades.

Remove this override when an approved upstream release removes or repairs the
legacy edge, then repeat loader/schema/build checks. Do not replace it with a broad
unbounded override or silence the advisory.

## Verification

Environment: Windows, Node 24.21.0, pnpm 10.34.5. No database URL, application server,
production connection or tracked migration output was used.

| Check | Actual result |
|---|---|
| Baseline and patched frozen installs | Passed. Existing build-script allowlist retained. |
| Actual dependency resolution | Legacy loader resolved esbuild 0.18.20 before and 0.25.12 after. `pnpm why esbuild -r` now lists only 0.25.12 and 0.28.2. |
| Legacy core transformSync and async transform | Passed before and after; evaluated TypeScript enum/export fixture returns 42 in both formats. |
| Actual legacy ESM loader | A separate Node process using its resolved `--loader` path executes the TypeScript enum fixture and prints 42 before and after. |
| Drizzle schema generation | Passed twice into separate ignored directories; 24 tables produce byte-identical 31,340-byte SQL. No tracked schema or migration changed. |
| Dependency audit | `pnpm audit --json` returned an empty advisory set and zero findings in every severity category. This is a point-in-time registry result. |
| Lint / typecheck | `pnpm lint` and `pnpm typecheck` passed. |
| Production build | `pnpm build` passed: Next.js production build and operational CLI bundles. Complete CI on the consolidated revision remains required. |

Generated SQL SHA-256 in both cases:
`5347af4a36366b393215cdf4a7a4b395f3d32351caad8fecefeb6672ac670bb3`.
The existing SQL migration chain was not regenerated or applied. This comparison
tests generator compatibility rather than qualifying an actual schema change.

## Reproduction

Run `pnpm install --frozen-lockfile`, `pnpm why esbuild -r` and `pnpm audit --json`.
For a before/after comparison, run the following probe on the baseline and patched
checkouts, saving each result separately. Store scratch files under ignored `.local/`.

Save this as `.local/esbuild-loader-probe.mjs` and run it from the repository root:

```js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = process.cwd();
const dbRequire = createRequire(path.join(root, 'packages/db/package.json'));
const kitRequire = createRequire(dbRequire.resolve('drizzle-kit'));
const loader = kitRequire.resolve('@esbuild-kit/esm-loader');
const core = createRequire(loader).resolve('@esbuild-kit/core-utils');
const coreRequire = createRequire(core);
const { transform, transformSync } = coreRequire(core);
const input = 'export enum Kind { Ready = 41 } export const answer: number = Kind.Ready + 1;';
mkdirSync('.local', { recursive: true });
const fixture = path.join(root, '.local/esbuild-fixture.ts');
writeFileSync(fixture, input + '\nconsole.log(answer);\n');
const sandbox = { exports: {}, module: { exports: {} } };
vm.runInNewContext(transformSync(input, fixture).code, sandbox);
assert.equal(sandbox.module.exports.answer, 42);
const esm = await transform(input, fixture);
assert.equal((await import('data:text/javascript;base64,' + Buffer.from(esm.code).toString('base64'))).answer, 42);
assert.equal(execFileSync(process.execPath, ['--no-warnings', '--loader', pathToFileURL(loader).href, fixture], { encoding: 'utf8' }).trim(), '42');
console.log({ esbuild: coreRequire('esbuild').version, loaderAndTransforms: 'passed' });
```

For schema comparison, create a temporary Drizzle config with dialect `postgresql`,
schema `./src/schema/index.ts` and an **absolute ignored output directory** unique to
each attempt. Run from the database package through:

```text
pnpm --filter @valkyria/db exec drizzle-kit generate --config ../../.local/<temporary-config>.ts --name compatibility
```

Compare both `0000_compatibility.sql` files byte for byte. Never use the tracked
`drizzle` output directory for this probe. Finish with `pnpm lint`, `pnpm typecheck`
and `pnpm build`. UI screenshots are N/A: this change affects dependency resolution,
and the functional loader/generator/build results are its proof.
