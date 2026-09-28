# Robots runtime-origin production acceptance

Issue [#53](https://github.com/ValkyriaWDG/www/issues/53) is verified in production:
`/robots.txt` now advertises the canonical `https://valkyria.cz` Host and Sitemap.
The image-only promotion completed on **2026-09-28 at 21:33:47 UTC (23:33:47 CEST)**.
The independent anonymous HTTP suite started at **21:35:24 UTC** and passed **55/55**.
The original [54/55 HTTP](../../unified-cutover-2026-09-28/http-after-01.json) and
[9/10 browser](../../unified-cutover-2026-09-28/browser-after-01.json) reports remain
unchanged. The separate browser-network investigation [#46](https://github.com/ValkyriaWDG/www/issues/46)
remains open; this HTTP fix does not qualify that browser gate.

- Deployed source: `e03d3c50b71f179dd22e7fbc07a1ce4a58a3731a`.
- Image: `majorluk/valkyria-www@sha256:5e9129fabf0e737a138efa3ad198242dc945bfe4fe31965bf8a7ead266d8fa25`.
- Previous source/image: `5e83abc91560480e21b60c4a2638c0b52b0e1720` /
  `sha256:79bf4ea15dd185f0618775fee2a794f2e5d024a116943224a1a4a1dcb7afef48`.
- No schema, canonical-origin, routing, authentication or HLL/provider activation change.

## Source and publication qualification

| Gate | Exact observation | Durable record |
| --- | --- | --- |
| PR [#54](https://github.com/ValkyriaWDG/www/pull/54) | Head `ac959add47bdb8c1dafd8f10820323add2f63d32`, base `5e83abc91560480e21b60c4a2638c0b52b0e1720`, tested merge `f257c2dc20f6ad061863689418a5133ad21bf0c7`; [CI 36482910323](https://github.com/ValkyriaWDG/www/actions/runs/36482910323) passed | [PR qualification](pr-ci.json) |
| Exact main | `e03d3c50b71f179dd22e7fbc07a1ce4a58a3731a`; [CI 36484523293](https://github.com/ValkyriaWDG/www/actions/runs/36484523293) passed | [Main qualification](main-ci.json) |
| Protected publication | [Run 36484542039](https://github.com/ValkyriaWDG/www/actions/runs/36484542039) repeated verification, passed the normal protected environment gate, then published the immutable source tag and verified its digest/OCI revision | [Publication qualification](publisher-qualification.json), [pre-publication visibility](registry-before-publish.json) |

Each full qualification passed **439 unit, 272 database, 144 browser, 126 tooling,
13 encrypted-recovery and 6 real PostgreSQL restore tests**. The **98 opt-in capture
skips** are not passes. All **15 cold-mobile samples** and **12 image/rollback stages**
passed. The rollback target was the actually deployed `5e83 / 79bf` image. Real
PostgreSQL 17.11 verification included empty/populated 27-table restoration, media
delivery/private denial and owned-resource cleanup. The budget profile uses its
documented CSS fallback rather than delivered game media; maximum CLS was 0.0402942.
The image scan records **0 fixable HIGH/CRITICAL findings, with 43 unfixed findings
remaining**. Qualification records preserve artifact identities, archive hashes,
source fingerprints and expiration dates; expiring Actions archives are supplemental.

Anonymous registry reads independently matched the immutable tag/index digest,
linux/amd64 manifest and configuration byte hashes, and OCI source revision. CI image
rehearsal and the published registry image identity are separate observations: the
publication rebuild is not claimed to have identical bytes to the earlier CI image.
The [local red/green regression](../README.md) proves build/runtime origin separation.

## Actual promotion and recovery guard

The [sanitized promotion record](deployment-record.json) records the actual
21:32:25–21:33:47 UTC operation. Publication and backup activity and the web process
were quiesced before a fresh paired database/editorial backup. A real restore into
a newly created, ownership-checked disposable database matched **27 tables, one
sequence and every editorial media hash**; the editorial archive contained zero files.
That database was dropped only after ownership verification, with no live database
restore. Both explicit candidate migration invocations were **0 applied / 2 already
applied / 2 total**, preserving the source rows, journal and sequence state.

Only the image pin and deployed-revision record changed. Runtime secrets, Compose,
canonical origin, persistent storage and routing were preserved. Two coherent
canonical/liveness/readiness rounds at least five seconds apart had zero pending
rounds, followed by one complete **14-check** page/health/media-range/robots smoke.
Both timers resumed. The protected rollback target was the prior `5e83 / 79bf`
image/configuration without a schema downgrade; no rollback was needed in this run.
Its known old robots defect is explicitly excluded only from rollback acceptance.

The [read-only runtime observation](runtime-after.json) at **21:34:31 UTC** confirms
the exact image/source, all four named readiness checks, uid 10001, read-only root,
all capabilities dropped, no public host ports and disabled Watchtower. All four
approved background files retain complete byte counts/hashes and canonical URLs.
Both timers are enabled/active and their service observations are successful.
Authentication remains disabled with zero local grants, HLL clips remain empty,
status source remains `none`, and legacy-HLL host migration remains inactive.
A later [natural publication pass](publisher-service-after.txt) ran at
21:36:55–21:36:56 UTC (23:36:55–23:36:56 CEST) and exited successfully after this
promotion. It does not establish monitoring, overdue-content detection or alert delivery.

The [operator tool verification](pinned-verification.json) binds reviewed and
candidate-pinned helper fingerprints and passing local suites. The private helpers,
configuration, temporary database identities and raw operator report are not published.
Those local checks do not replace the actual promotion or separate public observations.

## Normal public robots URL and complete HTTP suite

Promotion first checked a cache-busted robots response. A subsequent narrowly scoped
[cache purge](robots-cache-purge.json) invalidated only `https://valkyria.cz/robots.txt`,
not the zone. At **21:34:41 UTC**, the normal URL returned HTTP 200 / cache `MISS`,
canonical Host/Sitemap, the public social-image allowance and all seven private-route
exclusions. Its 251-byte response hash matched the promotion probe.

The unchanged [public HTTP harness](../../unified-cutover-2026-09-28/http-smoke.mjs)
then ran once with a fresh report ID; [http-after-02.json](http-after-02.json) passed
**55/55**. It verified CS/EN hub, HLL and Wardogs metadata, canonical/legacy redirects
including queries, privacy/cache boundaries, sitemap/robots, six fully decoded social
PNGs and approved media headers/ranges. This is a new observation after a new image
and targeted cache invalidation, not a replacement or waiver of the failed report.
The observed edge robots header is `public, max-age=14400, must-revalidate`, distinct
from Next.js's locally observed `max-age=0`. The accepted fix concerns origin
directives; no cache-policy fix or global cache qualification is claimed.

The HTTP report SHA-256 is
`7db11d2fd369f735f949d573b2091f6a9bbfae7242b0c5b19b9431549bfa4558`.
Its original `identityReference` of `../robots-hotfix/runtime-after.json` is retained
unchanged; in this durable layout it maps to the adjacent [runtime-after.json](runtime-after.json).
The local harness revision is distinct from the deployed source. Anonymous HTTP
cannot independently read container labels; runtime identity comes from that separate
operator observation. [Artifact fingerprints](artifact-index.json) hash text as its
canonical LF Git representation and binaries as exact bytes.

## Boundaries and screenshots

Screenshots are **N/A** for this machine-readable text endpoint and deployment-only
change. The [six inspected original-cutover images](../../unified-cutover-2026-09-28/README.md#inspected-production-captures)
remain UI evidence for source `5e83abc`, not newly captured proof for `e03d3c5`.
No new production browser run was performed for this robots fix; #46's 9/10 network
result remains failed and open. No live Discord/Logi, callback registration, HLL battle
footage or CRCON/statistics deployment is claimed. The legacy HLL site is unchanged.
Fresh local semantic restoration does not prove encrypted off-host retention,
monitoring/alert delivery or recovery objectives. The original cutover attempt's
unrecorded JSON failure cause remains unproven under #52.
