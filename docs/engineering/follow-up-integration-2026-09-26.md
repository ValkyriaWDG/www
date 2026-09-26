# Follow-up integration handoff — 2026-09-26

This is a source compatibility review and acceptance plan, not proof that the four
features have been integrated, merged or deployed. The reviewed worktrees were clean
at these heads, all based on `507e704d288cd93d7baa0d1ab22ba8347fd67b0a`:

| Pull request | Scope | Reviewed source SHA |
|---|---|---|
| [#33](https://github.com/ValkyriaWDG/www/pull/33) | Public SEO and social images | `14b0863c498f3f117426e448dfe68dcceb977b5f` |
| [#35](https://github.com/ValkyriaWDG/www/pull/35) | Discord role-sync receiver and authorization fences | `0764ff996f31d51a6710f8b982fc1f1744499c28` |
| [#34](https://github.com/ValkyriaWDG/www/pull/34) | Private bot administration | `025e4307c9056f0703930cdff1a2dd4cab454a4b` |
| [#32](https://github.com/ValkyriaWDG/www/pull/32) | Release/runtime hardening and mobile font stability | `6d48258926aed74b5e1b27bac93b1143f47520b3` |

No inherent runtime incompatibility was identified. The resolutions and combined
checks below remain required. Follow the [GitHub workflow](github-workflow.md),
[verification workflow](verification-workflow.md), [evidence policy](evidence.md),
[release workflow](release-workflow.md) and [deployment runbook](../operations/deployment.md).
This handoff grants no merge, publication or deployment authority.

## Integration order and conflict resolutions

Preferred order: **#33 → #35 → #34 → #32**. Refresh each remaining branch against
the accepted main revision and require its new exact-head CI. #34 and #35 may swap;
keep #32 last so the release rehearsal covers both the new schema and social renderer.
Record the resulting heads; earlier green runs do not qualify changed source.

| Shared area | Required resolution |
|---|---|
| `.github/workflows/ci.yml` | Keep both `bot-management-contract` and `role-sync-contract` jobs. `quality.needs` must contain `foundation`, `application` and both jobs. Retain both success/skipped assertions, plus #32's application timeout, page budgets, image rehearsal, runtime scans and artifacts. |
| Paired bot source | Both contract jobs pin `4f3db011ec0aa96eaaa96bfb7b71cd4bffd804ac`. Their `apps/web/tests/support/bot-source.ts` additions are byte-identical; retain one file. Keep their independent jobs/databases so fixture teardown cannot collide. Preserve the standalone bot Vitest config and the role-sync Vitest project. |
| `.env.example` | Keep both disabled-by-default blocks: `ROLE_SYNC_ENABLED`, `ROLE_SYNC_PRODUCER_ID`, `ROLE_SYNC_KEYS_JSON` and every `BOT_MANAGEMENT_*` key. Do not restore obsolete `ROLE_SYNC_SIGNING_SECRET`. Preserve mutual signing-secret separation and synthetic role-sync settings only in the isolated browser environment. |
| Authorization | Retain #34's `bot.read`/`bot.configure` capabilities and #35's full membership/session generation checks and scheduled-publication fences. Bot administration continues through the shared resolver; signed events invalidate authority and never grant it. |
| `apps/web/src/i18n/messages/index.ts` | Retain both `social` and `adminBot` imports/namespaces in CS and EN. Keep both language files and the bot navigation labels. |
| `assets/manifest.json` | Union the new entries rather than selecting one branch's entire file. At review: SEO 12, bot 11, role sync 6, release 4; no duplicate new IDs or paths. Preserve each file's actual hash and provenance. |
| `docs/STATUS.md` and evidence | Retain all feature sections. Preserve historical tested revisions and limitations; add new integrated evidence separately instead of relabeling old screenshots or runs. |

## Migration before application start

#35 adds `packages/db/drizzle/0001_role_sync.sql`, including
`guild_membership.authorization_generation`. Ordinary authorization queries use that
column even when `ROLE_SYNC_ENABLED=false`. Apply the complete candidate migration
chain **before starting the combined application image**; disabled integrations do
not make migration optional. Follow the backup and explicit migration steps in the
[deployment runbook](../operations/deployment.md) and [database workflow](database-workflow.md).

The release rehearsal must record its observed `appliedProductionMigrations` count;
remove the reviewed script's static claim that the release has no production migration.
Keep the synthetic nullable-column probe explicitly separate from real migrations.
Rehearse upgrade, repeated migration, old-image compatibility and backup restoration
against the final candidate. Public-page/media rollback proof does not establish
enabled Discord integration or authenticated-session rollback acceptance.

## Combined acceptance before release

1. On the integrated revision, pass foundation checks, lint, types, unit tests,
   PostgreSQL integration tests, the production build and CS/EN browser suites.
   Retain the stale/revoked authorization regressions, bot denied/unknown states,
   publication privacy checks and mobile font-arrival regression.
2. Require both pinned-bot contract jobs and the complete **Quality gate**. Their
   evidence proves local HTTP/database contracts against the recorded bot source;
   it does not prove live Discord, production bot connectivity or configured secrets.
3. Build both runtime variants from the same source and verify OCI revision,
   non-root/read-only operation, writable media/cache, native image processing,
   health, scans, migration/rollback and the page budgets described in
   [release hardening](../operations/release-hardening.md).
4. When the source includes
   `apps/web/src/app/api/social/[locale]/[kind]/[[...slug]]/route.ts`, require both
   candidate and same-source bookworm images to return HTTP 200 `image/png`,
   **1200×630**, from `/api/social/cs/site` and `/api/social/en/site`. This exercises
   the traced Latin/Czech WOFF fonts and shipped artwork in the actual containers.
   Missing source is explicit N/A before #33 integrates; source present with a
   failed probe fails acceptance. Exclude the immutable previous image, which
   predates those routes.
5. Inspect artifacts and relevant CS/EN desktop/mobile captures. Record the final
   source SHA and image digest. After an authorized merge, require fresh main CI;
   publication and live deployment verification remain separate operations under
   the deployment runbook. Keep integration switches disabled until their paired
   operational acceptance is complete.

The read-only review ran no combined application, container, database or live-provider
tests. Its conclusions must not be reported as those tests passing.
