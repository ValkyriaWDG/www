# Corrected branding exports

This is the authoritative branded source layer for the 2026-09-29 graphics handoff.
It replaces selection of the archive's typographic clan/game stand-ins with the
actual Valkyria crest and official HLL/Wardogs marks. It does not overwrite originals
or implement website behavior.

Read [catalog.json](catalog.json) before selecting an asset:

- 340 corrected outputs: 240 HLL map exports and 100 editorial/Discord exports.
- Coverage for all 458 original visual files: 340 use-corrected-export,
  107 retain-unbranded-source and 11 archive-reference-only.
- Each output records its original path/hash, output hash/bytes/dimensions and
  brand identities; logoSources records the exact marks.
- All 497 original package files remain preserved/reconstructable in the parent
  source archive. This folder contains derivatives only.

The exporter reconstructs native SVG layouts and raster variants using existing
scene/tactical material. It embeds exact brand assets; it does not redraw their
geometry with AI or fonts. Source illustrations keep their original provenance.

Use corrected exports only for a matching caption, locale, ratio and context.
Czech baked text, dates, opponent examples and score placeholders are not live
facts or English translations. Retained clean source layers plus localized templates
are preferable for dynamic CMS/social output. Do not run source editors or ship the
complete archive/gallery to browsers.

See the [brand-correction guide](../../../../docs/assets/brand-correction-2026-09-29.md),
[cloud integration handoff](../../../../docs/handoff/graphics-claude-code-cloud.md)
and [browser source-gallery evidence](../../../../docs/evidence/graphics-brand-correction-2026-09-29/README.md).
Continue PR #70 without overwriting concurrent work. Preserve the accepted PR #69
hub cover. Contact sheets are asset proof, not app or deployment acceptance.

Brand/game-image rights remain separate from the code license. Preserve
[the original notices](../source/05-zdroje/ZDROJE-A-PRAVA.md),
[the upstream license](../source/05-zdroje/HLL-reference-repository-LICENSE.txt)
and [root NOTICE](../../../../NOTICE.md). Neither reconstructed templates nor
adapted map-renderer code receive a blanket claim of original Apache authorship.
