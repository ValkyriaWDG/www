# Current status

Updated: 2026-09-28. Stage: **1.0.0 deployment; publication authorization hardening prepared; live authentication deferred.**

## Publication authorization hardening

PR #35 is narrowed from the retired custom bot receiver to provider-independent
website fixes. Discord request authorization rereads its durable session/observation
after mapping waits; scheduled publication locks and revalidates its exact membership
or local grant before publishing and after audit waits. Same-timestamp updates and
revocation cannot reuse the earlier authorization. The old receiver, custom-bot CI,
transport tables and unapplied `0001_role_sync.sql` are removed from the candidate.
There is no schema change, provider activation or Logi readiness claim.

See [local proof and limitations](evidence/authority-fences-2026-09-28/README.md).
Hosted membership/SSO acceptance stays in #8/#23; this candidate does not close those
issues. The deployment observations below are historical and were not refreshed by
this local work. Continue the shared platform and hosted Logi workstreams against
their agreed contracts rather than restoring the custom bot protocol.

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

Issue #26 candidate: [release hardening](operations/release-hardening.md) adds cold
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
coverage and regression results. Issue #29 still requires production HTTP verification
after an authorized release; source merge does not prove deployment.

PR #32 merged as `eaf9f911f13c0b929c8f7d90529c0ccab5dd0701` after
[CI 36435186950](https://github.com/ValkyriaWDG/www/actions/runs/36435186950) passed
on head `cfececb5fa5e48c013f1593a3ac2f9855df17588` / tested merge
`07a58689f7ca8051200f128eca14b43fc9f7c1ad`: 39 tooling, 374 unit, 229 database
and 119 browser tests, both runtime variants' CS/EN social PNGs, all 12 rollback
steps and all nine page-budget samples. Issue #26 is closed with acceptance proof.
The narrowed authorization candidate now incorporates that accepted main; its own
changed source still requires fresh CI. Hosted Logi is the selected integration
direction; #34 was closed unmerged as superseded and #35 retains only independent
website authorization fixes. Follow the updated
[integration handoff](engineering/follow-up-integration-2026-09-26.md). No candidate
image has been published or deployed; the recorded live deployment remains unchanged.

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
- The initial 1.0.0 validation did not include rollback rehearsal or page-weight/Web
  Vitals budgets. Issue #26's accepted historical Linux qualification and the separate
  pending combined-source qualification are recorded in the checkpoint above.

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
