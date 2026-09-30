# Current status

Updated: 2026-09-30. Stage: **Legacy HLL record import and CRCON are deployed. Public field-parity follow-up #73 is under verification; it is not closed by the earlier record-count acceptance. Fresh production capture observed source a7be042c and image 6c329c43 (including graphics PR #70). Public UI audit fixes are on branch `feat/hll-platform-handoff` (PR #72, not merged). Live authentication/Logi and broader client-navigation issue #46 remain separate work.**

## Public source field parity (#73)

The additive repair restores country/coalition labels, capture and time provenance,
complete recording credits, tournament descriptions/logos and article author images.
It preserves original import identities, editor versions/revisions, match facts and
results, publication and privacy decisions. Conflicting source values stay marked.
See the [operator procedure](operations/legacy-hll-import.md#additive-public-metadata-repair)
and [local/source/browser evidence](evidence/legacy-field-parity-2026-09-30/README.md).
Production repair and exact-image acceptance remain required before issue closure.

## Public UI audit fixes (branch `feat/hll-platform-handoff`, not merged)

A CS/EN audit at 390/768/1024/1440 px (synthetic fixtures, plus the committed
[legacy production captures](evidence/hll-legacy-production-2026-09-29/README.md))
found and fixed on application source `9946e4b`:

- Match detail: maps/rounds and imported statistics left the one-third pane (player
  columns were cut at 1440 px) for a full-width section below list and pane.
- Imported format "best of 1" was shown as "best of 1 · Best of 1 (Bo1)"; now once.
- HLL servers: PR #70's row thumbnail squeezed phone names into mid-word breaks, and
  1024 px squeezed the 58 % list; phones now get row summaries, two columns from 1280 px.
- Tournament description tables widened the page by 169 px on phones.
- The HLL panel on clan/community said HLL matches stay on the original website; it now
  links the on-site HLL section and labels the old site as the archive.
- Breadcrumb links have a 24 px touch target.

Checks on the `9946e4b` build: lint/types passed; unit 706/706; integration 340/340;
browser 182 passed, 0 failed (99 opt-in captures skipped), including the new
`e2e/public-layout.spec.ts`. [Before/after captures](evidence/public-ui-audit-2026-09-29/README.md).

Follow-up on `b8209bb` and `797f7d4` ([captures](evidence/public-ui-copy-icons-2026-09-29/README.md)):
- Copy no longer calls HLL our history or sends visitors to the old site for HLL matches.
- Server/members/tournament intros are visitor copy; Czech plural fixed; ping and
  duplicate refresh notes removed.
- No disabled "still image" button on HLL content pages; coverless community posts use
  the pack's community scene.
- Game sections stop repeating their own game on cards/rows, and shared pages there
  use the game eyebrow.
- Discord mark (Simple Icons, CC0; manifest/NOTICE) on every Discord link and the
  sign-in button; clan crest on sign-in/recovery; pack glyphs on hub destinations;
  trophy emblems on tournaments.

Checks on the `797f7d4` build: lint/types passed; unit 707/707; full browser suite
182 passed, 0 failed (99 skipped) before the icon case was added, then
`public-layout.spec.ts` 4/4 with it; integration 340/340; foundation and `derive-graphics-pack.mjs --check` passed.
Tournaments have no logo field (a logo upload needs a migration).

Match statistics and FAQ on `e4598c5` ([captures](evidence/match-stats-faq-2026-09-29/README.md)):
per-metric split bars comparing the teams (validated palette), team marks beside team
names and player rows, original glyphs for kills/deaths/combat/offense/defense/support
(game class/score icons are not licensed; stored statistics have no class), numbered
FAQ questions with a two-column index. Checks: lint/types passed, unit 708/708, browser
183 passed (99 skipped). The imported manual/FAQ content on production was not visible
from this environment; its reported formatting problems remain open.
Not changed: the published clan/community CMS pages still contain the owner's older
sentence about HLL matches on the original website (an editor must update that content);
production was not re-audited because `valkyria.cz` is blocked by this environment's
network policy. Next: review and merge, then an operator-run publication.

## Graphics pack integration (PR #70, merged and published)

Squash-merged as main `a7be042c0089629d3b850dd59a5761c5a8fe1899`. Publisher run
[36615145766](https://github.com/ValkyriaWDG/www/actions/runs/36615145766) passed
Foundation, Application (lint, types, unit, integration, build, image, rollback
rehearsal, scan, e2e, budgets, artwork) and Quality gate; after the protected
environment approval it published `majorluk/valkyria-www@sha256:6c329c43b071f322ad8b123a120a3c5744689557d2241edc269092e584ede330`
and reported channel status `promoted` at 19:36:21 UTC (migration and runtime
fingerprints equal to `1b38314 / 6623125c`). The 29 September 21:58 UTC paired
capture confirmed it running healthy as that image. The original branch verification
below is historical.

Branch `assets/graphics-pack-handoff` integrated the owner's graphics pack with the
brand correction (`5aa60ff`) on application source `7f4dc44`; head also merges main
`264bea6` (#71, docs only). See the [catalog's implemented integration](assets/graphics-pack-2026-09-29.md#implemented-integration)
and [evidence](evidence/graphics-pack-2026-09-29/README.md). The PR #69 hub cover,
strip geometry, crest and HLL/WDG media contracts are unchanged.

- 97 runtime files from `scripts/media/derive-graphics-pack.mjs` (only
  `retain-unbranded-source` clean layers per `branded/catalog.json`, plus the official
  HLL mark); map resolver for all 20 maps with alias/layer grammar and near-match rejection.
- Server list thumbnails, selected-server scene and on-demand tactical map; match map
  briefing and coverless banner scene; sharing template v3 (pack scenes, map briefing,
  official marks, framed covers, `0 : 0` vs unknown); editorial template import in the
  media library; official HLL mark on the hub card; 16 UI glyphs on mapped controls.
- Checks on the `7f4dc44` build: lint/types passed; unit 703/703; integration 340/340
  (PostgreSQL); browser 179 passed, 0 failed (97 opt-in capture cases skipped); CI artwork
  step 4/4; budgets 15/15 (`/cs/hll` median LCP 1,976 ms); foundation 2,461 files; tooling
  176/176; archive `restore.mjs --verify` 497/497.

Not included: corrected ready-made compositions with baked Czech copy, a map-guide page,
square/Discord export downloads, icons on the remaining mapped targets. No production
import or Discord message.

The archived pack itself: **497 original files** with exact hashes and a reversible
representation of the oversized editor ([pack README](../assets/design-packs/valkyria-2026-09-29/README.md));
340 corrected exports embed the actual crest and official marks
([brand correction](assets/brand-correction-2026-09-29.md)); 16 original
[UI icons](assets/icon-handoff.md). Source galleries are asset proof, not app screenshots.

## Initial production import: legacy HLL migration and CRCON

Source `1b38314ff6faf5182166fe15dff3172e4cf752ef` runs from
`majorluk/valkyria-www@sha256:6623125c93ec576e0402ce9708749d3a7175f36230c99890b132d3d23f71ef1b`
through the verified `production` channel. PR #67 implements issue #65; PR #68
fixes standalone importer dependency resolution and exercises the actual image
importer. [Production acceptance and screenshots](evidence/hll-legacy-production-2026-09-29/README.md)
record exact-source CI/publisher, the initial failed image rehearsal, its correction,
and the successful PostgreSQL 15 rehearsal and production import.

Imported: **205 public matches** (202 completed, three upcoming), **12 news records**
(nine articles plus three archived expired announcements), **eight manuals, eight
tournaments, FAQ/about pages and 219 media assets** with 438 stored WebP variants.
There are **131 primary scoreboards and three additional rounds**. Twenty-one
historical sides remain unknown; editorial results are preserved without claiming
new verification. Only match211's origin/game link is individually verified; other
historical game IDs do not acquire guessed provider links. Hidden matches and private
player/account fields are excluded. Twenty-six external/unsupported body image
references remain readable source links; one unsupported cover was omitted and is
covered by follow-up #73. Original fixed GMT+1 instants are preserved; complete
recording attribution and additional public fields are also repaired by #73.

The actual immutable image passed an isolated PostgreSQL **15.17** restore from the
held production capture, **680 HTTP/media checks**, and five previous-image checks
against its matching restored baseline. Production's fresh frozen baseline matched
that restored source exactly. The fresh paired backup was hashed, its database dump
TOC checked and its media archive restored; **that new database dump was not itself
restored again**. Four migrations advanced the journal from five to nine; the second
migration run applied zero. Production now has 31 application tables. Dry-run and
repeated import preserved full database/sequence/journal/media fingerprints; all nine
identity/grant tables remained unchanged. Recovery after this populated import requires
the matching pre-import database/media backup and old image, or a reviewed forward fix.

Public verification passed **929 HTTP cases, 371 decoded images, two independent
health checks and both live CRCON projections**. Five private application captures
were inspected; eight further Czech editorial captures passed desktop/mobile overflow,
image and browser-error checks, with six safe captures published as evidence. After
promotion/recreation, all eight final public smoke checks passed. The final runtime
readback confirms the exact image, healthy web/updater and active publisher timer;
all 26 unrelated containers were unchanged and all 24 owned maintenance containers
were stopped. Publication itself ran full CI: 603 unit, 331 database, 167 standard
browser and four separate artwork cases. The standard suite skipped 107 cases:
103 optional visual captures and four artwork cases subsequently exercised separately.

The public HLL server adapter is enabled for the reviewed primary and event servers.
It distinguishes current occupancy from round participants, refreshes while visible,
and retains bounded stale/error handling and allowlisted public fields. `admin2` DNS
was unavailable; the existing event origin was separately verified. Admin CRCON URL
import and player-publication controls are implemented and covered by real database
and synthetic authenticated browser tests; **live admin login/Discord SSO/Logi remain
disabled** and are not established by anonymous production checks. Credentials exist
only in protected local/runtime environment files. The old `valkyriahll.cz` domain
still serves the legacy site; no DNS/legacy-domain cutover or Wardogs API activation
occurred. See the [import runbook](operations/legacy-hll-import.md),
[source inventory](operations/legacy-hll-extraction.md), and open auth work #36.

## Automatic image updates

On 2026-09-29, a dedicated `valkyria-watchtower` was enabled for only
`valkyria-web`, polling `majorluk/valkyria-www:production` every 300 seconds. The
channel initially pointed to the accepted `e5d7276 / c4b53776` image below. Two
natural replacements have now been verified: `6c5f5c7 / b5f636fc` at 11:54:46 UTC
and `571475f / da884eda` at 12:19:48 UTC. Neither replacement ran migrations.
The [operating guide](operations/watchtower.md) describes selection, compatible
channel promotion and rollback. [Verification](evidence/watchtower-2026-09-29/README.md)
records the original polling-only setup; [deployment proof](evidence/channel-deployment-2026-09-29/README.md)
now establishes two actual replacements of the selected application container.

The publisher remains manual/main-only with full CI and accepted `expected_sha`.
With `WATCHTOWER_PROMOTION_ENABLED=true`, it promotes only byte-identical migration
bundles/runners and unchanged image runtime defaults. Changed or unknown contracts
stay outside automatic deployment. Authentication/Logi and #46 remain open; the reviewed HLL CRCON adapter is now enabled as recorded above.

## Historical production: crest and shared top strip

At **12:19:48 UTC / 14:19:48 CEST** on 2026-09-29, Watchtower replaced the web
container with source `571475f3f60fb38c7cf14cd6afb4702982ba4681`, image
`majorluk/valkyria-www@sha256:da884edad5dd00cbf1ed0fd9fcb733cb894de594739b99be5eee5049bcea015b`.
This includes PR #61's crest/editor fix, PR #64's channel support and PR #66's
matching HLL/Wardogs strip. [Production proof](evidence/channel-deployment-2026-09-29/README.md)
links successful exact-main CI **36563899286**, protected publisher **36565208081**,
independent registry hashes and exact runtime identity.

Qualification passed **500 unit, 291 database, 161 browser, 168 tooling, 13 encrypted
recovery, 6 real restore and 4 HLL artwork tests**; 106 optional captures were skipped.
Migration and runtime fingerprints matched the previous image. The natural update
reported one scanned container, one replacement and zero failures. Environment,
effective mounts/security, compose/env files, updater and other containers stayed
unchanged. All four readiness checks, **16 HTTP/media checks** and both timers passed.
No database migration, provider activation, content import or routing change occurred.

Anonymous production verification passed **33/33** checks over CS/EN, both game
landings/news and 1920/1366/1024/390 px viewports. All six actual screenshots were
inspected. Strip geometry and crest presentation match, with no overflow or page,
HTTP or unaccepted network errors. The 252 optional prefetch cancellations are
recorded separately; this full-navigation check does not close the broader #46.
Authenticated editor behavior is covered by release CI, not a live admin mutation.

## Historical production: HLL features and tournaments

At this earlier checkpoint, **https://valkyria.cz** served source `e5d7276f7dd7215dc2f5e402a6bbf3c7a3228f3e`
from `majorluk/valkyria-www@sha256:c4b53776e500b62088f69ae1b94c57ab91f9c68becea43a0790dce2ff4abe430`.
Promotion completed at **08:15:19 UTC (10:15:19 CEST)** on 2026-09-29.
[Production evidence](evidence/hll-features-production-2026-09-29/README.md) records
exact-main CI **36503155902**, protected publisher **36539109346**, immutable registry
identity, the fresh paired restore, actual-image rehearsal and independent runtime readback.

Both full qualifications passed **497 unit, 291 database, 160 browser, 126 tooling,
13 encrypted-recovery, 6 real restore and 4 separate HLL artwork cases**; 106 opt-in
capture cases were skipped. All 15 page-budget samples and 12 CI rollback stages passed.
Scans retain zero fixable HIGH/CRITICAL findings and 43 unfixed findings.

The fresh production backup was actually restored and verified: **27 tables, one
sequence, zero editorial files**. On that disposable PostgreSQL 15 restore, the exact
candidate and actual previous **e03d3c5 / 5e9129** image both passed their route/health
checks after upgrade. This is separate from CI's older **5e83 / 79bf** rollback pin.
Live migrations applied **3 / 2 / 5**, followed by **0 / 5 / 5** with unchanged retry
fingerprints. Schema now has **29 tables/five migrations**; old data was preserved,
new tables are empty and new tournament references are NULL. No seed/import occurred.

All **14 promotion smoke checks** passed; both timers resumed. The **08:16:00 UTC**
independent runtime observation confirms the exact image, readiness, approved media
hashes and security controls. A natural publication service pass at **08:16:20–21 UTC**
exited successfully; authenticated publication and alert delivery were not tested.
The corrected independent anonymous HTTP run passed **85/85**; browser verification
passed all **14 functional scenarios**, but its fifteenth strict network check failed
on **five non-prefetch RSC aborts**. There were zero page/HTTP errors. All **11 actual
production screenshots** were inspected. Issue #46 remains open with the classifier
unchanged. Initial **69/85 HTTP** and **0/1 browser (14 unrun)** reports are preserved:
the harness expected old social template v1 and matched serialized tournament error
translations. The separate source-backed harness correction changed no application code.

This deployment includes PR #50's HLL/CRCON/statistics/FAQ/artwork, #57's hydration-aware
assertions, #58's masthead/statistics defaults and #59's tournaments. PR #50 incorporates
PR #55 artwork; #55 itself remains open. Authentication/local grants remain off/zero,
HLL clips stay empty and server status remains `none`; no CRCON/Logi provider is enabled.
No DNS/proxy routing or old `valkyriahll.cz` content changed. Populated content, live
auth/provider workflows, off-host recovery and physical-device media coverage remain
separate acceptance work. Historical reports and images below are unchanged.

## Historical production: robots-origin hotfix

At this checkpoint, **https://valkyria.cz** served source `e03d3c50b71f179dd22e7fbc07a1ce4a58a3731a`
from `majorluk/valkyria-www@sha256:5e9129fabf0e737a138efa3ad198242dc945bfe4fe31965bf8a7ead266d8fa25`.
The image-only promotion completed at **21:33:47 UTC (23:33:47 CEST)** on 2026-09-28.
[Production acceptance](evidence/robots-runtime-origin-2026-09-28/production/README.md)
links PR #54, exact-main CI **36484523293**, protected publisher **36484542039**,
immutable registry/OCI verification and actual runtime/public proof.

Qualification passed **439 unit, 272 database, 144 browser, 126 tooling, 13 encrypted
recovery and 6 real restore tests**; 98 opt-in capture cases were skipped. All 15
page-budget samples and 12 rollback stages passed. Scans record zero fixable
HIGH/CRITICAL findings and 43 unfixed findings, not zero vulnerabilities.

The fresh quiesced paired backup was actually restored into a new ownership-checked
disposable database: **27 tables, one sequence and the zero-file editorial archive**
matched. Both candidate migrations were **0 / 2 / 2** with source fingerprints unchanged.
All 14 promotion smoke checks passed; both timers resumed. The **21:34:31 UTC**
readback confirms the exact image, four readiness checks, preserved media/security
and disabled authentication. No schema, origin, routing or provider activation changed.

After a purge of only the canonical robots URL, the normal URL advertised the correct
Host/Sitemap. The independent **21:35:24 UTC** HTTP run passed **55/55**, accepting
#53's production behavior. Its observed edge Cache-Control remains
`public, max-age=14400, must-revalidate`; no cache-policy repair is claimed.
The original cutover's **54/55 HTTP** and **9/10 browser** reports below remain immutable.
No new browser run was used to waive #46: the non-prefetch RSC cancellation gate remains
failed/open, and its six screenshots remain proof for the original `5e83abc` UI.

At this historical checkpoint, next work was to diagnose #46 with its retained failures; continue #23/#8 live auth/hosted
Logi and operational acceptance, #25 physical-device/media coverage and separately
owned #36 HLL content/footage work. Old `valkyriahll.cz` remained unchanged. Then-draft
CRCON/statistics PR #50 and migration 0002 were outside that deployment; #52 retains
the original cutover failure's unproven cause.

## Original unified deployment

Historical cutover observations, superseded by the image-only hotfix above.

At the original cutover, **https://valkyria.cz** served the Czech-first bilingual community hub and HLL/Wardogs
sections at source `5e83abc91560480e21b60c4a2638c0b52b0e1720`, with immutable image
`majorluk/valkyria-www@sha256:79bf4ea15dd185f0618775fee2a794f2e5d024a116943224a1a4a1dcb7afef48`.
Promotion completed on **2026-09-28 at 20:37:55 UTC (22:37:55 CEST)**. The
[cutover evidence](evidence/unified-cutover-2026-09-28/README.md) records full source,
publication, backup, recovery, routing, public-check and inspected screenshot proof.

PR #51 fixed query-preserving game/language switch hydration and merged after its
required CI passed. Exact-main [CI 36474517364](https://github.com/ValkyriaWDG/www/actions/runs/36474517364)
and protected [publisher 36476285050](https://github.com/ValkyriaWDG/www/actions/runs/36476285050)
passed: **439 unit, 272 database, 143 browser, 126 tooling, 13 encrypted-recovery and
6 real restore tests**; 98 opt-in captures skipped. All 15 cold-mobile samples and
12 image/rollback stages passed. The image has no fixable HIGH/CRITICAL finding;
43 unfixed findings remain recorded. The immutable registry digest and OCI revision matched.

The first production attempt restored its fresh **25-table** paired backup, applied
0001 once, and then failed public health JSON parsing. It recovered the old image/config
and routes without downgrading the database. The failed response body was not retained,
so its cause remains unproven. The second attempt used a revised diagnostic/convergence
protocol, created another fresh backup and actually restored all **27 tables** and the
editorial archive into owned disposable targets. Both migration runs were **0 applied,
2 already applied**, preserving all rows, the journal and sequences. Two coherent
canonical/live/readiness rounds preceded the single successful full smoke. Both timers
resumed. No live database restore, fixtures or legacy-content import occurred.

The [runtime readbacks](evidence/unified-cutover-2026-09-28/runtime-after.json) confirm
the exact image/source, all four readiness checks, uid 10001, read-only root, dropped
capabilities, no public host ports, unchanged approved background hashes and Watchtower
off. The publication service subsequently exited successfully. Authentication stays
off; hosted Logi/status is unconfigured and HLL has no battle clips, using its static fallback.

`www.valkyria.cz` redirects to the apex. Both WDG hosts redirect with **308**, mapping
their locale landings to `/{locale}/wardogs` and preserving other paths and queries.
**The old `valkyriahll.cz` site was not changed.** Existing HLL archive links remain.

Public checks at **20:40 UTC** retained **54/55 HTTP** and **9/10 browser** results.
At that observation, robots advertised the old WDG Host/Sitemap origin ([#53](https://github.com/ValkyriaWDG/www/issues/53)); the later repair is accepted above.
All nine browser UI/playback/navigation scenarios passed, but the strict network gate
failed on five non-prefetch RSC aborts ([#46](https://github.com/ValkyriaWDG/www/issues/46)).
Six actual production captures were inspected. No failed check was waived or rerun to
replace its result. The 20:38 runtime readback precedes these checks; the later 20:42
readback separately corroborates the same identity and healthy services.

At this historical checkpoint #53 was still open; its production fix is accepted above.
Remaining work: #46 browser network diagnosis; #36 legacy HLL content,
approved footage and remaining unified features; #23/#8 live login/hosted Logi, recovery
administrator, privacy decisions and off-host recovery/monitoring; #25 physical-device,
Safari/retail-Firefox and media-performance coverage. Draft CRCON/statistics PR #50 and
its migration 0002 are **not** part of this deployment. Incident #52 retains the two
deployment attempts, actual rollback/recovery and the limits of their diagnosis.

## Earlier unified qualification failure

PR #37 merged as `40da3df1d2bee5ad4e99f8d09d590c7b9ada42a9`; its PR and exact-main
CI passed. The separate [publisher 36469751788](https://github.com/ValkyriaWDG/www/actions/runs/36469751788)
then caught a real query-loss defect before registry access: the game switch exposed
a query-less link while its query-aware segment was still hidden. The language switch
used the same fallback pattern. Issue #49 was subsequently resolved by PR #51; the original
[trace observations and screenshot](evidence/switch-query-hydration-2026-09-28/README.md)
are preserved. No image was published, no production data was migrated and no domain
route was changed by that failed publisher. The subsequently qualified source and
actual promotion are recorded above; the original failed record remains unchanged.

## Previous WDG production refresh

Historical 2026-09-28 checkpoint, superseded by the unified deployment above.

PR #44 merged as `9a872918ad4d89935eb26118d853d40776af7d66`. Its final PR CI and
[exact-main CI 36455739949](https://github.com/ValkyriaWDG/www/actions/runs/36455739949)
passed: 53 tooling, 13 encrypted-recovery, 379 unit, 240 database and 124 browser
tests; 67 opt-in browser cases were skipped. All nine unchanged cold-mobile samples
passed; the article's maximum CLS was 0.005100. The original failed run is preserved
below. Issue #43 is closed with red/green measurements and inspected screenshots.

[Publication 36457009482](https://github.com/ValkyriaWDG/www/actions/runs/36457009482)
passed its separate verification and protected environment gate. The public image
`majorluk/valkyria-www@sha256:cab3230e760ced4e10a52c00327d863ca5c704093cd81ef61ea000b38d368e93`
was deployed at that exact source revision. No version tag or mutable image alias
was created. [Runtime readback](evidence/production-refresh-2026-09-28/runtime-after.json)
confirms healthy configuration/database/schema/media, uid 10001, a read-only root,
dropped capabilities, no published host ports, unchanged approved media hashes and
disabled authentication. Watchtower remains off for the digest-pinned service.

The web and publication timer were quiesced for a paired database/editorial backup.
Both checksums and archive readability passed; no new semantic restore was performed
on this production backup. Migration reported **0 applied, 1 already applied**.
Configuration and persistent media were preserved; the previous image/configuration
remain available. The timer resumed and a subsequent natural publication pass exited
successfully. This does not establish overdue-content monitoring or alert delivery.

[Public HTTP verification](evidence/production-refresh-2026-09-28/http-after.json)
passed **37/37**, including both homepage canonicals/alternates and six fully decoded
1200×630 social PNGs. The original browser run remains failed at 5/6. A reviewed run
passed all six UI/playback/navigation checks but failed its seventh network gate on
two non-prefetch RSC aborts. A bounded diagnostic reproduced aborts after HTTP 200
and before successful same-document rendering, with six seconds before each next
action; their exact cause remains unresolved. #46 tracks that investigation. Both
failed reports and eight inspected captures are preserved. See the [refresh evidence](evidence/production-refresh-2026-09-28/README.md)
for exact source/digest, CI artifacts, observed results and verification limits.

Remaining launch work stays in #23: hosted Logi membership/SSO and role removal (#8),
recovery administrator/MFA, owner privacy decisions, encrypted off-host recovery and
actual monitoring/alert delivery. #25 retains Safari/device/retail-Firefox and media
performance qualification. #45 is accepted through PR #47, merged as
`0b843e5458aae485b33e3d5f5f4e11348a994ee4`: restore tooling refuses existing or
ambiguous targets without DROP or directory deletion. Its [Linux CI qualification](evidence/production-refresh-2026-09-28/restore-boundaries-ci-qualification.json)
passed six real PostgreSQL 17.11 restore tests, 126 tooling tests and the complete
application/image/browser gates at PR head `19a30dd1b110d11c63a97a1755a352989579eb9d`.
Do not use the earlier unsafe script against operator targets. This tooling merge
did not deploy another image or prove off-host recovery. HLL and Logi workstreams remain
separate from this deployment.

## Unified platform / HLL implementation

Merged PR [#37](https://github.com/ValkyriaWDG/www/pull/37) (`40da3df`),
issue [#36](https://github.com/ValkyriaWDG/www/issues/36) (stays open). Built on the
[handoff](handoff/hll-claude-code-cloud.md); unified source and canonical production
cutover are delivered as recorded above, with explicit remaining acceptance items.

- **Routes:** `/cs` and `/en` are the community hub; `/{locale}/hll/...` (news, matches,
  servers, members, field-manual, clan, community) and `/{locale}/wardogs/...` (the
  preserved Wardogs menu shell). Shared lists keep working; news/match details live at
  their canonical game section and old shared URLs redirect permanently. A game switch
  keeps locale and page category or explains the destination (`?switch=`).
- **HLL presentation:** `[data-theme='hll']` token overrides, landing menu lane, content
  masthead/section bar/drawer and a cinematic stage: one clip per document from
  `HLL_BACKGROUND_CLIPS_JSON` (empty by default → static fallback), no video request
  under reduced motion, Save-Data or the narrow touch default, one alternate on failure.
- **Game-scoped authority:** Discord role mappings and local admin grants can carry
  `games`; content, manual, matches and members check the resource game on every private
  read and mutation (denials audited). Media/settings/audit/access stay platform-only.
- **Servers:** server-only status boundary with fresh/stale/unavailable read models;
  `SERVER_STATUS_SOURCE=none` by default, `crcon` reads CRCON's public
  `get_public_info` for the servers in `HLL_SERVER_SOURCES_JSON` (map, mode, players,
  next map, time left, score, teams, stats link; per-server outage), labelled synthetic
  snapshots for tests. The approved primary and event sources are now enabled and
  verified in the production migration acceptance above.
- **HLL matches:** the shared match editor offers the official HLL maps, modes and
  Allies/Axis sides with 0–5 sector scores. Game statistics (team totals, kills by weapon
  type, weapons, optional player rows) import from a configured CRCON server by game ID
  or from an uploaded scoreboard JSON into `match_statistics` (migration 0002), with
  source/game ID/import time; player rows are public by default after an import (owner
  decision 2026-09-28) and an editor can hide them; a replacement import keeps that choice.
- **Field manual:** `manual` documents on the shared CMS (drafts, revisions, preview,
  scheduling, publication), manual categories, provenance metadata, diacritic-insensitive
  search with abbreviations and table of contents. Initial legacy draft shells have
  now been populated by the reviewed archive import recorded above.
- **Tournaments:** `tournament` records (game, name, season, organizer, start/end day,
  HTTPS links, publication, internal notes) managed in the administration by match
  managers within their game scope; a per-locale description (rules, dated standings)
  on the shared prose model; matches link to a tournament of their own game from the
  match editor. HLL shows `/cs/hll/tournaments` (current/upcoming, then finished) and a
  detail with the published linked matches; drafts and other games are 404. Legacy
  `/turnaje` redirects there; the eight legacy tournament records are now imported.
- **Legacy:** reviewed redirect resolver, active only for `LEGACY_HLL_HOSTS` (empty).
- **FAQ:** shared core page `faq` (`/cs/hll/faq`, `/cs/faq`) with a question index; the
  seed creates an unpublished Czech/English outline. The reviewed migration has now
  populated and published the legacy FAQ with 11 answers; it did not generate English
  translations.
- **Migrations:** additive `0001_unified_platform_scope.sql` (upgrade from 0000 data and
  repeated run verified locally), `0002_match_statistics.sql` (new table only),
  `0003_faq_page.sql` (widens the page-key check) and `0004_tournaments.sql` (new table,
  nullable `match.tournament_id` and `prose_translation.tournament_id`, widened prose
  owner check). The fixture loader inserts only existing columns, so the release rollback
  rehearsal can still load candidate fixtures into the previous schema. Tournaments:
  [evidence](evidence/hll-tournaments-2026-09-29/README.md) (497 unit, 291 integration,
  160 browser tests at `c3e65a6`). PR #59 merged as `e5d7276`; exact-main
  [CI 36503155902](https://github.com/ValkyriaWDG/www/actions/runs/36503155902) passed.
- **Crest:** the HLL main menu shows the Wardogs ghosted crest (same size, position,
  colour and opacity; hidden on content pages), per the owner. Editors now continue after
  an inserted image instead of leaving it selected, so the next keystroke or table no longer
  replaces it ([evidence](evidence/hll-crest-2026-09-29/README.md)). PR #61 merged as
  `1efdf09`; exact-main [CI 36548677606](https://github.com/ValkyriaWDG/www/actions/runs/36548677606)
  passed. Deployed in `571475f`; no migration. See the current production proof above.
- **Top strip:** HLL renders the Wardogs strip classes (height, crest, game switch,
  language, account, community link, breakpoints, phone layout) in HLL colours, so nothing
  in the strip moves or resizes when switching games; `platform.spec.ts` requires equal
  boxes on both games' landings, news pages and the hub at 1920/1366/1024/390 px
  ([evidence](evidence/hll-strip-2026-09-29/README.md)). PR #66 merged as `571475f`
  and is deployed with production strip/crest verification above; no migration.
- **Hub cover:** the community hub uses the owner-supplied cover (HLL left, Wardogs right)
  on the hub route only, with 960/1672 px derivatives, a centred heading and the game
  cards as windows onto their half ([evidence](evidence/hll-hub-cover-2026-09-29/README.md)).
  PR #69 merged as `d61c38f`; included in accepted production source `1b38314`.
  No additional migration. Its earlier publisher was cancelled before publication
  because that source still contains the importer packaging defect recorded above.

Remaining work: approved clan footage (stage shows its fallback), live authentication
and hosted Logi (events), events/rankings destinations, tactical map and a scoped media
library for game-scoped editors. Legacy content, tournaments, FAQ, match-ID aliases and
the two approved public CRCON sources are accepted above. Broader client navigation
remains tracked separately in #46.

Historical implementation qualification for servers, matches and game statistics:
[hll-parity-2026-09-28](evidence/hll-parity-2026-09-28/README.md) (468 unit, 281
integration, 144 browser tests at `59b3e38`, after the review fixes). After merging PR #55
and main `048c179` (`c8fc2d7`): foundation, 126 tooling, lint, types, 493 unit, 283
integration, build, 156 browser (106 opt-in skipped), the 4 empty-playlist artwork tests
and all 15 page-budget samples passed. PR #50 merged as `52a9897`; its exact-main
[CI 36493298550](https://github.com/ValkyriaWDG/www/actions/runs/36493298550) failed in the
header-position browser test (`TypeError` reading `x` of a `null` box): the query-aware game
switch replaces its server fallback during hydration, and the test measured the replaced
element. The test now waits for both switches to finish hydrating and polls the box
(`platform.spec.ts`, 120/120 repeated passes); the application is unchanged. PR #57
merged as `0794a71`. Owner follow-ups: the HLL main menu masthead now sits at the Wardogs
position and imported player rows are public by default
([evidence](evidence/hll-masthead-2026-09-28/README.md); 493 unit, 283 integration, 156
browser tests at `46d22ff`).
PR #37 before its merge:
Verified locally on `ad0ea20` (after merging main `425fb5f`): foundation + 39 tooling
tests, lint, types, 439 unit, 261 PostgreSQL integration, standalone build and 136
browser tests passed (98 opt-in capture cases skipped); 33 captioned captures; after
merging main `df48609` (ops/docs only) foundation + 53 tooling tests passed.
On `9d4fe3c` the HLL links drop a fourth Barlow weight (landing fonts 189,826 → 152,344 B;
limit 184,320 B), page budgets cover both game landings and the canonical Wardogs article,
and the rollback rehearsal loads fixtures with `--schema-compatible` and proves each
image's own routes. Merging main `9a87291` brings the [#44](https://github.com/ValkyriaWDG/www/pull/44) article metadata repair; on
the canonical Wardogs article it removed the 0.24 CLS seen in one CI budget run and in 5
of 10 local runs at 8× CPU (0 of 10 after). On merge `17a47cd` 53 tooling, lint, types,
439 unit and 141 browser tests and all 15 budget runs passed; 264 integration tests and a
previous-image rollback stand-in passed on `9d4fe3c`, where the HLL captures were
retaken; CI for the pushed head is linked from PR #37. Details:
[hll-platform-2026-09-28](evidence/hll-platform-2026-09-28/README.md). Earlier preparation
evidence: [hll-handoff-2026-09-28](evidence/hll-handoff-2026-09-28/README.md).

Next task: resolve live authentication/hosted Logi acceptance and the separate client
navigation issue #46. Keep legacy `valkyriahll.cz` unchanged until its domain cutover
is explicitly scheduled. Clan footage remains pending; preserve the static stage
and truthful provider-unavailable states without synthetic production data.

Follow-up after PR #37 (PR #50, which also delivered the HLL graphics of PR #55; #55 was
closed as delivered): CRCON server status, HLL rounds, imported match statistics (migration
0002), the FAQ page (migration 0003) and tournaments (migration 0004, administration-managed
per the owner) were deployed in `e5d7276`. The later `571475f` deployment added PR #61
(`1efdf09`, crest and editor caret) and PR #66 (shared top strip), without a migration.
Current source `1b38314` additionally contains the hub cover, legacy archive and CRCON
changes; migrations 0005–0008 and the real import are accepted at the top of this file.
The hosted events contract (Logi) and a rankings source remain separate decisions.

## Publication authorization hardening

PR #35 was merged as `df119f8df2fff5d84c579c0843dd5c1bf4942468`, narrowed from the retired custom bot receiver to provider-independent
website fixes. Discord request authorization rereads its durable session/observation
after mapping waits; scheduled publication locks and revalidates its exact membership
or local grant before publishing and after audit waits. Same-timestamp updates and
revocation cannot reuse the earlier authorization. The old receiver, custom-bot CI,
transport tables and unapplied `0001_role_sync.sql` are removed from the candidate.
There is no schema change, provider activation or Logi readiness claim.

See [local proof and limitations](evidence/authority-fences-2026-09-28/README.md).
[CI 36436602897](https://github.com/ValkyriaWDG/www/actions/runs/36436602897) passed
for head `9faefd03ea53c838a9d731690c813c3be1562589`, tested merge
`f807ff95ff08e76c09fbb7cb5d3d7512f2541766`: 39 tooling, 374 unit, 240 database
and 119 browser tests; 67 opt-in browser cases were skipped. Image/release and page
budget checks also passed. Hosted membership/SSO acceptance stays in #8/#23; this does not close those
issues. The first-deployment observations below remain historical; the latest runtime
is recorded above. Continue the shared platform and hosted Logi workstreams against
their agreed contracts rather than restoring the custom bot protocol.

## First public deployment

Historical observations from **2026-09-26**, not a fresh runtime check during this
maintenance work. Present-tense descriptions in this section refer to that observation.

**https://valkyriawdg.cz** serves the Czech-first bilingual website with the complete
192.47-second background sequence. The public DockerHub image is pinned to source
`d0f98b0475e7dfb07add2a679c49acce23259684` and digest
`sha256:2ceb72d0b67fd462fa93733c752b60cdc708f36584bcffb5537be31bb5c360d4`.
See [deployment evidence](evidence/first-deployment-2026-09-26/README.md) for exact CI,
runtime readback, host/media acceptance, restore proof and public browser/HTTP results.

Dedicated PostgreSQL 15.17 persistence, explicit idempotent migration/production seed,
non-root read-only runtime, private runtime secrets, HTTPS routing, full media delivery,
daily on-host backups and minute publication timer are operating. A disposable restore
matched all 25 tables; a website-only restart recovered readiness. No synthetic content
was loaded. Discord/local recovery login remain disabled. Public HTTP checks expose two
existing homepage canonical-metadata omissions ([#29](https://github.com/ValkyriaWDG/www/issues/29)).
Issue #23 remains open for authentication and the remaining launch/operational inputs.

## Earlier qualification checkpoints

PR #42 merged as `df48609e384aca679fb5b72073ea9188ee4785b5` after
[PR CI 36445523409](https://github.com/ValkyriaWDG/www/actions/runs/36445523409)
passed for head `2fd922c9933d4286dd2602afcf2743ef9893ba2a` (tested merge
`68037ab9b4e1eb41ff1cb56ec48199e7d562d945`). It passed 53 tooling, 13 real
encrypted-backup integration, 379 unit, 240 database and 119 browser tests (67 opt-in
browser cases skipped), image/rollback checks and nine cold-mobile page samples.
Issue #41 is accepted for byte-integrity tooling only; off-host recovery remains #23.

The subsequent [main CI 36447034783](https://github.com/ValkyriaWDG/www/actions/runs/36447034783)
failed the article's first cold-mobile sample: CLS **0.2920**, above the unchanged
0.1 limit. The other two article samples passed at 0.0051. Font-loading changes to
metadata wrapping moved the article twice; [#43](https://github.com/ValkyriaWDG/www/issues/43)
tracks a deterministic reproduction and repair. A passing PR run does not override
this later failure. Do not publish this main revision or average away the failed sample.
The 2026-09-28 host preflight still observed the original `d0f98b0` image below,
healthy with authentication disabled; no production promotion had taken place at that preflight.

The [#43 repair evidence](evidence/article-layout-2026-09-28/README.md) keeps compact
metadata in explicit rows while preserving desktop wrapping. A staged-font red/green
reproduction reduced the 391 px Czech shift sum from 0.292901 to 0.004595; all nine
unchanged cold-page samples passed, with article CLS 0.002693 in each sample.
Local production build and 17 focused browser cases passed. The integrating checkout
also passed full lint, typecheck, 379 unit and 53 tooling tests. Final PR and merged-main
CI subsequently passed, as recorded in the latest refresh above.
[Public refresh evidence](evidence/production-refresh-2026-09-28/README.md) preserves
the original 24/37 passing before-state HTTP checks alongside the separate after run.

Issue #26 is accepted: [release hardening](operations/release-hardening.md) adds cold
mobile budgets, a pinned Debian 13 runtime comparison, native image checks and
disposable previous-image/database rollback rehearsals. [CI 36267354812](https://github.com/ValkyriaWDG/www/actions/runs/36267354812)
passed for PR source `677c07f8e284ec6de936094102e0f6858b1e3a81`, tested as merge
revision `499558cbd9e0fc1260356274c40e318c28514e86`. All 12 rehearsal steps and
cleanup passed; all 25 restored table fingerprints matched, runtime scans found no
fixable HIGH/CRITICAL advisories, and all nine cold-mobile samples passed. The
[acceptance evidence](evidence/release-hardening-2026-09-26/README.md) preserves the
remaining advisories, larger candidate image, dirty-tree provenance and earlier failures.

PR #33 was merged as `b37931393cd9b836415724d9572765f8615c31e8` on 2026-09-28.
Its [SEO and sharing](engineering/seo-and-sharing.md) adds bilingual homepage
canonicals, branded publication-aware PNG templates for site/news/matches, editorial
sharing previews and published-article JSON-LD. [Feature evidence](evidence/seo-social-2026-09-26/README.md)
includes actual images, CS/EN desktop/mobile editor captures, long-title stress
coverage and regression results. The latest refresh supplies the separate deployed
HTTP acceptance for #29; the earlier source merge alone did not prove deployment.

PR #32 merged as `eaf9f911f13c0b929c8f7d90529c0ccab5dd0701` after
[CI 36435186950](https://github.com/ValkyriaWDG/www/actions/runs/36435186950) passed
on head `cfececb5fa5e48c013f1593a3ac2f9855df17588` / tested merge
`07a58689f7ca8051200f128eca14b43fc9f7c1ad`: 39 tooling, 374 unit, 229 database
and 119 browser tests, both runtime variants' CS/EN social PNGs, all 12 rollback
steps and all nine page-budget samples. Issue #26 is closed with acceptance proof.
The authorization qualification above includes that accepted main. Hosted Logi is the selected integration
direction; #34 was closed unmerged as superseded and #35 retains only independent
website authorization fixes. Follow the updated
[integration handoff](engineering/follow-up-integration-2026-09-26.md). At that earlier
checkpoint no candidate image had been published; the latest promotion is recorded above.

Maintenance [PR #39](https://github.com/ValkyriaWDG/www/pull/39) / issue #38 consolidates action updates #10–#14, the scoped
[esbuild advisory repair](engineering/esbuild-advisory-2026-09-28.md), portable
[media tests and storage path validation](evidence/portable-media-2026-09-28/README.md).
[Action compatibility](engineering/ci-action-refresh-2026-09-28.md) records preserved
publication gates. The PR records its current reviewed head, complete CI and merge
status; verify those before release. Local success does not replace current-head CI.

PR #39 merged as `e8f19d7b3f664e82d545a58a97a9e215469e62c5` after
[CI 36438595440](https://github.com/ValkyriaWDG/www/actions/runs/36438595440).
The remaining checkout/artifact action refresh in [PR #40](https://github.com/ValkyriaWDG/www/pull/40)
merged as `425fb5f3ae058764723182b097ecaf7d5bd2119c` after
[CI 36440170118](https://github.com/ValkyriaWDG/www/actions/runs/36440170118) on head
`b12f75e6c13a0d46a3666a0cc1c13496060a0806`, tested merge
`8c7db4486cd1a6248581ee345d6d446346b637e1`. It passed 39 tooling, 379 unit,
240 PostgreSQL and 119 browser tests (67 opt-in browser cases skipped), image/rollback
rehearsal, advisory/SBOM checks and all nine page-budget samples. Independent review
verified the immutable upstream pins and five downloadable evidence archives.
Neither merge published a container or changed the recorded deployment.

Issue #25 now has [native Edge H.264 evidence](evidence/native-media-2026-09-28/README.md):
11 MP4-only and two dual-source scenarios passed, including a natural 192.4723-second
wrap and controlled WebM-to-MP4 fallback. Historical source hashes and actual captures
are recorded; Chrome, Firefox, Safari/iOS, physical devices and production playback
remain outside that local run.

The additional [Chrome and Firefox qualification](evidence/browser-media-2026-09-28/README.md)
passed all 46 executed scenarios on clean application source `e8f19d7`, with full
192.47-second WebM and MP4 loops in Chrome for Testing 154.0.8037.57 and
Playwright-patched Firefox 155.0. Chrome recorded zero dropped frames; Firefox MP4
recorded 61/5,774 dropped frames and a 597 ms maximum frame-callback gap. Functional
playback passed; smooth playback is not universally accepted. Two unsupported Firefox
mobile-emulation cases were explicitly excluded. Actual captures, executable/source
hashes, reproduction harness and metrics are committed. Safari, retail Firefox,
physical devices and production delivery remain open under #25.

Issue #41 adds the [encrypted paired-backup verifier](operations/encrypted-backup-verification.md):
an independent manifest hash and full restic snapshot ID pin the exact database/media
bytes. It rejects stale, incomplete, modified or unsafe recovery sets, uses a new
destination and retains plaintext explicitly for operator handling. Local Windows
verification passed 53 tooling and 13 real restic integration tests; independent
review and the coordinating checkout repeated the recovery checks. The
[durable evidence](evidence/encrypted-backup-2026-09-28/README.md) records exact source
fingerprints. The integrated Linux/application checks passed in PR #42 as recorded
above. This does not prove SQL/media semantic restoration, off-host storage,
scheduling, alert delivery or production recovery; those remain under #23.

```text
Release: 1.0.0 (CHANGELOG.md) from PR #19, branch claude/eager-mayer-0tk36i
Delivered: Czech-first /cs + /en website with the Wardogs menu shell and full-length
  background media, public news/clan/community/members/matches/privacy pages, Discord
  sign-in with fail-closed role mapping and MFA local-admin recovery, editorial
  administration (visual editor, media library, revisions, preview, scheduling),
  community administration (matches, members, settings, audit), migrations, CLIs,
  non-root image with CI scan/SBOM, backup/restore rehearsal.
Evidence: docs/evidence/app-1.0.0/README.md (captioned captures + measurements.json)
Migrations: packages/db/drizzle/0000_initial_schema.sql (applied; repeated runs no-op)
Open: operator launch inputs and follow-ups listed below; M4 (#7, #8) and #22.
Next checkpoint: preserve the production refresh proof and close SEO #29 against
  its HTTP acceptance; resolve the separate browser network-gate failures and
  continue #23 operator acceptance and #25
  device/performance coverage. Hosted Logi contracts
  must be established before enabling #7/#8/#22 integration.
```

## Verification (release head; application source 64809d0)

Environment: Claude Code cloud container (Ubuntu 24.04), Node 24.21.0, pnpm 10.34.5,
PostgreSQL 16.13, Chromium 141.0.7390.37 via `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, Docker
29.3.1. Hosted CI repeats the application checks on PostgreSQL 17 with the pinned browser.

| Check | Command | Result |
|---|---|---|
| Foundation | `node scripts/check-foundation.mjs && node --test scripts/tests/*.test.mjs` | Passed |
| Lint / types | `pnpm lint && pnpm typecheck` | Passed |
| Unit | `pnpm test:unit` | 365 passed (37 files) |
| Integration | `DATABASE_URL=… pnpm test:integration` | 227 passed (21 files) |
| Browser | `pnpm build && DATABASE_URL=… pnpm test:e2e` | See [evidence](evidence/app-1.0.0/README.md#checks) |
| Actual media | `pnpm test:e2e:media` (delivered files in `apps/web/public/media/background/`) | 11 passed |
| Container | build, migrate ×2, read-only run, health | Passed; non-root, idempotent migrations |
| Image scan / SBOM | Trivy 0.67.2 (`--ignore-unfixed`, HIGH/CRITICAL) / CycloneDX | Passed after removing npm; SBOM per CI build |
| Backup/restore | `apps/web/scripts/restore-rehearsal.mjs` | Passed: content-identical tables and media |

Reviewed exceptions: Debian 12.15 base-image advisories without a fixed package
(`affected`, `fix_deferred`, `will_not_fix`) remain; the CI gate fails on fixable ones.

## Not verified here (operator or environment inputs)

- Live Discord OAuth, guild and role IDs (tests use the local REST mock).
- The original cloud Chromium lacked H.264. Separate Windows evidence now covers
  native Edge, Chrome for Testing and Playwright-patched Firefox. Safari/iOS,
  retail Firefox, physical mobile devices and the Firefox MP4 frame-drop observation
  remain open in #25.
- Live SSO/admin configuration and acceptance remain deferred. Production host, DNS,
  proxy/TLS, registry publication, media delivery and `publish-due` timer were subsequently
  verified in the first-deployment evidence linked above.
- The initial 1.0.0 validation did not include rollback rehearsal or page-weight/Web
  Vitals budgets. Issue #26's accepted combined-source Linux qualification is recorded
  in the checkpoint and durable release evidence above.

## Media

The [full-length delivery](assets/background-media-full-2026-09-26.md) (5,774 frames,
~192.47 s, no audio) supersedes the 15-second candidate. Binaries stay outside Git;
previews place them under the ignored `apps/web/public/media/background/`
([operations](operations/background-media.md)). File-level QA is in
[the delivery evidence](evidence/background-media-full-2026-09-26/README.md); application
playback evidence is in [the 1.0.0 evidence](evidence/app-1.0.0/README.md).

## January 2026 presskit selection

The [presskit guide](assets/presskit-2026-01.md) maps seven original assets to
editorial and game-identification uses. The [offline gallery](assets/presskit-preview.html)
preserves complete compositions and compares logo variants on dark/light surfaces.
Source mapping, dimensions and hashes belong to the presskit catalog and asset manifest.
The application places three of them (1.0.0): the key art on the clan page (contain),
the Flying scene as the community recruitment illustration and the white wordmark on
coverless Wardogs news cards, each captioned as game media, never as clan events.
Web derivatives come from `apps/web/scripts/build-presskit-derivatives.mjs`; see the
[application evidence](evidence/app-1.0.0/README.md#wardogs-presskit-placements-21).
Local Chromium 153.0.8010.12 rendered the gallery through the read-only loopback
preview at 1440 × 1100 and 390 × 844. The [capture evidence](assets/evidence/presskit-2026-01/README.md)
records source fingerprints, eight image placements, zero external requests,
page errors and horizontal overflow. Captures are inspected before publication.
The foundation checker and all 19 tooling tests pass, including 13 presskit integrity
cases covering tampering, unsafe SVG, path traversal and catalog drift.

## HLL graphics research (2026-09-28)

The [media handoff](assets/hll-media-research.md) inventories 158 installed MP4s
(151 tutorials and seven logo intros) and proposes eight manual categories. No
standalone ambient/menu movie was identified among the loose files. The two
catalogs record 16 tutorial candidates and 39 visually reviewed public-source
images with measured metadata, hashes and suggested placements. These are
research candidates; no new runtime graphics, videos or game archives were added.

Verification: all 158 MP4s probed successfully; all 39 selected images decoded.
An independent local comparison matched all **55 selected source byte counts and
SHA-256 values** to their catalogs. `node scripts/check-foundation.mjs` and
`git diff --check` passed. Sampled visual inspection is not full video playback,
gameplay-rule validation or publication approval. Next: select the first cover/
guide batch, preserve instructional diagrams without cropping, and deliver the
owner's clan battle recordings through the existing media pipeline. Deployment
acceptance is maintained separately from this documentation-only research.

Follow-up internet research adds a [web graphics brief](assets/hll-web-graphics-expansion.md)
and a [separate 20-image catalog](assets/hll-web-image-candidates.json): ten official
developer-article sources and ten community map/role/overlay sources, all decoded,
visually reviewed and independently matched by byte count and SHA-256 (37,641,864
bytes). The original 39-image catalog remains unchanged. Source release/playtest
context, pinned repository revisions, overlay alignment requirements and individual
artwork provenance are recorded. The brief also specifies eight custom covers,
three editorial templates and four teaching diagrams for a future production pass;
none of those custom deliverables is claimed as implemented. Foundation and whitespace
checks passed for this documentation extension; full application checks remain CI's
separate responsibility. No runtime assets, deployment or issue closure changed.

## HLL graphics implementation (2026-09-28)

The [graphics delivery](assets/hll-graphics-delivery.md) supersedes the earlier
research-only checkpoint for its selected runtime batch. HLL now uses a full
viewport scene in the persistent shell, with paused/dimmed reading pages and
visible localized playback controls. Ten local WebP derivatives (746,768 bytes)
provide the still fallback, eight manual-category illustrations and HLL news art.
Published CMS covers retain priority. HLL site/news/match sharing uses game-scoped
localized artwork; the source registries and code-license exclusions are recorded.

[Inspected evidence](evidence/hll-graphics-2026-09-28/README.md) contains desktop,
mobile, CS/EN and actual social PNGs, with 464 unit, 273 integration, 37 selected
browser and four actual-artwork tests passing. The local integration run used
PostgreSQL 18.4 with Unicode locale and a temporary Windows Sharp cache mitigation;
CI independently uses PostgreSQL 17. Full lint, types, build and 126 foundation
tests passed. Final PR-head CI is tracked on PR #55.

After CI exposed a legacy expectation that HLL news had no images, the test now
requires both decoded HLL assets and rejects Wardogs art. The complete local
browser suite then passed **150 tests**, with 102 opt-in capture cases skipped;
the separate four-test actual-artwork proof remains above. Main `048c179`'s
production documentation is incorporated without altering its deployed-source
statements. Runtime implementation and the inspected captures remain unchanged.

The final clan recording is still absent. Empty HLL clip configuration deliberately
shows the real still; synthetic test playback is separate proof. Issue #36 remains
open for the broader HLL acceptance scope. This branch performs no deployment;
the production cutover checkpoint remains owned and recorded separately.

## GitHub

Main requires a pull request, the **Quality gate** and linear history. CI runs foundation,
lint, types, unit, PostgreSQL integration, build, Playwright, container smoke, image scan
and SBOM. Container publication is a separate, gated manual workflow. Private
vulnerability reporting, Dependabot alerts, secret scanning and push protection are on.
