# Logi verification record

Local implementation checkpoint, 2026-10-02. This record separates deterministic
fixtures, real disposable database checks, actual paired-provider HTTP and browser
behavior. It is not production acceptance. The final source hashes, results and
selected UI attachments are in the [acceptance bundle](../../evidence/logi-integration-2026-10-02/README.md).
Do not treat base commit IDs alone as the tested changed source.

## Completed focused checks

| Boundary | Observed result | Proof scope |
| --- | --- | --- |
| Command HTTP client | 20/20 focused tests passed | Fixed endpoint, closed schemas, bounded reads/deadlines, error classification, 429 Retry-After and unchanged command identity |
| Website command journal/service | 17/17 focused PostgreSQL tests passed | Real encrypted sessions, actor resolution and durable journal; behavioral HTTP stub for the remote command boundary |
| Website Logi authentication | 31/31 focused integration tests passed | Actual Better Auth handler with disposable PostgreSQL; controlled provider responses for identity, callback and current-account checks |
| Webhook inbox | 14/14 focused PostgreSQL tests passed | Actual persistence, concurrent duplicates, signed-ID/body collision, scope/signature/time/size limits, failed commit and bounded processing cutoff |
| Paired Logi -> website SSO | 33/33 local interoperability checks passed | Actual local Logi discovery/JWKS/authorize/token/userinfo and maintained website Better Auth callback with a fresh PostgreSQL database |
| Actor command producer | 22/22 local checks passed | Actual local producer HTTP/Convex command boundary, distinct from the website service's HTTP stub |
| Central logout and concurrent redemption | 16/16 local checks passed | Real browser logout and local provider/database concurrency checks |

The SSO interoperability fixture starts with a newly seeded **synthetic durable Logi
session** and its matching cookie. It proves reuse of an existing central login,
callback/token validation and current-session behavior. It does **not** prove a new
interactive login through live Discord, production guild membership or any hosted
callback registration. All identities and data in these runs were isolated fixtures.

The journal tests cover a remote commit followed by a lost reply, a local receipt
write failure, same-key/body retry, user/source/body collisions, changed game authority,
central revocation, late responses, durable 429 backoff and an exact local-session
check after waiting on a database lock. Replaying the same confirmed operation leaves
one upstream mutation. No actor bearer token is stored in the journal.

The final website suite passed 875 unit and 440 PostgreSQL integration tests, including
the two journal regressions. Website lint, typecheck and optimized build passed.
The local provider suite passed 696 tests, typecheck and webpack production build.
Scoped provider lint had no errors and one pre-existing unused OpenAPI helper warning.
The actual optimized website browser flow passed 19 checks and two additional visual
checks; the preceding-schema upgrade passed six assertions.

Additional implemented tests cover membership freshness and game grants, final
scheduled-publication fences, exact decimal revisions above JavaScript's safe-integer
range, leases/checkpoint compare-and-swap, rollback, explicit tombstones, partial reset
visibility and removal of retired generations. They are included in the final full
suite and changed-source manifest; focused counts are not additional full-suite tests.

## Reproduce website checks

Use the repository's pinned Node/pnpm toolchain. Integration tests require an explicitly
selected **disposable PostgreSQL instance** whose test role can create/drop the template
and worker databases. Set `DATABASE_URL` through a protected local environment; never
point the integration runner at production or a shared application database. Missing
database configuration fails the run rather than silently skipping tests.

From the repository root:

```sh
node scripts/check-foundation.mjs
pnpm --filter @valkyria/web lint
pnpm --filter @valkyria/web typecheck
pnpm --filter @valkyria/web test:unit
pnpm --filter @valkyria/web exec vitest run --project integration --maxWorkers=4
pnpm --filter @valkyria/web build
```

Focused commands for the boundaries above:

```sh
pnpm --filter @valkyria/web exec vitest run --project unit src/modules/integrations/logi-command-client.test.ts src/modules/integrations/logi/client.test.ts src/modules/integrations/logi/mapping.test.ts src/modules/integrations/logi/sync.test.ts src/modules/access/logi-grants.test.ts
pnpm --filter @valkyria/web exec vitest run --project integration tests/integration/auth-logi.test.ts tests/integration/logi-membership.test.ts tests/integration/logi-store.test.ts tests/integration/logi-webhook.test.ts tests/integration/logi-command-service.test.ts
```

The integration global setup applies committed migrations to a fresh template. Release
qualification must also exercise the bundled CLI in the actual built image; this
slice verified the preceding-schema upgrade and built CLI locally, without an image.
Run `logi:sync` with private synthetic data and publication disabled first, as
specified in the [operator runbook](runbook.md).

## Final delivery gates

| Gate | State at this documentation checkpoint |
| --- | --- |
| Combined website lint, typecheck, unit/integration/build on final source | Passed; 875 unit / 440 integration |
| Complete paired-provider suite on final source | Passed; 33 SSO / 22 native commands; 696 provider regression tests |
| Additive migration: fresh and preceding-schema upgrade | Passed; fresh integration template and six upgrade assertions |
| Bundled `logi-sync.mjs` execution | Passed on the local optimized source build |
| Built container execution/scan | Not run; release acceptance remains open |
| CS/EN login, public match list/detail and connected editor in desktop/mobile browser | Passed; 19 behavior assertions and two visual checks |
| Selected captures, captions and exact changed-source manifest | Stored in the linked acceptance bundle |
| Independent boundary review | Completed; corrections and scope recorded in the acceptance bundle |
| Current PR-head CI | See exact-head run in the PR discussion; local results do not substitute for it |
| Hosted OAuth/roles/collectors, production migration, scheduler and deployment | Not performed; separate activation acceptance |

Visible changes require real application screenshots; backend tests do not replace
those captures. Each attachment must identify the safe scenario, locale, route,
viewport/browser and tested revision. Server-only transaction/protocol checks use test
assertions and sanitized outcomes as proof; screenshots are not evidence of those
hidden boundaries. Follow the [evidence policy](../../engineering/evidence.md), and
keep private credentials, session material and security qualification reports out of
public artifacts.

## Remaining capability limits

The website reads the supplied match/results/server summaries and writes eligible
event create/update/cancel commands. This is not a roster, signup, attendance, result
editing or server-control interface. The new public server projection does not export
live player names or advanced statistics. No fixture proves unavailable completed-match
or three-team facts. Activation remains off by default and publication requires explicit
source/game/server approval described in the [contract](contract.md).
