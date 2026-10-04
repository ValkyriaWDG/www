# Logi membership refresh recovery and sparse change-feed catch-up

## Intermittent membership denial

The production account could authenticate through Logi while its subsequent access
check reported unavailable membership. A bounded read-only probe at 20:03:28 UTC
reproduced HTTP 200 `present` for HLL in 1,440 ms alongside HTTP 200 `unknown` for
Wardogs in 613 ms. Current Logi source (`9d460e0`) shares the Discord member refresh
lease by guild and subject, across game grants. A sibling request can therefore
receive `unknown` while the first refresh is still running. Separate probes also
observed genuine four-second timeouts; those are a different failure and remain
fail-closed.

The consumer now waits for both initial game reads, then rechecks only validated
`unknown` results once with that game's original restricted key and freshness
requirement. It does not retry HTTP errors, verified absence or a valid empty role
set. Requests retain four-second timeouts, with an eight-second aggregate bound.
Epoch/revision ordering, final stored-evidence/session checks and request-level
grant revalidation remain unchanged. There is no cross-request authority cache.

At 20:19:10 UTC the **actual patched reader**, bundled as an isolated read-only
diagnostic in the website runtime, recovered this live race: HLL initially returned
`unknown`, Wardogs returned `present`, then only HLL was reread and returned
`present`. Total time was 1,642 ms. The [sanitized response sequence](membership-refresh-live-proof.json)
contains no subjects, role IDs or credentials. This is live provider recovery proof,
**not a deployed website change or a completed production login acceptance**.

The account warning also names the configured membership provider (`Logi` or
`Discord`), independently of the sign-in method. Its layout is unchanged. Targeted
browser capture of the changed Logi warning remains unperformed; private account
screenshots are not public repository artifacts.

```sh
pnpm --filter @valkyria/web exec vitest run --project unit src/modules/access/logi-membership-reader.test.ts src/modules/integrations/logi/client.test.ts src/i18n
pnpm --filter @valkyria/web exec vitest run --project integration tests/integration/logi-membership.test.ts
```

RED: the old one-round reader failed three of ten regression cases. GREEN: all ten
reader cases pass, including scoped recovery, continued unknown, verified departure,
empty roles, wrong subject, stale observations, 401/403/429/503 and timeout. The
reader/client/i18n command passes 70 tests; the full unit suite passes 1,180 tests.
Lint, typecheck and the production build also pass. Independent auth review found no
actionable issue. The added real-database two-game recovery case and existing
revocation/session regressions require the final-head CI PostgreSQL environment;
they were not run against a production database or an unavailable local database.

## Observed production behavior

Base: accepted source `9279c0f77a010e732dc5e24987c34fcb3370aca9`, deployed
2026-10-04 at 19:24:37 UTC by the dedicated Watchtower after the standard
[qualified publication](https://github.com/ValkyriaWDG/www/actions/runs/37226612670).
OCI digest:
`sha256:cfa43d2210e7c2c1eff55d86e35d2649a1f077b8b1e9943916a502a5623f6022`.

At 19:30:38 UTC the accepted image, unchanged runtime/mount/network/security
configuration, running updater and HTTP 200 live/readiness/CS/HLL/WDG routes were
verified. Fresh browser Logi authentication and protected administration succeeded.
The first protected response reported unavailable membership, then account/admin
reads recovered without changing authority. The read-only HTTP probe also required
an identifiable User-Agent; Python's default agent received 403.

Four bounded manual import passes resumed the existing checkpoints. The original
contract rejection was gone, but all scopes remained in replay. At 19:39:28 UTC the
diagnostic revision gaps were 23,779 / 23,707 for HLL/WDG data and 22,837 / 22,087
for people. At 19:41:11 the HLL data gap was 23,697 after another eight steps.
Revision gaps are diagnostic positions, **not** counts of relevant records. One
later people request timed out before its run deadline and correctly remained a
transport failure with durable backoff; it was not reclassified as successful.

The producer's `/changes` endpoint limits **scanned guild rows**, then filters by
game and authorized resource. Empty filtered pages with a continuation are normal.
Skipping them or replacing the replay boundary would lose changes and is not a fix.

## Change and invariants

- Change scans accept an explicit integer limit from 1 through 100; returned hint
  count cannot exceed the requested or reported bound. Resource/game checks remain.
- Replay starts at ten rows. An empty nonterminal page expands later scans to 100.
- If an expanded page has over ten hints, reread from the **unchanged** cursor at
  ten. Never commit the larger continuation. Atomic refetch concurrency remains
  four, with at most ten hints per commit.
- Data passes permit 100 steps inside the existing 25-second deadline. People
  retain 100 steps/50 seconds. Leases, retries and 429 handling are unchanged.
- No schema migration, stored-checkpoint change, runtime flag, new grant or public
  projection is introduced. A normal redeploy resumes saved checkpoints.

## Reproduction and verification

```sh
pnpm --filter @valkyria/web exec vitest run --project unit src/modules/integrations/logi/sync.test.ts src/modules/integrations/logi/client.test.ts
pnpm --filter @valkyria/web exec vitest run --project integration tests/integration/logi-runner.test.ts
```

The second command requires an isolated PostgreSQL test environment, never a
production database. CI provides the real database boundary.

| Scenario | Expected / observed local result |
| --- | --- |
| 24,001-position sparse feed | Baseline remains pending after three 100-step passes; patch catches up in three passes and at most 250 requests, preserving the old active generation until completion |
| Sparse-to-dense transition | Larger page reread at the same cursor; all 100 relevant identities fetched exactly once in batches of at most ten; no partial promotion |
| Dense-page reread returns 429 or 503 | Error preserved, prior committed cursor retained, no missing identities inferred |
| Invalid scan limit or oversized response | Fail before HTTP for invalid requested size; reject response exceeding either bound |
| Persisted PostgreSQL data replay | Added integration case resumes through more than eight filtered pages and promotes only at the terminal cursor; hosted result pending |

RED: eight new assertions failed on the unmodified base implementation. GREEN:
72 targeted unit tests, all 1,170 unit tests, lint, typecheck, production build and foundation checks
passed on Windows with the implementation. Independent review found no actionable
correctness or security issue; its documentation consistency note was corrected.
Local PostgreSQL integration was not run because the isolated database runtime was
unavailable. Hosted current-head CI results are recorded in the PR before
acceptance; neither an unrun database test nor a pending CI job is passing proof.

Screenshots: **N/A for the batching change**, which changes no UI. Synthetic cursor,
atomic-refetch, checkpoint and real-database tests are the relevant proof. Private
production account screenshots and credentials are not repository artifacts.

## Release and remaining acceptance

The website patches are not deployed production proof. Require current-head Quality gate,
independent review and the standard accepted-main publication workflow. Preserve
existing checkpoints and runtime; do not replace the image with an ad hoc build.
After deployment, finish bounded manual imports until all four scopes are caught
up, then enable the already-prepared timer and verify a scheduled pass. Keep public
Logi publication, commands and webhooks disabled during that acceptance.
Also verify a new browser login, account membership and protected administration.
Real provider outages still deny access; bounded refresh recovery is not an outage
bypass. The earlier sparse-only CI run is not final-head evidence for the auth fix.

Provider HLL/Warcon collectors remain a separate hosted configuration dependency.
They had no successful observation/import at the last UI read. Preserve the current
direct HLL CRCON reader. The earlier `matchTeams` stored-JSON rollback boundary is
unchanged; use its [compatible roll-forward procedure](../logi-live-contract-2026-10-04/README.md).
