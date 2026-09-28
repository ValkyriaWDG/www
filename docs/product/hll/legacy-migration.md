# Legacy HLL content and migration inventory

Observed **28 September 2026, 13:38–13:45 UTC**, through anonymous HTTP responses, their public Next.js payloads, and linked client bundles. This is a bounded content inventory, not a complete database export or browser acceptance test. No member profiles were crawled. Search-engine extracts were older than current responses and are not the migration authority.

Targets below are proposed routes on the future canonical origin `https://valkyria.cz`, not existing pages or enacted redirects. One application and CMS serve community, HLL and Wardogs contexts. Czech is primary; English translations publish independently. Preserve source URLs, dates, IDs and provenance during import.

## Navigation and scope

The current header links Home, Servers, Matches, Field Manual, FAQ and About. The footer additionally exposes News, Rankings, Events and Tournaments. Home combines recruitment, article/tournament cards, videos, servers, upcoming matches, results and events. Community links are shared; game records require explicit classification. [Home](https://valkyriahll.cz/)

| Exact legacy path | Proposed canonical target | Scope and migration decision |
| --- | --- | --- |
| `/` | `/cs/hll` | Preserve HLL entry intent; shared identity also appears on `/cs`. |
| `/servery` | `/cs/hll/servers` | HLL destination, with visible Wardogs cross-link; move the existing Wardogs card to `/cs/wardogs/servers`. |
| `/matches` | `/cs/hll/matches` | Upcoming/history and preserved pagination. |
| `/matches/{existingId}` | `/cs/hll/matches/{existingId}` | Stable legacy-ID aliases if the new internal IDs differ. |
| `/guide` | `/cs/hll/field-manual` | Searchable manual collection. |
| `/guide/{existingSlug}` | `/cs/hll/field-manual/{existingSlug}` | Eight exact slugs below; preserve useful heading fragments. |
| `/zebricky` | `/cs/hll/leaderboards/kills` | Legacy payload redirects to `/zebricky/zabiti`. |
| `/events` | `/cs/hll/events` | HLL view with shared community events explicitly labeled. |
| `/turnaje` | `/cs/hll/tournaments` | Actual working tournament collection. |
| `/tournaments` | `/cs/hll/tournaments` | Currently **404**, despite the footer link; repair as an alias. |
| `/turnaje/{existingSlug}` | `/cs/hll/tournaments/{existingSlug}` | Eight observed slugs below. |
| `/clanky` | `/cs/hll/news` | Historical entry point; mixed articles redirect individually by scope. |
| `/faq` | `/cs/hll/faq` | HLL/VIP/recruitment answers; link shared community policies. |
| `/about` | `/cs/about` | Shared clan identity with HLL history and game links. |
| `/stats/1`, `/stats/6` | `/cs/hll/servers/1/stats`, `/cs/hll/servers/6/stats` | Preserve live-statistics entry points; destination implementation still needs provider verification. |

Use a reviewed redirect manifest, not a blanket prefix substitution. Preserve meaningful `page` queries and history anchors. Fragments never reach the server: retain old heading IDs or handle aliases in the destination document. Do not redirect all missing content to Home. English URLs require published English content; they are not automatic Czech redirects.

## Matches, results and tournaments

[Matches](https://valkyriahll.cz/matches) shows three upcoming entries, eight historical entries on page one, and **26 history pages**. Visible list fields are date, competition label, two team identities/logos and result or upcoming `vs`. No search/filter controls were observed in the initial HTML. The full history was not enumerated.

Verified examples: [211](https://valkyriahll.cz/matches/211), 27 September, Friendly, VLK **1:4 YOKO**, completed; [207](https://valkyriahll.cz/matches/207), 20 September, ECL, VLK **2:3 404**; upcoming [208](https://valkyriahll.cz/matches/208), 4 October, EJIG; [209](https://valkyriahll.cz/matches/209), 11 October, 331; [206](https://valkyriahll.cz/matches/206), 18 October, FLL.

Details display date/time, competition and tournament link, map, strongpoint, best-of format, player format, match state, team names/logos/countries, Allies/Axis assignment and score. Completed matches expose **Summary, Players, Weapons, Tactical Map**, plus videos/empty state. Summary includes team combat/support/offensive/defensive points and kills by weapon category. Future matches show `0:0`; import this as **unplayed**, not a verified draw. Player-tab interactions and tactical-map behavior were not browser-tested; no player rows were copied.

Preserve the information needed for match creation/editing, scheduling, game/competition/team references, map/strongpoint, side assignment, format, result verification, publication and linked reports/videos. The website CMS handles historical import, editorial reports and publication; future operational scheduling/results use the verified Logi workflow and read-only website projections described in [the integration contract](../../integrations/logi/contract.md). Assign each record one operational authority; do not introduce a second writable match master to reproduce legacy page fields. Keep imported performance statistics separate from editorial match fields, with source and observation time. Do not infer an old private admin workflow from public pages.

[Tournament index](https://valkyriahll.cz/turnaje) and [page two](https://valkyriahll.cz/turnaje?page=2) contain eight entries:

`ecl-2026-fall`, `ecl-2026-spring`, `ecl-2025-fall`, `hca-fap-2025`, `greyhound-skirmish-cup-2025`, `ecl-2025-spring`, `thursday-night-league-eu-season-7`, `ecl-2024`.

Each maps from `/turnaje/<slug>` to `/cs/hll/tournaments/<slug>`. Collection fields: title, season, excerpt, start/end and pagination. Details add rich content, rules/website/Discord links, participants, standings or bracket images, associated matches and related tournaments. The [fall 2026 table](https://valkyriahll.cz/turnaje/ecl-2026-fall) explicitly says **24 August 2026** and remains zero-filled despite completed matches. [Spring 2026](https://valkyriahll.cz/turnaje/ecl-2026-spring) labels its table 27 April while listing a May match. Preserve these as dated snapshots, never live standings. The 2025 spring index has an end date preceding its start; flag it for editorial correction.

## News, community information and links

[News page one](https://valkyriahll.cz/clanky) and [page two](https://valkyriahll.cz/clanky?page=2) expose **nine articles**. Lists have title, excerpt, publication date, tags and pagination. Details add author/brand credit, rich body, heading anchors, images, latest/related articles and optional recruitment calls to action.

| Legacy `/clanky/` suffix | Proposed full target |
| --- | --- |
| `wardogs-oznameni` | `/cs/wardogs/news/wardogs-oznameni` |
| `sobotni-verejna-akce` | `/cs/hll/news/sobotni-verejna-akce` |
| `sbirka-2026` | `/cs/news/sbirka-2026` — community support, retaining HLL context |
| `ecl-2025-a-ghc-2025-aktualne` | `/cs/hll/news/ecl-2025-a-ghc-2025-aktualne` |
| `oznameni-23-04-2025` | `/cs/hll/news/oznameni-23-04-2025` |
| `vlk-push-ecl-2025-jaro-1` | `/cs/hll/news/vlk-push-ecl-2025-jaro-1` |
| `vlk-fll-ecl-2025-jaro-1` | `/cs/hll/news/vlk-fll-ecl-2025-jaro-1` |
| `uvod-ecl-2025-jaro` | `/cs/hll/news/uvod-ecl-2025-jaro` |
| `jak-ziskat-vip` | `/cs/hll/news/jak-ziskat-vip` |

The [Wardogs announcement](https://valkyriahll.cz/clanky/wardogs-oznameni), dated 17 September 2026, is Wardogs content even though its host is the HLL domain. The [Saturday event](https://valkyriahll.cz/clanky/sobotni-verejna-akce) describes HLL participation, registration, team assignment and event stages. The [VIP article](https://valkyriahll.cz/clanky/jak-ziskat-vip), dated February 2025, describes queue priority and acquisition methods; its thresholds/rewards need current owner verification before becoming policy.

[FAQ](https://valkyriahll.cz/faq) has eleven questions and answers in the public payload: joining, VIP, training, admission requirements, competition, event frequency, experience, communication, community identity, time commitment and values. Import as editable ordered FAQ entries, separating shared policies from HLL-specific answers. Do not treat claims such as age requirements or training frequency as newly confirmed policy.

[About](https://valkyriahll.cz/about) and Home describe a Czech/Slovak community, teamwork and competitive HLL. Static counters differ: Home says 3,500+ community and 100+ competitive members; About says 3,500+ Discord, 150+ clan and 100+ matches. These are distinct, undated populations, not verified live counters. Preserve history only with labels or replace with maintained data.

Shared links observed in the footer: [Discord](https://discord.gg/vlkhll), [YouTube](https://www.youtube.com/@VALKYRIA_HLL), [Steam group](https://steamcommunity.com/groups/vlkhll), [Instagram](https://www.instagram.com/valkyriahll/), [Facebook group](https://www.facebook.com/groups/1611704832777331), [support account](https://transparentniucty.moneta.cz/256862392). Retain reviewed destinations centrally; do not duplicate community identity records per game.

## Field Manual: preserve the information, make it editable

[Manual index](https://valkyriahll.cz/guide) exposes eight categories. Each exact legacy URL below maps to `/cs/hll/field-manual/` plus the same final slug.

| Legacy article | Observed topics and source date |
| --- | --- |
| [/guide/zakladni-nastaveni](https://valkyriahll.cz/guide/zakladni-nastaveni) | Windows/display/NVIDIA/game settings and startup optimization; 8 June 2024. |
| [/guide/herni-mody](https://valkyriahll.cz/guide/herni-mody) | Warfare, Offensive, Skirmish, phases and victory conditions; 8 June 2024. |
| [/guide/role](https://valkyriahll.cz/guide/role) | Commander, infantry, recon, armor and artillery; commander ability/cost/cooldown/description table; 9 June 2024. |
| [/guide/vozidla](https://valkyriahll.cz/guide/vozidla) | Transport/supply trucks, jeeps, repair and resupply; 28 February 2024. |
| [/guide/tanky](https://valkyriahll.cz/guide/tanky) | Tank components, classes, identification, penetration, driving and anti-tank threats; Slovak body; 25 January 2025. |
| [/guide/spawny](https://valkyriahll.cz/guide/spawny) | HQ, garrisons, outposts, airheads and halftracks; 17 June 2024. |
| [/guide/gameplay](https://valkyriahll.cz/guide/gameplay) | Communication, markers/pings and map icons; explicitly under construction; 28 February 2024. |
| [/guide/prirucka-sl](https://valkyriahll.cz/guide/prirucka-sl) | Squad leadership, terminology, spawns, command communication, defense, movement and team coordination; 8 June 2024. |

Templates expose breadcrumbs, sidebar categories, dates, author/editor/contributor credits, rich headings and an on-page contents list. Preserve article credits: the tank article credits Ninjonik; the SL article credits Sandiary, Tryfid-GA, Larry and Kelly in their respective roles. These are source attribution, not imported membership profiles.

**Proposed CMS model:** `ManualCategory` with game, order and localized label; `ManualArticle` with stable ID, category, game, difficulty/tags, source URL, original language/date, credits, game-version applicability, review date and editorial status. Each `cs`/`en` translation owns slug, title, summary, structured rich text, revision and publication state. Allow headings, lists, tables, callouts, figures/captions, reviewed links and related articles. Existing long chapters may be split later with explicit URL/anchor aliases.

Editors need preview, revision history, draft/publish/unpublish, image alternative text/captions, table editing, link checking and reorderable taxonomy. Search published title, summary, headings, body and tags within locale/game/category; support Czech diacritics and useful synonyms such as SL/Squad Leader. Search must exclude drafts and unpublished translations. Derive the contents list from stable heading IDs. Missing optional translations must not reveal draft text. Gameplay remains incomplete until authored; do not manufacture missing material.

The tank article links [The Line’s Tank Bible](https://www.theline.gg/tankbible/) and numerous externally hosted Imgur illustrations. Record source, attribution and reuse status per text/image before copying; public availability alone does not establish reuse permission. Preserve Slovak source provenance when preparing Czech and English editions. Review dated game mechanics independently. Wardogs press-kit assets do not automatically belong in HLL articles.

## Dynamic information and integration boundaries

| Publicly observed source | Verified fields / limitation |
| --- | --- |
| [Servers](https://valkyriahll.cz/servery), linked server-card bundle | Two HLL configurations, IDs 1 and 6; card fields include name, current/next map, mode, players/capacity, remaining time, rules, connection and live-score link. The shipped client calls same-origin `/api/server?url=<configured-source>`. |
| Same-origin HLL status proxy with the page’s configured sources | Both responded HTTP 200: #1 St. Mere Eglise Warfare and event server Carentan Warfare, each 0/100 at observation. This proves a response, not ongoing uptime. Additional fields include team counts, score, morale, match timing and voting. |
| [/api/server/wardogs](https://valkyriahll.cz/api/server/wardogs) | HTTP 200: name, mode, playerCount, maxPlayerCount, mapName; Bakurani, 0/100. Keep separate from HLL. |
| [/api/events](https://valkyriahll.cz/api/events), discovered from [Events](https://valkyriahll.cz/events) | HTTP 200 Google Calendar-shaped projection; Europe/Prague; updated 23 September; 30 entries and another-page token. Relevant fields: title, description when present, start/end, status, registration location/link, update time and recurrence. First page contains one ECL entry and repeated clan meetings; not a complete event inventory. |
| [/zebricky/zabiti](https://valkyriahll.cz/zebricky/zabiti) | Ranked display name/value rows and last update **17 July 2026, 01:06**. No live leaderboard API contract discovered. Do not copy player rows into static fixtures. |
| [/stats/1](https://valkyriahll.cz/stats/1), [/stats/6](https://valkyriahll.cz/stats/6) | HTTP 200 statistics shells. Full tables, filtering and refresh behavior remain unverified. |

The ranking routes `/zebricky/{zabiti,win-rate,zabiti-za-minutu,kd-pomer,serie-zabiti,teamkills,herni-cas,vyhry,capture-points}` map respectively to `/cs/hll/leaderboards/{kills,win-rate,kills-per-minute,kd-ratio,kill-streak,teamkills,playtime,wins,capture-points}`. Legacy eligibility text refers to servers #1/#2 since January 2025, 50 hours, completed matches and at least ten minutes per player. Current server cards instead list #1/event; establish intended scope before rebuilding rankings.

**Reconciliation required:** Calendar ECL Ejig starts 4 October at **10:30 +02:00**, while match 208 displays **18:30**. Keep source identities separate until an editor confirms the authoritative schedule. Do not combine them by title alone.

Use allowlisted server-side provider adapters and minimal public projections. Hosted Logi is a separate system; these legacy endpoints are discovery evidence, not proof of equivalent Logi capabilities or authorization. Choose one operational owner for future events/participation, and one editorial owner for articles/manuals. Expose observed-at/stale/unavailable states; unavailable data is not zero players or an empty calendar. Preserve historical results without claiming all legacy data has been exported.

## Implementation status

- Manifest and resolver: `apps/web/src/modules/legacy/hll.ts` encodes the tables above.
  Implemented destinations (`/`, `/servery`, `/matches`, `/guide`, `/guide/{8 slugs}`,
  `/clanky`, `/about` → `/cs/clan`) resolve to 308 redirects; everything else is `pending`
  (FAQ, events, tournaments, rankings, stats, legacy match IDs, individual articles) or
  unknown (404). Legacy list pagination is not carried over; `/matches?page=N` opens the
  results view.
- `LEGACY_HLL_HOSTS` activates the resolver in `proxy.ts` for explicitly routed legacy
  hostnames only; it is empty by default and changes nothing until the cutover release.
- Guides: `tsx src/cli/import-legacy-manual.ts [--apply]` creates private Czech draft shells
  (working title, legacy slug, category, source URL/date/language, credits) without body
  text; publication stays blocked until an editor adds reviewed content. Guide text and
  images were not fetched: the cloud environment blocks the legacy host, and reuse status
  of external illustrations is unrecorded.

## Completion gates for implementation

- Account for every collection and explicit URL above; enumerate the remaining match history from an authorized source before final redirects.
- Review dates, schedule conflicts, obsolete VIP rules, unfinished guides, attribution and media reuse; retain unresolved items as drafts or labeled archives.
- Test scope/locale isolation, independent publication, manual search, table/figure rendering and legacy redirects including pagination/fragments.
- Capture actual Czech/English desktop and mobile views of manual, match detail, server unavailable/stale states, events and rankings. This inventory supplies no browser screenshots or live Logi acceptance proof.
