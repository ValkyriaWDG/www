# Approved Logi readers (League preview, tracked League fixtures, Warcon and retained game history)

Server-only, on-demand readers for the four explicit Wardogs read grants of Logi PR #158
(reviewed head `af5a52a` for the first three, `72946e3` for the retained history; the
earlier endpoints are unchanged since `c42ea770`): `league-matches`, `league-fixtures`,
`warcon-data` and `server-game-history`. They are separate from the change-feed
collection client (`../client.ts`, `../sync.ts`) and never widen its resource list: the
producer also publishes `league-fixtures` and `server-game-history` as change-feed
resources (`/changes?resources=…`, `/sync-records/<resource>/<id>`), which this website
does not consume; the collections are read on demand like the other readers. See the
[readiness map](../../../../../../../docs/integrations/logi/readiness-2026-10-03.md),
the [operator runbook](../../../../../../../docs/integrations/logi/runbook.md) and the
[retained history design](../../../../../../../docs/integrations/logi/warcon-history.md).

| Module | Responsibility |
| --- | --- |
| `../transport.ts` | Shared bounded transport: fixed origin and path, `game` query, bearer key, `redirect: manual`, `cache: no-store`, 5 s default / 15 s maximum timeout, size-limited JSON, status mapping to stable codes; no body, URL or key is retained |
| `contracts.ts` | Closed (`z.strictObject`) wire schemas of the League read, of a `league-fixtures` page (`LeagueFixture` with the same snapshot, tracking state, optional native `eventId`, bounded free-text `error`) and of the Warcon `live` and `matches` views only; producer cache lifetimes and freshness rule |
| `league-url.ts` | The producer's League URL policy (regex, 125-character cap, canonical form); shared with the match schema and editor |
| `league.ts` | `league-matches` reader, in-process last-known cache per canonical URL with `nextRefreshAt`/`Retry-After` backoff, in-flight dedupe, background refresh once a snapshot exists (only the first read of a URL is awaited) and a quiet unavailable preview |
| `fixtures.ts` | `league-fixtures` reader: pages `GET /api/v1/clan/league-fixtures?game=wardogs&limit=100&cursor=…` up to `LEAGUE_FIXTURES_MAX_PAGES` (3) pages per refresh and reports a remaining cursor as `truncated`; scope check of every item (`gameId`, the source's `guildId`, `snapshot.id`, canonical `snapshot.sourceUrl`); one in-process last-known list per configured source with the website minimum of 60 s, re-polled when the oldest listed snapshot reaches the producer lifetime, `Retry-After`/404 (15 min)/failure backoff, in-flight dedupe and background refresh once a list exists; `null` from `getLeagueFixtures()` means "not configured, render nothing" |
| `warcon.ts` | `warcon-data` reader for approved `warconConnections`, last valid envelope per connection and view (live 10 s, matches 60 s), unavailable live view after a failed pull |
| `public.ts` | Minimal website DTOs and pure freshness ageing (also used by client components) |
| `history-contracts.ts` | Closed wire schemas of `GET /api/v1/clan/server-game-history` (`HistoryRecord`, page envelope, producer filters, revision/source-ID patterns, page size 20, cursor cap 8192); the retained-session refinements are encoded as types and refinements |
| `history-report.ts` | Pure port of the producer's `aggregateHistory` (dedupe by ID keeping the highest revision, outcomes, faction wins/shares, players keyed by `platform:platformId`, known-only metric sums, feed rule, eligibility floor, K/D and win-rate rules), plus `filterHistoryRecords` (end time in `[from, until)`, exact map, applied locally to one snapshot) and `listHistoryMaps` |
| `history-scan.ts` | Pure complete-scan helper ported from `buildHistoryReport`: one revision per scan, no record newer than its page, no repeated cursor, page budget, time budget, caller abort and at most two restarts after 410; a `HistoryScanError` reason, never a partial result |
| `history.ts` | `createHistoryReader(source)` (canonical query only, per-item guild/source/revision check for approved `historySources`), the synthetic reader, opaque player keys and the public entry points `getHistoryReport`, `getHistoryGames`, `listHistoryPublicIds` |
| `history-store.ts` | In-process snapshot store per `scopeKey/sourceId`: complete cached reads refreshed at most every 10 minutes, atomic replacement, stale after a failed refresh or 30 minutes, 2 s first wait then `preparing`, denied/unsupported invalidation, 180-day window fallback when the archive exceeds 250 pages, memoized reports; `historyStoreStatus()` for health |
| `history-public.ts` | Pure publication DTOs `HistoryReportPublic` and `HistoryGamesPublic`, the public filter/page parsers and the publication policy below |
| `synthetic.ts` | Labelled synthetic observations for `LOGI_READERS_SOURCE=synthetic-fixture` (tests, review captures), including `syntheticHistoryPages(now)` |
| `health.ts` | `readerCapabilityStates(env, now)`: `unconfigured` / `configured` / `unsupported` per resource with the last attempt outcome (and the last League error the producer itself reported), for the administration health page; the tracked fixtures follow the League key and report a 403 as `unconfigured` ("key lacks the explicit league-fixtures grant"); the retained history adds `denied`, `preparing`, `available`, `stale` and `error` from the snapshot store |

## Configuration

`LOGI_LEAGUE_API_KEY_WDG` and `LOGI_WARCON_API_KEY_WDG` select the readers for the
Wardogs source of `LOGI_SOURCES_JSON` (`configuredLogiSources(env, 'league' | 'warcon')`).
The tracked fixtures use the same League key: the producer requires an explicit
`league-fixtures` grant on it in addition to `league-matches` (the preview grant alone is
answered with 403 `insufficient_scope`, which the health read model reports as
`unconfigured`).
Approved Warcon connections are `warconConnections: [{ connectionId, publicId }]` on that
source; each `publicId` must name a `publicServers` entry with `published: true`, IDs are
unique, and the entry is rejected on an HLL source. HLL CRCON configuration is untouched.

`LOGI_HISTORY_API_KEY_WDG` selects the retained-history reader (`configuredLogiSources(env,
'history')`): a separate key with the explicit `server-game-history` resource and `wardogs`
game grant (the `warcon-data`, League and legacy keys do not inherit it; 401/403 is
reported as `denied`). Approved sources are `historySources: [{ sourceId, publicId,
publishPlayers }]` on the Wardogs source: `sourceId` is the opaque 64-hex retained-history
source ID a `HistoryRecord` carries (not the Warcon connection ID, the provider server
UUID or a website public ID), `publicId` a published `publicServers` entry, both unique,
`publishPlayers` false by default. Nothing is matched by server name.

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

`LeagueFixturesPublic` = `{ observedAt, state, synthetic, truncated, items: [{ id,
sourceUrl, eventId, tracking, state, observedAt, title, fixtureNumber, type, status,
scheduledAt, teams: [{ code, name }], map: { name, zone, lighting }, hosting: { mode,
teamCode } }] }` (`toLeagueFixturesPublic(items, now, answered, synthetic, truncated)`).
`id` is the external League match ID, `sourceUrl` its canonical League page, `eventId`
the bound native Logi event (already a public `/[game]/matches/logi/[id]` route
parameter) and `tracking` the producer state (`tracked`, `paused`, ...). An item is
`stale` when the producer flags it stale/errored or the last website pull failed; items
whose snapshot is older than 24 hours are dropped (the producer refreshes tracked
fixtures about every 5 minutes), the rest are sorted by kickoff with unscheduled fixtures
last and capped at `LEAGUE_FIXTURES_PUBLIC_LIMIT` (20). The collection is `unavailable`
without any answered list, `stale` after a failed pull, else `fresh`. No progress, map
vote, moderator, warnings, revision, guild ID, attempt time or error text is projected,
and no result.

Not projected, by design: Steam IDs, player rows and names, `serverId`, `gameServerId`,
build, tier, reserved slots, throttling, ping, cash, Logi connection IDs, League moderator
text, member counts, nations, request links, warnings and parser diagnostics. The
`health` and `capabilities` Warcon views are never read for public output.

### Retained game history

`HistoryReportPublic` = `{ publicId, state, synthetic, coverage: { kind: 'all' | 'window',
from }, refreshedAt, lastCollectedAt, filters: { from, until, map, minMinutes }, games,
outcomes: { decided, draw, noResult, unknown }, feedGames, firstEndedAt, lastEndedAt,
factions: [{ name, colorHex, wins, appearances, winShare }], maps: [{ name, games }],
playersPublished, eligiblePlayers, players: null | [{ key, name, platform, lastSeen,
matches, wins, losses, draws, unknownResults, eligible, winRate, kd, metrics: { seconds |
kills | deaths | cashDelta | headshots | teamKills | suicides | vehicleKills: { value,
knownGames } } }] }` (`getHistoryReport(publicId, filters, now)`).

`HistoryGamesPublic` = `{ publicId, state, synthetic, coverage, refreshedAt,
lastCollectedAt, filters: { from, until, map }, page, pageSize: 20, total,
playersPublished, games: [{ id, startedAt, endedAt, map, mode, lighting, outcome, winner,
hasFeed, factions: [{ name, colorHex, score }], players: null | [{ key, name, platform,
faction, result, seconds, kills, deaths, cashDelta, headshots, teamKills, suicides,
vehicleKills }] }] }` newest first (`getHistoryGames(publicId, filters, page, now)`).

`state` is `fresh` (complete snapshot, last refresh succeeded, younger than 30 minutes),
`stale` (snapshot kept after a failed refresh or past 30 minutes), `preparing` (first
scan running longer than 2 s), `unavailable` (no snapshot, last scan failed), `denied`
(401/403) or `unsupported` (404). `refreshedAt` is the website scan time; `lastCollectedAt`
is the most recent successful game import of the whole Logi workspace, not of this source.
`coverage: window` means the archive exceeded the page budget and only games that ended
at or after `from` are included. Both entry points answer `null` when the reader is
unconfigured or the public ID has no approved source: the page renders nothing.
`parseHistoryPublicFilters` and `parseHistoryPage` normalize raw query values.

Publication policy: faction aggregates, outcomes, maps and per-game facts are always
shown; player names and statistics only for a source whose operator set `publishPlayers`
(`players: null` and `playersPublished: false` otherwise). Players are identified by an
opaque key (SHA-256 of the provider identity with a per-source salt derived from the
scope key, 16 hex characters; a rotated key re-keys them), never by a platform ID. Never
projected: platform IDs, the source ID, guild ID, source digest, external match ID, the
provider server name, raw record revisions or key material. No member, roster or
attendance is inferred: factions are not clan teams, provider players are not verified
members and games are not official League results. Retained completed-game statistics
differ from Warcon's live/session leaderboard, whose playtime has a different coverage.

## Composition points

- `../../servers/browser.ts` adds `warcon` to `ServerBrowserData` for Wardogs: live
  projections for the listed approved servers and recent matches for the selected one.
  Only the servers page detail renders them; the Wardogs home overview keeps its compact
  server rows without a Warcon section so the utility rail fits short windows.
  The existing `/api/servers/wardogs` polling route therefore includes these DTOs; it
  accepts no connection or view parameters.
- `components/public/matches-screen.tsx` reads `getLeagueMatchPreview(match.leagueMatchUrl)`
  for a published Wardogs match with an editorial League URL.
- `app/[locale]/[game]/matches/page.tsx` reads `getLeagueFixtures()` for the unfiltered
  Upcoming view of the Wardogs section only and renders
  `components/public/league-fixtures.tsx` after the match browser: one card per tracked
  fixture with the League link, the clan's own match page when a published Wardogs match
  carries the same League link (`mapPublishedLeagueMatchSlugs` in `modules/matches/queries.ts`)
  and the Logi roster page when the bound `eventId` is a published Logi event. The results
  view, filtered lists, the HLL matches page and the Wardogs home carry no fixtures.
- The retained game history has no public page yet: `getHistoryReport`, `getHistoryGames`
  and `listHistoryPublicIds` are the composition points for it.
