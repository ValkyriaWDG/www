# Brand correction: 2026-09-29

The owner requested the real Valkyria crest and official game marks in place of
typographic approximations. This delivery adds corrected source exports for Claude's
ongoing PR #70 implementation. It changes neither the running app nor production
content. The accepted PR #69 community hub cover stays in place.

## Authoritative selection and coverage

Use [branded/catalog.json](../../assets/design-packs/valkyria-2026-09-29/branded/catalog.json).
Each export records its source replacement, original/output SHA-256, dimensions,
bytes, family and embedded brand identities. The coverage array gives the action
for every original visual path.

| Classification observed in the complete catalog | Count | Implementation treatment |
|---|---:|---|
| Corrected branded replacements | 340 | Select the replacement path instead of the old branded original |
| Retained unbranded sources | 107 | Use approved clean scene/tactical/background layers when appropriate |
| Archive-only references | 11 | Keep historical overviews, editor captures and retired concepts out of runtime |
| Original visual files covered | 458 | Every visual has an explicit selection decision |

The 340 replacements comprise **240 HLL map exports** and **100 editorial/Discord
exports**: 94 editorial variants and six banner variants. All 497 supplied original
files remain intact/reconstructable; originals are not overwritten. Catalog
sampleOnly is false and all 340 output paths existed at documentation review.
These counts/path checks alone are not full image or browser acceptance.

## Exact brand sources

| Identity | Canonical repository source | Provenance |
|---|---|---|
| Valkyria clan | assets/brand/valkyria-logo.png | Exact owner-supplied clan crest; retain its complete ratio and detail |
| Hell Let Loose | assets/brand/game-logos/hell-let-loose-fullmark-white.svg | Official full emblem/wordmark extracted from the HLL website; normalized standalone SVG |
| Wardogs | assets/presskit/wardogs-january-2026/fullmark-white.svg | Existing January 2026 official presskit source and catalog |

The catalog records the exact hashes used by the exporter. The two HLL SVGs have
distinct provenance roles: **hell-let-loose-official-inline-source.svg** preserves
the extracted inline element; **hell-let-loose-fullmark-white.svg** changes only
the root attribute spelling from viewbox to viewBox for correct standalone scaling.
Both preserve the 34 original paths, transparent background and 424 × 78 ratio.

See the [official mark catalog](../../assets/brand/game-logos/catalog.json) and
[mark guide](../../assets/brand/game-logos/README.md). The recorded source is the
navigation logo on the [official HLL game page](https://www.hellletloose.com/game/hll),
retrieved 2026-09-29; it is not a separate presskit license. The page's copyright
notice names Team17 Digital Limited. No general redistribution license or publisher
endorsement is asserted. Wardogs retains its independent
[presskit provenance](../../assets/presskit/wardogs-january-2026/catalog.json).

## Reconstruction and content limits

Corrections use native SVG composition and encoded raster exports from existing
source imagery. The actual crest and game marks are embedded as assets; no AI
redrawing or font imitation replaces them. Existing scene/tactical artwork is
retained as source material, with derivative encoding/resizing where required.
Earlier AI illustrations remain illustrations, not evidence of clan gameplay.

Brand correction does not turn the compositions into current editorial content:
Czech baked captions, dated match examples, donation/VIP themes, opponent names
and result placeholders require contextual review. Corrected exports already use
canonical valkyria.cz; legacy domains remain only in preserved originals. Keep the
canonical domain in newly rendered UI/sharing output. Never translate an
English screen by serving Czech pixels, infer results from templates, seed a
scheduled event from an example or publish a placeholder score.

For live content, prefer retained clean layers plus localized semantic text and
the exact marks in the existing CMS/social renderer. Use corrected ready-made
compositions only where their actual caption, locale, ratio and publication context
are appropriate. Retain HTML headings, server state, results and accessible names.

## Claude integration order

1. Fetch/reconcile the latest assets/graphics-pack-handoff changes with ongoing
   PR #70 work. Preserve existing edits and independent migration/runtime changes;
   do not reset the implementation to an earlier archive-only snapshot.
2. Read the corrected catalog first. Replace previous selections of the 340 old
   branded compositions with mapped corrected paths or clean-layer derivations.
   Keep originals and source notices intact.
3. Replace game-name stand-ins where the app displays a brand mark, including the
   HLL hub card, with the official graphic. Keep real localized game names as
   semantic link/image labels; ordinary text references need not become logos.
4. Apply the [interface icon handoff](icon-handoff.md) only to current component
   gaps. Original UI glyphs do not substitute for clan/game/Discord branding.
5. Preserve PR #69's cover, scoped responsive loading, current game video contracts,
   themes, menu geometry, publication controls and game/locale boundaries.
6. Register selected runtime assets/derivatives and produce actual app evidence
   using the [updated cloud handoff](../handoff/graphics-claude-code-cloud.md).

## Evidence scope and rights

The [brand-correction evidence record](../evidence/graphics-brand-correction-2026-09-29/README.md)
is the location for the actual browser source gallery and four contact-sheet PNGs:
44 source samples spanning 20 maps, 14 editorial themes, three Discord banners and
seven Foy format examples. Read its recorded checks/captions for the performed
validation. These are source-asset reviews, not screenshots of a working website.

The independent [icon evidence](../../assets/icons/valkyria-ui/evidence/README.md)
covers only the original UI glyphs. App tests, CS/EN integration screenshots and
deployment acceptance remain separate. No new live acceptance is claimed here.

Game marks, clan branding, corrected compositions and underlying game imagery do
not acquire the repository's Apache license. Adapted map-rendering code/templates
retain source provenance and applicable upstream terms. Preserve the supplied
notices and [NOTICE.md](../../NOTICE.md). The separate original UI icon geometry is
covered by the repository code license.
