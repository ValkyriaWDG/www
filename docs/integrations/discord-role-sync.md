# Discord role-sync receiver

The website implements `POST /api/integrations/discord/role-sync` (no locale prefix).
It is disabled by default. Paired delivery is owned by [website #8](https://github.com/ValkyriaWDG/www/issues/8)
and [bot #5](https://github.com/ValkyriaWDG/bot/issues/5). Offline contract/browser proof
does not enable live Discord, deploy the receiver, or establish real guild acceptance.

## Trust and wire contract

The website owns OAuth, sessions, guild-role mappings and access policy. Events never
create/link an account, issue a session, grant owner, or supply positive authorization.
Only the stable configured guild and string Discord IDs are accepted. Names and email
addresses are not identity keys. No browser token or bot secret is exposed to the UI.

The strict v1 body contains exactly `schemaVersion: 1`, `eventId` (UUID), `guildId`,
`userId`, unique `roleIds` (at most 250), `membershipState` (`present`/`left`),
`observedAt` (UTC ISO timestamp ending in `Z`) and `sequence` (positive decimal string,
at most 30 digits). Snowflakes use the paired bot's positive 1–20 digit string format.
Departure requires an empty role list. Body size is limited to 65,536 bytes; UTF-8 is
validated and streaming reads have a five-second deadline. Compression is not accepted.

Headers are `Content-Type: application/json`, `X-Valkyria-Key-Id`, `X-Valkyria-Timestamp`
(Unix seconds), `X-Valkyria-Nonce` (32 lowercase hex characters) and
`X-Valkyria-Signature` (64 lowercase hex characters). Authenticate the exact bytes:

```text
HMAC-SHA256(secret, "POST\n/api/integrations/discord/role-sync\n" +
  keyId + "\n" + timestamp + "\n" + nonce + "\n" + rawBody)
```

The URL cannot include a query. Envelope time must be within five minutes of receipt;
the transaction rechecks this after waiting for its lock. Observations more than five
minutes in the future are rejected. Old observations may invalidate authority but never
become fresh grants. Compare signatures in constant time, before parsing body fields.

## Durable application and acknowledgements

Migration `0001_role_sync.sql` adds three private tables and
`guild_membership.authorization_generation`:

| Storage | Invariant |
|---|---|
| `discord_role_sync_nonce` | Unique producer/nonce across keys and application processes. |
| `discord_role_sync_receipt` | Unique producer/event ID and immutable raw-body SHA-256; applied/stale outcome. |
| `discord_role_sync_member` | Permanent per-producer/guild/member high-water sequence, observation and departure state. Numeric sequences never pass through JavaScript `Number`. |
| Membership generation | Incremented on each newly applied event. A REST response may commit only against the generation captured before its request. |

A producer-scoped PostgreSQL transaction lock serializes replay/order decisions. Nonce,
receipt, member ordering, snapshot invalidation and affected-session removal commit
before a success acknowledgement. Lock wait is bounded to two seconds and statements
to five seconds. An unknown/failed commit returns failure; retries use the same event ID.

An older/equal sequence or regressed observation time cannot replace a newer state.
A higher sequence with an older observation advances only the sequence fence. REST
snapshots and the bot's high-water mark are separate; a newly started, authoritative REST
lookup can establish present membership again without erasing the event tombstone.

| HTTP | Machine code / sender behavior |
|---|---|
| 204 | Applied and committed. No response body. |
| 409 | `DUPLICATE_EVENT` or `STALE_EVENT` plus matching `eventId`: terminal acknowledgement. |
| 409 | `EVENT_CONFLICT` or `REPLAYED_REQUEST`: no success claim; sender retries with a fresh envelope and eventually quarantines unresolved conflicts. |
| 401 / 400 / 413 / 408 | Invalid authentication / invalid request or event / oversized body / body timeout. |
| 503 | Disabled, invalid configuration or unavailable persistence. No success acknowledgement. |

Every response is private/no-store. Raw bodies, keys, signatures and session tokens are
not logged. Receipts store digests, not raw payloads. Member ordering remains private.

## Authorization and missed events

Every newly applied event clears cached role authority: `present` becomes `unknown`,
and `left` remains `left`. A departure, or removal from previously observed REST/bot
roles, also deletes the linked user's Discord-assured sessions. Password/MFA sessions
and local grants are unchanged. A role addition alone does not sign a user out.
Events do not cancel work that already completed before the transaction committed.

Interactive and scheduled permission resolution require a server-side REST snapshot
after invalidation. A REST request already in flight before the event cannot restore
roles. Mapping changes retain their existing versioned audit behavior; no role value is
persisted in a long-lived browser JWT. Writes retain the 60-second snapshot ceiling and
private reads the five-minute ceiling; unavailable refreshes fail closed.

Request resolution rechecks the durable Discord session and membership generation after
awaited role-mapping persistence, so that a revocation committed during that work denies
the earlier cached actor. Scheduled publication carries a proof from the verified REST
observation into its transaction. After taking content locks, it rechecks generation,
observation/roles and freshness under a shared membership lock held through publication
commit. A revocation that committed first blocks publication without changing the live
revision. If publication obtains that lock first, it commits before the invalidation.
Freshness is checked again after publication/audit writes, immediately before returning
from the transaction; expiry during a database wait rolls the whole publication back.
Local recovery schedules instead lock/recheck their independent grant ID/version and
expiry; they do not depend on Discord availability.

The existing bot reconciliation scans **tracked** members in bounded batches; it is not
full-guild discovery. Missed events are corrected by reconciliation and website REST
freshness checks. Bot retry/backoff preserves observation time and event ID. 429 honors
Retry-After; exhausted attempts remain quarantined in the bot outbox for inspection.

## Operator configuration and rotation

Configure at runtime, never in image build arguments:

| Variable | Meaning |
|---|---|
| `ROLE_SYNC_ENABLED` | Only literal `true` enables the receiver; absent/false is disabled. |
| `ROLE_SYNC_PRODUCER_ID` | Stable 1–64 character producer name. Preserve across restart and key rotation. |
| `DISCORD_GUILD_ID` | Exact guild also used by website REST authorization. |
| `ROLE_SYNC_KEYS_JSON` | One current key and optionally one retiring key, keyed by the bot's `roleSync.keyId`; each secret must have at least 32 UTF-8 bytes. |

`ROLE_SYNC_SIGNING_SECRET` alone is obsolete and does not enable the receiver. Role-sync
keys must differ from Better Auth, bot management, OAuth and Discord bot credentials.
Configure the bot's existing secret environment reference and key ID separately.

For rotation, first install current+next receiver keys under the **same producer**;
switch the sender to next, verify acknowledged delivery, then remove the retired key
after in-flight attempts have drained. Old-key traffic must fail after removal. Never
reset the producer or member fences to recover a restored bot sequence: pause delivery,
inspect the restore/reconciliation plan and establish new authoritative observations.

Migration is an additive expansion; existing observations receive generation zero.
Run the explicit migration runner before enabling the new image. No backfill or contract
drop is needed. Keep receiver and sender disabled during rollout/rollback until paired
acceptance. An old image does not provide generation fencing and is not safe to run
alongside an enabled receiver. Do not drop new tables during an image rollback.

Receipts/nonces are retained unless an operator explicitly prunes them. Retain event
receipts for at least seven days and nonce rows until their 15-minute expiry; prune in
bounded batches. Never prune member fences/tombstones. A replay after receipt pruning
still fails the high-water check. PostgreSQL backups must include all four structures.

## Reproduce offline proof

Use a disposable PostgreSQL instance and the normal frozen-lockfile setup. Set
`DATABASE_URL` to that instance. The cross-repo setup requires a loopback host and a
database name ending in `_test`, before it connects or cleans fixtures. Each integration file uses a separate database; no
production table is truncated. The optional cross-repo suite requires `BOT_SOURCE_DIR`
pointing at a clean public bot checkout at `4f3db011ec0aa96eaaa96bfb7b71cd4bffd804ac`.
Its helper bundles actual bot source with the locked web test dependencies; it does not
copy a fake implementation or install/modify the bot checkout.

```sh
pnpm test:role-sync
pnpm --filter @valkyria/web exec vitest run --project integration tests/integration/role-sync.test.ts tests/integration/auth-membership.test.ts tests/integration/auth-local-admin.test.ts tests/integration/publisher-schedule.test.ts tests/integration/migrations.test.ts
pnpm --filter @valkyria/web exec vitest run --project unit src/modules/role-sync
pnpm build
pnpm --filter @valkyria/web exec playwright test e2e/role-sync.spec.ts --project=chromium --workers=1
```

The cross-repo suite uses real signer, outbox storage, sender service, HTTP and receiver
transactions. It covers lost ACK, reconstructed service/database handles, expired sender
leases, rotation, reordering, 429, reconciliation and bounded outage quarantine. It does
not kill a production process or contact Discord. Browser tests use synthetic identities
and a local Discord REST fixture, and exercise the actual production-build Next route.
Set `CAPTURE_EVIDENCE=1` to preserve six captioned CS/EN captures under `.local/evidence/role-sync`.
The CI job records both repository revisions and uploads the contract report; its result
is required by the quality gate.

PostgreSQL concurrency regressions wait for actual blocked mapping/translation queries,
commit signed invalidation, then release the lock. They prove denial for cached request
actors and scheduled publication after a previously verified issuer loses authority.

Before live enablement, separately accept real-guild departure/role changes, the actual
network path and credentials, current/retiring-key rotation, a receiver outage, recovery,
outbox inspection and the effective privileged-write/private-read revocation windows.
Keep bot #5 open until its live criteria have corresponding evidence.
