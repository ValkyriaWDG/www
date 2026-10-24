# HLL live detail through Logi

The website can read HLL server status and selected-server round statistics from
Logi. It does not contact CRCON when `SERVER_STATUS_SOURCE=logi`. The ordinary
server list uses the scoped `server-snapshots` collection; the selected server
adds mode, next map, remaining time and explicit Allies/Axis scores through
`GET /api/v1/clan/hll-live/{connectionId}`. Missing facts remain unknown.

## Activation prerequisites

The read-only hosted inspection on 24 October 2026 found HLL still using
`SERVER_STATUS_SOURCE=crcon` with an empty Logi `publicServers` allowlist.
Both configured game sources pointed to `https://logibot.tech`; Wardogs already
used its Logi source. This implementation does not change those runtime settings.

1. In Logi, verify an **enabled** `hll_crcon` connection for the HLL workspace,
   with `gameId=hell_let_loose` and working provider credentials. The hosted
   dashboard and Convex backend must provide the HLL live route. A successful
   website `server-snapshots` read alone does not establish live access.
2. Preserve the configured source origin, `sourceInstanceId` and canonical
   Discord `guildId` in `LOGI_SOURCES_JSON`. Obtain each exact native Logi
   connection ID from that workspace. The snapshot `id` and live route
   `connectionId` identify the same Logi connection. Never substitute a CRCON
   server number, provider hostname, website public ID or internal workspace ID.
   Follow all collection cursors: an empty page with a continuation is valid.
3. Add each approved HLL connection to that source's `publicServers` with its
   stable website `publicId`, display `name`, `published: true`, and approved
   public `address`/`statsUrl` or `null`. Preserve existing public IDs when
   replacing the website's CRCON mapping so links remain valid. Optional
   `hllScoreSides` maps the generic snapshot's exact score IDs; the HLL live
   response already identifies Allies and Axis explicitly.
4. The server-only `LOGI_DATA_API_KEY_HLL` must retain its existing required
   data grants and additionally hold the explicit **`hll-live`** resource with
   **`hell_let_loose`** game access for that guild. `server-snapshots`, a
   Wardogs grant and legacy unrestricted keys do not imply this permission.
   No additional website secret variable is required. A missing grant returns
   unavailable live detail while ordinary generic snapshots remain usable.
5. Set **`publishLivePlayers: true`** on an approved `publicServers` entry only
   when its public live player names and round metrics should be shown. An
   absent or false flag leaves player output disabled; safe server status is
   independent. The actual configured entry controls publication, including
   after a flag is removed. Website server presentation can additionally hide
   a server; a hidden server is not asked for selected-server live detail.
6. In the separately authorized runtime rollout, change
   **`SERVER_STATUS_SOURCE=logi`** for HLL. Preserve the explicit Wardogs
   **`SERVER_STATUS_SOURCE_WDG=logi`** setting. Verify the new release and
   configuration after deployment; source code and successful tests do not
   switch the hosted runtime.

## Read and publication behavior

The HLL live route accepts **no query string**, unlike the other scoped Logi
readers. The transport exception is a fixed HLL-only method with a validated
connection ID; ordinary requests still include their game. Redirects are
rejected and requests retain the shared bounded JSON size and timeout.

Concurrent status/player reads share one cache per key-fingerprinted source and
connection. Refresh follows Logi's interval, bounded to 15–300 seconds, with
failure/`Retry-After` backoff. Original independent status/player observation
times determine freshness; fetching an old observation does not make it fresh.
Transient failures preserve labelled stale observations and remove live scores,
remaining time and next-map claims. Authorization or connection-scope failures
clear the cached payload. Expired or future observations are unavailable.

Public player output contains sanitized game names, side and available round
metrics only. It carries no Steam/platform IDs, provider URLs, server passwords,
connection IDs, raw payloads or private operational fields. A live player list
is independent of the clan member directory and match roster.

## Verification

The implementation has synthetic unit coverage for the producer contract,
publication defaults and revocation, scope/connection refusal, no-query route,
ordinary game-scoped routes, concurrent refresh, failed/stale reads, independent
observation clocks, zero/unknown values and hidden-server behavior:

```text
pnpm --filter @valkyria/web exec vitest run --project unit src/modules/integrations/servers src/modules/integrations/logi/readers src/modules/integrations/logi/client.test.ts src/modules/integrations/logi-public.test.ts src/modules/integrations/logi/mapping.test.ts
pnpm --filter @valkyria/web typecheck
```

Hosted acceptance must separately prove the exact connection mapping, the
`hll-live` grant, current source timestamps, selected-server status, player
publication on/off and absence of IDs/credentials in browser and polling
responses. No hosted HLL switch or live acceptance is claimed here.
