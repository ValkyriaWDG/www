# Follow-up integration handoff

Updated 2026-09-28. This replaces the earlier four-PR integration sequence with the
owner's selected hosted Logi direction. Code merge, release qualification and live
deployment are separate states. Follow the [GitHub workflow](github-workflow.md),
[verification workflow](verification-workflow.md), [evidence policy](evidence.md),
[release workflow](release-workflow.md) and [deployment runbook](../operations/deployment.md).

## Current integration boundary

- [PR #33](https://github.com/ValkyriaWDG/www/pull/33), public SEO/social images, was
  merged as `b37931393cd9b836415724d9572765f8615c31e8` on 2026-09-28.
- [PR #32](https://github.com/ValkyriaWDG/www/pull/32) merged as
  `eaf9f911f13c0b929c8f7d90529c0ccab5dd0701` after combined-source
  [CI 36435186950](https://github.com/ValkyriaWDG/www/actions/runs/36435186950).
  The [accepted evidence](../evidence/release-hardening-2026-09-26/accepted-2026-09-28.json)
  records the source, tested merge, artifacts and limitations.
- The owner selected [Ninjonik's hosted Logi](https://github.com/Ninjonik/logi) for
  both Hell Let Loose and Wardogs. Separate upstream integration work must establish
  capabilities and contracts before website integration is enabled.
- [PR #34](https://github.com/ValkyriaWDG/www/pull/34) closed unmerged as superseded.
  [PR #35](https://github.com/ValkyriaWDG/www/pull/35) was narrowed to provider-independent
  authorization fixes, reviewed and merged as `df119f8df2fff5d84c579c0843dd5c1bf4942468`.
  Its [evidence](../evidence/authority-fences-2026-09-28/README.md) covers role/session
  freshness and publication races, not Logi compatibility. The retired receiver,
  management API and transport migration are not integration prerequisites.
- [PR #39](https://github.com/ValkyriaWDG/www/pull/39) merged as
  `e8f19d7b3f664e82d545a58a97a9e215469e62c5`; [PR #40](https://github.com/ValkyriaWDG/www/pull/40)
  merged as `425fb5f3ae058764723182b097ecaf7d5bd2119c`. Their maintenance checks and
  acceptance proof are linked from each PR. Neither merge published or deployed an image.
- Claude owns the ongoing unified HLL website implementation in PR #37. This refresh
  does not edit that branch or claim its runtime acceptance.

## Preserve these integration boundaries

| Shared area | Required resolution |
|---|---|
| `assets/manifest.json` | Preserve the union of 12 SEO captures and 4 release captures, with their actual hashes and provenance. Never select one branch's entire catalog. |
| `docs/STATUS.md` and evidence | Retain SEO and release sections, historical tested revisions and limitations. State combined-source verification separately. |
| CI | Retain complete application checks plus #32's page budgets, image rehearsal, runtime scans and artifacts. Require Foundation, Application and Quality gate on the refreshed source. |
| Social rendering | The source route is now present. Both actual same-source runtime images must render/decode CS and EN 1200×630 PNGs; N/A is no longer acceptable for these variants. |

This integration has no production schema migration. Do not import the old
`0001_role_sync.sql` as a prerequisite. Future approved migrations must follow the
[database workflow](database-workflow.md), run explicitly before application start,
and be tested against the complete accepted migration chain. The rehearsal records
its observed `appliedProductionMigrations`; its nullable-column probe remains
separate from application schema. Public-page/media rollback does not prove
compatibility of authenticated sessions or enabled provider integrations.

## Combined acceptance before release

1. Pass foundation/tooling, lint, types, unit tests, PostgreSQL integration tests,
   production build and CS/EN browser suites on the combined revision. Retain
   publication privacy, authorization denial and mobile font-arrival regressions.
2. Require the complete Quality gate. The deferred hosted Logi integration is not
   made ready by these website checks or by legacy-bot contract jobs.
3. Build both runtime variants from the same exact source; verify OCI revision,
   non-root/read-only operation, writable media/cache, native sharp, health,
   advisory reports, migration/rollback and restoration. Review the complete
   [release-hardening evidence](../evidence/release-hardening-2026-09-26/README.md).
4. Require HTTP 200 `image/png`, 1200×630 and full decoding from
   `/api/social/cs/site` and `/api/social/en/site` in both runtime variants.
   This proves traced fonts/artwork exist in the actual containers. The immutable
   previous image predates these routes and is not required to serve them.
5. Inspect budget samples, `sourceRevision`, `sourceDirty` and `dirtyPaths`,
   actual screenshots and runtime artifacts. A generated SBOM is recorded, not
   silently ignored; the historical report without dirty paths remains unchanged.
6. Record the accepted source SHA and image digest. After an authorized merge,
   require fresh main CI. Publication and live deployment follow their own scope;
   keep authentication/provider switches disabled until operational acceptance.

Foundation/tooling checks do not substitute for combined application,
container, database, browser or live-provider verification. Earlier green runs and
screenshots remain evidence only for their recorded source and environment.
