# Wardogs public server overview

The Wardogs menu exposes `/{locale}/wardogs/servers`. Its home panel previews up to
three configured servers, with a link to the full list and a direct URL selection
(`?server=<publicId>`) for each detail. Both Czech and English are supported, including
the mobile menu and selected-server layout. HLL keeps its own source and two-side UI.

## Data and public boundary

Warcon -> Logi collector -> scoped `server-snapshots` -> website sync worker -> local
PostgreSQL projection -> homepage/server browser. Public reads do not call Warcon or
receive its API key. Only explicitly published `publicServers` entries appear, with
the configured public name, join information and statistics link. Provider connection
details and upstream attribution URLs are not used as public join links.

The current projection supplies observed reachability, map, player count/capacity,
named team scores and observation time/freshness. Three supplied teams remain three
teams: no positional assignment to Valkyria, factions or HLL Allied/Axis sides. A
reported zero remains zero; an unknown score or population remains a dash. The Logi
adapter does not currently supply mode, next map, round timer or per-team player counts.

The browser polls its own `/api/servers/wardogs` every 30 seconds while visible. Both
surfaces have a pause checkbox. Scores disappear after two minutes or immediately
following a failed browser refresh. Last-known map/population remain explicitly stale
for up to 30 minutes, then disappear. A timeout never implies an empty/offline server.
The total delay also includes the Logi collector and website sync schedule; this is
not an instantaneous stream. Operational source-health checks may mark data stale
sooner. A configured but never observed server has unknown values.

The public statistics button opens the operator-approved Warcon scoreboard URL.
**Individual live Wardogs player rows are not yet imported into the website server
browser.** The separate [people projections](people.md) serve verified collected-session
statistics for linked members; they neither enumerate current server occupants nor
automatically turn them into clan members.

## Configuration and activation

Keep the current HLL setting and choose Wardogs independently:

```dotenv
SERVER_STATUS_SOURCE=crcon
SERVER_STATUS_SOURCE_WDG=logi
```

The override accepts `none`, `logi` or `synthetic-fixture`; blank inherits the default.
`synthetic-fixture` is only for labelled local tests and review evidence. Defaults do
not enable a provider. The section remains reachable with an honest unavailable state
when no approved source is configured.

Use the [operator runbook](runbook.md) to qualify the producer, configure a restricted
Wardogs data key and `LOGI_SOURCES_JSON` entry for `gameId: "wardogs"`, and schedule
`logi:sync`. Bind the precise Logi connection ID to a stable public slug and explicitly
approve its `publicServers` entry (`published: true`). Approve a public HTTPS scoreboard
link separately. A server password, administrative endpoint or join ID must never be
placed in that public configuration. Check fresh, stale, unavailable and unknown
states in both locales after activation. A data-only deployment does not require
enabling SSO, membership or event writes.

No production source was activated or deployed in this implementation slice.
Local verification and screenshots are in the [acceptance record](../../evidence/wardogs-servers-2026-10-03/README.md).
