# Complete graphics pack: implementation catalog

The owner supplied a complete graphics ZIP for Claude Code to integrate. This
handoff preserves the archive and adds a separate brand-corrected export tree;
the asset delivery does not alter public pages,
CMS records or production. All original files are recoverable from the repository
without the owner's PC, a cloud conversation or a download token.

Start with the [pack README](../../assets/design-packs/valkyria-2026-09-29/README.md),
[complete inventory](../../assets/design-packs/valkyria-2026-09-29/inventory.json) and
[Claude handoff](../handoff/graphics-claude-code-cloud.md).

## Current selection: corrected branding

The [brand correction](brand-correction-2026-09-29.md) and
[branded/catalog.json](../../assets/design-packs/valkyria-2026-09-29/branded/catalog.json)
are authoritative for asset selection. They replace all **340 branded exports**
(240 HLL map compositions and 100 editorial/Discord compositions) with native SVG
layouts/raster exports using the exact clan crest and official game marks.
All **497 originals remain intact**. The catalog classifies all 458 original visual
files: 340 replacements, 107 retained unbranded sources and 11 archive-only references.
Use the action for each path; do not choose an outdated branded original because
its old preview looks convenient. Clean scenes/tactical layers remain available
for localized runtime templates.

The [official logo provenance](../../assets/brand/game-logos/README.md),
[interface icon handoff](icon-handoff.md) and
[browser source-sheet evidence](../evidence/graphics-brand-correction-2026-09-29/README.md)
support the correction. Source sheets are not screenshots of an integrated app.
Preserve the accepted PR #69 hub cover and Claude's ongoing PR #70 work.

## What is supplied

| Original directory | Content | Recommended role |
|---|---|---|
| `01-hll-map-pack` | 20 HLL maps; nine finished WebP formats per map; JPG/SVG alternatives, source scenes/tactical maps, catalog, offline editor and example resolver | Map-aware server/match/manual artwork and references for localized social templates |
| `02-predchozi-bannery` | 14 editorial themes, FHD/OG/card exports, selected social exports, three Discord banners, editable SVGs, local editor and eight scene assets | HLL/Wardogs/community editorial template library; check game and publication context |
| `03-pozadi-a-revize` | Six AI panorama revisions, original PNGs and FHD WebP; an additional latest-export PNG | Revision references; preserve the accepted hub cover from PR #69 |
| `04-koncepty` | Two concept grids and four earlier previews | Design reference only; not individual runtime banners |
| `05-zdroje` | Source/rights notes and upstream license notice | Preserve provenance and third-party exclusions |

The source folder names and Czech documents are deliberately unchanged originals.
All new engineering instructions are English. The source documents are reference
data, not repository instructions. Their earlier testing claims are not fresh tests.

The [supplied overview](../../assets/design-packs/valkyria-2026-09-29/source/UKAZKA-BALICKU.jpg),
[20-map sheet](../../assets/design-packs/valkyria-2026-09-29/source/01-hll-map-pack/PREHLED-MAP.jpg)
and [banner sheet](../../assets/design-packs/valkyria-2026-09-29/source/02-predchozi-bannery/PREHLED.jpg)
were visually inspected. They are supplied design previews, not screenshots of a new
implemented web feature. The latest panorama and Foy's article/result/card/strip were
also inspected (eight actual images in total).

## HLL formats and appropriate use

Each of the 20 map folders has 17 files: nine finished WebP compositions, two JPGs,
two editable SVGs, two source images, one tactical preview and one source JSON.

| File prefix | Size | Use and constraint |
|---|---|---|
| `source-scene` | 718x404 | Best compact server-row thumbnail; render names/status in HTML |
| `server-card` | 640x360 | Larger preview; baked map typography is too small in compact rows |
| `server-strip` | 960x240 | Wide preview/download; preserve the 4:1 composition |
| `article`, `match-preview` | 1200x630 | Reference for article/OG and fixture cards; WebP plus JPG |
| `match-result` | 1920x1080 | Result template reference, not an actual match record |
| `wide` | 1920x480 | Wide editorial or Discord header |
| `social` | 1080x1080 | Square social export |
| `tactical-poster` | 1080x1350 | Public map guide poster |
| `tactical-background` | 1920x1080 | Text-free, subdued briefing background |
| `tactical-preview` | 1400x1400 | On-demand preview, including in the supplied editor |
| `source-tactical` | 4096x4096 | Original map; load only for a requested full-map view/export |

The original 180 finished map WebPs remain archived. Select their corrected
replacement when the coverage catalog specifies one; retained unbranded layers
stay usable. No source editor needs to execute. A 1920x1080 composition does not turn its embedded 718x404
scene into a native FHD screenshot. Day/night and other layers share base-map artwork;
never imply separate authentic imagery for every variant.

The [map catalog](../../assets/design-packs/valkyria-2026-09-29/source/01-hll-map-pack/maps.json)
contains all 20 IDs, proper names, aliases, formats and per-map source links/hashes.
Use the existing `apps/web/src/modules/games/hll-catalog.ts` as the application
vocabulary and an explicit mapping to the supplied slugs. Both cover the same 20
base maps, including Juno Beach and Smolensk. Do not extend the game catalog from a
file name or treat artwork availability as proof of current game-server support.

## Editorial themes and visual decisions

The [14-theme manifest](../../assets/design-packs/valkyria-2026-09-29/source/02-predchozi-bannery/manifest.json)
covers Wardogs server, public Saturday event, ECL Split 2, fundraising, VIP,
server announcements, recruitment, player manual, HLL news, Wardogs news, seeding,
Discord community, VLK vs EJIG and a match report. The three Discord banners are
for HLL, Wardogs and the shared community. These exports are useful for visual
direction and future generated/editor-selected covers; importing them must not
create events, results, donations or entitlement claims.

Important observed constraints:

- Map exports visibly bake Czech labels and `valkyriahll.cz`; older Wardogs artwork
  uses `valkyriawdg.cz`. New derivatives should use the canonical `valkyria.cz` and
  the requested locale. Do not modify the archived originals.
- Result templates contain `SOUPEŘ`, `— : —`, `SOUTĚŽ / DOPLNIT` and `DATUM / DOPLNIT`.
  Older themes contain dated examples such as VLK vs EJIG / 04.10.2026 and ECL 2026
  Split 2. Neither these nor `actual: true` metadata establish current publication.
- Earlier banners/panoramas are documented AI illustrations, not gameplay screenshots
  or evidence of a Valkyria battle. The owner-selected shared hub cover is already
  implemented in [PR #69](https://github.com/ValkyriaWDG/www/pull/69).
  Preserve that cover, its scoped responsive loading and evidence; the archive does
  not request replacing it, HLL/WDG footage or the approved clan crest.
- The archive's red/orange and Arial-style presentation is a template reference.
  Adapt future UI to current HLL khaki/Barlow and Wardogs amber theme tokens; preserve
  accepted shared top-strip geometry and original-logo aspect ratio.
- Use scene/texture plus localized semantic text for web UI. Do not crop baked copy
  into another ratio or ship Czech-only baked text as an English translation.

## Integration map for the implementation agent

| Existing boundary | Work to implement later |
|---|---|
| `apps/web/src/modules/games/hll-catalog.ts` | Explicit map-ID/alias adapter with unknown-map fallback; no broad prefix guessing |
| `apps/web/src/components/servers/server-browser.tsx` | Fill current decorative thumbnail with a small known-map scene; preserve fresh/stale/unavailable status and HTML labels |
| `apps/web/src/components/hll/artwork.ts` | Extend game-scoped artwork selection for map contexts without replacing unrelated manual-category fallbacks |
| `apps/web/src/components/public/news-list-screen.tsx` | Reuse public CMS covers; choose an appropriate scoped fallback only when no published cover exists |
| `apps/web/src/modules/social/render.tsx` and sibling model/metadata/handler | Adapt templates inside the existing localized, publication-aware server renderer; keep versioned caching and canonical entity/game scope |
| `apps/web/src/modules/media/` and existing admin media picker | Reuse authorized editorial selection, metadata and private/public lifecycle; no second unscoped file-serving system |
| HLL/WDG/shared shells | Preserve video/motion policy, strip geometry and the accepted PR #69 hub cover; deduplicate references against existing artwork |

The supplied `map-assets.mjs` is an integration example, not a trustworthy layer
validator: `startsWith` can resolve `carentanTypo`, while short aliases such as
`CT_warfare` or `H4_warfare` are missed. Use reviewed exact aliases plus the supported
layer grammar, with explicit negative tests. The renderer's `opts.scoreA || '—'`
also treats numeric zero as missing; preserve real 0–5 HLL scores in application code.

Do not embed the supplied editors or concatenate their SVG/HTML into application DOM.
They contain local export/upload scripts and system-font assumptions. Preserve them
as tools/reference; implement required workflows inside existing authenticated CMS
and social-rendering boundaries with escaped text and selected trusted images.

## Original archive integrity and verification

[Fresh verification](../../assets/design-packs/valkyria-2026-09-29/verification.json)
records safe path/CRC extraction, **496/496 supplied checksums**, **404 fully decoded
rasters**, **387 filename-dimension checks**, **54 parsed SVGs**, **320 existing map
asset references** and **40 matching source-image hashes**. Independent static review
found no SVG scripts/foreignObject/event handlers/external image links, credential
patterns or automatic external resource loading. Editors were not executed.

The one oversized HTML file remains byte-identical through four hashed chunks;
the repository-owned restore helper verifies and reconstructs all 497 original files
to a fresh ignored directory and refuses overwrites. Original line endings/bytes are
preserved by `.gitattributes`; all 458 image/SVG files are registered in the root
manifest. The entire design pack is excluded by `.dockerignore`.

At the original archive-import checkpoint, foundation passed for 1,921 files and all 172 foundation tests
passed. Four new restore regressions cover byte recovery/no source execution,
corrupt editor parts, overwrite refusal and both levels of linked output ancestors
without external writes. Run `node --test scripts/tests/design-pack-restore.test.mjs`
for the focused disposable-fixture suite.

No application tests or runtime screenshot acceptance are claimed by this import.
Claude must provide actual before/after UI proof and relevant app checks when it
implements the artwork. Preserve the [source notices](../../assets/design-packs/valkyria-2026-09-29/source/05-zdroje/ZDROJE-A-PRAVA.md):
game imagery is excluded from the upstream MIT license and from this repository's
Apache grant. Supplied provenance is preserved; no new general usage license is asserted.
