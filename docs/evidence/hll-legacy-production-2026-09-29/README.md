# HLL legacy production acceptance

**Accepted on 29 September 2026 at 14:58:22.806902 UTC:** the archive was imported,
public and browser checks passed, the complete approved OCI index was promoted, and
the prior automation state was restored. Final runtime identity and the subsequent
eight-request HTTP smoke passed. The [production record](production.json) binds these
observations to source `1b38314ff6faf5182166fe15dff3172e4cf752ef` and its immutable
image digest. Source `571475f` is the preserved pre-migration baseline. The first candidate's failed attempt remains preserved in the
[sanitized failed report](rehearsal-338ee2f-failed.json). The corrected code's
[CI qualification](packaging-ci.json), [publication](publication.json) and
[successful rehearsal](rehearsal-1b38314.json) are separate results. The subsequent
[production HTTP report](deployment-http.json) and
[editorial reflow report](editorial-reflow.json) cover the held production candidate.
Their earlier observation windows remain unchanged; the final channel, runtime and
automation observations are recorded separately in [production.json](production.json).

The first published candidate uses merged application source
[`338ee2ff39ac484b4fef6d9f9da8bc1238d68b5a`](https://github.com/ValkyriaWDG/www/commit/338ee2ff39ac484b4fef6d9f9da8bc1238d68b5a),
from [PR #67](https://github.com/ValkyriaWDG/www/pull/67). Exact-source verification and
[publisher run 36571865529](https://github.com/ValkyriaWDG/www/actions/runs/36571865529)
completed successfully after normal protected-environment approval. The published
image is `majorluk/valkyria-www@sha256:8f048f6c9d2f0038d0a48ae66940ddb5bcb300d899615d56f0fbe4b1269cb18a`.
Automatic channel promotion was held with `migration-bundle-changed`, as intended.
**Publication is not production acceptance:** this image must not be promoted as the
accepted migration candidate. The packaging correction has since merged in
[PR #68](https://github.com/ValkyriaWDG/www/pull/68). Its new immutable image passed
the production-backup rehearsal described below and the subsequent explicit production
acceptance. The failed first candidate remains unaccepted.

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
| Corrected published image and production-major rehearsal | [Exact-main publication](publication.json) and [passed PostgreSQL 15 restore/import report](rehearsal-1b38314.json) | Qualifies the recorded backup pair, image and bundle in isolation; this rehearsal itself did not mutate production. |
| Actual production acceptance | [Accepted maintenance, channel and runtime record](production.json), [public HTTP](deployment-http.json) and [inspected captures](editorial-reflow.json) | Real imported content and bounded public verification; authentication, Logi and the legacy-domain cutover remain outside scope. |

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
subsequently succeeded; the publish job completed at **14:23:16 UTC**. The
[publication record](publication.json) retains its exact-main verification and
the automatic channel hold, `migration-bundle-changed`. The pull-request CI revision
is not the merged main revision.

## Passed production-backup rehearsal

The corrected immutable image is
`majorluk/valkyria-www@sha256:6623125c93ec576e0402ce9708749d3a7175f36230c99890b132d3d23f71ef1b`,
from source `1b38314ff6faf5182166fe15dff3172e4cf752ef`. Its isolated rehearsal ran
**14:26:29.554414–14:33:18.980166 UTC** on 29 September 2026. The recorded timestamps
already use offset `+00:00`; displaying them in Europe/Prague must not shift their
meaning. See the [sanitized successful report](rehearsal-1b38314.json) for identities,
protected artifact hashes, counts and limits.

| Step | Actual observed result |
|---|---|
| Isolation and restored baseline | PostgreSQL 15.17; restricted application role, internal network and no published ports. Both candidate and previous-image database/media copies matched the held 13:21:04 UTC capture: 29 tables, 0 editorial media files. |
| Bundle staging | 354 declared files hash-verified and mounted read-only; exact reviewed bundle hash recorded. |
| Migration, seed and dry run | Four migrations applied, journal 5 to 9; repeat applied zero. Seed completed; import dry run preserved database/media fingerprints. |
| Archive import | 219 media assets, 8 tournaments, 12 news records, 8 manuals and 205 matches created; 2 seeded community pages adopted. The 27 external/unsupported media descriptors remained intentionally skipped. |
| Imported data audit | 131 primary statistics snapshots plus 3 additional rounds, 21 unknown clan sides, 1 verified provider game link and 202 editorial results preserved. Private player fields absent; identity tables unchanged. |
| Replay | All imported records reported unchanged; complete database/media fingerprints matched the first apply. |
| Candidate readiness and HTTP | Readiness 1/1; HTTP 680/680 matched expectations: 647 HTTP 200 and 33 intentional HTTP 404 responses. Requests left database/media fingerprints unchanged. |
| Editorial media visibility | 438 stored WebP variants checked: 408 anonymous responses were nonempty `image/webp`; 30 private/unreferenced variants correctly returned HTTP 404. |
| Paired previous-image rollback | Readiness 1/1 and HTTP 5/5 passed against the matching restored pre-import database/media pair. Fingerprints before and after requests matched the captured baseline. |
| Cleanup | All 11 owned rehearsal containers stopped; preserved resources were not deleted. No production operation or channel promotion was performed by the rehearsal. |

All **11 snapshot canonical fingerprints** were independently checked against the
protected files, alongside the required before/after equality comparisons. File-byte
hashes and canonical JSON fingerprints are recorded separately. The original failed
`338ee2f` attempt remains unchanged and is not reclassified as successful.

This establishes the specified isolated restore/import and paired rollback result.
It does not itself establish rollback by replacing only the image, browser visual
acceptance, live CRCON authorization, or production migration. The original source
had no editorial media; the imported archive supplied the 438 new variants. The
subsequent production checks below have their own observation window and evidence
lineage; they do not change the earlier rehearsal's scope.

## Observed production HTTP and health

The read-only verifier ran **14:52:08.369–14:53:58.961 UTC** on 29 September 2026
against `https://valkyria.cz`. Its protected report hash is bound to the same candidate
revision/digest and maintenance record as the separate health proof. The
[sanitized HTTP report](deployment-http.json) contains only aggregates, route groups,
hashes and public health paths; raw bodies and private provider addresses are omitted.

- **929/929 planned HTTP observations passed:** 267 reviewed content checks, 615
  numeric-alias checks, 40 public-surface checks, 3 redirects and 4 server-route checks.
  These are observations, not 929 unique pages.
- **371/371 discovered image URLs passed**, including 362 CMS variants, with nonempty
  image bodies and valid decoded dimensions. This does not make all 438 stored variants
  public; unreferenced, archived-only and CSS assets are outside this discovery scope.
- **Two approved live-server detail selections passed**, each reporting two configured
  sources; privacy checks passed. Zero players is valid and is not treated as an outage.
  No player records, server identifiers or provider addresses are published here.
- **Health 2/2 passed** at **14:53:27.535–14:53:27.781 UTC**: `/api/health/live` returned
  `ok`; `/api/health/ready` returned `ready` with configuration, database, schema and
  media checks all `ok`. Both responses passed the no-store check.

These results establish the recorded public behavior of the held candidate. Subsequent
channel promotion, resumed automation and final runtime confirmation passed in the
separate [production acceptance record](production.json).

## Inspected production editorial captures

The [reflow report](editorial-reflow.json) records **8/8 passed cases** across the tank
guide, manual index, news list and match list, at **390×844** and **1440×1000** browser
viewports. All returned HTTP 200 with zero measured document overflow, broken images
or page errors. The coordinating agent inspected all eight original captures and
selected the six below for public evidence. The tank-guide images and the separate
five-image private deployment/statistics set remain private.

Shared context: actual published editorial content at source
`1b38314ff6faf5182166fe15dff3172e4cf752ef`, candidate digest
`sha256:6623125c93ec576e0402ce9708749d3a7175f36230c99890b132d3d23f71ef1b`, Czech locale,
Chromium **153.0.8010.12**, observed **14:53:01.422–14:53:13.505 UTC** on 29 September
2026. The report records this shared window, not individual frame timestamps. Mobile
is viewport emulation. Full-page PNG heights exceed some viewport heights; original
bytes, sizes and hashes are preserved in the report and asset manifest. No crop,
resize or other image edit was applied.

| Capture | Route / viewport | Expected and observed |
|---|---|---|
| [Manual index, mobile](manual-index-mobile.png) | `/cs/hll/field-manual`, 390×844; PNG 390×1915 | Readable imported manual categories and loaded covers; HTTP 200, no horizontal overflow, broken images or page errors. |
| [Manual index, desktop](manual-index-desktop.png) | `/cs/hll/field-manual`, 1440×1000; PNG 1440×1000 | Readable category grid and loaded covers; same successful measured checks. |
| [News list, mobile](news-list-mobile.png) | `/cs/hll/news`, 390×844; PNG 390×4286 | Published news cards and artwork remain readable in the responsive list; same successful measured checks. |
| [News list, desktop](news-list-desktop.png) | `/cs/hll/news`, 1440×1000; PNG 1440×2099 | Published news content and images are visible in the desktop layout; same successful measured checks. |
| [Match list, mobile](match-list-mobile.png) | `/cs/hll/matches`, 390×844; PNG 390×1224 | Public fixtures/results remain readable and the table stays contained; same successful measured checks. No player-statistics page is included. |
| [Match list, desktop](match-list-desktop.png) | `/cs/hll/matches`, 1440×1000; PNG 1440×1481 | Readable public match table with contained layout; same successful measured checks and no player-statistics page. |

This is a navigation-only content/reflow check. It does not prove filtering,
pagination, authenticated editing, physical-device behavior or complete accessibility.
Capture provenance uses the declared deployed source; the browser harness does not
independently resolve a running OCI digest.

## Reviewed import expectations

These are **expected counts from the frozen reviewed bundle**. The observed production
import and unchanged replay agree on 219 media, 12 news, 8 manuals, 8 tournaments,
2 adopted pages and 205 matches; [production.json](production.json) records these
actual counts separately. Detailed source classifications below remain the reviewed
bundle inventory rather than newly measured application behavior.

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

## Accepted production maintenance and recovery

The [production record](production.json) covers maintenance from **14:46:41.997912 UTC**,
candidate readiness at **14:51:24.034216 UTC** and acceptance at
**14:58:22.806902 UTC**. It records the exact bundle, protected artifact hashes, observed
entity counts, unchanged import replay and the privacy/identity audit. The two earlier
preflight stops occurred before freezing or importing production data:

- Compose serialized the unchanged memory limit as a decimal string. The narrow parser
  correction accepts only the exact integer or canonical decimal string; 35 offline
  regressions passed. Resource limits were unchanged.
- Two task-authorized provider credentials existed in the environment file but were
  absent from the previous running web process. The exact previous web image was
  recreated with the existing unchanged configuration, without pulling, building or
  recreating dependencies. The strict runtime/configuration comparison then passed.

No guard was bypassed. The reconciliation ran **14:46:03.239524–14:46:12.145653 UTC**;
precise timestamps for the two earlier failed preflight calls were not recorded.

**Fresh-backup classification:** the fresh database dump was **not restored**. Its
source fingerprint matched the independently restored accepted baseline, the dump's
archive table of contents was verified, and the fresh media archive was restored and
verified. Both fresh checksums and the earlier accepted PostgreSQL 15 paired-restore
report hash are retained. These are different observations; the rehearsal must not
be relabeled as restoration of the later dump.

The approved complete OCI index, containing **two manifests**, was promoted at
**14:57:28.046 UTC** after the bound public proof. The promotion helper itself did not
resume automation. The accepted maintenance stage recreated the web through the
production alias and restored the updater and publisher state. At
**14:59:05.069679 UTC**, the web's revision/digest matched the accepted candidate,
both web and updater were healthy, the publisher timer was active and its service
result was successful. A subsequent **8/8 HTTP 200** smoke passed at
**14:59:30.703–14:59:32.265 UTC**, covering both games/locales, an imported match,
servers and both health routes.

The separate point-in-time runtime comparison found **26/26 unrelated containers
unchanged**, no missing or unexpected containers, and **24 owned maintenance
containers stopped**, with none still running. This compares Docker properties, not
unrelated application behavior, traffic, storage or host-service history. Unrelated
service identities and protected paths are omitted from public proof.

Authentication and Logi remain disabled. The existing legacy HLL domain remains
unchanged; this acceptance does not cut it over.

## Production acceptance checklist

| Criterion | Expected verification | Current result / artifact |
|---|---|---|
| Release identity | Successful exact-source run; immutable OCI index, runtime manifest/config, revision and attestations independently agree | **Passed:** [exact-main publication](publication.json) and [final production runtime identity](production.json); the initial automatic hold was resolved through explicit acceptance. |
| Paired restore and rollback rehearsal | Isolated production-major PostgreSQL 15, restricted application role, captured database plus media, exact candidate and previous images; import, rerun, public/private media and rollback reader checked | **Passed for the corrected image and recorded backup pair**; [successful rehearsal](rehearsal-1b38314.json). The [first failed attempt](rehearsal-338ee2f-failed.json) remains preserved. |
| Writer exclusion and fresh backup | Record updater/scheduler state, stop writes, capture and verify paired checksums and baseline fingerprints | **Recorded:** automation already held, paired fresh checksums and baseline equality verified. Fresh dump was not restored; exact classification and restored media evidence are in [production.json](production.json). |
| Explicit migration and import | Verify journal delta, exact reviewed bundle hash, publication scope, provenance corrections, entity counts and repeat-import stability | **Passed:** exact hash-verified bundle, observed import counts, no-op migration/import replay and privacy/identity audit; [production aggregate record](production.json). The separate rehearsal records the four-migration journal delta. |
| Candidate public HTTP and media | Run the bounded 929-case route/alias/provider plan; check published image decoding and privacy; independently GET liveness/readiness | **Passed:** 929/929 HTTP observations, 371/371 discovered image URLs and health 2/2; [actual report](deployment-http.json). |
| Actual HLL providers | Two approved configured sources; truthful fresh/stale/unavailable states, public DTO allowlist and no fabricated Wardogs provider | **Passed at the observed checkpoint:** two approved detail selections and privacy checks; [aggregate report](deployment-http.json). This does not guarantee ongoing provider availability. |
| Content reflow and visible behavior | Inspect actual editorial/manual/list pages on desktop and 390×844 mobile; verify images, overflow and browser errors | **Passed:** 8/8 actual-content cases with six inspected public captures; [reflow evidence](editorial-reflow.json). An earlier local preview startup was rejected by automatic approval review and not retried. |
| Held candidate acceptance | Bind real HTTP, health and inspected browser artifacts to candidate revision/digest, maintenance run and timestamps | **Accepted:** real proof hashes, chronology and exact identity preserved in the [final record](production.json); the prior awaiting-acceptance report remains separately hash-bound. |
| Channel and automation recovery | After public-proof acceptance, preserve the complete approved OCI index, verify the running identity, then restore the previously recorded automation state | **Passed:** two-manifest index verified, production alias running the exact candidate, web/updater healthy, timer active, service successful and post-recreation HTTP 8/8; [final record](production.json). |

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

Real-data match statistics and server-player screenshots stay private. The six
published captures are restricted to the inspected HLL manual index, news list and
match list. The tank-guide captures remain private. Captions identify
the actual deployed revision, route, locale, browser, viewport, capture time and
expected/observed behavior. Original bytes and hashes are preserved; all six committed
verification images are registered in the asset manifest.

Keep the legacy HLL domain/router cutover, live SSO, Discord role sync and unrelated
provider/server control outside this acceptance. The existing broader navigation
issue [#46](https://github.com/ValkyriaWDG/www/issues/46) is not resolved by a bounded
full-navigation capture. The actual accepted runtime keeps authentication and Logi
disabled and preserves the legacy HLL domain; no live SSO or Discord role-sync proof
is claimed.
