# Release hardening checks

Issue [#26](https://github.com/ValkyriaWDG/www/issues/26) adds required candidate
checks to the existing Application CI job. A passing Foundation job alone is
insufficient. These checks build and inspect images without publishing or deploying
them. The [deployment contract](deployment.md) still governs an authorized promotion.

## Cold mobile page budgets

After a frozen install and `pnpm build`, run:

```bash
# A dedicated loopback PostgreSQL database, never a production connection.
export DATABASE_URL=postgresql://test:synthetic-only@127.0.0.1:5432/valkyria_budget_test
pnpm --filter @valkyria/web exec playwright install chromium
node scripts/release/measure-pages.mjs
```

The role must be able to create databases. The runner derives and **resets** the
corresponding `valkyria_budget_e2e` database, installs migrations and synthetic fixtures,
then starts the standalone application on loopback port 3134. `BUDGET_PORT` overrides
that port; the fixture Discord mock uses the following port plus 1000. The runner stops
only its own process tree. On Windows, set the same variables with `$env:NAME='value'`;
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` may point to an installed Chromium/Edge executable.

The [policy](../../scripts/release/page-budgets.json) measures `/cs`, `/cs/news` and a
published synthetic article with a cover, inline image and table. Each route gets three
new mobile browser contexts at 390 × 844, no cache or service worker, 4× CPU slowdown,
150 ms latency, 1.6 Mbps download and 750 Kbps upload. Chromium's CDP network and CPU
emulation apply during navigation. Observers run for at least 10 seconds, including at
least two seconds after load.

| Metric | Required limit |
|---|---:|
| Compressed JavaScript transfer | 350 KiB per run |
| Compressed CSS transfer | 60 KiB per run |
| Font transfer | 180 KiB per run |
| Total encoded transfer | 1 MiB per run |
| LCP | Median of three runs ≤ 2500 ms |
| CLS | Every run ≤ 0.1 |

Network measurements use actual encoded response bytes, including response overhead
and any prefetch within the window. Missing samples/measurements, wrong status,
unfinished or failed requests, page errors, unexpected external dependencies, cached
responses or background-video requests fail the check. CLS uses the maximum session
window with less than one second between shifts and less than five seconds total,
excluding recent user input. These are repeatable lab budgets, not field Core Web
Vitals, a percentile claim or an INP measurement.

This profile explicitly tests the reduced-motion CSS fallback. Optional externally
delivered background poster/video bytes are absent from this fixture and are **not**
included in these numbers. Real media playback and production transfer still need the
[background integration gate](../handoff/background-media-integration.md). Keep media
outside the image and never satisfy a byte budget by silently shortening the video.

The homepage's decorative emblem is requested eagerly with high priority because it
is the measured mobile LCP element. It adds about 61 KiB to first-load subpages where
CSS hides it; those bytes are included in the budgets. A route-aware alternative can
be evaluated later against the same measurements rather than assuming it is faster.

CI uploads `page-budgets-<workflow SHA>` with raw samples and three synthetic full-page
captures. Local outputs stay in `.local/release-hardening/pages`. Review all raw runs;
the median gate does not assert that every individual LCP met 2.5 seconds.
Each sample includes layout-shift element identifiers and before/after rectangles.
The separate `news-font-stability.spec.ts` browser regression delays actual font loads
and substitutes a generic fallback to exercise mobile filter wrapping on hosts without
a condensed system font. It does not replace the unmodified-page performance gate.

## Compare runtime images and advisories

The build stage remains the pinned Node 24 bookworm image. The runtime candidate is
the pinned Node 24 trixie-slim image from
[the official Node image project](https://github.com/nodejs/docker-node). Both variants
remove npm, npx, Corepack and Yarn, retain the standalone application/native sharp,
run as UID/GID 10001 and allow writes only to editorial media, Next cache and tmpfs.
Trixie uses Debian 13/glibc; this is an evaluated candidate, not an assertion that the
image is smaller or has no advisories.

The immutable image inputs and previous accepted image are recorded in
[runtime-policy.json](../../scripts/release/runtime-policy.json). Build two images from
one exact source revision:

```bash
REVISION=$(git rev-parse HEAD)
BASELINE_RUNTIME=$(node -p "JSON.parse(require('fs').readFileSync('scripts/release/runtime-policy.json')).baselineRuntime")
docker build -f apps/web/Dockerfile --build-arg SOURCE_REVISION="$REVISION" -t valkyria-web:ci .
docker build -f apps/web/Dockerfile --build-arg SOURCE_REVISION="$REVISION" --build-arg RUNTIME_IMAGE="$BASELINE_RUNTIME" -t valkyria-web:bookworm .
node scripts/release/rehearse-images.mjs
```

The [CI scan step](../../.github/workflows/ci.yml) scans both actual images with the same
pinned Trivy version and database cache, retains OS/package inventory and all
HIGH/CRITICAL advisories, then runs
[runtime-scan.mjs](../../scripts/release/runtime-scan.mjs). Missing inventory fails.
Any candidate HIGH/CRITICAL finding with a fixed version fails. Unfixed findings remain
visible in the comparison and require review; they are not removed with `--ignore-unfixed`.
CI uploads both full reports, a comparison, image sizes/IDs from the rehearsal and a
candidate CycloneDX SBOM. Compare native behavior and actual scan/size results before
accepting the runtime change. A scanner's unavailable database is a failed check.

## Disposable image rollback and database restore

The rehearsal accepts only local `valkyria-web:*` build tags and a local Docker endpoint.
It creates uniquely named containers, an internal network, PostgreSQL 17 on tmpfs with
no published database port, and two disposable volumes. It never accepts an operator's
database URL or mounts persistent host data. Application ports bind to loopback only.
It removes its own resources in `finally`; cleanup failure fails the check.

The runner:

1. Pulls the recorded immutable previous image and checks its OCI revision. It checks
   both candidate variants identify the exact workflow source revision.
2. Applies the **previous** image's migrations and seed to the disposable database,
   loads clearly synthetic content with the dev-only fixture CLI and serves it through
   the previous image. The dev fixture CLI is bind-mounted for the test, not shipped.
3. Makes a logical database backup and records every table's count/content fingerprint
   plus the delivered published media hash.
4. Applies candidate migrations explicitly, verifies a repeated run applies zero,
   and adds a separate nullable-column compatibility probe. That probe is test-only and
   is not a production migration. The report records the actual number of production
   migrations applied; integrating another feature may make this count nonzero.
5. Starts both runtime variants with read-only roots, dropped capabilities and no new
   privileges. It checks Node 24, UID 10001, denied root writes, writable media/cache,
absent package managers, real sharp WebP encoding, configured health command,
   public routes and byte-identical published media. Candidate DB disconnection must
   produce readiness 503 while liveness stays 200, then recover after reconnection.
   When the candidate source includes the social image route, both candidate variants
   must also serve and fully decode the Czech and English site PNGs at 1200 × 630,
   proving traced font/image availability inside each container. Source absence is an
   explicit `not-applicable` result; the immutable older image is not required to have
   the newer route.
6. Starts the previous image against the candidate-migrated database and verifies the
   public routes/media and unchanged post-migration table fingerprints.
7. Restores the pre-upgrade dump to a separate fresh database, verifies all table
   fingerprints and serves it with the previous image. This case retains the unchanged
   synthetic media volume; it does not rehearse a media-format migration or archive
   restoration. Use [backup/restore](backup-restore.md) for that independent requirement.

CI uploads `release-rehearsal-<workflow SHA>`. A current passing rehearsal qualifies only
that image/schema pair. Re-run it for each release, update the previous accepted digest
deliberately, and use expand/migrate/contract for real schema changes. An old image
failing compatibility blocks image-only rollback. A reviewed restore or roll-forward
plan must account for writes since the backup; never blindly restore over live data.
Failed steps retain up to 4096 characters of sanitized stderr or assertion detail in
the report and CI log. Command arguments are not logged; generated passwords, known
fixture secrets and database connection URLs are redacted before truncation.

The [initial local evidence](../evidence/release-hardening-2026-09-26/README.md) identifies
which checks actually ran and which still require Linux CI.
