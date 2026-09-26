# Notices and asset scope

The root Apache-2.0 license covers original repository code and documentation.
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
