# Current status

Updated: 2026-09-26. Stage: **1.0.0 — public website deployed; live authentication deferred.**

## First public deployment

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
Migrations: 0000_initial_schema.sql applied; 0001_role_sync.sql prepared and verified
  offline, not deployed. Repeated runs are no-op.
Open: operator launch inputs and follow-ups listed below; M4 #7 and #22.
  #8 receiver implemented with paired offline proof; exact-head CI/review pending.
Next executable step: configure Discord OAuth/guild roles and finish remaining #23 acceptance.
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
- Live SSO/admin configuration and acceptance remain deferred. Production host, DNS,
  proxy/TLS, registry publication, media delivery and `publish-due` timer were subsequently
  verified in the first-deployment evidence linked above.
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

## Discord role-sync receiver (2026-09-26)

Website [#8](https://github.com/ValkyriaWDG/www/issues/8) now has a default-disabled
signed receiver, additive `0001_role_sync.sql`, durable replay/order receipts and
departure tombstones. Events invalidate cached roles and revoke affected Discord
sessions; only fresh website REST observations grant capabilities. Generation checks
fence in-flight REST and cached actors. Scheduled publication locks/rechecks the verified
authority inside the content transaction and checks freshness again after audit writes.
Local MFA recovery retains its independent grant path.

The [contract/runbook](integrations/discord-role-sync.md) defines enablement and rotation.
[Offline evidence](evidence/discord-role-sync-2026-09-26/README.md) records both source
revisions, exact dirty pre-commit file hashes, six inspected CS/EN screenshots and limits.
Passed: role-sync unit 15; focused PostgreSQL 77; actual pinned bot sender/HTTP receiver
contract 7; browser journeys 4; foundation tests 19; lint and production build including
TypeScript/CLI bundles. Independent review reproduced and verified the mapping-lock,
translation-lock and audit-expiry races. The separately required CI contract job checks
the actual public bot revision `4f3db011ec0aa96eaaa96bfb7b71cd4bffd804ac`.

Earlier broader Windows runs had platform/fixture failures (unit 380/384, integration
235/237); the evidence preserves them, and final applicable PR-head Linux CI remains
required. Receiver/sender enablement and production migrations were not performed.
Live real-guild/network/rotation/recovery acceptance remains in
[bot #5](https://github.com/ValkyriaWDG/bot/issues/5) and website #23. Offline website #8
completion does not close those operational gates.
