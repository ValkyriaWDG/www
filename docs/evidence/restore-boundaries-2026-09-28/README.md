# Restore rehearsal ownership and connection boundaries — 2026-09-28

Issue: [#45](https://github.com/ValkyriaWDG/www/issues/45).
Local safety qualification of the capture rehearsal, with synthetic PostgreSQL and
editorial media only. This is not a production recovery or off-host/restic acceptance.

## Verified behavior

| Criterion | Observed proof |
| --- | --- |
| Refuse unsafe paths before SQL or subprocesses | Builtin tests preserve sentinels for existing/overlapping work paths, linked roots/parents/nested media, hard links and directory-creation collisions. |
| Connection identity cannot be replaced by URL/environment overrides | URL scheme/name/port/identity/query tests, encoded aliases, password-file refusal and actual CLI ambient-PG refusal. Only matching explicit connection fields and one allowed TLS mode pass. |
| Never drop a pre-existing or competing target | Real existing database and injected real CREATE race both preserve sentinel rows; no capture starts after the race. A real NOCREATEDB role creates no target. |
| Restore bytes and database content into a fresh target | Actual `pg_dump`/`pg_restore --dbname`/`tar`, zero pending migrations and 25 matching tables in empty and populated cases. The populated case has 6 live assets and 12 byte-identical variants, with 5 public responses and 1 explicitly private 404. |
| Preserve ownership and sanitize failures | Failed dump, migration drift, table/media mismatch, HTTP/start failures and interruption retain only owned partial outputs with code-only reports. Actual child timeout/output/abort/spawn tests and hard termination are exercised. |
| Empty content does not invent image proof | Actual empty database/media succeeds with `mediaDelivery: not-applicable-empty`. An empty media directory containing an orphan subdirectory is rejected. |

[source.json](source.json) records the base revision, exact final source fingerprints,
commands, versions and artifact hashes. [integration.json](integration.json) contains
the actual sanitized per-case operator reports and test-owned database cleanup counts.
[boundary-tests.txt](boundary-tests.txt) and [integration-tests.txt](integration-tests.txt)
contain completed test output. [tooling-tests.txt](tooling-tests.txt) covers the full
builtin tooling suite. The application build and full application lint also passed.

The workflow now makes the real suite a required Application step after `pnpm build`,
using the existing PostgreSQL 17 service and explicitly checked native major-17 clients.
It reuses installed clients/package sources before using the distribution-provided
[official PGDG helper](https://www.postgresql.org/download/linux/ubuntu/), and installs
the client package only. The [runner inventory](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)
observed during review supplied major 16, so relying on the runner's default client
would not prove a supported server-17 dump. Existing image-rehearsal clients live inside
separate containers and are not host executables for this standalone test.

The exact sanitized JSON is always uploaded as
`restore-boundaries-<tested-sha>-<run-id>-<attempt>`, with a unique filename and 90-day
retention. This wiring has local YAML/Bash validation and independent review; the
artifact must still be accepted from the actual exact-head Linux CI run. Local Windows
results above are unchanged and do not substitute for that required Linux result.

## Preserved initial failure

The first real integration run passed the populated-media case and the three refusal
cases but failed the empty case with `operation_failed`. Its report already recorded
successful capture, no-op migrations, 25 matching tables and empty-media hashes; its
app process was stopped. The old report did not record the failing HTTP phase/cause.
No raw application output was retained, so the exact cause is **not established**.

[first-integration-failure.txt](first-integration-failure.txt) preserves the original
failing test output with local checkout paths sanitized.
[first-failure-observation.json](first-failure-observation.json) is a recovery of the
empty-case JSON previously observed in tool output, not the original byte stream or
its hash. The first report file was overwritten during the second run, and no original
source fingerprint was captured. We do not infer one from later source.

The script subsequently gained sanitized HTTP phase/error diagnostics and stricter
connection validation; its five-second HTTP bound was unchanged. Later real passes
do not diagnose or repair the first failure, and do not establish reliable repeated
cold startup. The integration harness now refuses an existing report path before
creating test resources and writes a fresh report exclusively, preserving future
failed evidence instead of overwriting it.

## Scope and limits

- Windows local PostgreSQL 18.4, matching official EDB client binaries, Node standalone
  app, synthetic database/media, no provider credentials, production writes or Discord.
- No schema/application change, encrypted recovery mode, off-host verification,
  visual/static-asset qualification, container recovery or Linux execution is claimed.
  Required exact-head CI remains the integrator's acceptance gate.
- The operator must freeze all source writers and protect source/build/parent paths.
  Fingerprints and path checks are not atomic against hostile concurrent replacement.
- Failure deliberately retains partial plaintext and a created/uncertain target.
  No automatic data cleanup, encryption or recovery guarantee is implied.
- Screenshots: **N/A** — changed behavior is filesystem/SQL/process/CLI ownership;
  sentinel, hash, HTTP and child-process evidence directly tests that boundary.
