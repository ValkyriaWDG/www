# One public match browser

## Problem and resulting behavior

PR #108 exposed connected history in a second browser above the original archive.
The owner rejected separate source-labelled groups. Public visitors now use one
Upcoming/Results control, search, count, chronological list and paginator for all
eligible matches. Exact reviewed archive associations occupy one row and their
primary link opens the original detail, preserving rounds and statistics.

The ordered database window is merged with the filtered public projections before
paging. The window includes enough original records for every connected insertion;
it neither pages the two sources independently nor truncates the original archive.
All records retain their game, publication and availability boundaries. Missing
scores remain unknown, zero remains zero, and provisional results stay labelled.
Source provenance remains useful on details; it is not a separate public group.

## Tested implementation and local acceptance

Implementation: `e547be03c8a5611f1c48621da2e9b2d8b17ceef2`, based on deployed
`746b62a95e5fc11e9c061ce3d45a72ec7e669446`. The following evidence-only commit
does not change application behavior. Environment: Windows, Node 24.21.0, pnpm
10.34.5, Chromium, actual standalone production build and disposable PostgreSQL 15.
All browser fixtures are synthetic. The test database contains no production data.

| Acceptance | Executed check | Observed result |
| --- | --- | --- |
| One collection across sources | Dedicated Logi Playwright suite | 8/8 passed; one search/table/count/paginator, original fixture interleaved chronologically, 10 then 3 rows |
| CS/EN and desktop/mobile | Same suite, 1440x900 and 390x844 | Passed; captions below, no page overflow, axe checks passed |
| Search, deep pages and original URLs | Same suite | Search spans both sources; filter resets page; an out-of-range page is empty; linked primary route opens original maps/statistics |
| Current result agrees with preview | Same suite | First row and preview show reviewed 0:5; original detail retains its separate historical 3:2 evidence |
| Persisted publication and game boundaries | `vitest run --project integration tests/integration/logi-match-links.test.ts` | 3/3 real PostgreSQL cases passed, including 14 interleaved matches across five pages and unavailable-provider archive fallback |
| Existing website browser | `playwright test e2e/public-matches.spec.ts` | 12/12 passed against final build |
| Window completeness and orchestration | Full unit suite | 1,235 tests passed in 114 files; ascending/descending/tie/deep-page oracle and linked-detail view regression covered |
| Code and standalone build | Web lint, typecheck, `pnpm build` | Passed |
| Independent review | Read-only implementation review | No remaining actionable findings; preview score, detail back-view and CI artifact-path findings fixed before final checks |

Reproduce from this checkout with `DATABASE_URL` pointing only to a disposable
PostgreSQL instance:

```sh
pnpm --filter @valkyria/web lint
pnpm --filter @valkyria/web typecheck
pnpm --filter @valkyria/web test:unit
pnpm --filter @valkyria/web exec vitest run --project integration tests/integration/logi-match-links.test.ts
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
records the original reproduction. These new full-page captures show the corrected
application with invented data. Capture timestamps and routes are in adjacent JSON
sidecars, all pinned to the implementation SHA above.

| Capture | Expected and observed state |
| --- | --- |
| [Czech desktop](history-cs-1440.png) | `/cs/hll/matches?view=results`, 1440x900 viewport; one list, original fixture in its chronological position, same current result in row and preview |
| [Czech mobile](history-cs-390.png) | Same route, 390x844; single stacked list, one paginator and fully visible results without horizontal overflow |
| [English desktop](history-en-1440.png) | `/en/hll/matches?view=results`, 1440x900; one translated collection and shared search/count |
| [English mobile](history-en-390.png) | Same English route, 390x844; one compact collection with readable names, results and navigation |

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
