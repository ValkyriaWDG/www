# HLL features: production deployment and verification

The qualified HLL/Wardogs source was promoted at **08:15:19 UTC (10:15:19 CEST) on
29 September 2026**. The canonical origin remains **https://valkyria.cz**.

- Source: `e5d7276f7dd7215dc2f5e402a6bbf3c7a3228f3e`.
- Image: `majorluk/valkyria-www@sha256:c4b53776e500b62088f69ae1b94c57ab91f9c68becea43a0790dce2ff4abe430`.
- Previous actual source: `e03d3c50b71f179dd22e7fbc07a1ce4a58a3731a`.
- Previous actual image: `majorluk/valkyria-www@sha256:5e9129fabf0e737a138efa3ad198242dc945bfe4fe31965bf8a7ead266d8fa25`.

This source includes [#50](https://github.com/ValkyriaWDG/www/pull/50)'s CRCON adapter,
HLL round/statistics support, FAQ and fullscreen artwork; hydration-aware assertions
from [#57](https://github.com/ValkyriaWDG/www/pull/57); masthead/statistics defaults
from [#58](https://github.com/ValkyriaWDG/www/pull/58); and tournament administration
and linked matches from [#59](https://github.com/ValkyriaWDG/www/pull/59). PR #50
incorporates the artwork from [#55](https://github.com/ValkyriaWDG/www/pull/55), which
remains open; this is not a separate merge or acceptance of that PR.

## Source and image qualification

| Gate | Actual result | Record |
| --- | --- | --- |
| Exact main | [CI 36503155902](https://github.com/ValkyriaWDG/www/actions/runs/36503155902), source `e5d7276`, succeeded | [Main qualification](main-ci.json) |
| Protected publication | [Run 36539109346](https://github.com/ValkyriaWDG/www/actions/runs/36539109346) repeated verification, passed the normal protected environment gate and published the immutable source tag | [Publisher qualification](publisher-qualification.json) |
| Registry identity | Anonymous reads matched the tag/index digest, linux/amd64 manifest/configuration bytes and OCI source revision | [Registry verification within publisher record](publisher-qualification.json) |

Both complete qualifications passed **497 unit, 291 database, 160 browser, 126
tooling, 13 encrypted-recovery and 6 real restore tests**, plus the separate **4 HLL
artwork cases**. The **106 opt-in capture skips** are not passes. All **15 mobile
page-budget samples** and **12 image/rollback stages** passed. Scans report **zero
fixable HIGH/CRITICAL findings and 43 unfixed findings**, not zero vulnerabilities.
The budget profile measures its documented CSS fallback, not delivered game media.

CI's synthetic PostgreSQL 17.11 restore exercised empty/populated **29-table**
databases and media delivery/private denial. Its image rollback pin is the earlier
`5e83abc / 79bf` image. That does not qualify the actual pre-deployment `e03d3c5`
image; the additional on-host rehearsal below addresses that distinction. The
publication rebuild and CI rehearsal image are separately verified identities,
without a claim that their bytes are identical. Qualification JSON preserves the
then-current limitations; its pending actual-image gate was subsequently fulfilled
by the promotion record.

## Actual backup, upgrade and rollback rehearsal

The [sanitized deployment record](deployment-record.json) records the operation from
**08:11:20 to 08:15:19 UTC**. Web/publication/backup activity was quiesced before a
fresh paired database/editorial-media backup. An actual semantic restore into a new,
ownership-checked disposable database matched **27 tables, one sequence and the
zero-file editorial archive**. Source row counts/hashes and media hashes matched;
the source remained unchanged. Cleanup dropped only the created disposable database.

Before live migration, that restored **PostgreSQL 15** database was upgraded using
the exact published candidate: **3 applied / 2 already applied / 5 total**, then
**0 / 5 / 5**. The candidate passed 13 HTTP checks and the **actual previous
`e03d3c5 / 5e9129` image** passed 10 common-route checks against the upgraded schema.
Both images were healthy. This rehearsed image rollback without a schema downgrade.
The disposable database URL and media were isolated by configuration; the shared
database role/network was not a credential sandbox.

Live migrations 0002–0004 then produced the same **3 / 2 / 5**, followed by an
unchanged **0 / 5 / 5** retry. Schema grew from **27 to 29 tables**: empty
`match_statistics` and `tournament` tables, nullable tournament references and widened
content-owner constraints. Existing values were compared through their old-column
projection; new tournament references were NULL. No fixture, seed, content import,
live database restore or migration downgrade occurred. No rollback was needed during
this successful promotion; the preceding rehearsal proved the protected old image.

All **14 promotion page/health/media-range/robots checks** passed. Both timers resumed.
The [independent 08:16:00 UTC runtime readback](runtime-after.json) confirms the exact
image/source, 29 tables/five known migration hashes and all four readiness checks.
It also confirms uid 10001, read-only root, all capabilities dropped, no-new-privileges,
no public host ports, Watchtower off and all four approved background file hashes.
The [natural publication service observation](publisher-service-after.json) records
a successful **08:16:20–08:16:21 UTC** execution after deployment. It does not prove
authenticated publication, monitoring or alert delivery.

[Local operator review](operator-review.json) and the [qualified digest pin receipt](pinned-operator-bundle.json)
bind the reviewed helper fingerprints and 18 promotion/6 collector mock tests. These
checks supplement the actual restore/migration/image observations. Private helpers,
credentials, configuration, database identities and content fingerprints are excluded.
The collector validates a protected report; it is not independent attestation.

## Anonymous HTTP and browser observations

| Observation (UTC) | Actual result | Preserved report |
| --- | --- | --- |
| Initial HTTP, 08:18:31 | **69/85**; 16 assertions failed | [http-after-01.json](http-after-01.json) |
| Initial browser, 08:19:10 | **0/1 executed**; 14 scenarios unrun, no captures | [browser-after-01.json](browser-after-01.json) |
| Corrected HTTP, 08:23:14 | **85/85** | [http-after-02.json](http-after-02.json) |
| Corrected browser, 08:23:14 | **14/15**; all 14 functional scenarios passed, strict network gate failed | [browser-after-02.json](browser-after-02.json) |

The initial harness still expected social template `v=1`; the deployed source's
`SOCIAL_TEMPLATE_VERSION` is `2`. This caused the initial browser stop and the HTTP
metadata failures. Two tournament checks additionally matched translated error text
inside serialized Next.js dictionaries rather than the rendered main content.
The [original scripts](initial-harness/README.md) and failed reports are preserved.
The bounded correction aligns social URLs with the accepted source and distinguishes
rendered tournament cards/empty/error markup; browser checks independently inspect
the visible state. [Regression tests](correction.test.cjs) reject dictionary-only
false positives and retain actual error-state rejection. The [correction receipt](correction-provenance.json)
records **42/42 local tests**, independent review and exact original/final file hashes.
No application was changed
between these observations, and no repeated probe replaced a failing result.

The successful HTTP suite covers CS/EN canonical and legacy redirects, metadata,
anonymous admin boundaries, robots/sitemap, approved media ranges, HLL artwork
hashes/full decode, tournaments and unpublished FAQ state. Browser verification used
**Chrome for Testing 154.0.8037.57**: game/language navigation, HLL static poster,
Wardogs short playback and pause/reload/resume, news/home navigation, tournaments/FAQ,
and six mobile captures without video requests all passed.

The unchanged strict classifier retained **five non-prefetch RSC `net::ERR_ABORTED`
requests** as failures. There were zero page errors, HTTP failures, write attempts,
blocked requests or unexpected-origin requests/responses. The 161 cancellations
classified as best-effort prefetch required same-origin GET/fetch plus both RSC and
prefetch headers; this exception did not cover the five failing requests.
[#46](https://github.com/ValkyriaWDG/www/issues/46) therefore remains open. The
browser suite is **not accepted overall**, and screenshots do not waive its network gate.

Reports retain the original `identityReference` value `../runtime-after.json`; in this
durable layout it maps to the adjacent [runtime-after.json](runtime-after.json).
Their local harness revision is separate from independently observed runtime identity.

## Inspected production captures

All 11 original PNGs were visually inspected, with no editing or fixture insertion.
Every capture is anonymous production at the source/image above, in Chrome for Testing
154.0.8037.57. Desktop viewport is **1440×900**; mobile is **390×844 touch emulation**.
Full-page PNG height may exceed the viewport. [Browser JSON](browser-after-02.json)
records each exact size, hash, route and overflow measurement.

| Capture | Route / locale / viewport | Observed content |
| --- | --- | --- |
| [Community hub](browser-after-02-hub-cs-desktop.png) | `/cs`, CS desktop | Both game entries and honest no-news state |
| [HLL main menu](browser-after-02-hll-cs-desktop.png) | `/cs/hll`, CS desktop | Fullscreen static artwork, masthead and menu |
| [Wardogs main menu](browser-after-02-wardogs-cs-desktop.png) | `/cs/wardogs`, CS desktop | Approved video scene and playback controls |
| [HLL tournaments](browser-after-02-hll-tournaments-cs-desktop.png) | `/cs/hll/tournaments`, CS desktop | No published tournaments; no synthetic rows |
| [English HLL menu](browser-after-02-hll-en-desktop.png) | `/en/hll`, EN desktop | English navigation over the static artwork |
| [Mobile community hub](browser-after-02-hub-en-mobile.png) | `/en`, EN mobile | Stacked game entries and shared navigation |
| [Mobile English HLL](browser-after-02-hll-en-mobile.png) | `/en/hll`, EN mobile | Wrapped masthead and readable menu, no video |
| [Mobile Wardogs](browser-after-02-wardogs-en-mobile.png) | `/en/wardogs`, EN mobile | Poster fallback and manual playback control |
| [Mobile Czech HLL](browser-after-02-hll-cs-mobile.png) | `/cs/hll`, CS mobile | Czech menu and static background |
| [Mobile tournaments](browser-after-02-hll-tournaments-en-mobile.png) | `/en/hll/tournaments`, EN mobile | Visible empty tournament collection |
| [Mobile FAQ](browser-after-02-hll-faq-en-mobile.png) | `/en/hll/faq`, EN mobile | Explicit unpublished page with Discord/navigation links |

## Reproduce the bounded verification

Run from the repository root with installed project dependencies and an explicitly
selected browser. The tests are local; the final two commands are anonymous public
GET/HEAD/browser checks and require the operator's verification scope. Substitute
new report IDs: reports and captures use exclusive creation and must not overwrite
this evidence. The recorded commands used `http-after-02` and `browser-after-02`.

```powershell
$evidence = 'docs/evidence/hll-features-production-2026-09-29'
$env:VERIFICATION_DEPENDENCY_ROOT = '<absolute checkout with installed apps/web dependencies>'
$browser = '<absolute Chrome for Testing executable>'
$revision = 'e5d7276f7dd7215dc2f5e402a6bbf3c7a3228f3e'
$digest = 'sha256:c4b53776e500b62088f69ae1b94c57ab91f9c68becea43a0790dce2ff4abe430'
node --test "$evidence/harness.test.cjs" "$evidence/request-classification.test.cjs" "$evidence/correction.test.cjs"
node "$evidence/http-smoke.mjs" --stage after --origin https://valkyria.cz --media-origin https://valkyria.cz --dependency-root $env:VERIFICATION_DEPENDENCY_ROOT --revision $revision --digest $digest --identity-ref runtime-after.json --report-id '<new-http-report-id>'
node "$evidence/browser-smoke.cjs" --media-origin https://valkyria.cz --dependency-root $env:VERIFICATION_DEPENDENCY_ROOT --revision $revision --digest $digest --identity-ref runtime-after.json --browser-executable $browser --browser-product 'Chrome for Testing' --report-id '<new-browser-report-id>'
```

Initial [preparation](preparation.json) and [local test output](local-tests.txt) remain
historical 25-test/source-artwork evidence, not the corrected production run. The
additional correction tests and their [separate execution receipt](correction-provenance.json) document the revised
harness. Its browser fence checks observed redirect hops; it is not complete
pre-network redirect isolation. WebSockets and write attempts remain forbidden.

## Scope and remaining limits

Authentication remains disabled with **zero local grants**. The HLL background clip
playlist is empty, status source is `none`, no CRCON/Logi provider is activated and
legacy-HLL host migration remains inactive. Static HLL artwork is not recorded clan
gameplay. No DNS/proxy routing changed; the old `valkyriahll.cz` site is unchanged.

An anonymous empty/unpublished production site cannot prove populated tournaments,
match rounds/statistics, authenticated editor/RBAC workflows or real provider data.
Those capabilities retain their separate synthetic local/CI evidence. Fresh semantic
restoration does not prove encrypted off-host retention, recovery objectives or alert
delivery. Mobile browser emulation is not physical-device, Safari or retail-Firefox
coverage; short playback is not full-loop performance qualification.

Historical evidence is preserved: the original unified source's
[54/55 HTTP and 9/10 browser checkpoint](../unified-cutover-2026-09-28/README.md),
and the previous image's [55/55 robots-hotfix HTTP checkpoint](../robots-runtime-origin-2026-09-28/production/README.md).
Their screenshots retain their original source attribution. The original cutover
attempt's unrecorded JSON failure cause remains unproven under
[#52](https://github.com/ValkyriaWDG/www/issues/52). The strict non-prefetch RSC
cancellation gate in [#46](https://github.com/ValkyriaWDG/www/issues/46) is evaluated
separately and is not waived by this deployment.

The [artifact index](artifact-index.json) hashes canonical LF Git bytes for text and exact bytes for images.
Anonymous clients cannot read container labels; deployed identity comes from the
separate operator/runtime records rather than a local checkout or expected tag.
