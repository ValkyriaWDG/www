# HLL legacy parity: servers, matches and game statistics (2026-09-28)

Evidence for draft PR [#37](https://github.com/ValkyriaWDG/www/pull/37) and issue
[#36](https://github.com/ValkyriaWDG/www/issues/36). Nothing here was deployed; no real
CRCON server, Logi tenant, DNS or production database was used.

## Context

- **Revisions:** `8ebe1be5f8594f765897893c93e4e7bc5fc695ec` (CRCON server status),
  `6a21fe7` (HLL rounds), `288e621f0955627ead210f78d53cf071f0da8930` (statistics import),
  `1a14ce07f830497fac62d62670147d3d98dcceb5` (admin captures and table header alignment).
- **Environment:** Claude Code cloud container, Node.js 24.21.0, PostgreSQL 16.13,
  Next.js 16.3.6 standalone build, Playwright 1.63.0 / Chromium 141.
- **Sources:** CRCON behaviour follows the public
  [hll_rcon_tool source](https://github.com/MarechJ/hll_rcon_tool) (`rconweb/api/views.py`
  `get_public_info`, `rconweb/api/scoreboards.py` `get_map_scoreboard`, `rcon/models.py`
  player statistics). All responses used here are synthetic: `crcon-fixtures.ts`,
  `statistics-fixtures.ts` and the loopback mock `e2e/support/crcon-mock.mjs`.

## Legacy parity

Legacy features from the [inventory](../../product/hll/legacy-migration.md):

| Legacy valkyriahll.cz | Now | Proof |
|---|---|---|
| Server cards: name, current/next map, mode, players, remaining time, connection, live-score link | `SERVER_STATUS_SOURCE=crcon` reads `get_public_info` for configured servers; per-server outage; freshness | `crcon.test.ts`, `provider.test.ts`, `platform.spec.ts`; servers captures |
| Match list/detail: date, competition, teams, map, format, side, score | Shared match module; HLL rounds with official maps, modes, Allies/Axis side, 0–5 sectors | `matches-lifecycle.test.ts`, `admin-hll-matches.spec.ts`; admin rounds capture |
| Match creation/editing and results | Admin editor for HLL matches (game scope enforced) | `admin-hll-matches.spec.ts` |
| Completed match Summary / Players / Weapons | CRCON scoreboard import (server by game ID or uploaded JSON); public tabs; player rows opt-in | `statistics.test.ts`, `match-statistics.test.ts`, `admin-hll-matches.spec.ts`; statistics captures |
| Tactical map, videos | Videos: existing VOD links. Tactical map: **not implemented** (CRCON stores no map positions) | — |
| Rankings (`/zebricky/*`), per-server `/stats/*` | **Not implemented**: needs an aggregate statistics source; a configured `statsUrl` links to live stats | — |
| Events | **Not implemented**: owner of events is Logi (contract 0.3); tenant access pending | — |
| Tournaments, FAQ | **Not implemented** | — |
| Legacy match history (26 pages) and match-ID aliases | **Not imported**: the legacy host is blocked here and no authorized export exists | — |

## Checks

| Check | Revision | Result |
|---|---|---|
| Lint, types | `288e621` | Passed |
| Unit | `288e621` | 466 passed (48 files) |
| Integration (PostgreSQL) | `288e621` | 269 passed (28 files), incl. migration 0002 and `match-statistics.test.ts` |
| Browser | `1a14ce0` | 144 passed; 101 opt-in capture cases skipped |
| Foundation / tooling | `288e621` | Passed / 53 passed |

Behaviour covered: CRCON config accepts HTTPS (loopback HTTP only for a mock), rejects
credentials/queries/duplicates; real-HTTP requests without redirects, with body limits and
timeouts; current and older response shapes; one failing server marked unknown with a
partial notice while others stay live; HLL round sides/scores enforced on update and
result; scoreboards stored without Steam/platform IDs or encounters; player rows hidden
until published; imports/settings/removal authorized per game and audited; editors without
match rights denied.

## Captures

### Servers (CRCON)

- **`servers/hll-servers-crcon-cs-1920x1200.webp`** — `/cs/hll/servers` with
  `SERVER_STATUS_SOURCE=crcon` against the local synthetic CRCON mock: live map, mode,
  players, next map, time left, sector score, players per team, join address and
  live-statistics link; the third configured server does not answer and is shown as
  unknown with a partial-outage notice, not as offline or empty.

  ![Servers page backed by the synthetic CRCON mock](servers/hll-servers-crcon-cs-1920x1200.webp)
- **`servers/hll-servers-crcon-en-390x844.webp`** — The same server detail in English on a
  390×844 phone (full page).

  ![CRCON-backed server detail on a phone](servers/hll-servers-crcon-en-390x844.webp)

### Matches and statistics (public)

- **`matches/hll-match-statistics-cs-1440x900.webp`** — HLL match detail (full page):
  rounds with map, Warfare mode and Spojenci side, then the imported statistics (source,
  game ID, import time) with the Souhrn tab: team totals and kills by weapon type.
  Synthetic scoreboard and player names.

  ![HLL match detail with rounds and the statistics summary](matches/hll-match-statistics-cs-1440x900.webp)
- **`matches/hll-match-statistics-players-en-390x844.webp`** — English on a 390×844 phone,
  Players tab: published synthetic player rows in a horizontally scrollable table.

  ![Players tab on a phone](matches/hll-match-statistics-players-en-390x844.webp)

### Administration

- **`admin/admin-hll-match-rounds-cs-1440x1200.webp`** — HLL round in the match editor:
  official map list, Warfare/Offensive/Skirmish, Allies/Axis side, 0–5 sector scores.

  ![HLL round editing](admin/admin-hll-match-rounds-cs-1440x1200.webp)
- **`admin/admin-hll-match-statistics-cs-1440x1200.webp`** — Game statistics panel:
  imported synthetic scoreboard, team totals, side and player-publication settings, and the
  import form (configured CRCON server by game ID, or uploaded JSON; no server configured
  here).

  ![Game statistics panel in the match editor](admin/admin-hll-match-statistics-cs-1440x1200.webp)

## Limitations

- No real CRCON server was queried. Real hosts, the optional statistics API key and
  acceptance against Valkyria's servers are deployment inputs (`HLL_SERVER_SOURCES_JSON`).
- Team attribution uses CRCON's per-player `team` detection; players it cannot attribute
  appear as unknown and are left out of team totals.
- The public match page is rendered per request; server status is cached for 15 seconds
  per server and is not pushed live to an open page.
