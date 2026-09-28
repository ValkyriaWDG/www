# Current status

Updated: 2026-09-28. Stage: **SEO, release qualification and authorization fixes merged on main; unified HLL/WDG platform implemented on draft PR #37 (not deployed); live authentication deferred.**

## Unified platform / HLL implementation

Branch `feat/hll-platform-handoff`, draft PR [#37](https://github.com/ValkyriaWDG/www/pull/37),
issue [#36](https://github.com/ValkyriaWDG/www/issues/36) (stays open). Built on the
[handoff](handoff/hll-claude-code-cloud.md); nothing is deployed and no DNS changed.

- **Routes:** `/cs` and `/en` are the community hub; `/{locale}/hll/...` (news, matches,
  servers, members, field-manual, clan, community) and `/{locale}/wardogs/...` (the
  preserved Wardogs menu shell). Shared lists keep working; news/match details live at
  their canonical game section and old shared URLs redirect permanently. A game switch
  keeps locale and page category or explains the destination (`?switch=`).
- **HLL presentation:** `[data-theme='hll']` token overrides, landing menu lane, content
  masthead/section bar/drawer and a cinematic stage: one clip per document from
  `HLL_BACKGROUND_CLIPS_JSON` (empty by default → static fallback), no video request
  under reduced motion, Save-Data or the narrow touch default, one alternate on failure.
- **Game-scoped authority:** Discord role mappings and local admin grants can carry
  `games`; content, manual, matches and members check the resource game on every private
  read and mutation (denials audited). Media/settings/audit/access stay platform-only.
- **Servers:** server-only status boundary with fresh/stale/unavailable read models;
  `SERVER_STATUS_SOURCE=none` by default, labelled synthetic snapshots for tests.
- **Field manual:** `manual` documents on the shared CMS (drafts, revisions, preview,
  scheduling, publication), manual categories, provenance metadata, diacritic-insensitive
  search with abbreviations, table of contents; legacy guides import only as draft shells.
- **Legacy:** reviewed redirect resolver, active only for `LEGACY_HLL_HOSTS` (empty).
- **Migration:** additive `0001_unified_platform_scope.sql` (upgrade from 0000 data and
  repeated run verified locally).

Not done / blocked: approved clan footage (stage shows its fallback), hosted Logi and
real server status, legacy guide text/images (host blocked in this environment; reuse of
external illustrations unrecorded), FAQ/events/tournaments/leaderboards destinations,
legacy match-ID aliases, scoped media library for game-scoped editors, domain cutover.
Evidence: [hll-platform-2026-09-28](evidence/hll-platform-2026-09-28/README.md).
Earlier preparation evidence: [hll-handoff-2026-09-28](evidence/hll-handoff-2026-09-28/README.md).

## Publication authorization hardening

PR #35 was merged as `df119f8df2fff5d84c579c0843dd5c1bf4942468`, narrowed from the retired custom bot receiver to provider-independent
website fixes. Discord request authorization rereads its durable session/observation
after mapping waits; scheduled publication locks and revalidates its exact membership
or local grant before publishing and after audit waits. Same-timestamp updates and
revocation cannot reuse the earlier authorization. The old receiver, custom-bot CI,
transport tables and unapplied `0001_role_sync.sql` are removed from the candidate.
There is no schema change, provider activation or Logi readiness claim.

See [local proof and limitations](evidence/authority-fences-2026-09-28/README.md).
[CI 36436602897](https://github.com/ValkyriaWDG/www/actions/runs/36436602897) passed
for head `9faefd03ea53c838a9d731690c813c3be1562589`, tested merge
`f807ff95ff08e76c09fbb7cb5d3d7512f2541766`: 39 tooling, 374 unit, 240 database
and 119 browser tests; 67 opt-in browser cases were skipped. Image/release and page
budget checks also passed. Hosted membership/SSO acceptance stays in #8/#23; this does not close those
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

Issue #26 is accepted: [release hardening](operations/release-hardening.md) adds cold
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
The authorization qualification above includes that accepted main. Hosted Logi is the selected integration
direction; #34 was closed unmerged as superseded and #35 retains only independent
website authorization fixes. Follow the updated
[integration handoff](engineering/follow-up-integration-2026-09-26.md). No candidate
image has been published or deployed; the recorded live deployment remains unchanged.

Maintenance [PR #39](https://github.com/ValkyriaWDG/www/pull/39) / issue #38 consolidates action updates #10–#14, the scoped
[esbuild advisory repair](engineering/esbuild-advisory-2026-09-28.md), portable
[media tests and storage path validation](evidence/portable-media-2026-09-28/README.md).
[Action compatibility](engineering/ci-action-refresh-2026-09-28.md) records preserved
publication gates. The PR records its current reviewed head, complete CI and merge
status; verify those before release. Local success does not replace current-head CI.

Issue #25 now has [native Edge H.264 evidence](evidence/native-media-2026-09-28/README.md):
11 MP4-only and two dual-source scenarios passed, including a natural 192.4723-second
wrap and controlled WebM-to-MP4 fallback. Historical source hashes and actual captures
are recorded; Chrome, Firefox, Safari/iOS, physical devices and production playback
remain outside that local run.

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
- The original cloud Chromium lacked H.264. Native Edge MP4 playback is now verified
  by the separate evidence above; actual Chrome, Firefox, Safari/iOS and physical
  mobile-device acceptance remain open in #25.
- Live SSO/admin configuration and acceptance remain deferred. Production host, DNS,
  proxy/TLS, registry publication, media delivery and `publish-due` timer were subsequently
  verified in the first-deployment evidence linked above.
- The initial 1.0.0 validation did not include rollback rehearsal or page-weight/Web
  Vitals budgets. Issue #26's accepted combined-source Linux qualification is recorded
  in the checkpoint and durable release evidence above.

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
