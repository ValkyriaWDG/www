# Prose game-scope concurrency regression

Captured on 2026-09-28 during PR #37 integration with main. Source fingerprints in
[`proof.json`](proof.json) identify the exact tested service, regression and migration;
this evidence predates the merge commit and is not an exact-head Linux CI result.

The original service checked the match/member game before starting its mutation
transaction. A concurrent owner move could therefore allow an HLL-only principal to
save, publish, unpublish or restore prose after its owner became out of scope. The fix
takes an owner `FOR SHARE` lock before the translation `FOR UPDATE` lock, rechecks the
game under that lock and keeps it until commit. Denials use the outer audit connection
so their audit records survive rollback.

The regression uses real PostgreSQL row locks. A blocker holds the owner and translation
while the scoped mutation starts, then commits a match move to Wardogs or adds Wardogs
to a member's affiliations. `pg_stat_activity` confirms the competing query is blocked;
there is no guessed timing delay or mocked database. All eight owner/action cases
require a forbidden result, unchanged full translation/revision snapshots and one
durable game-scope denial.

| Evidence | Result |
| --- | --- |
| [Original service regression](red.json) | 8 failed, 0 passed: each mutation incorrectly succeeded instead of denying access |
| [Patched service and neighboring regressions](green.json) | 33 passed, 0 failed, 0 skipped |
| [Migration, old-schema upgrade and production seed](migration-seed.json) | 12 passed, 0 failed, 0 skipped |
| Scoped ESLint and application typecheck | Passed |

Environment: Windows, Node 24.21.0, PostgreSQL 18.4, isolated synthetic database namespace
created only after an absence check. All owned worker/template databases and the base
were removed; the owned PostgreSQL instance was stopped in smart mode. No production,
Discord or external identity provider was contacted. No screenshot is applicable to
this database authorization regression.

From `apps/web`, with `DATABASE_URL` pointing only to a newly allocated disposable test
database:

```sh
pnpm exec vitest run --project integration tests/integration/prose-game-scope-race.test.ts tests/integration/prose-translations.test.ts tests/integration/game-scope.test.ts tests/integration/authority-fences.test.ts
pnpm exec vitest run --project integration tests/integration/fixtures-schema-compat.test.ts tests/integration/seed-production.test.ts tests/integration/migrations.test.ts
pnpm exec eslint --max-warnings=0 src/modules/prose/service.ts tests/integration/prose-game-scope-race.test.ts
pnpm run typecheck
```

The original red run executed the new regression alone before editing the service. The
committed JSON files are normalized extracts of the captured Vitest reports: counts,
test names, outcomes, durations and first failure lines. Absolute machine paths and
stack traces are omitted. Each extract records its original report hash; `proof.json`
also hashes the extracts and records LF-normalized source hashes.

Limits: migration/seed tests prove synthetic upgrade and idempotence, not a production
data import or live provider setup. A previous image predating the new `games` column
ignores scoped local grants; image-only rollback must keep authentication disabled if
such grants have been created. Exact-head Linux CI and image upgrade/rollback gates
remain required before deployment.
