# Publication and request authorization fences

Scope: provider-independent extraction from PR #35, based on main
`b37931393cd9b836415724d9572765f8615c31e8`. The former custom bot transport,
receiver/migration/tables, paired-bot CI and obsolete captures are not part of this
candidate. Historical evidence remains accessible in original commit
`0764ff996f31d51a6710f8b982fc1f1744499c28`; it does not verify hosted Logi.

## Acceptance and reproduction

Use a disposable PostgreSQL instance and a unique database prefix. No credentials,
live guild, production database or provider endpoint is needed. From the repository:

```sh
pnpm --filter @valkyria/web exec vitest run --project integration tests/integration/authority-fences.test.ts tests/integration/auth-membership.test.ts
pnpm lint
pnpm typecheck
pnpm test:unit
node scripts/check-foundation.mjs
node --test scripts/tests/*.test.mjs
```

Set `DATABASE_URL` through the local environment; never copy its value into proof.
The integration harness creates and removes isolated migrated template/worker
databases under the selected prefix. Tests use actual SQL locks and inspect
`pg_stat_activity` to wait for a blocked statement, not arbitrary sleeps.

| Criterion | Observed proof |
|---|---|
| Interactive authority after awaited mapping | Committed departure, role removal, same-time revoke/restore and durable session deletion deny `content.publish`. |
| Same-value update detection | Ephemeral row equality changes even for two updates in the same transaction with unchanged application timestamps/values. |
| Publication under contention | A membership change while waiting for the content lock blocks the saved publication; the old live revision remains unchanged. |
| Local recovery | An unchanged valid local grant publishes without a provider; revoked/version-changed grants block the intent after the content wait. |
| Freshness at the final commit boundary | A 59-second observation becomes 61 seconds old while the audit write is blocked; the live pointer rolls back and the intent is blocked. |

The PostgreSQL `xmin`/`ctid` equality token is transient and server-only. It is not
stored in a database column, exported, treated as a provider sequence or relied on
as a permanent identity. Ordinary reads do not hold a lock over subsequent user
actions; those actions still require their own server authorization. Upstream
changes cannot be denied before they are observed. Existing freshness policy applies.

## Verification record

Local environment: Windows, Node 24.21.0, pnpm 10.34.5, disposable PostgreSQL 18.4
on loopback. All identities, grants, sessions and content are synthetic. No network
calls reach Discord or Logi. See [results](results.json) for the exact source-file
fingerprints, commands and check outcomes; matching committed-head CI is a separate
delivery gate.

- Final focused regressions: **11/11 passed**. The same fixture against main's four
  runtime modules produced **10 failures and one passing valid-local-grant control**;
  nine failures exercise denied authority/publication, one checks row-version ABA.
- Related real PostgreSQL coverage: **117/117 passed** across seven files (HTTP auth,
  local recovery, membership, request policy, authority fences, publisher, migrations).
- Lint, typecheck, the 713-file foundation check, 19 foundation tests and staged/working
  whitespace checks passed.
- Broad Windows unit run: **370 passed, four failed**. Three unchanged presskit tests
  compare Windows path separators with manifest paths; the unchanged media-symlink
  test fails with `EPERM`. These were not skipped, weakened or counted as passed.

**Screenshots: N/A.** This diff changes server authorization/transactions only, not
pages, layouts or UI controls. The proof is denied capability, blocked schedule and
unchanged live pointer in the real database, including deterministic concurrent
transactions. Previous custom-bot screenshots are not reused as this feature's proof.

No application build/browser/container, hosted provider acceptance or production
operation is claimed by the local regression run. No schema migration is required.
Issues #8 and #23 remain open for their actual provider/operational criteria.
