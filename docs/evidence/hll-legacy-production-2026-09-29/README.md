# HLL legacy production acceptance — pending

**29 September 2026: the importer packaging correction is merged and its combined
pull-request CI passed. Production acceptance is not complete.** No production
schema migration or legacy import was performed at this checkpoint. The last
confirmed production source is `571475f`; the old web was ready after the held backup
capture. The first candidate's failed attempt remains preserved in the
[sanitized rehearsal report](rehearsal-338ee2f-failed.json); the corrected code's
[CI qualification](packaging-ci.json) is a separate result.

The first published candidate uses merged application source
[`338ee2ff39ac484b4fef6d9f9da8bc1238d68b5a`](https://github.com/ValkyriaWDG/www/commit/338ee2ff39ac484b4fef6d9f9da8bc1238d68b5a),
from [PR #67](https://github.com/ValkyriaWDG/www/pull/67). Exact-source verification and
[publisher run 36571865529](https://github.com/ValkyriaWDG/www/actions/runs/36571865529)
completed successfully after normal protected-environment approval. The published
image is `majorluk/valkyria-www@sha256:8f048f6c9d2f0038d0a48ae66940ddb5bcb300d899615d56f0fbe4b1269cb18a`.
Automatic channel promotion was held with `migration-bundle-changed`, as intended.
**Publication is not production acceptance:** this image must not be promoted as the
accepted migration candidate. The packaging correction has since merged in
[PR #68](https://github.com/ValkyriaWDG/www/pull/68). Its new image and complete
production-backup restore/import rehearsal remain pending at this checkpoint.

This record continues the evidence introduced in merged PR #68.
Do not replace the earlier records or use this failed attempt to close an acceptance item.
The [report contract](REPORT-SCHEMA.md) defines what the later sanitized artifacts
must contain; its field descriptions are not measured results.

## Separate evidence boundaries

| Boundary | Established record | Limit |
|---|---|---|
| Previous production baseline | [Source `571475f3f60fb38c7cf14cd6afb4702982ba4681`](../channel-deployment-2026-09-29/README.md), observed 29 September at 12:20 UTC; image digest `sha256:da884edad5dd00cbf1ed0fd9fcb733cb894de594739b99be5eee5049bcea015b` | Historical baseline, not a fresh observation of the current container; no legacy import or schema migration occurred in that replacement. |
| Local feature implementation | [Synthetic browser evidence](../hll-legacy-crcon-2026-09-29/README.md), with its own source revisions and test history | Does not prove real provider behavior or production recovery. |
| Prepared migration input | [Reviewed source inventory](../../operations/legacy-hll-extraction.md) and [operator runbook](../../operations/legacy-hll-import.md) | Local extraction and PostgreSQL 18 rehearsal do not establish a restore/import on the production PostgreSQL major version. |
| First published migration candidate | Source, digest and successful workflow above | Isolated rehearsal failed; no production migration or accepted channel promotion. |
| Merged packaging correction | Combined [CI run 36577994736](https://github.com/ValkyriaWDG/www/actions/runs/36577994736) and [sanitized results](packaging-ci.json) | Synthetic CI qualification, distinct from exact-main publication and the production PostgreSQL 15 backup rehearsal. |

The baseline database has five journal entries; the candidate's expected journal
has nine, including migrations `0005`–`0008`. Capture the actual journals during
rehearsal and maintenance. A schema difference must not be treated as an ordinary
automatic image replacement.

## Failed rehearsal: missing importer runtime dependency

The exact failed window is **13:21:58.387463–13:23:39.238322 UTC** on 29 September
2026, from the protected rehearsal report. Local PowerShell time displays may show
Europe/Prague at UTC+2; they do not change these recorded instants.

| Step | Actual observed result |
|---|---|
| Held source capture | Captured at 13:21:04 UTC: 29 tables, 0 editorial media files; automation held and previous web ready afterward. |
| Production-major restore | PostgreSQL 15.17, internal network, no published ports, restricted application role. Candidate and rollback database/media copies both matched the captured baseline. |
| Candidate migrations | Four applied, journal increased from 5 to 9; repeat applied zero and preserved database/media fingerprints. |
| Seed | Completed; seeded snapshot recorded. |
| Import inventory/dry run | Failed with `ERR_MODULE_NOT_FOUND`: `sharp` could not be resolved from `/app/scripts/import-legacy-hll.mjs`. The protected summary records `subprocess_failed`; the package diagnosis comes from the operator's inspected process error. |
| Subsequent checks | Import apply/rerun, candidate HTTP and rollback HTTP were not reached. |
| Cleanup | All 7 owned rehearsal containers stopped; preserved rehearsal resources were not deleted. Source and production data were unchanged. |

The five referenced snapshots were checked against their recorded canonical JSON
fingerprints; original file-byte hashes are recorded separately in the public
summary. This failure exposed a production-image packaging gap
that the previous image checker did not cover. It is a failed candidate rehearsal,
not a failed production import and not successful restore/import acceptance.
Raw database/media snapshots, service/resource names and process logs remain private.

### Packaging correction qualification

The linker now exposes the same validated, pinned, already-traced Sharp package at
both standalone resolution roots. A real ESM subprocess test reproduced the original
failure before the correction and passes afterward. Local checks passed: 169 tooling
tests (including all 3 linker cases), 5 importer contract/native image cases, scoped
ESLint, canonical application typecheck and all six production CLI bundles. Repository
foundation validation passed across 1,434 files. Independent review found no blocker.

The image rehearsal now runs both actual importer bundles using the candidate image
ID, with a disposable database and synthetic PNG/article input. It checks dry-run
database equality, one media asset and one unpublished news draft created by apply,
both WebP variants decoded to raw pixels, and unchanged replay. The test passed in
the completed combined CI run; no runtime dependency installation or host
`node_modules` mount is used. Local Docker execution was unavailable. Screenshots
are not applicable to this packaging correction; feature screenshots remain linked
above.

[Combined CI run 36577994736](https://github.com/ValkyriaWDG/www/actions/runs/36577994736)
tested PR head `857ba9301fe102ea5f5d47d3b34ceafea09d2d3b` through GitHub's temporary
merge revision `9488b81240806b5d77447a329c53eca2c22a5c83`, including base
`d61c38fcd217c36f6a06ca6d273bb4de371afc71`. The quality gate completed at
**14:04:12.4597478 UTC** on 29 September 2026. The [sanitized CI report](packaging-ci.json)
records the protected log hash and exact source-line references.

| Completed combined CI gate | Actual result |
|---|---|
| Foundation | 1,447 files checked. |
| Tooling / encrypted recovery | 169 / 13 tests passed; none skipped or failed. |
| Unit / database integration | 603 tests across 62 files / 331 tests across 34 files passed; none skipped or failed. |
| Real restore boundary | 6 tests passed using disposable CI data. |
| Standard browser suite | 167 passed, 107 skipped, 0 failed; 274 total. |
| Dedicated shipped HLL artwork | 4 passed, 0 skipped or failed. These four were skipped in the standard run and then exercised separately. |
| Immutable image rehearsal | 13 steps passed, including actual importer execution; cleanup passed. |
| Cold-mobile budgets | 15 samples across 5 routes passed; all HTTP 200, no page errors, failed resources or video requests. |
| Image scan | Zero fixable HIGH/CRITICAL findings; 43 candidate findings remain. This is not a claim of zero vulnerabilities. |

The other **103 skipped browser cases are optional visual captures**, not successful
tests. CI used synthetic data on PostgreSQL 17; it does not establish migration of
the real archive or restore/import acceptance on production PostgreSQL 15.

PR #68 merged as source
[`1b38314ff6faf5182166fe15dff3172e4cf752ef`](https://github.com/ValkyriaWDG/www/commit/1b38314ff6faf5182166fe15dff3172e4cf752ef).
Its [exact-source publisher run 36580018846](https://github.com/ValkyriaWDG/www/actions/runs/36580018846)
was still running at this documentation checkpoint. Its eventual image identity,
the complete production-backup rehearsal and production acceptance require their
own results; the pull-request CI revision is not the merged main revision.

## Reviewed import expectations

These are **expected counts from the frozen reviewed bundle**, not assertions that
production already contains them. Later reports must separate expected and observed
counts and preserve any mismatch.

| Entity | Expected migration outcome |
|---|---|
| Editorial records | 30: 12 news records, 8 manuals, 8 tournaments and 2 community pages. News includes 9 articles and 3 expired announcements retained as archived. |
| FAQ | 11 question/answer pairs within the single FAQ page, not 11 independent pages. |
| Matches | 205 distinct public matches: 202 completed and 3 upcoming. Upcoming `0:0` values do not become confirmed results. |
| Historical statistics | 134 eligible round snapshots associated with 131 matches, including 3 additional rounds. |
| Unknown clan sides | 21 snapshots retain an unknown side and faction labels; no attribution inferred from names or weapons. |
| Provider game links | One independently verified origin/game association; 133 other snapshot links deliberately remain unset. |
| Media | 219 staged raster files become validated media-library assets and 438 stored WebP variants; only publication-referenced variants are expected to be anonymously available. |
| Unsupported/external image references | 27 retained as readable source links, without unresolved image placeholders. |

Game and language scope remain explicit. The archive includes a Wardogs article and
shared community material; importing the legacy site does not make every record
HLL-only. Original Czech/Slovak text and attribution remain identifiable. English
translations are not generated as a side effect of migration.

## Source corrections and clock policy

- The source record for match `199` embeds duplicate ID `198`. The reviewed repair
  preserves the two distinct events and its provenance; it is not a blanket dedupe.
- Statistics for matches `101` and `199` are quarantined because their maps conflict
  with the associated events. Four empty exports (`172`, `206`, `208`, `209`) are
  excluded. Their absence must not become fabricated zero statistics.
- Match `89` retains a source map-variant note. Ambiguous clan sides stay unknown.
- One tournament has a source end date before its start date; retain the warning
  and a null normalized end date rather than inventing a corrected date.
- Use `legacy-fixed-offset`: the old renderer appended fixed `GMT+1` to match
  times. For example, `27/09/2026 19:30` preserves the instant `18:30Z`. Interpreting
  it as Europe/Prague summer time would change history and needs a separate explicit
  editorial decision. Preserve the original text and selected interpretation.
- Operational observations use timezone-aware UTC timestamps. An optional human
  rendering may show Europe/Prague alongside UTC; never label an approximate approval
  time as an exact observation. HTTP/browser evidence must follow the recorded
  candidate-ready time and refer to the same maintenance run and image identity.

## Production acceptance checklist

| Criterion | Expected verification | Current result / artifact |
|---|---|---|
| Release identity | Successful exact-source run; immutable OCI index, runtime manifest/config, revision and attestations independently agree | First image published; automatic promotion held for `migration-bundle-changed`. Correction merged and combined PR CI passed; exact-main publisher result and corrected image identity **pending**. |
| Paired restore and rollback rehearsal | Isolated production-major PostgreSQL 15, restricted application role, captured database plus media, exact candidate and previous images; import, rerun, public/private media and rollback reader checked | **Failed at import dry run** after successful baseline restores/migrations/seed; [actual failed attempt](rehearsal-338ee2f-failed.json). Full corrected rehearsal pending. |
| Writer exclusion and fresh backup | Record updater/scheduler state, stop writes, capture and verify paired checksums and baseline fingerprints | Held capture for the rehearsal completed; old web ready afterward. Final production-apply capture and maintenance acceptance remain **pending**. |
| Explicit migration and import | Verify journal delta, exact reviewed bundle hash, publication scope, provenance corrections, entity counts and repeat-import stability | **Not run in production**; aggregate audit pending. |
| Candidate public HTTP and media | Run the bounded 929-case route/alias/provider plan; check published image decoding and privacy; independently GET liveness/readiness | **Not run against the deployed candidate**; report pending. Planned case counts are not pass counts. |
| Actual HLL providers | Two approved configured sources; truthful fresh/stale/unavailable states, public DTO allowlist and no fabricated Wardogs provider | **Not run against production configuration**; sanitized aggregate report pending. |
| Content reflow and visible behavior | Inspect actual editorial/manual/list pages on desktop and 390×844 mobile; verify images, overflow and browser errors | **Not run against production**; inspected captures pending. An additional local preview startup was rejected by automatic approval review and was not retried. |
| Held candidate acceptance | Bind real HTTP, health and inspected browser artifacts to candidate revision/digest, maintenance run and timestamps | **Pending**; preparation of a proof assembler is not acceptance. |
| Channel and automation recovery | After acceptance, preserve the complete approved OCI index, verify the running identity, then restore the previously recorded automation state | **Not run**; promotion and final runtime evidence pending. |

The private operator reports must distinguish restoring the **exact fresh dump**
from matching a freshly captured source fingerprint to an independently restored
backup. A valid archive listing or matching checksum alone is not a restore test.
Record the exact backup pair used by each rehearsal; do not relabel an earlier
restore as restoration of a later dump.

After nullable imported sides and additional rounds exist, rollback to the previous
reader is paired with the matching pre-import database and media. Image-only
rollback is not established as safe. No automatic destructive restoration is claimed.

## Public proof and protected artifacts

Publish only allowlisted aggregate results, immutable source/artifact identities,
timestamps, checksums and inspected editorial screenshots. Raw source checkouts,
database/media exports, environment files, credentials, private service addresses,
full provider responses, player names/IDs and membership/moderation records remain
protected operator artifacts. Do not attach them or link their private paths here.

Real-data match statistics and server-player screenshots stay private. Proposed
public visual proof is restricted to the HLL manual index, tank guide, news list and
match list, after inspecting each capture for safe content. Captions must identify
the actual deployed revision, route, locale, browser, viewport, capture time and
expected/observed behavior. Preserve original bytes and hashes; register any committed
verification images in the asset manifest. No screenshot is supplied by this scaffold.

Keep the legacy HLL domain/router cutover, live SSO, Discord role sync and unrelated
provider/server control outside this acceptance. The existing broader navigation
issue [#46](https://github.com/ValkyriaWDG/www/issues/46) is not resolved by a bounded
full-navigation capture. Record actual enabled/disabled runtime boundaries after
maintenance rather than copying the historical baseline's configuration claims.
