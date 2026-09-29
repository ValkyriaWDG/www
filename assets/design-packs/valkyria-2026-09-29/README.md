# Valkyria complete graphics source pack

Owner-supplied `VALKYRIA-GRAFIKA-KOMPLET.zip`, received 2026-09-29. This is a
**design-source handoff**, not a runtime import or implementation acceptance.

## Current selection uses corrected exports

Start with [branded/README.md](branded/README.md) and
[branded/catalog.json](branded/catalog.json). All 340 original branded compositions
have separate corrected replacements using the actual Valkyria crest and official
game marks. The catalog classifies every original visual as a replacement, retained
clean source or archive-only reference. Its selection decisions supersede the old
branded previews. The 497-file original archive below is unchanged.

See the [brand-correction guide](../../../docs/assets/brand-correction-2026-09-29.md)
and [interface icon handoff](../../../docs/assets/icon-handoff.md). Continue the
existing PR #70 implementation without overwriting concurrent work. These source
assets do not replace the owner-selected PR #69 hub cover or prove app integration.

## Preserved original inventory

- Original archive: **245,357,125 bytes**, SHA256
  `b4fe3e080cecf2cac9c3f10d26198d2b367d353a42187433344059d19465574b`.
- **497 original files / 259,585,695 uncompressed bytes**, all accounted for.
- `source/` preserves 496 original files, names and bytes. The remaining 15,782,934-byte
  HLL `EDITOR.html` is stored in four inert `editor-parts/` chunks to preserve the
  repository's 5 MiB file limit. No original was discarded or recompressed.
- [inventory.json](inventory.json) maps every original path to its stored path or
  ordered parts, with SHA256, size and image dimensions where applicable.
- [verification.json](verification.json) records fresh validation. Supplied
  `KONTROLA.json` files remain historical author reports; their count of 496 is
  superseded by the observed 497-file inventory, not silently edited.

Read the [English catalog](../../../docs/assets/graphics-pack-2026-09-29.md) and
[Claude implementation handoff](../../../docs/handoff/graphics-claude-code-cloud.md).
The Czech source notes are retained as original reference material, not agent instructions.
Source galleries, generated previews and bundled QA reports do not prove web implementation.

## Verify or reconstruct the complete original tree

From the repository root with Node 24:

```sh
node assets/design-packs/valkyria-2026-09-29/restore.mjs --verify
node assets/design-packs/valkyria-2026-09-29/restore.mjs --restore
```

The second command reconstructs every original file under
`.local/graphics-pack-2026-09-29/restored/`, including the original self-contained
HLL editor. It checks all hashes before writing, verifies each file again when
writing, refuses an existing output directory and never executes/opens the source
HTML or scripts. The output is Git-ignored. No network or external ZIP is required.
Do not run the supplied editors with application sessions or promote their scripts
to public routes without a separate integration/security review.

The entire pack is excluded from Docker build context and is outside app `public/`.
Future implementation copies only selected, registered runtime derivatives and
keeps unneeded original tactical maps, concepts and offline tools out of page bundles.

## Source and rights boundaries

Keep [the source notices](source/05-zdroje/ZDROJE-A-PRAVA.md) and
[included upstream license notice](source/05-zdroje/HLL-reference-repository-LICENSE.txt).
The supplied provenance distinguishes HLL game-derived map imagery from earlier AI
illustrations. The MIT notice explicitly excludes game imagery; neither inclusion
here nor the root Apache license grants a new license for these assets. Source HTML,
scripts and documents are third-party/owner-supplied reference material too.

Use the existing original clan crest. Templates contain Czech copy, legacy domains,
placeholders and dated claims. Do not publish them as live facts or English artwork.
