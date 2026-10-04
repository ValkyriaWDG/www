# Live Logi consumer compatibility

Date: 2026-10-04. Scope: `fix/logi-live-contract` on main
`b112bad0dd530b11d6a9f6df5f831acfed934023`. The PR records its tested head and CI.
Local environment: Windows, Node 24.21.0, pnpm 10.34.5. Test data is synthetic;
the bounded collection probe used the live provider with scoped read credentials.
No credentials, response records, player identities or cursor values are retained here.

## Reproduction and result

The deployed consumer rejected current event/match collection rows with
`unrecognized_keys: ["matchTeams"]`. Its result-summary schema already accepted the
observed data. Separately, a larger initial people scan committed pages before its
whole-pass deadline, then returned `failed / timeout` despite a resumable checkpoint.

| Criterion | Verification | Observed result |
| --- | --- | --- |
| Current team snapshots | Client tests for null, empty and populated snapshots in event/match lists and atomic records | Accepted after the schema change; positive cases failed before it |
| Closed trust boundary | Oversized teams, private extra field, invalid date/revision/name, script/malformed/credentialed logo URLs | Rejected as `invalid_response` |
| Older producer | Existing fixtures omit `matchTeams` | Remain accepted |
| Whole-pass expiry | Commit a page, expire the run during the next request, resume from its stored cursor | `pending`, no partial publication, then `caught_up` with the retained record |
| HTTP timeout | Timeout while the run budget is available | Still `failed / timeout`; lease released |
| Live wire compatibility | Six collection reads, limit 10; refetch up to two returned IDs per collection through the atomic-record client | All six accepted; six HLL atomic records accepted |

The live probe at 18:22:36 UTC accepted 10 HLL event, 10 match and 10 result rows.
Each Wardogs page was empty **with a continuation cursor**. This is not evidence of
an empty guild or a complete scan. Actual response bodies remained in process memory.
All requests were read-only and used the patched strict client, including its
guild/game binding and atomic-record validation. Nonempty Wardogs snapshots were
covered synthetically, not established by this limited live probe.

Reproduce the local regressions from the repository root:

```sh
pnpm install --offline --frozen-lockfile
pnpm --filter @valkyria/web exec vitest run --project unit src/modules/integrations/logi/client.test.ts src/modules/integrations/logi/sync.test.ts src/modules/integrations/logi/mapping.test.ts
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
node scripts/check-foundation.mjs
```

The focused final run passed 68 tests in three files. The full final run passed
1,157 tests in 106 files. Lint, typecheck, foundation and the Next.js/CLI production
build passed. Final current-head CI belongs in the PR; do not infer image or
deployment acceptance from these local checks. PostgreSQL integration, browser and
image verification are CI gates.

To repeat the live check, provision only the existing per-game read scopes. Call
`createLogiClient(...).list(resource, { limit: 10 })` for event, match and result
summaries, then `syncRecord(resource, row.id)` for at most two returned rows. Record
only counts and success/error categories. An empty page with a cursor must continue
during real synchronization. Never log keys, records or opaque cursors.

## Operational boundary

Screenshots: N/A; this changes server-side input validation and checkpoint outcomes,
not UI rendering. The regression tests and sanitized live observations are the proof.
No migration, dependency, runtime configuration, permission or publication-policy
change. Team metadata does not enter the public match DTO. Existing keys and stored
checkpoints can continue after the reviewed image is deployed. Keep the scheduled
runner disabled until manual continuation reaches `caught_up`; inspect provider
configuration failures separately. Login success is not a collector/import proof.
