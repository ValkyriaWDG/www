# Current status

Updated: 2026-09-26. Stage: **foundation / implementation handoff**.

## Prepared

- Public repository structure, contribution/security/ownership files and agent instructions.
- Czech-first bilingual product brief for `valkyriawdg.cz`, with Czech/English flag
  switching and localized UI/CMS contracts; code, docs and AI prompts remain English.
- Detailed game-menu visual specification, screen map, 13 reference captures and exact logo.
- Architecture, domain model, Discord/local-admin access contract and release plan.
- Legacy site research and read-only local Wardogs media inventory.
- [Full-length background media delivery](assets/background-media-full-2026-09-26.md):
  the owner requires the entire available approximately 192.45-second AVI timeline.
  Full 1080p/720p MP4, 1080p WebM and poster are encoded, with final file fingerprints
  and frame counts recorded; complete decoding passed for all three videos.
  Native Chromium playback, pause/resume and seeking passed for all variants, plus one
  uninterrupted primary loop. The ZIP is uploaded to a draft release and its authenticated
  download hash matches. The 15-second edited candidate is superseded.
  The [cloud integration handoff](handoff/background-media-integration.md) now follows
  the full-length contract and approximately 60 MiB primary budget.
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
Full-length background files are prepared; cloud integration and production media
hosting remain unverified here. Sequential decoding recovered all 11,547 available
source frames with zero decode errors, and all output videos contain 5,774 frames.
Complete error-sensitive decoding passed for all three output videos.
Native Chromium playback passed, and the ZIP's authenticated GitHub draft download was
verified. Access from the actual Claude Cloud session remains untested.
The AVI's unfinished headers and unconfirmed Bink source remain explicit limitations.

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

The [historical short-clip evidence](evidence/background-media-2026-09-26/README.md)
records decoding and native playback for the superseded 15-second files only. It does
not verify the new full-length media. The [new report](assets/background-media-full-2026-09-26.md)
and [raw browser evidence](evidence/background-media-full-2026-09-26/media-qa.json)
record complete output decoding, native playback/pause/resume and middle/near-end
seeks for every rendition. In Chromium 153.0.8010.12, the primary completed one natural
rate-1 wrap in 192.5042 seconds with zero dropped frames during that loop and no media
or page errors. No three-loop run is claimed. ZIP size is 84,333,534 bytes; GitHub's
asset digest and the authenticated download matched its recorded SHA-256.
Standalone media QA does not establish application reduced-motion, navigation or mobile UX.

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
and the verified full-length ZIP from the draft transfer channel. Confirm access in
the actual cloud session and retain the current branch and changes. Continue independent
app work if that session cannot obtain the bundle.
Finish [M1–M3](implementation/plan.md),
then handle secondary match management separately. Discord/registry configuration and
production media hosting remain separate operator inputs. The media documentation PR
does not merge or deploy the application.
