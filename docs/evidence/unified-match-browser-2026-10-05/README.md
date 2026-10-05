# One public match browser

## Problem and resulting behavior

PR #108 exposed connected history in a second browser above the original archive.
The owner rejected separate source-labelled groups. Public visitors now use one
Upcoming/Results control, search, count, chronological list and paginator for all
eligible matches. Exact reviewed archive associations occupy one row and their
primary link opens the original detail, preserving rounds and statistics.

That canonical detail now uses the fresh, explicitly linked Logi date, status and
result as its primary facts, as do its preview and social image. It does not show
a second source table or fill a current unknown result with an older local score.
All captured teams, codes and supplied sides remain visible on mobile. Original
rounds, historical statistics, recordings and editorial context remain attached.
The old linked provider URL redirects to the original published match URL; public
people remain subject to the existing consent, game and freshness gates.

The ordered database window is merged with the filtered public projections before
paging. The window includes enough original records for every connected insertion;
it neither pages the two sources independently nor truncates the original archive.
All records retain their game, publication and availability boundaries. Missing
scores remain unknown, zero remains zero, and provisional results stay labelled.
Source provenance remains useful on details; it is not a separate public group.

## Tested implementation and local acceptance

Final implementation: `f909b2dcb72c856a4fb15e26ac6f237a9d1a8a97`, based on deployed
`746b62a95e5fc11e9c061ce3d45a72ec7e669446`. The following evidence-only commit
does not change application behavior. Environment: Windows, Node 24.21.0, pnpm
10.34.5, Chromium, actual standalone production build and disposable PostgreSQL 15.
All browser fixtures are synthetic. The test database contains no production data.

| Acceptance | Executed check | Observed result |
| --- | --- | --- |
| One collection across sources | Dedicated Logi Playwright suite | 10/10 passed; one search/table/count/paginator, original fixture interleaved chronologically, 10 then 3 rows |
| CS/EN and desktop/mobile | Same suite, 1440x900 and 390x844 | Passed; captions below, no page overflow, axe checks passed |
| Search, deep pages and original URLs | Same suite | Search spans both sources; filter resets page; an out-of-range page is empty; linked primary route opens original maps/statistics |
| One authoritative result and canonical detail | Same suite | Row, preview and primary detail show reviewed Axis 0 / Allies 5; no competing 3:2 primary result. End time stays labelled, unknown status stays unknown, original map rounds remain attached |
| Mobile captured teams | Same suite, Wardogs at 390x844 | Three team names, short codes and supplied sides survive the canonical redirect even without public people data |
| Persisted publication and game boundaries | Focused `logi-match-links.test.ts` and `social-images.test.ts` integration suites | 7/7 real PostgreSQL cases passed, including 14 interleaved matches across five pages, unavailable-provider archive fallback, social result precedence and withdrawal before cache lookup |
| Social image freshness | Unit, PostgreSQL and real ImageResponse rendering | Labelled zero/unknown scores, corrected/provisional state and supplied end time agree with the detail. Changing an imported score with unchanged event timestamps and no result version changes both OG/Twitter image URLs |
| Existing website browser | `playwright test e2e/public-matches.spec.ts` | 12/12 passed against final build |
| Window completeness and orchestration | Full unit suite | 1,245 tests passed in 116 files; ascending/descending/tie/deep-page oracle, exact binding, unknown result and linked-detail/metadata regressions covered |
| Code and standalone build | Web lint, typecheck, `pnpm build` | Passed |
| Independent review | Read-only implementation and final fixes review | No remaining actionable findings; conflicting detail authority, retained mobile teams and imported-score URL invalidation fixed and independently rechecked |

Reproduce from this checkout with `DATABASE_URL` pointing only to a disposable
PostgreSQL instance:

```sh
pnpm --filter @valkyria/web lint
pnpm --filter @valkyria/web typecheck
pnpm --filter @valkyria/web test:unit
pnpm --filter @valkyria/web exec vitest run --project integration tests/integration/logi-match-links.test.ts tests/integration/social-images.test.ts
pnpm build
CAPTURE_EVIDENCE=1 pnpm --filter @valkyria/web exec playwright test -c playwright.logi.config.ts
E2E_PORT=3500 pnpm --filter @valkyria/web exec playwright test e2e/public-matches.spec.ts
node scripts/check-foundation.mjs
```

The full PostgreSQL suite, Linux image gates and current-head Quality gate are
required in CI; the focused local pass does not stand in for them. A hosted Codex
security scan was not run. Browser assertions observed no page errors. Canceled
prefetch/navigation streams can still produce server log messages, which are not
provider or hosted authentication acceptance.

## Inspected browser captures

The [previous separated history](../logi-public-data-2026-10-05/history-cs-1440.png)
records the original reproduction. All captures use invented data. The four list
captures below remain pinned to the earlier list implementation `e547be03`; their
behavior is also covered by the final 10-test pass. The new detail and actual social
renderer captures are pinned to `f909b2d`. Adjacent JSON records full revisions,
capture timestamps, routes or test origin, and image hashes.

| Capture | Expected and observed state |
| --- | --- |
| [Czech desktop](history-cs-1440.png) | `/cs/hll/matches?view=results`, 1440x900 viewport; one list, original fixture in its chronological position, same current result in row and preview |
| [Czech mobile](history-cs-390.png) | Same route, 390x844; single stacked list, one paginator and fully visible results without horizontal overflow |
| [English desktop](history-en-1440.png) | `/en/hll/matches?view=results`, 1440x900; one translated collection and shared search/count |
| [English mobile](history-en-390.png) | Same English route, 390x844; one compact collection with readable names, results and navigation |
| [Czech detail desktop](detail-cs-1440.png) / [mobile](detail-cs-390.png) | Original canonical match route; one current 0:5 primary result, all captured teams and explicit end time; original maps and historical statistics retained below |
| [English detail desktop](detail-en-1440.png) / [mobile](detail-en-390.png) | Same authority and retained enrichment in English, no separate connected-match result table |
| [Wardogs three-team mobile detail](detail-wardogs-en-390.png) | All three captured teams, short codes and sides, without requiring public roster data; unknown result remains a dash |
| [Czech social card](social-cs.png) / [English social card](social-en.png) | Actual 1200x630 renderer output, labelled current 0:5 corrected result and end time, preserved original map artwork |
| [Long social card](social-long-en.png) | Long synthetic title and 16 participants; bounded three-row preview distinguishes zero/unknown and declares the remaining 13 |

## Production boundary and release handoff

Read-only preflight at 2026-10-05 19:51 UTC confirmed production still running
`746b62a95e5fc11e9c061ce3d45a72ec7e669446`, digest
`sha256:5ac55ad0345412ba02e5b14b2540f15782180c6f8e03e7364c84172ed605d45c`.
The web container was healthy, Watchtower was running and the already authorized
minute sync timer/marker were active. All five checked public/health routes returned
200. A protected private baseline records environment, mounts, networks and security
for comparison after the next accepted deployment; its contents are not published.

This change has no SQL migration, credential/runtime/sync change or authorization
change. The existing known upstream HLL player-statistics failure stays visible;
incomplete generations are not promoted. The canceled chat monitor stays canceled.
Release must use exact-head required CI and the standard main-only publisher with
`expected_sha`, followed by digest/revision verification and actual production UI
checks. PR evidence will record that acceptance; these synthetic captures alone do
not prove production deployment.
