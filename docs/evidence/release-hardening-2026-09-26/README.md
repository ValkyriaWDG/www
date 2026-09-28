# Release hardening evidence — 2026-09-26

## Accepted combined source — 2026-09-28

[CI 36435186950](https://github.com/ValkyriaWDG/www/actions/runs/36435186950) passed
for PR #32 head `cfececb5fa5e48c013f1593a3ac2f9855df17588`, tested as merge
`07a58689f7ca8051200f128eca14b43fc9f7c1ad`. Its committed tree matches accepted
main commit `eaf9f911f13c0b929c8f7d90529c0ccab5dd0701`. The
[durable acceptance record](accepted-2026-09-28.json) preserves actual report hashes,
39 tooling / 374 unit / 229 PostgreSQL / 119 browser passes, 67 browser skips,
all 12 runtime/rollback steps, decoded CS/EN social PNGs in both images and the
114-component SBOM. All nine cold-mobile samples pass; LCP medians are
1976/884/984 ms. The exact page-report dirty path is `sbom/valkyria-web.cdx.json`.
Candidate scans retain 43 unfixed HIGH findings and zero CRITICAL findings.
[Issue #26 acceptance](https://github.com/ValkyriaWDG/www/issues/26#issuecomment-5872056794)
records closure. Raw artifacts expire on their recorded dates; current Linux
capture hashes are verified, while committed historical images below retain their
original provenance. This qualifies the recorded synthetic fixtures and lab checks,
not production deployment, future migrations, delivered-video playback or Logi.
Earlier results and failures below remain unchanged historical evidence.

## Accepted historical CI and combined-source refresh — 2026-09-28

[CI 36267354812](https://github.com/ValkyriaWDG/www/actions/runs/36267354812) passed
Foundation, Application and Quality gate for PR head
`677c07f8e284ec6de936094102e0f6858b1e3a81`, tested as merge revision
`499558cbd9e0fc1260356274c40e318c28514e86`. The actual artifacts were downloaded
and re-inspected on 2026-09-28; the three recorded Linux capture hashes matched.
[Issue #26 acceptance proof](https://github.com/ValkyriaWDG/www/issues/26#issuecomment-5849412715)
contains measurements, captions and the source/operational limits.

| Verification | Observed result for that historical source |
|---|---|
| Foundation / application | 714 files; 36 tooling, 369 unit, 227 PostgreSQL and 114 browser tests; lint, types and production build passed. |
| Runtime and rollback | All 12 steps and cleanup passed. The immutable previous image served routes/media before and after candidate migrations and after restore; all 25 table fingerprints matched. |
| Native image behavior | UID 10001, read-only root, writable media/cache, sharp WebP encoding and health passed in both variants; candidate database loss/recovery passed. |
| Same-source comparison | Bookworm 281,795,388 bytes vs Trixie 286,027,086 bytes: candidate is 4,231,698 bytes larger (+1.50%). Package inventory decreases 121 to 112; HIGH/CRITICAL package findings decrease 56 to 43. |
| Advisory limits | Candidate retains 43 unfixed HIGH findings, zero CRITICAL and zero fixable HIGH/CRITICAL; complete advisory reports remain available. |
| Cold-mobile budgets | Home/news/article median LCP 1968/872/984 ms; maximum CLS 0.049400/0.002521/0.005100; maximum transfer 503137/492871/585733 bytes. All nine samples pass. |
| SBOM | Candidate CycloneDX 1.6 with 113 components; image ID/source match the rehearsal. |

Inspect the run's `release-rehearsal-*`, `runtime-scans-*`, `sbom-*` and
`page-budgets-*` artifacts (90-day retention). The old budget report records
`sourceDirty: true`; an SBOM was generated earlier, but the complete dirty-path
list was not captured. This is not a clean-tree measurement and inferred paths
must not be added retroactively. Future reports now include `dirtyPaths`.

This qualifies only the recorded disposable image/schema pair. It applied zero
real migrations plus a separate synthetic nullable-column expansion; media used
an unchanged synthetic volume. It does not prove production deployment, a future
migration, real-media restoration or enabled Discord integration. Social PNG
checks were N/A because the route did not yet exist in that source.

At this earlier checkpoint, refreshed PR #32 incorporated PR #33 from main
`b37931393cd9b836415724d9572765f8615c31e8` and still needed its own full CI,
including CS/EN 1200×630 social PNG rendering/decoding in both runtime variants.
That later acceptance is recorded above; these historical results are not relabeled.
Hosted Logi is the integration direction; legacy custom-bot PRs #34/#35 are not
release prerequisites. See the [current integration handoff](../../engineering/follow-up-integration-2026-09-26.md).
No registry publication, production migration, DNS change or deployment was made.

## Historical failed run: budgets passed, runtime correction pending

[CI run 36265109815](https://github.com/ValkyriaWDG/www/actions/runs/36265109815)
tested PR head `6d48258926aed74b5e1b27bac93b1143f47520b3` through merge checkout
`5603528d928640211e088443e6aaba858842ecff`. The
[compact evidence record](linux-attempt-36265109815.json) identifies the exact artifacts,
raw-report hashes and three inspected capture hashes. All nine Linux navigations passed:

| Route | Median LCP | Maximum CLS | Maximum transfer |
|---|---:|---:|---:|
| `/cs` | 1976 ms | 0.049400 | 503139 bytes |
| `/cs/news` | 860 ms | 0.002521 | 492609 bytes |
| Synthetic published article | 992 ms | 0.005101 | 585727 bytes |

Both same-source Docker variants built. The disposable rehearsal failed while loading
synthetic fixtures: the standalone pnpm graph contained `sharp`, but external operational
CLIs could not resolve its bare package import. Cleanup passed. Native runtime acceptance,
image rollback/restore, scan comparison and SBOM were not reached; this run is not green.

The correction links only the exact pinned, already-traced package during the image
build, rejecting absent, ambiguous or mismatched packages. Two regression tests and an
actual Windows standalone 8 × 8 WebP encode passed; 32 foundation tests passed locally.
The corrected Linux images still require a new exact-source CI run. This evidence does
not assert results for that later commit. No registry publication or deployment occurred.

## Follow-up: mobile font-swap regression

The first [Linux CI run](https://github.com/ValkyriaWDG/www/actions/runs/36263964911)
failed the unchanged 0.1 CLS limit for `/cs/news`: all three samples were 0.11814349.
[Original CI samples](page-budgets-ci-before-font-fix.json) are retained. The final
screenshot alone did not expose this transient layout defect.

Delaying the actual font responses and selecting a generic Arial fallback reproduced
the wider-fallback behavior on Windows: the game filters lost one row (48 px) when
Barlow Condensed loaded, then the result summary moved onto the previous row.
[Observed source rectangles](font-fallback-diagnosis.json) record the resulting
0.11953 accumulated shift. Native Windows condensed fallback did not expose the same
wrap, explaining why the initial local run passed.

Mobile filter groups now use three equal columns with room for two-line labels; the
result summary has its own row. The CS/EN delayed-font browser regressions failed
before the correction with a 48 px height change and passed afterwards, including
unchanged group height, CLS ≤ 0.1 and unclipped labels. The regular budget runner now
records layout-shift source rectangles to diagnose future failures.

The [new nine-run report](page-budgets-font-fix.json) passed on the same Windows,
Edge 154.0.4258.37 and PostgreSQL 18.4 setup. Source was `1c034dd2347e1e4d7836c39320b0b8ed8bf302be`
plus the uncommitted correction; [source and capture hashes](font-fix-provenance.json)
identify those inputs. This local evidence does not replace a new Linux CI run.

| Route | Median LCP | Maximum CLS | Maximum transfer |
|---|---:|---:|---:|
| `/cs` | 1980 ms | 0.032223 | 524173 bytes |
| `/cs/news` | 976 ms | 0.000758 | 509079 bytes |
| Synthetic published article | 1136 ms | 0.002694 | 604387 bytes |

Production build, lint, typecheck and 30 foundation tests passed. Three new diagnostic
tests prove that rollback failures retain bounded stderr/assertion reasons while
removing generated credentials, database URLs and command arguments. Docker image
build/scan/rollback remain blocked locally and require the candidate's Linux CI.

![Synthetic mobile news after stable filter-row correction](news-font-fix.png)

## Initial local run (historical)

These results use a local production standalone build with synthetic PostgreSQL data,
not the live website. The base commit is `507e704d288cd93d7baa0d1ab22ba8347fd67b0a` with
the uncommitted issue #26 patch. The raw reports explicitly record `sourceDirty: true`;
they do not prove a later commit or Linux CI. [Provenance](provenance.json) records
normalized source hashes and screenshot hashes for this local run.

| Check | Observed result |
|---|---|
| Frozen dependency install | Passed |
| Production build after the emblem loading fix | Passed |
| Lint and typecheck | Passed |
| Dependency-free foundation regression tests | 27 passed, including 8 new budget/scan tests |
| Real PostgreSQL fixtures + nine throttled browser navigations | Passed budget assessment |
| Image build, native image checks, scan comparison, image rollback and restore | Blocked locally by unavailable Docker engine; required Linux CI checks are implemented but not claimed passed |
| Registry publication / deployment | Not performed |

Runtime: Node 24.21.0, Windows PostgreSQL 18.4 and real headless Edge/Chromium
154.0.4258.37. CI uses the locked Playwright Chromium and PostgreSQL 17. See the
[procedure and fixed budgets](../../operations/release-hardening.md) for the exact
network/CPU profile, excluded optional background media and reproduction commands.

| Route | Before median LCP | After median LCP | After maximum CLS | After maximum total transfer |
|---|---:|---:|---:|---:|
| `/cs` | 2756 ms | 2004 ms | 0.032223 | 521971 bytes |
| `/cs/news` | 980 ms | 1072 ms | 0.023926 | 511163 bytes |
| Synthetic published article | 1072 ms | 1340 ms | 0.002694 | 604326 bytes |

The browser identified the emblem as the homepage LCP element. Eager/high-priority
loading brought its median below the unchanged 2500 ms limit. The first after-run home
sample was 3576 ms, so these results do not claim every individual LCP passed. News
and article transfer rose because the persistent emblem now loads eagerly there too;
those bytes are counted. All nine after-run responses were HTTP 200 with zero page
errors, failed/incomplete requests and video requests. This shared local machine's
lab measurements are not production field metrics.

- [Before samples](page-budgets-before.json)
- [After samples and assessment](page-budgets-after.json)
- [Local Docker precheck failure](container-local-attempt.json): stopped at the first
  availability check, with no fixture/image/scan work performed.

These captures show synthetic fixtures and the CSS background fallback. They do not
show the deployed site, game video, authentication or editorial management behavior.

![Synthetic mobile homepage after the loading fix](page-1.png)

![Synthetic mobile news listing](page-2.png)

![Synthetic mobile article with cover, inline image and table](page-3.png)

Before merging or releasing, require the exact candidate's Application/Quality gate,
inspect `page-budgets-*`, `release-rehearsal-*`, `runtime-scans-*` and `sbom-*` artifacts,
and reconcile any platform-dependent results. No runtime size reduction or advisory
count is asserted until the two real Linux image builds/scans complete.
