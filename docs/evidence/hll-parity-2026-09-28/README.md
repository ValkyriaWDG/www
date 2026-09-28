# HLL legacy parity: servers, matches and game statistics (2026-09-28)

Evidence for the follow-up to merged PR [#37](https://github.com/ValkyriaWDG/www/pull/37)
(branch `feat/hll-platform-handoff`, rebased on `40da3df`) and issue
[#36](https://github.com/ValkyriaWDG/www/issues/36). Nothing here was deployed; no real
CRCON server, Logi tenant, DNS or production database was used.

## Context

- **Revisions:** `6604626` (CRCON server status), `757bced` (HLL rounds), `1c12a5d`
  (statistics import), `44c8490` (admin captures, table header alignment), `65b47be`
  (browser import from the CRCON mock by game ID). All checks and captures below ran on
  `65b47be`, except where noted.
- **Environment:** Claude Code cloud container, Node.js 24.21.0, PostgreSQL 16.13,
  Next.js 16.3.6 standalone build, Playwright 1.63.0 / Chromium 141.
- **Sources:** CRCON behaviour follows the public
  [hll_rcon_tool source](https://github.com/MarechJ/hll_rcon_tool) (`rconweb/api/views.py`
  `get_public_info`, `rconweb/api/scoreboards.py` `get_map_scoreboard`, `rcon/models.py`
  player statistics). All responses used here are synthetic: `crcon-fixtures.ts`,
  `statistics-fixtures.ts` and the loopback mock `e2e/support/crcon-mock.mjs`
  (`get_public_info` and `get_map_scoreboard`).

## Legacy parity

Legacy features from the [inventory](../../product/hll/legacy-migration.md):

| Legacy valkyriahll.cz | Now | Proof |
|---|---|---|
| Server cards: name, current/next map, mode, players, remaining time, connection, live-score link | `SERVER_STATUS_SOURCE=crcon` reads `get_public_info` for configured servers; per-server outage; freshness | `crcon.test.ts`, `provider.test.ts`, `platform.spec.ts`; servers captures |
| Match list/detail: date, competition, teams, map, format, side, score | Shared match module; HLL rounds with official maps, modes, Allies/Axis side, 0–5 sectors | `matches-lifecycle.test.ts`, `admin-hll-matches.spec.ts`; admin rounds capture |
| Match creation/editing and results | Admin editor for HLL matches (game scope enforced) | `admin-hll-matches.spec.ts` |
| Completed match Summary / Players / Weapons | CRCON scoreboard import (the web downloads it from a configured server by game ID, or an uploaded JSON); public tabs; player rows opt-in | `statistics.test.ts`, `match-statistics.test.ts`, `admin-hll-matches.spec.ts` (both paths in the browser); statistics captures |
| Tactical map, videos | Videos: existing VOD links. Tactical map: **not implemented** (CRCON stores no map positions) | — |
| Rankings (`/zebricky/*`), per-server `/stats/*` | **Not implemented**: needs an aggregate statistics source; a configured `statsUrl` links to live stats | — |
| Events | **Not implemented**: owner of events is Logi (contract 0.3); tenant access pending | — |
| Tournaments, FAQ | **Not implemented** | — |
| Legacy match history (26 pages) and match-ID aliases | **Not imported**: the legacy host is blocked here and no authorized export exists | — |

## Checks

| Check | Revision | Result |
|---|---|---|
| Lint, types | `65b47be` | Passed |
| Unit | `f5e56bc` (same application code) | 466 passed (48 files) |
| Integration (PostgreSQL 16) | `f5e56bc` (same application code) | 277 passed (29 files), incl. migration 0002 and `match-statistics.test.ts` |
| Standalone build | `f5e56bc` | Passed |
| Browser | `65b47be` | 144 passed; 101 opt-in capture cases skipped |
| Foundation / tooling | `f5e56bc` | Passed (1127 files) / 126 passed |

`65b47be` changes only browser-test support (`e2e/`) on top of `f5e56bc`.

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
  Players tab: published synthetic player rows in a horizontally scrollable table
  (visible only because an editor published them).

  ![Players tab on a phone](matches/hll-match-statistics-players-en-390x844.webp)

### Administration

- **`admin/admin-hll-match-rounds-cs-1440x1200.webp`** — HLL round in the match editor:
  official map list, Warfare/Offensive/Skirmish, Allies/Axis side, 0–5 sector scores.

  ![HLL round editing](admin/admin-hll-match-rounds-cs-1440x1200.webp)
- **`admin/admin-hll-match-statistics-cs-1440x1200.webp`** — Game statistics panel:
  imported synthetic scoreboard (source, game time, import time, 12 players), team totals
  for Valkyria (Spojenci) and the opponent (Osa), side and player-publication settings, and
  the start of the replacement import form.

  ![Game statistics panel in the match editor](admin/admin-hll-match-statistics-cs-1440x1200.webp)
- **`admin/admin-hll-match-statistics-import-cs-1440x1200.webp`** — Replacement import:
  the configured synthetic CRCON server selected and game ID 1234 entered, with side and
  publication choice. Submitting downloads `get_map_scoreboard` from that server; the
  browser suite does this against the loopback mock (not submitted in this capture).

  ![CRCON import by game ID](admin/admin-hll-match-statistics-import-cs-1440x1200.webp)

## Limitations

- No real CRCON server was queried. Real hosts, the optional statistics API key and
  acceptance against Valkyria's servers are deployment inputs (`HLL_SERVER_SOURCES_JSON`).
- Team attribution uses CRCON's per-player `team` detection; players it cannot attribute
  appear as unknown and are left out of team totals.
- The public match page is rendered per request; server status is cached for 15 seconds
  per server and is not pushed live to an open page.
