# Current status

Updated: 2026-09-28. Stage: **Public SEO/social updates and the mobile article repair deployed; live authentication and hosted Logi acceptance remain deferred.**

## Latest production refresh

PR #44 merged as `9a872918ad4d89935eb26118d853d40776af7d66`. Its final PR CI and
[exact-main CI 36455739949](https://github.com/ValkyriaWDG/www/actions/runs/36455739949)
passed: 53 tooling, 13 encrypted-recovery, 379 unit, 240 database and 124 browser
tests; 67 opt-in browser cases were skipped. All nine unchanged cold-mobile samples
passed; the article's maximum CLS was 0.005100. The original failed run is preserved
below. Issue #43 is closed with red/green measurements and inspected screenshots.

[Publication 36457009482](https://github.com/ValkyriaWDG/www/actions/runs/36457009482)
passed its separate verification and protected environment gate. The public image
`majorluk/valkyria-www@sha256:cab3230e760ced4e10a52c00327d863ca5c704093cd81ef61ea000b38d368e93`
is now running at that exact source revision. No version tag or mutable image alias
was created. [Runtime readback](evidence/production-refresh-2026-09-28/runtime-after.json)
confirms healthy configuration/database/schema/media, uid 10001, a read-only root,
dropped capabilities, no published host ports, unchanged approved media hashes and
disabled authentication. Watchtower remains off for the digest-pinned service.

The web and publication timer were quiesced for a paired database/editorial backup.
Both checksums and archive readability passed; no new semantic restore was performed
on this production backup. Migration reported **0 applied, 1 already applied**.
Configuration and persistent media were preserved; the previous image/configuration
remain available. The timer resumed and a subsequent natural publication pass exited
successfully. This does not establish overdue-content monitoring or alert delivery.

[Public HTTP verification](evidence/production-refresh-2026-09-28/http-after.json)
passed **37/37**, including both homepage canonicals/alternates and six fully decoded
1200×630 social PNGs. The original browser run remains failed at 5/6. A reviewed run
passed all six UI/playback/navigation checks but failed its seventh network gate on
two non-prefetch RSC aborts. A bounded diagnostic reproduced aborts after HTTP 200
and before successful same-document rendering, with six seconds before each next
action; their exact cause remains unresolved. #46 tracks that investigation. Both
failed reports and eight inspected captures are preserved. See the [refresh evidence](evidence/production-refresh-2026-09-28/README.md)
for exact source/digest, CI artifacts, observed results and verification limits.

Remaining launch work stays in #23: hosted Logi membership/SSO and role removal (#8),
recovery administrator/MFA, owner privacy decisions, encrypted off-host recovery and
actual monitoring/alert delivery. #25 retains Safari/device/retail-Firefox and media
performance qualification. #45 is accepted through PR #47, merged as
`0b843e5458aae485b33e3d5f5f4e11348a994ee4`: restore tooling refuses existing or
ambiguous targets without DROP or directory deletion. Its [Linux CI qualification](evidence/production-refresh-2026-09-28/restore-boundaries-ci-qualification.json)
passed six real PostgreSQL 17.11 restore tests, 126 tooling tests and the complete
application/image/browser gates at PR head `19a30dd1b110d11c63a97a1755a352989579eb9d`.
Do not use the earlier unsafe script against operator targets. This tooling merge
did not deploy another image or prove off-host recovery. HLL and Logi workstreams remain
separate from this deployment.

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
issues. The first-deployment observations below remain historical; the latest runtime
is recorded above. Continue the shared platform and hosted Logi workstreams against
their agreed contracts rather than restoring the custom bot protocol.

## First public deployment

Historical observations from **2026-09-26**, not a fresh runtime check during this
maintenance work. Present-tense descriptions in this section refer to that observation.

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

## Earlier qualification checkpoints

PR #42 merged as `df48609e384aca679fb5b72073ea9188ee4785b5` after
[PR CI 36445523409](https://github.com/ValkyriaWDG/www/actions/runs/36445523409)
passed for head `2fd922c9933d4286dd2602afcf2743ef9893ba2a` (tested merge
`68037ab9b4e1eb41ff1cb56ec48199e7d562d945`). It passed 53 tooling, 13 real
encrypted-backup integration, 379 unit, 240 database and 119 browser tests (67 opt-in
browser cases skipped), image/rollback checks and nine cold-mobile page samples.
Issue #41 is accepted for byte-integrity tooling only; off-host recovery remains #23.

The subsequent [main CI 36447034783](https://github.com/ValkyriaWDG/www/actions/runs/36447034783)
failed the article's first cold-mobile sample: CLS **0.2920**, above the unchanged
0.1 limit. The other two article samples passed at 0.0051. Font-loading changes to
metadata wrapping moved the article twice; [#43](https://github.com/ValkyriaWDG/www/issues/43)
tracks a deterministic reproduction and repair. A passing PR run does not override
this later failure. Do not publish this main revision or average away the failed sample.
The 2026-09-28 host preflight still observed the original `d0f98b0` image below,
healthy with authentication disabled; no production promotion had taken place at that preflight.

The [#43 repair evidence](evidence/article-layout-2026-09-28/README.md) keeps compact
metadata in explicit rows while preserving desktop wrapping. A staged-font red/green
reproduction reduced the 391 px Czech shift sum from 0.292901 to 0.004595; all nine
unchanged cold-page samples passed, with article CLS 0.002693 in each sample.
Local production build and 17 focused browser cases passed. The integrating checkout
also passed full lint, typecheck, 379 unit and 53 tooling tests. Final PR and merged-main
CI subsequently passed, as recorded in the latest refresh above.
[Public refresh evidence](evidence/production-refresh-2026-09-28/README.md) preserves
the original 24/37 passing before-state HTTP checks alongside the separate after run.

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
coverage and regression results. The latest refresh supplies the separate deployed
HTTP acceptance for #29; the earlier source merge alone did not prove deployment.

PR #32 merged as `eaf9f911f13c0b929c8f7d90529c0ccab5dd0701` after
[CI 36435186950](https://github.com/ValkyriaWDG/www/actions/runs/36435186950) passed
on head `cfececb5fa5e48c013f1593a3ac2f9855df17588` / tested merge
`07a58689f7ca8051200f128eca14b43fc9f7c1ad`: 39 tooling, 374 unit, 229 database
and 119 browser tests, both runtime variants' CS/EN social PNGs, all 12 rollback
steps and all nine page-budget samples. Issue #26 is closed with acceptance proof.
The authorization qualification above includes that accepted main. Hosted Logi is the selected integration
direction; #34 was closed unmerged as superseded and #35 retains only independent
website authorization fixes. Follow the updated
[integration handoff](engineering/follow-up-integration-2026-09-26.md). At that earlier
checkpoint no candidate image had been published; the latest promotion is recorded above.

Maintenance [PR #39](https://github.com/ValkyriaWDG/www/pull/39) / issue #38 consolidates action updates #10–#14, the scoped
[esbuild advisory repair](engineering/esbuild-advisory-2026-09-28.md), portable
[media tests and storage path validation](evidence/portable-media-2026-09-28/README.md).
[Action compatibility](engineering/ci-action-refresh-2026-09-28.md) records preserved
publication gates. The PR records its current reviewed head, complete CI and merge
status; verify those before release. Local success does not replace current-head CI.

PR #39 merged as `e8f19d7b3f664e82d545a58a97a9e215469e62c5` after
[CI 36438595440](https://github.com/ValkyriaWDG/www/actions/runs/36438595440).
The remaining checkout/artifact action refresh in [PR #40](https://github.com/ValkyriaWDG/www/pull/40)
merged as `425fb5f3ae058764723182b097ecaf7d5bd2119c` after
[CI 36440170118](https://github.com/ValkyriaWDG/www/actions/runs/36440170118) on head
`b12f75e6c13a0d46a3666a0cc1c13496060a0806`, tested merge
`8c7db4486cd1a6248581ee345d6d446346b637e1`. It passed 39 tooling, 379 unit,
240 PostgreSQL and 119 browser tests (67 opt-in browser cases skipped), image/rollback
rehearsal, advisory/SBOM checks and all nine page-budget samples. Independent review
verified the immutable upstream pins and five downloadable evidence archives.
Neither merge published a container or changed the recorded deployment.

Issue #25 now has [native Edge H.264 evidence](evidence/native-media-2026-09-28/README.md):
11 MP4-only and two dual-source scenarios passed, including a natural 192.4723-second
wrap and controlled WebM-to-MP4 fallback. Historical source hashes and actual captures
are recorded; Chrome, Firefox, Safari/iOS, physical devices and production playback
remain outside that local run.

The additional [Chrome and Firefox qualification](evidence/browser-media-2026-09-28/README.md)
passed all 46 executed scenarios on clean application source `e8f19d7`, with full
192.47-second WebM and MP4 loops in Chrome for Testing 154.0.8037.57 and
Playwright-patched Firefox 155.0. Chrome recorded zero dropped frames; Firefox MP4
recorded 61/5,774 dropped frames and a 597 ms maximum frame-callback gap. Functional
playback passed; smooth playback is not universally accepted. Two unsupported Firefox
mobile-emulation cases were explicitly excluded. Actual captures, executable/source
hashes, reproduction harness and metrics are committed. Safari, retail Firefox,
physical devices and production delivery remain open under #25.

Issue #41 adds the [encrypted paired-backup verifier](operations/encrypted-backup-verification.md):
an independent manifest hash and full restic snapshot ID pin the exact database/media
bytes. It rejects stale, incomplete, modified or unsafe recovery sets, uses a new
destination and retains plaintext explicitly for operator handling. Local Windows
verification passed 53 tooling and 13 real restic integration tests; independent
review and the coordinating checkout repeated the recovery checks. The
[durable evidence](evidence/encrypted-backup-2026-09-28/README.md) records exact source
fingerprints. The integrated Linux/application checks passed in PR #42 as recorded
above. This does not prove SQL/media semantic restoration, off-host storage,
scheduling, alert delivery or production recovery; those remain under #23.

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
Next checkpoint: preserve the production refresh proof and close SEO #29 against
  its HTTP acceptance; resolve the separate browser network-gate failures and
  continue #23 operator acceptance and #25
  device/performance coverage. Hosted Logi contracts
  must be established before enabling #7/#8/#22 integration.
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
- The original cloud Chromium lacked H.264. Separate Windows evidence now covers
  native Edge, Chrome for Testing and Playwright-patched Firefox. Safari/iOS,
  retail Firefox, physical mobile devices and the Firefox MP4 frame-drop observation
  remain open in #25.
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
