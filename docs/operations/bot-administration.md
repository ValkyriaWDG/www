# Private bot administration

The website exposes `/cs/admin/bot` and `/en/admin/bot` for observed bot status and
bounded presentation settings. Integration is **disabled by default**. This document
describes the implemented website adapter for the [bot's management v1 API](https://github.com/ValkyriaWDG/bot/blob/4f3db011ec0aa96eaaa96bfb7b71cd4bffd804ac/docs/management-api.md).
Local contract evidence is separate from deployment or live Discord acceptance.

## Access and supported controls

The web capabilities `bot.read` and `bot.configure` are independent. Both are granted
to the existing `administrator` and `owner` roles; no other built-in role gains either.
Page visibility never substitutes for API authorization. The backend resolves the
session and current actor on every request; configuration requests force a fresh
membership lookup and repeat web authorization after recording their audit intent.
The bot then independently checks its own explicit key scopes and Discord role grants,
including a second fresh membership check after locking its settings row. A website
role or Discord Administrator permission cannot bypass those bot-side grants.

Enabled integration requires a Discord-assured session and its server-resolved stable
Discord account ID. Local recovery administrators can see the disabled page but cannot
impersonate a Discord member or sign enabled management requests. The browser cannot
provide actor, guild, service key, correlation ID, destination or arbitrary API paths.

Implemented settings are the default bot language (`cs`/`en`) and labels for the
bot's existing configured server IDs. The bot requires the exact server-ID set; this
page does not create/delete servers. Each save includes an expected decimal-string
revision and a required reason. Channel destinations, templates, publication schedules,
grants, secrets, providers, enablement, process controls and game-server operations
remain unavailable. Runtime health is not game-server health.

## Operator provisioning

Provision the bot management feature and its additive bot migration before enabling
the website adapter. No website migration or additional website table is required;
website intent/result records use the existing audit table. The bot owns settings,
revision concurrency, replay receipts, independent audit and effective runtime state.
The website does not access the bot database in production.

| Website variable | Contract |
| --- | --- |
| `BOT_MANAGEMENT_ENABLED` | `false` by default; only literal `true` enables the adapter |
| `BOT_MANAGEMENT_ORIGIN` | Exact operator-chosen root origin; no credentials, path, query or fragment |
| `BOT_MANAGEMENT_ALLOWED_ORIGINS` | Comma-separated exact origin allowlist, including the chosen origin |
| `BOT_MANAGEMENT_ALLOW_PRIVATE_HTTP` | Defaults to `false`; explicit `true` permits HTTP only for private IPv4, loopback, localhost or an operator-controlled single-label service name |
| `BOT_MANAGEMENT_KEY_ID` | Key ID configured on the bot, 1–64 letters/digits/underscore/hyphen |
| `BOT_MANAGEMENT_SECRET` | Dedicated 32–256-character management key, available only on the two backends |
| `DISCORD_GUILD_ID` | Existing configured guild; must match the bot |

HTTPS is the default. A private HTTP exception is for an operator-controlled local
container/private network, not a public tunnel or cross-host plaintext connection.
An allowlisted service name does not establish network isolation by itself: restrict
ingress, DNS and routing at the infrastructure layer. Never expose the management
listener to browsers or the public web. Provision appropriate `bot.read` and
`bot.configure` key scopes and role mappings in the bot's operator configuration.
Reuse of known Discord, Better Auth or role-sync secrets is rejected. Role-sync key
rotation uses `ROLE_SYNC_KEYS_JSON`; equality with any of those keys is also rejected.
Malformed optional key JSON fails closed rather than silently bypassing separation.

The transport only calls these exact routes: `GET /api/management/v1/status`,
`GET /api/management/v1/settings`, and `PATCH /api/management/v1/settings`. It signs the
bot's exact purpose-prefixed v1 method/path/key/time/nonce/guild/actor/raw-body format.
Every request gets a new 16-byte nonce. Redirects and automatic retries are disabled;
the client enforces a five-second deadline, 16 KiB request and 64 KiB response bounds,
strict versioned JSON and code-only errors. Private URLs, signatures and secrets are
never serialized into the page or client errors. GET and PATCH web responses are
`private, no-store`; PATCH requires the exact application Origin and rejects cross-site
requests before any bot call.

## Observations and conflict recovery

The visible page polls at most once every 30 seconds and cancels an active read when
hidden or unmounted. Reads do not overlap or start during a settings mutation. Current
runtime, Discord, database and lease states have separate labels. Runtime observations
older than 30 seconds (or more than five seconds ahead) are stale. A failed read marks
previous runtime values unavailable/historical. A rejected settings revision does not
rewrite the last observed runtime health. Role-delivery aggregates remain distinct:
an empty queue does not prove that every member is synchronized, and no delivery
history is not reported as successful delivery.

Requested and effective settings/revisions are shown separately. Saving a requested
revision is not proof it is applied: 202 responses may remain pending, errored or
unknown. The bot's strict `applied` response requires matching effective values and
revision. Website audit writes record intent before dispatch and acceptance afterward;
`bot.settings.requested` means an intent was recorded, not that the bot applied it.
The server-generated correlation UUID links this intent to the bot's durable audit.

On conflict or a lost/uncertain mutation response, the form retains unsaved edits and
blocks another save. Refresh, compare current requested/effective values, and explicitly
select the current revision before resubmitting. A timeout may follow COMMIT. The web
never retries that PATCH automatically. If the website's intent audit fails, no bot
PATCH is sent; if the terminal audit fails after dispatch, the outcome is unknown and
requires reconciliation. The bot transaction separately rolls back a desired change
when its own audit cannot commit.

To roll back this integration, disable `BOT_MANAGEMENT_ENABLED` and redeploy the prior
website image as appropriate. Retain all audit/settings/replay records. Disabling the
website adapter does not undo a stored bot revision or restart the bot; use the bot's
documented rollback procedure for that separate runtime.

## Verification and live acceptance

[The evidence record](../evidence/bot-admin-2026-09-26/README.md) maps scenarios to
checks and captioned CS/EN screenshots. CI's required **Bot management contract** job
checks out the actual public bot at the pinned revision above and runs:

```sh
pnpm --filter @valkyria/web exec vitest run --config vitest.bot-contract.config.ts
```

Local execution requires `BOT_SOURCE_DIR` pointing to that clean tracked checkout and
`DATABASE_URL` pointing to an explicitly disposable loopback PostgreSQL database whose
bounded name contains `test`. The config rejects an unsafe destination before setup
can create/drop template or worker databases. Use a dedicated test base and run this
suite serially with other suites using the same template prefix. No production token,
live guild, bot deployment or provider call is used. Bot HTTP handlers, signing,
PostgreSQL persistence and web handler/audits are real; membership/runtime observations
are synthetic. Browser tests use real website routes and synthetic sessions with
intercepted bot DTOs for deterministic UI states, plus a real disabled backend check.

An operator must still verify the deployed private path, provisioned independent role
grants, live role revocation, rotation of the dedicated key, production audit retention
and desired/effective application before calling the integration operational. This
implementation and its local evidence do not activate or certify that environment.
