# Native graphics export tools

These tools rebuild the owner's editable source templates with the exact approved
clan/game marks. They do not execute archived editors, redraw logos, modify original
sources, update application routes or publish content. The adapted map renderer
retains the source-pack rights boundary described in the root notice.

Use Node 24 and an isolated local tool directory. Tested with sharp 0.35.4,
@napi-rs/canvas 0.1.100 and Playwright 1.63.0. Arial and Impact must already be
available as system fonts; they are not distributed here. The exporter refuses
silent font substitution. Existing application fonts stay unchanged.

```sh
npm install --prefix .local/graphics-tools --no-save sharp@0.35.4 @napi-rs/canvas@0.1.100 @playwright/test@1.63.0
node scripts/graphics/export-branded-pack.mjs
node scripts/graphics/capture-branded-pack.mjs
node --test scripts/tests/branded-assets.test.mjs
node scripts/check-foundation.mjs
```

Install Playwright Chromium in that tool environment if it is not already present.
Alternatively set `GRAPHICS_MODULE_ROOT` to an existing dependency directory; this
is a local tool resolution override, not application configuration or a credential.
The dependencies and browser are only required for regeneration/capture. The
committed asset contract tests use Node alone.

The full exporter writes 340 derivatives and their old-to-new catalog beneath
`assets/design-packs/valkyria-2026-09-29/branded/`. It verifies all raster decodes,
dimensions, source digests and the unchanged 5 MiB per-file budget. `--sample` is a
local preview option: it rewrites the catalog with `sampleOnly: true`, which the
tests intentionally reject. Always run a complete export before delivery.

HLL scene WebPs are embedded losslessly as PNG in native SVG because some SVG
decoders cannot render embedded WebP. Tactical previews use JPEG98 with 4:4:4
sampling to stay within the existing file budget; original WebPs remain intact.
Editable SVG lettering relies on the stated fonts; raster exports are the stable
visual reference. Different native font/browser builds may change exported bytes.
After regeneration, review captures and refresh manifest hashes deliberately.

The capture tool creates a local static gallery and four actual Chromium captures
under `docs/evidence/graphics-brand-correction-2026-09-29/`. It checks 44 image decodes,
page errors, external network requests and horizontal overflow. Those captures
prove the exported assets, not integration into the website. Application behavior,
localization and runtime budgets remain the implementing agent's responsibility.
