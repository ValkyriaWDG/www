# Public Logi data and archive reconciliation

## Problem and behavior

The accepted website could spend hours replaying a change boundary captured before
an interrupted bootstrap, keeping data projections unavailable. Imported historical
scores also remained invisible because the public adapter only used reviewed result
summaries. Existing archive records and duplicated provider imports needed explicit
identity handling without losing old URLs, recaps or statistics.

- An incomplete generation ages out after 30 minutes and starts a **full replacement**
  (fresh boundary, every collection, authoritative refetch, replay, atomic promotion).
  Live generations keep incremental polling. The last complete generation survives
  renewal, errors and provider resets. Repeated change hints coalesce by exact scoped
  identity/revision before the bounded dense-page decision.
- Reviewed results win; otherwise supplied imported results are visibly provisional.
  Null remains unknown, zero remains zero, supplied end times are labelled accurately,
  and captured team names/sides are projected without logos or private fields.
- Connected history has independent paging and search. Both home pages select the
  next eligible match across the archive and published current Logi projections.
- Reviewed `matchLinks` bind exact event IDs to same-game published archive UUIDs.
  A fresh linked row replaces only its duplicate list entry; the original detail,
  result and statistics remain intact. Provider unavailability restores the archive.
- Explicit `matchAliases` collapse only currently identical facts in one authority.
  Conflicting scores, missing canonical records or another scope remain independent.
  Hidden alias URLs temporarily redirect; no permanent identity rewrite is assumed.

## Reproduction and observed checks

Tested on branch `fix/logi-public-data`, based on accepted `cf70d557`, Node 24,
Windows, standalone Next.js and a dedicated disposable PostgreSQL 15 instance.
Production data was not used for test fixtures. Exact accepted commits and the
Linux/PostgreSQL 17/image gates are recorded by the pull request's required CI.

```sh
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
# DATABASE_URL must be a disposable PostgreSQL instance.
pnpm --filter @valkyria/web exec vitest run --project integration --maxWorkers 2
CAPTURE_EVIDENCE=1 pnpm --filter @valkyria/web exec playwright test -c playwright.logi.config.ts
node scripts/check-foundation.mjs
```

Local lint, typecheck, production build and **1,232 unit tests** passed. Six focused
real PostgreSQL cases passed, covering persistent generation renewal/promotion and
archive link/fallback behavior. The full 520-case PostgreSQL pass completed 518
successes; one archive assertion ran while its implementation was being updated,
and one existing double-fixture-load case exceeded 30 seconds over the remote test
connection. Both affected files then passed (6/6) against the final code with one
worker and a local-only `--testTimeout 60000`. The repository/CI timeout was not
changed; this is not a claim that the first full pass was green.

All **eight dedicated browser tests passed** after the mobile layout correction.
The dedicated browser suite runs the actual standalone application against invented
public projections in a separate `_logi_e2e` database. It verifies CS/EN at 1440 and
390 px, score/provenance precedence, unknown status, captured teams, old archive URLs
and maps, paging/search, alias redirect, upcoming Wardogs and both home links. Axe
checks the connected browser and assertions check page overflow and mobile result
visibility. These tests are part of the required Application CI job. Expected video
404s and server messages from canceled navigation/prefetch streams are not counted
as provider or login acceptance; asserted page errors remain empty.

Independent implementation review found two issues, both fixed: the shared game
filter must remain visible with an empty archive list, and linked rows must retain
archive opponent/competition metadata for search. Sync generation/lease/CAS and
scoped identity handling were also reviewed. The hosted Codex security scan did
**not** run.

## Captioned browser evidence

Screenshots are from synthetic local browser acceptance, not the production Logi
tenant. The first reviewed result is deliberately 0:5 while its imported fallback
is 5:0, proving precedence. The linked archive deliberately retains its old 3:2 and
map/statistic detail. This tests preservation, not a claim those conflicting records
should be linked by a production operator.

| Capture | Expected visible behavior |
| --- | --- |
| [Czech history, desktop](history-cs-1440.png) | Imported provisional and reviewed results, supplied end times, archive association |
| [Czech history, mobile](history-cs-390.png) | All result and archive fields visible without horizontal scrolling |
| [English history, desktop](history-en-1440.png) | English result/provenance labels and independent pagination |
| [English history, mobile](history-en-390.png) | Same facts and links at 390 px |
| [Czech archive, desktop](archive-cs-1440.png) | Current Logi result alongside unchanged original result, rounds and statistics |
| [Czech archive, mobile](archive-cs-390.png) | Both sources remain legible on a narrow screen |
| [English archive, desktop](archive-en-1440.png) | Original archive route and metadata retained |
| [English archive, mobile](archive-en-390.png) | Preserved archive and connected result on mobile |
| [Upcoming Wardogs](wardogs-three-teams-en-1280.png) | Three supplied teams/sides; no fabricated score |

## Live inventory and acceptance boundary

Bounded read-only production inventory on October 5 returned 68 HLL match summaries,
66 imported provisional result payloads and one reviewed result, plus one upcoming
Wardogs match. These are record counts, not unique games: repeated imports exist.
Both server connections were enabled/current; HLL retained-history health still
reported `network`, while Wardogs returned five completed retained games.
At 17:54 UTC, three further bounded GETs passed the consumer's real strict schemas:
Warcon live (fresh), recent matches and all five retained games, with matching
connection/source/guild scope. See the [sanitized contract proof](reader-contract-proof.json).
That process did not write a database, change a checkpoint or activate publication.

Private operator evidence records 29 exact archive associations using shared game
identity, timestamps, scores and single-round coverage, and 26 duplicate identity
groups. One conflicting result pair remains separate. Runtime IDs/keys and private
production records are not in this repository. A returned connection ID is not a
retained-history source ID; the latter was checked against returned records and the
producer's canonical source-identity hash. No association is inferred from a panel
UUID, display name or calendar date.

This evidence does not yet establish new-image production publication, complete
catch-up, scheduled synchronization or public server/history acceptance. Those
checks follow the approved release and are recorded separately. Existing SSO and
membership authorization are unchanged; real provider timeouts continue to fail
closed. HLL direct CRCON remains its richer public live reader. Commands, webhooks
and public player-history names are not enabled by this change.

## Deployment and rollback

No SQL migration is added. Use the standard main-only publication workflow and its
required environment approval, with the exact accepted main SHA. Verify the digest,
OCI source revision, production channel, running image, health and preserved runtime,
mounts, network/security settings and Watchtower before activating public bindings.

New pending checkpoints contain `bootstrapStartedAt`; older strict consumers reject
that JSON, including after promotion. Older strict config readers also reject
`matchLinks`/`matchAliases`, and the prior `matchTeams` projection boundary remains.
Do not attempt an old-image-only rollback. Retain protected pre-release runtime and
database evidence, keep publication disabled if a reader cannot prove current complete
projections, and use a compatible roll-forward. Never rewrite checkpoints, skip a
cursor, promote partial data, weaken schema/authorization or use a broad legacy key.

After the new image, run official bounded nonconcurrent `logi-sync.mjs` passes from
the persisted checkpoints, respecting backoff. Renewal is normal application
protocol, not an operator DB edit. Enable the existing marker/timer only after all
four configured initial scopes have completed and caught up; verify a real scheduled
run. Publish only the reviewed sources/connections, preserve the direct HLL reader,
and check CS/EN public pages, archive URLs, current server state and retained history.
