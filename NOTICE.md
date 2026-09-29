# Notices and asset scope

The root Apache-2.0 license covers original repository code and documentation,
including the separately authored UI glyphs in assets/icons/valkyria-ui/.
It does not grant rights to Valkyria branding, third-party game imagery, screenshots,
video, fonts or trademarks. See [asset policy](docs/assets/policy.md) and
[asset manifest](assets/manifest.json) for provenance and intended use.

Wardogs and Hell Let Loose references identify the games played by this independent
community. This project does not claim to be an official game website or to have
publisher endorsement. Do not use the Wardogs wolf emblem as the clan identity.

## Third-party runtime components

Application dependencies are installed from npm under their own licenses (recorded in
`pnpm-lock.yaml`; license files ship with each package). Notable redistributed assets:

| Component | Use | License |
|---|---|---|
| Barlow and Barlow Condensed (via `@fontsource/barlow`, `@fontsource/barlow-condensed`) | Self-hosted web fonts incl. Latin Extended (Czech/Slovak glyphs) | SIL Open Font License 1.1 |
| Tiptap / ProseMirror (`@tiptap/*`) | Administration rich-text editor only (not loaded on public pages) | MIT |
| Next.js, React, next-intl, Better Auth, Drizzle ORM, zod, sharp (libvips) | Application runtime | MIT / Apache-2.0 / LGPL-3.0 (libvips, dynamically linked prebuilt binary) |

Bundled CLI files (`apps/web/dist/cli/*.mjs`) retain third-party license comments.

The selected January 2026 Wardogs presskit images and logo variants retain their
third-party rights and are excluded from the Apache-2.0 code/documentation license.
No license file or separate usage grant was found in the supplied source package;
this repository does not assert a general redistribution license. See the
[presskit guide](docs/assets/presskit-2026-01.md) and
[source catalog](assets/presskit/wardogs-january-2026/catalog.json) for provenance
and intended editorial/game-identification use.

The ten HLL runtime WebP derivatives are selected promotional game imagery from
the official Steam listing and developer update material. Their sources, source
hashes, transformations and intended placements are recorded in
[the runtime artwork catalog](assets/hll-runtime-artwork.json). They retain their
respective rights holders' rights and are excluded from the Apache-2.0 license.
They illustrate the game, not actual Valkyria matches or verified game mechanics.

The [owner-supplied 2026-09-29 graphics pack](assets/design-packs/valkyria-2026-09-29/README.md)
is archived reference material, including its original code/documents, game-derived
map imagery and AI illustrations. It is excluded from the root Apache-2.0 grant.
Its bundled source/rights notices remain intact; the included upstream MIT notice
does not license game imagery. New original catalog documentation and archive
reconstruction tooling follow the repository code/documentation license.
Adapted map-rendering code and reconstructed SVG composition templates retain
their supplied-source provenance and applicable upstream conditions; do not treat
them as wholly original Apache-licensed work. Derived branded compositions also
retain the underlying clan/game-image rights. No pack asset is added to runtime
merely by this handoff.

The [official HLL mark delivery](assets/brand/game-logos/README.md) contains the
extracted navigation SVG from the official Hell Let Loose website and a standalone
variant with only the root viewBox spelling normalized. The source page identifies
Team17 Digital Limited in its copyright footer. The full emblem/wordmark and its
derivatives are third-party game artwork/trademarks, excluded from the Apache grant.
The catalog establishes source provenance, not a general redistribution license,
trademark permission or publisher endorsement.

The [brand-corrected export layer](assets/design-packs/valkyria-2026-09-29/branded/README.md)
uses the exact supplied Valkyria crest, that official HLL mark and the existing
Wardogs presskit mark. Native SVG reconstruction and raster encoding do not change
those rights boundaries. The separate original interface-icon pack contains no
game logos or extracted game glyphs and remains under the repository code license.
