# Current status

Updated: 2026-09-26. Stage: **foundation / implementation handoff**.

## Prepared

- Public repository structure, contribution/security/ownership files and agent instructions.
- Czech-first bilingual product brief for `valkyriawdg.cz`, with Czech/English flag
  switching and localized UI/CMS contracts; code, docs and AI prompts remain English.
- Detailed game-menu visual specification, screen map, 13 reference captures and exact logo.
- Architecture, domain model, Discord/local-admin access contract and release plan.
- Legacy site research and read-only local Wardogs media inventory.
- [Actual background media delivery](assets/background-media-2026-09-26.md): 15-second
  silent 1080p/720p MP4, smaller 1080p WebM and WebP poster, with full SHA-256,
  native-browser playback proof and a [cloud integration handoff](handoff/background-media-integration.md).
- Claude Cloud detailed handoff and copy-ready prompt.
- Foundation CI and gated future application/container publication workflows.
- Explicit [news/blog visual-editor and match-authoring requirements](product/editorial-and-matches.md),
  with media, draft/revision/scheduling workflow and visible HLL website links.
- Eight committed [agent skills](engineering/skills.md), task continuity and FE/BE/auth,
  database migration, GitHub, verification and release procedures for cloud development.
  Foundation CI validates skill structure and runs its positive/negative fixtures.
- [Evidence and closure policy](engineering/evidence.md): feature/fix proof, captioned
  real screenshots when applicable, issue/incident acceptance summaries and accessible
  artifacts before completion; corresponding PR and issue templates.

## Not implemented

This foundation branch does not contain the website application, database migrations,
login, role sync, admin UI, match coordination or runtime image. Application work is
independently tracked in [PR #19](https://github.com/ValkyriaWDG/www/pull/19).
The actual background derivatives are prepared; cloud integration and production
media hosting remain unverified here. The earlier inventory was not a decode;
the media delivery now records source-frame inspection and complete derivative decoding.

## Verification

| Check | Result |
|---|---|
| `node scripts/check-foundation.mjs` | Passed: documentation links, JSON, required files, asset hashes and basic hygiene |
| `node --test scripts/tests/*.test.mjs` | Passed: six tests covering valid/invalid skills and accepted/mismatched/missing release revisions |
| Project skill validation | All eight skills passed the skill-creator schema validator; native Claude Cloud discovery has not been run in a cloud session |
| Independent skill scenarios | Reviewed scheduled publication with revoked authority and stale CI; release with changed main and incompatible migration; foundation-only release readiness |
| Evidence/closure scenario review | Reviewed missing UI upload and stale CI, backend-only screenshot N/A, and incident with unverified production recovery; no application or incident was executed/closed |
| Bilingual contract scenario review | Reviewed deterministic Czech entry with an English browser, English admin return after login, independent translated drafts/schedules/media and missing UI keys versus optional prose; clarified cross-locale metadata invalidation. Documentation review only; no bilingual app was run |
| Publisher revision guard | Required expected SHA and execution before registry login/push verified locally; no publication dispatched |
| `node scripts/check-commit-attribution.mjs` | Passed against current history |
| `pnpm install --frozen-lockfile --ignore-scripts` | Passed for dependency-free foundation workspace |
| YAML parse of workflows/templates/Compose/workspace | Passed with PyYAML |
| Independent design/auth/CI consistency review | Completed; identified handoff inconsistencies corrected |
| Isolated negative fixtures | Passed: tracked env, altered asset, missing app manifest, AI co-author and cloud-session footer were rejected |
| Hosted GitHub Actions | [Initial foundation CI passed](https://github.com/ValkyriaWDG/www/actions/runs/36237469190) for `0550ec0`; Application correctly skipped |

No application/container/live checks are claimed by this document.

For the media delivery, all three videos passed full FFmpeg decoding and native
Chromium playback, pause/resume and the primary MP4's three natural loops. Hashes,
metadata, faststart layout and real viewer screenshots are recorded in the
[media evidence](evidence/background-media-2026-09-26/README.md). This standalone
viewer does not establish application reduced-motion, navigation or mobile UX.

## GitHub preparation

Description, target homepage, topics, four milestones and [eight open implementation
issues](implementation/github-backlog.md) are configured. Private vulnerability reporting,
Dependabot vulnerability alerts, secret scanning and secret push protection are enabled.
Container publication has an owner-reviewed environment and is disabled by repository
variable. Main requires a pull request, current **Quality gate**, resolved conversations
and linear history; force pushes/deletion are disabled, including for administrators.
No mandatory external reviewer is configured because the owner must be able to merge
after checks without approving their own PR. Latest checks remain visible in
[GitHub Actions](https://github.com/ValkyriaWDG/www/actions/workflows/ci.yml).

## Next action

Continue the existing Claude application task using [the media integration handoff](handoff/background-media-integration.md)
and the verified ZIP. Preserve its current branch and changes. Finish [M1–M3](implementation/plan.md),
then handle secondary match management separately. Discord/registry configuration and
production media hosting remain separate operator inputs. The media documentation PR
does not merge or deploy the application.
