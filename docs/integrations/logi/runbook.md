# Logi operator runbook

Use this after the paired website/provider revisions are qualified. The commands below
are preparation and verification steps, not a record of production execution. Keep all
credentials in the deployment's protected runtime configuration. Never commit a filled
`.env`, tokens, cookies, private keys, real rosters or production database exports.

## Configuration

The complete variable names and disabled defaults are in [`.env.example`](../../../.env.example).
`LOGI_SOURCES_JSON` contains at most one row per supported game. Each `guildId` is the
canonical Discord guild ID exposed by the API, not Logi's internal workspace record ID.
The latter is only needed in the provider's registration/policy setup.

This is a synthetic example, not a usable tenant configuration:

```json
[
  {
    "sourceInstanceId": "primary-logi",
    "origin": "https://logi.example.test",
    "guildId": "100000000000000001",
    "gameId": "hell_let_loose",
    "publishMatches": false,
    "publicServers": [
      {
        "connectionId": "synthetic-hll-connection",
        "publicId": "community-hll",
        "name": "Community HLL",
        "published": false,
        "address": null,
        "statsUrl": null
      }
    ]
  },
  {
    "sourceInstanceId": "primary-logi",
    "origin": "https://logi.example.test",
    "guildId": "100000000000000001",
    "gameId": "wardogs",
    "publishMatches": false,
    "publicServers": []
  }
]
```

Origins are fixed HTTPS origins without credentials, path, query or fragment. Never
paste an arbitrary URL from a browser request into this configuration. A repeated
`sourceInstanceId` for webhook intake must resolve to the same origin and guild.
`LOGI_ALLOW_LOOPBACK_HTTP` is exclusively for explicit isolated local tests; keep it
false in production.

| Settings | Purpose and prerequisite |
| --- | --- |
| `LOGI_SSO_ENABLED`, `LOGI_ISSUER_URL`, `LOGI_CLIENT_ID`, `LOGI_CLIENT_SECRET`, `LOGI_GUILD_ID` | Qualified RS256/JWKS provider; exact registered HTTPS callback `/api/auth/callback/logi`; canonical Discord guild |
| `BETTER_AUTH_SECRET` | Independent website session/token encryption secret of at least 32 characters; not a provider private key |
| `LOGI_MEMBERSHIP_SOURCE=logi`, `LOGI_MEMBERSHIP_API_KEY_HLL/WDG`, `DISCORD_ROLE_MAPPING_JSON` | Restricted per-game membership reads and reviewed application-role mapping |
| `LOGI_DATA_API_KEY_HLL/WDG` | Restricted reads for the five collections and their scoped change/refetch operations |
| `LOGI_PEOPLE_API_KEY_HLL/WDG`, source `syncPeople: true` | Private directory, published rosters and verified player-session reads; see [people synchronization](people.md) |
| `LOGI_EVENT_WRITE_ENABLED`, `LOGI_EVENT_API_KEY_HLL/WDG` | Separate command credentials, current user session and an explicitly enabled provider application/key/game/role policy |
| `LOGI_WEBHOOK_ENABLED`, `LOGI_WEBHOOK_SIGNING_SECRETS_JSON` | Map configured source instance ID to a separate signing secret, at least 32 printable characters; never reuse a service key |
| `SERVER_STATUS_SOURCE=logi` | Read server cards from approved configured Logi connections; this does not publish every collected server |
| `SERVER_STATUS_SOURCE_WDG=logi` | Select Logi for Wardogs independently; blank inherits `SERVER_STATUS_SOURCE`, `none` disables Wardogs telemetry. HLL may keep `SERVER_STATUS_SOURCE=crcon`. See [Wardogs servers](wardogs-servers.md) |
| `LOGI_LEAGUE_API_KEY_WDG` | Restricted `league-matches` read grant for the Wardogs source; enables the unverified League preview of matches with an editorial League link |
| `LOGI_WARCON_API_KEY_WDG`, source `warconConnections` | Restricted `warcon-data` read grant plus individually approved `{connectionId, publicId}` pairs under published `publicServers`; reads the `live` and `matches` views only |
| `LOGI_READERS_SOURCE` | `logi` (default) or `synthetic-fixture` for labelled local reader data; never set the fixture in production |
| `LOGI_DISCORD_FALLBACK_ENABLED` | Explicit direct-Discord fallback while Logi is primary; default false |

Use a separate key per purpose and game, restricted to the necessary resources.
Membership source configuration must match the SSO guild. Login and command source
origins must identify the same qualified Logi issuer. Existing Discord client/bot
credentials are only needed for the separately selected legacy paths, not to proxy
Logi data. Local recovery is a separately provisioned MFA account.

## Activation sequence

1. Record the tested provider and website revisions, intended issuer/callback, approved
   guild/game mapping and acceptance evidence. Qualify discovery, JWKS, existing-login
   redirect, exact membership, logout and command policy in an isolated environment
   first. Do not weaken signature, nonce, PKCE or scope checks to match an older provider.
2. Back up the target PostgreSQL database using the approved operational process. Run
   the explicit migration runner against the intended target. `0009_aspiring_klaw`
   adds five Logi tables and seven nullable private session columns; it does not import
   private production data or migrate old matches. `0012_league_match_url` adds the nullable
   `match.league_match_url` column with its Wardogs-only check constraint.
3. Configure restricted data sources with `publishMatches=false`, no published servers
   and commands/webhooks/SSO still disabled. Run bounded pulls until every configured
   game reports `caught_up`. Inspect safe source identities, revisions and freshness.
4. Register the exact website callback in the provider. Set the website issuer/client,
   canonical guild, membership keys and explicit role mapping. Enable Logi SSO and
   select Logi membership together. Verify authorized and denied users in both games,
   local logout, central logout, expiry and outage behavior. Re-login is required when
   transitioning old sessions or provider session formats; no implicit account merge.
5. Approve public output independently. `publishMatches=true` makes every eligible safe
   match summary in that source/game public. Set `publicServers[].published=true` only
   for individually approved connections; supply only approved public join/statistics
   values. Select `SERVER_STATUS_SOURCE=logi`, or `SERVER_STATUS_SOURCE_WDG=logi`
   for Wardogs alone, and inspect both languages and mobile UI.
6. Enable the provider's actor-command policy for the registered application, scoped
   command key and explicit game role IDs. Configure all required games before setting
   `LOGI_EVENT_WRITE_ENABLED=true`: that switch blocks ordinary legacy website match
   creation globally. Verify create -> load -> update with revision -> cancel on an
   eligible synthetic event, plus denied user/game and unknown-outcome recovery.
7. Install the one-minute pull schedule below. Optionally register the webhook URL
   `/api/integrations/logi/{sourceInstanceId}/webhook` and its independent secret, then
   enable intake. Verify a test event, a supported change, duplicate delivery and
   durable acknowledgment. Keep polling enabled regardless of webhook coverage.
8. Record the actual hosted/domain, callback, role, collector, scheduler and UI outcomes
   in the activation record. Local proof in this PR does not fill in those results.

## Wardogs League and Warcon readers

The two readers of [issue #87](https://github.com/ValkyriaWDG/www/issues/87) are
on-demand, server-only and separate from the change-feed pull: they do not use the
data key, the sync CLI or the projection tables. Each has its own restricted key
(`readAccess` `{resources:["league-matches"],gameIds:["wardogs"]}` and
`{resources:["warcon-data"],gameIds:["wardogs"]}`), bound to the canonical guild;
legacy full-access keys are refused by the producer. HLL CRCON settings stay untouched.

- **League preview.** A match manager with Wardogs scope stores a canonical
  `https://wardogsleague.net/matches/<id>` link in the match editor (see the
  [editor guide](../../operations/editor-guide.md)). The public match page then reads
  the preview with an in-process cache per link: at most one request per minute and
  per producer `nextRefreshAt`/`Retry-After`, last-known data shown as stale after a
  failed pull, nothing shown after 15 minutes without a successful read. The preview
  never carries a result.
- **Warcon.** Add approved connections to the Wardogs source:
  `"warconConnections": [{"connectionId": "<Logi connection id>", "publicId": "community-wardogs"}]`.
  The `publicId` must name a `publicServers` entry with `published: true`; the
  configuration is rejected otherwise, on duplicates and on an HLL source. The live
  view is cached 10 s and recent matches 60 s per connection; a failed pull makes the
  live view unavailable immediately and keeps recent matches as stale for up to 30
  minutes. Only map, lighting, population, named scores, round time, rotation and the
  last five rounds are published; player rows, Steam IDs, join codes and the
  `health`/`capabilities` views are never read for public output.
- **Verification.** Local proof is synthetic. Before activation confirm with the
  operator that the hosted producer serves both routes (a 404 reports `unsupported`
  in the health read model), that the keys are separate and guild-bound, and that the
  approved connection IDs are Logi connection IDs (as in `server-snapshots`), not panel
  UUIDs. Then check fresh, stale and unavailable states in both languages on the
  Wardogs server detail and a linked match page.

## Migration and scheduled pull commands

From a trusted source checkout with protected runtime variables already loaded:

```sh
pnpm --filter @valkyria/web db:migrate
pnpm --filter @valkyria/web logi:sync
```

The [CLI builder](../../../apps/web/scripts/build-cli.mjs) bundles `logi-sync.ts` into
`apps/web/dist/cli/logi-sync.mjs`. The [Dockerfile](../../../apps/web/Dockerfile) copies
that directory to `/app/scripts` and migrations to `/app/migrations`. Inside the built
image, under its normal restricted runtime user and runtime configuration:

```sh
node /app/scripts/migrate.mjs
node /app/scripts/logi-sync.mjs
```

Run migration as an explicit release operation, never on application startup. Install
an operator-managed timer invoking the second command **once per minute**, using the
same image and protected environment as the website. No timer is installed by this
code change. Do not launch the pull as an unawaited web-request promise. Concurrent
invocations are fenced by PostgreSQL leases, but a single scheduled worker is enough.

Each source has a 25-second/8-step pass and 60-second lease. A large initial import or
reset can require several passes. The CLI reports safe outcomes and exits nonzero for
`failed`; `pending` means resumable work, not completed synchronization. Backoff is
stored durably, so restarting the process does not bypass a 429. Pending webhook hints
are marked only after all games of their source/guild are caught up through a pass
started after those hints arrived.

## Operation and recovery

| Observation | Action |
| --- | --- |
| `pending` during initial sync/reset | Continue the schedule; partial generations remain hidden |
| `busy` or `lease_lost` | Allow the current lease holder/next pass to finish; never force the checkpoint forward |
| Read 401/403 | Repair the scoped key or configuration; do not treat it as deletion or publish a cached authority indefinitely |
| 429 | Respect persisted `nextAttemptAt`/Retry-After; do not manually create repeated retries |
| Cursor reset | Let the replacement generation rebuild; the last complete generation remains subject to freshness limits |
| Public match disappears after an outage | Restore qualified reads; public eligibility expires after 15 minutes without successful source revalidation |
| Server unknown/stale | Check collector/source observation age; unknown never means an empty server |
| Pending event command | Resume the saved request with its original ID/body; do not recreate it under a new ID to hide an unknown result |
| Revision conflict | Reload authoritative event facts, review the difference, then submit a new deliberate edit |
| Webhook 409 | Investigate signed event-ID/body mismatch; never overwrite the accepted inbox identity |
| Webhook 503 | Keep producer retries active and repair persistence/configuration; receipt was not acknowledged |

Inspect `logi_sync_scope` for checkpoint/lease/attempt/error state, `logi_inbox` for
pending hint counts and `logi_command` for the affected author's request status. Logs
and support exports must omit credentials, raw bodies, member roles and private session
bindings. Do not promote an unfinished generation or patch a receipt to `confirmed`.

Completed rebuilds remove old projection generations. The inbox and command journal
retain durable deduplication/recovery records; no general retention cleanup job ships
in this slice. Agree on retention before large-scale operation, preserving pending
commands and the required replay window.

## Administration health

Administrators and owners (`settings.manage`) can read the website's own view of the
integration at `/[locale]/admin/integrations` (issue #22). The page is server-rendered
on every visit and its **Obnovit / Refresh** link reloads it; it never polls. It shows
**website collector health**: what the website has stored and configured. It does not
show the hosted Logi runtime, the bot's Discord connection, Logi's database or live
game-server telemetry; the hosted API exposes none of those to the website, and the
page never synthesizes a success for them.

| Section | What the state means |
| --- | --- |
| Game servers per game | The selected status source (`none`, `crcon`, `logi`, synthetic), a generic configuration error if the source JSON is invalid, the configured public identities (name, public ID, address/statistics presence, Logi publication flag) and the current public overview with per-server freshness and reachability. CRCON base URLs, Logi origins, keys and addresses are not shown; a Logi source is identified by instance, guild and game only. |
| Logi purpose `Nenastaveno` / not configured | No restricted key of the required length for that purpose and game, or its switch (`syncPeople`, `LOGI_EVENT_WRITE_ENABLED`) is off. |
| `Nastaveno` / configured | A key is present for a purpose without a scheduled collector (membership reads happen at sign-in, commands on demand). |
| `Zatím neběželo` / never ran | A data/people key exists but `logi_sync_scope` records no attempt yet. |
| `Zatím bez úspěšného stažení` / no successful pull yet | Passes ran but none completed a successful pull (bootstrap still in progress) and no failure is persisted. |
| `V pořádku` / healthy | The last successful pull is at most 15 minutes old (the public revalidation limit) and no failure is persisted. |
| `Zastaralé` / stale | The last successful pull is older than 15 minutes; public projections of that scope are no longer served. |
| `Nedostupné` / unavailable (code) | `logi_sync_scope.error_code` is set from the last pass (for example `unauthorized`, `rate_limited`, `timeout`); it supersedes a recent success. `nextAttemptAt` shows the persisted backoff. |
| `Právě běží` / running now | A pass currently holds the lease (`lease_expires_at` in the future). |
| Confirmed capabilities | The `integration-health` rows of the active data generation, as reported by the producer: provider, enabled flag, capabilities, freshness, collected sessions and error category. "Unknown" means no successful pull has stored such a report; it is neither success nor failure. |
| Webhooks / commands | Intake and write switches, the number of unprocessed hints in `logi_inbox` with the last receipt/processing time, pending commands in `logi_command` and the last outcome time (latest update of a confirmed or rejected command, not the receipt of the newest request). Aggregates only; no payloads, IDs or author identities. |
| Discord | Whether the guild/bot pair is configured, the number of mapped role IDs (or the generic mapping error) and the selected membership source. |

The same page holds the website-owned **server presentation** (`servers.presentation`
site setting): display name, visibility and order of the configured public servers.
It changes only how the public pages present servers; identities, addresses and sources
stay in the runtime configuration. Public reads cache the setting for 15 seconds per
process; a save clears the cache of the process that handled it.

## Rollback and compatibility

The migration is additive: existing CMS/archive records and existing auth columns stay
intact, and the previous website image can coexist with the added tables. New caches
are populated by normal pulls; no account-linking or legacy-match backfill is implied.
There is no destructive down migration or planned column removal in this release.

For an operational write stop, disable the **provider command policy first**. Keep the
website write flag true while investigating if legacy creation must remain blocked.
Setting `LOGI_EVENT_WRITE_ENABLED=false` reopens the legacy website create path; do that
only after explicitly deciding which system owns new operations. Preserve unresolved
request IDs and receipts across the change.

Disable webhook intake and its producer subscription as needed; stopping intake alone
does not stop scheduled pulls. To withdraw public Logi output, set `publishMatches=false`,
unpublish the relevant server entries and choose the reviewed server source. Pause the
pull timer only after deciding the freshness/publication behavior.

To stop Logi login, disable its flag and require re-login through an explicitly
configured alternate provider or provisioned MFA recovery account. Old Logi sessions
must not become Discord-authorized through a silent fallback. Preserve the additive
schema during image rollback. Key/issuer/client/encryption-secret changes require
requalification and can invalidate current sessions or cache authority; do not copy
old tokens into the replacement configuration.

## Remaining activation acceptance

Hosted provider rollout, actual new Discord OAuth, production roles and game data,
callback registration, timer installation, production migration, image deployment and
end-user domain acceptance remain **not performed by this implementation**. Record each
separately with its actual environment/revision. The live-name/advanced-statistics,
roster-write and result-write capabilities are outside this website adapter's contract.

### Review follow-ups before activation

The independent review of PR #83 left these open; resolve or accept them before enabling
the related flag:
- **Sign-in discovery.** Better Auth fetches the OIDC discovery document once, when the
  process creates its auth instance, without a timeout or retry. If Logi is unreachable at
  that moment the `logi` provider is skipped until the website restarts, while the login
  button stays visible. Start the website only after Logi answers, or add a retry.
- **Public match list.** The connected list reuses the archive's `view`, `q` and `page`
  parameters, so paging one list pages the other. Separate them before
  `publishMatches` is enabled.
- **Per-request provider calls.** Every authorization of a Logi user, including the public
  header on each page view, calls membership and userinfo. Expect that load, or add a short
  read cache, before broad SSO rollout.
- **One source fails all.** With both game sources configured, a membership timeout for one
  game denies the user's authority in both. This is fail-closed by design; revisit it if one
  source is often unavailable.
