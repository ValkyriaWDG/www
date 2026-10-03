# Retained Warcon game history (website consumer)

The website reads the retained completed Warcon games of the Wardogs workspace from
Logi's `GET /api/v1/clan/server-game-history` and computes faction and player reports
from them. This document records the consumed contract, the configuration, the
first-version design and what remains unverified. The producer is
[Ninjonik/logi PR #158](https://github.com/Ninjonik/logi/pull/158) at delivery head
`72946e3915af2216f97f8c167ea02ea20308555c` (retained-history implementation `051457a`,
duplicate-faction fix `424e118`); its own description is
`docs/integrations/website/warcon-history.md` in that repository. This is a source
checkpoint, not a claim that the hosted producer runs that revision.

What the data is: server gameplay history of the configured Warcon source. A faction
victory is not a clan victory, a provider player is not a verified Logi member, and an
imported game is not an official League result. Logi retains games it observed
successfully; games deleted upstream before import and games missed during an outage
are not recoverable. Retention is indefinite on the producer side.

## Contract at `72946e3`

- Request: `GET /api/v1/clan/server-game-history?game=wardogs` with a bearer key that
  carries the explicit `server-game-history` resource and the `wardogs` game grant. The
  `warcon-data`, League and legacy keys do not inherit it.
- Query parameters are exactly `game`, `sourceId` (opaque 64-hex retained-history source
  ID; not the Warcon connection ID, the provider server UUID or a website public ID),
  `map` (exact), `from` (inclusive) and `until` (exclusive) by game **end** time as UTC
  ISO instants, `cursor` (signed continuation bound to caller, workspace and filters,
  expiring after 24 hours) and `id` (one record; not combinable with filters or a
  cursor). The website never sends `limit`, `page`, `sort`, `minMinutes`, `gameId` or
  `id`.
- Page envelope `{ data: { items: HistoryRecord[], revision, nextCursor, lastCollectedAt } }`:
  at most 20 scanned games per page; a filtered page can be empty and still carry a
  cursor; `revision` is the workspace history revision as a decimal string (compared with
  `BigInt`); `lastCollectedAt` is the most recent successful game import of the whole
  workspace, not evidence that a filtered source is healthy.
- `HistoryRecord` = `{ schemaVersion: 1, id, guildId, gameId: 'wardogs', provider:
  'wardogs_warcon', sourceId, serverName, revision, collectedAt, updatedAt, session: {
  externalId, startedAt, endedAt, complete: true, map, participants [{ id, label, score }],
  sourceDigest, warcon: { schemaVersion: 1, winner, outcome: decided | draw | no_result |
  unknown, hasFeed, mode, lighting, factions [{ name, colorHex }] }, players [{ platform:
  steam | xbox | unknown, platformId, name?, faction?, result?: win | loss | draw | null,
  metrics }] } }` with the producer refinements (end not before start, unique
  `platform:platformId`, unique participant IDs, unique faction names, a named winner
  among the participants when a scoreboard was retained). Warcon defines a game without a
  winner but with a positive final score as a draw; without a positive score it has no
  result. Missing values are never losses or zero scores.
- Errors: 400 `invalid_query` / `invalid_cursor`, 401, 403 `insufficient_scope`, 404
  `not_found` (`id`), 410 `reset_required` (facts changed during pagination: discard the
  partial scan and restart), 429 with `Retry-After`, 503 `unavailable`. All answers are
  `Cache-Control: no-store`.
- Calculation rules (the producer's `aggregateHistory`, ported to
  `apps/web/src/modules/integrations/logi/readers/history-report.ts`): records are
  deduplicated by ID keeping the highest revision and ordered by end time; mixed guilds are
  rejected; faction share = wins / decided games; player identity = platform + platform ID
  with the latest non-empty name; the ranking floor is 60 observed minutes (0–100 000) and
  never removes games from faction totals; win rate = wins / (wins + losses + draws) with
  unknown results counted separately; K/D needs complete kills and deaths for every game of
  the player and deaths above zero; metric totals sum known values only with `knownGames`,
  and feed-only metrics (everything except seconds, kills, deaths and cash delta) count only
  for games with a feed; cash can be negative.

## Configuration

| Setting | Meaning |
| --- | --- |
| `LOGI_HISTORY_API_KEY_WDG` | Restricted key with the explicit `server-game-history` resource and `wardogs` game grant, bound to the canonical guild. Separate from every other key; a 401/403 is reported as `denied` on the health page. |
| `historySources` on the Wardogs source of `LOGI_SOURCES_JSON` | `[{ "sourceId": "<64 hex>", "publicId": "<published publicServers entry>", "publishPlayers": false }]`, at most 20, unique source and public IDs, Wardogs only, each `publicId` published. The `sourceId` is read from a returned record (or from the Logi operator); nothing is matched by server name. `publishPlayers: true` releases player names and statistics of that source to the public page. |
| `LOGI_READERS_SOURCE=synthetic-fixture` | Serves the labelled synthetic dataset for the synthetic Wardogs server (23 games, 24 players, players published); tests and review captures only. |

Example (synthetic IDs, not a usable configuration):

```json
{
  "sourceInstanceId": "primary-logi",
  "origin": "https://logi.example.test",
  "guildId": "100000000000000001",
  "gameId": "wardogs",
  "publicServers": [{ "connectionId": "synthetic-wardogs-connection", "publicId": "community-wardogs", "name": "Community Wardogs", "published": true, "address": null, "statsUrl": null }],
  "historySources": [{ "sourceId": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "publicId": "community-wardogs", "publishPlayers": false }]
}
```

## First-version design: complete cached reads

The reader (`readers/history.ts`) requests pages with the canonical query only and checks
every item against the source's guild, the requested source ID and the page revision. The
scan helper (`readers/history-scan.ts`) reads every page at one revision, rejects a
revision change, a repeated cursor and a record newer than its page, honours the caller's
abort signal, a page budget and a wall-clock budget, and restarts from the first page after
a 410 at most twice; a failed or partial scan never yields records.

The snapshot store (`readers/history-store.ts`) keeps one complete snapshot per approved
source in process:

- A refresh runs at most every 10 minutes after a success and replaces the snapshot
  atomically only when the scan completed; readers never see a partial list. A snapshot
  older than 30 minutes, or whose last refresh failed, is reported `stale` with the failure
  reason; the website `refreshedAt` stays that of the completed scan.
- The first request of a source starts the scan and waits at most 2 seconds, otherwise it
  answers `preparing`; once a snapshot exists, refreshes run in the background and a page
  never waits on the producer.
- Failure backoff follows the League reader: `Retry-After` when given, 15 minutes after a
  404, otherwise 60 seconds, bounded to 24 hours. A 401/403 drops the snapshot (`denied`);
  a 404 drops it (`unsupported`).
- Budgets: 250 pages (5 000 scanned games) and 60 seconds per scan. When the complete
  archive exceeds the page budget, the source is scanned again restricted to games that
  ended in the last 180 days and the snapshot carries `coverage: window`; the process then
  keeps scanning the window. When the window exceeds the budget too, the state is `error`
  with reason `budget_exceeded`.
- Reports are computed per request from the snapshot with the local filters (end time in
  `[from, until)`, exact map, playtime floor) and memoized per revision, coverage, filters
  and floor, so one complete snapshot answers every filter without another producer read.
- Corrections: a changed game advances the workspace revision and replaces its record; the
  next refresh scans the new revision and every report is recomputed from it (nothing is
  incremented). Between refreshes the previous revision stays visible as the snapshot.
- Not used yet: the `server-game-history` change feed (`/changes`, `/sync-records`), the
  `id` read, maintained projections or persistence. These are the planned next step if
  the archive outgrows complete reads.

Three timestamps are kept apart: `refreshedAt` (website scan), `lastCollectedAt`
(workspace-wide import) and the dataset `revision`.

## Publication

`readers/history-public.ts` projects the snapshot: faction aggregates, outcomes, maps,
first/last game and per-game facts are always publishable; player names and statistics
only for a source with `publishPlayers`, otherwise `players: null`. Players carry an
opaque key (SHA-256 of the provider identity with a per-source salt) and never a platform
ID. The source ID, guild ID, source digest, external match ID, provider server name, raw
record revisions and key material are never projected. The DTOs and policy are described
in the [readers README](../../../apps/web/src/modules/integrations/logi/readers/README.md).
No public page consumes them yet.

## Health

`/[locale]/admin/integrations` shows the fourth reader row "Warcon – historie her serveru /
Warcon – server game history": `unconfigured` (no key, no Wardogs source or no
`historySources`), `configured` (no attempt yet), `preparing`, `available` (with the game
count, revision, `lastCollectedAt`, `refreshedAt` and coverage), `stale` or `error` (with
the reason), `denied` (401/403: the key lacks the explicit grant or was revoked) and
`unsupported` (404). See the [runbook](runbook.md#administration-health).

## Activation steps and unrun hosted checks

1. The Logi operator creates a read key with the explicit `server-game-history` resource
   and the `wardogs` game grant for the canonical guild and supplies the opaque `sourceId`
   of each Warcon source that may be shown (from a returned record).
2. Set `LOGI_HISTORY_API_KEY_WDG` and the `historySources` entries under already published
   `publicServers`; decide `publishPlayers` per source after considering retention and
   player-ID visibility (the producer documents both as operator decisions).
3. Check the health row: `configured` → `available` after the first public read, with a
   plausible game count and `lastCollectedAt`.

Local verification used the synthetic dataset and unit/PostgreSQL/browser tests only. Still
unrun against the hosted producer: the deployed revision serving the route; the explicit
grant on a real key (403 for the Warcon and League keys); real page sizes, scan duration
and the page budget against the actual archive; a real 410 during pagination; cursor
expiry after 24 hours; the budget window on a large archive; and whether game display names
may be public. No recorded hosted response of the collection exists in this repository.
