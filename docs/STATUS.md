# Current status

Updated: 2026-09-26. Stage: **1.0.0 — M1–M3 implemented and verified; not deployed.**

## Checkpoint (resume here)

```text
Release: 1.0.0 (CHANGELOG.md) from PR #19, branch claude/eager-mayer-0tk36i
Delivered: Czech-first /cs + /en website with the Wardogs menu shell and full-length
  background media, public news/clan/community/members/matches/privacy pages, Discord
  sign-in with fail-closed role mapping and MFA local-admin recovery, editorial
  administration (visual editor, media library, revisions, preview, scheduling),
  community administration (matches, members, settings, audit), migrations, CLIs,
  non-root image with CI scan/SBOM, backup/restore rehearsal.
Evidence: docs/evidence/app-1.0.0/README.md (captioned captures + measurements.json)
Migrations: packages/db/drizzle/0000_initial_schema.sql (first production apply is an operator step)
Open: operator launch inputs and follow-ups listed below; M4 (#7, #8) and #22.
Next executable step: operator launch checklist in docs/operations/deployment.md.
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
- MP4/H.264 playback in the application: this Chromium has no H.264 and the Chrome
  download host is blocked; Firefox/Safari not run. WebM playback is verified.
- Production host, DNS, reverse proxy, TLS, approved background-media origin, registry
  publication (`Publish container` workflow, gated) and scheduled `publish-due` timer.
- Rollback rehearsal (1.0.0 is the first release) and page-weight/Web Vitals budgets.

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

## GitHub

Main requires a pull request, the **Quality gate** and linear history. CI runs foundation,
lint, types, unit, PostgreSQL integration, build, Playwright, container smoke, image scan
and SBOM. Container publication is a separate, gated manual workflow. Private
vulnerability reporting, Dependabot alerts, secret scanning and push protection are on.
