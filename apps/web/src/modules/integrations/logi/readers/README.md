# Approved Logi readers (League preview and Warcon)

Server-only, on-demand readers for the two explicit Wardogs read grants of Logi PR #158
(`c42ea770`): `league-matches` and `warcon-data`. They are separate from the change-feed
collection client (`../client.ts`, `../sync.ts`) and never widen its resource list. See
the [readiness map](../../../../../../../docs/integrations/logi/readiness-2026-10-03.md)
and [operator runbook](../../../../../../../docs/integrations/logi/runbook.md).

| Module | Responsibility |
| --- | --- |
| `../transport.ts` | Shared bounded transport: fixed origin and path, `game` query, bearer key, `redirect: manual`, `cache: no-store`, 5 s default / 15 s maximum timeout, size-limited JSON, status mapping to stable codes; no body, URL or key is retained |
| `contracts.ts` | Closed (`z.strictObject`) wire schemas of the League read and of the Warcon `live` and `matches` views only; producer cache lifetimes and freshness rule |
| `league-url.ts` | The producer's League URL policy (regex, 125-character cap, canonical form); shared with the match schema and editor |
| `league.ts` | `league-matches` reader, in-process last-known cache per canonical URL with `nextRefreshAt`/`Retry-After` backoff, in-flight dedupe and a quiet unavailable preview |
| `warcon.ts` | `warcon-data` reader for approved `warconConnections`, last valid envelope per connection and view (live 10 s, matches 60 s), unavailable live view after a failed pull |
| `public.ts` | Minimal website DTOs and pure freshness ageing (also used by client components) |
| `synthetic.ts` | Labelled synthetic observations for `LOGI_READERS_SOURCE=synthetic-fixture` (tests, review captures) |
| `health.ts` | `readerCapabilityStates(env)`: `unconfigured` / `configured` / `unsupported` per resource with the last attempt outcome, for the administration health page |

## Configuration

`LOGI_LEAGUE_API_KEY_WDG` and `LOGI_WARCON_API_KEY_WDG` select the readers for the
Wardogs source of `LOGI_SOURCES_JSON` (`configuredLogiSources(env, 'league' | 'warcon')`).
Approved Warcon connections are `warconConnections: [{ connectionId, publicId }]` on that
source; each `publicId` must name a `publicServers` entry with `published: true`, IDs are
unique, and the entry is rejected on an HLL source. HLL CRCON configuration is untouched.

## Public DTOs

`WarconLivePublic` = `{ publicId, observedAt, freshness, serverName, map, lighting,
playerCount, maxPlayers, matchSeconds, scores: [{ name, score }], rotationNow,
rotationNext }`. `freshness` follows the producer's `freshness` re-evaluated against the
website clock (fresh < 45 s, stale < 180 s), is never fresh when `!ok`, and becomes
`unavailable` immediately after a failed pull. Scores, round time and rotation are
present for fresh observations only; map, server name and population remain while stale.

`WarconRecentMatchesPublic` = `{ publicId, observedAt, freshness, matches: [{ id,
startedAt, endedAt, map, experiences, lighting, peakPlayers, finalScores: [{ name,
score }] | null, winner }] }` (last 5 by start time; fresh 2 min, stale 30 min).

`LeaguePreviewPublic` = `{ sourceUrl, observedAt, state, synthetic, title, fixtureNumber,
type, status, scheduledAt, teams: [{ code, name }], map: { name, zone, lighting },
hosting: { mode, teamCode }, mapVote: { status, closesAt }, progress: [{ label, state,
detail }] }`. `state` is `stale` when the producer flags the read stale/errored or the
last website pull failed; a snapshot older than 15 minutes is `unavailable`. The preview
never carries a result: the producer's `results` is always `null` and the CMS result
remains the only published result.

Not projected, by design: Steam IDs, player rows and names, `serverId`, `gameServerId`,
build, tier, reserved slots, throttling, ping, cash, Logi connection IDs, League moderator
text, member counts, nations, request links, warnings and parser diagnostics. The
`health` and `capabilities` Warcon views are never read for public output.

## Composition points

- `../../servers/browser.ts` adds `warcon` to `ServerBrowserData` for Wardogs: live
  projections for the listed approved servers and recent matches for the selected one.
  The existing `/api/servers/wardogs` polling route therefore includes these DTOs; it
  accepts no connection or view parameters.
- `components/public/matches-screen.tsx` reads `getLeagueMatchPreview(match.leagueMatchUrl)`
  for a published Wardogs match with an editorial League URL.
