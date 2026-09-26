# Evidence required for PRs and closure

Every delivered feature or fix needs reviewable proof of the claimed behavior.
Attach it to the PR and record an acceptance summary in each related issue or
incident before marking it resolved/completed or allowing automatic closure.
Screenshots are required when the affected behavior is visible; they complement
tests and do not prove hidden server, security or persistence behavior.

The owner explicitly requests task-scoped evidence updates: updating the assigned
PR/issue/incident body or posting its evidence/closure-summary comment is part of
delivery. This is not authorization for unrelated comments, review requests, mass
notifications, closing incomplete work, merging or production operations.

## What the proof contains

For each acceptance criterion, record:

- **Claim and scenario:** the user action or failure being verified, prerequisites
  and reproducible steps; expected result and actual observed result.
- **Context:** tested commit/build, environment and relevant fixture/role. Use only
  synthetic identities and safe data. UI evidence also records route, browser and
  viewport and active locale; incident evidence records observation times with timezone.
- **Result and artifact:** passed, failed, blocked or not run, with a specific test
  result, report, sanitized output or accessible screenshot link. Link the exact CI
  run and identify the tested PR head/base when CI uses a merge revision.
- **Limits:** what the proof does not establish and which acceptance items remain
  open. A generic green badge or “tested and works” does not prove a feature.

Use this compact acceptance table in the PR and a scoped summary in the issue:

| Criterion | Steps / expected result | Observed result | Tested revision / environment | Proof |
|---|---|---|---|---|
| Describe one actual criterion | Reproducible scenario | Passed / failed / blocked / not run and actual behavior | Full SHA or build identity and context | Specific artifact/report/screenshot |

## Screenshots when applicable

| Change | Required visual evidence |
|---|---|
| Visible feature, page, form or editor | Actual implemented outcome, relevant interaction/error state and a caption explaining what it proves |
| Layout, navigation or responsive behavior | Relevant desktop and mobile captures with viewport; include long content/overflow or focus state when affected |
| Visible bug fix | Before/after at comparable context when the failure can be reproduced safely; explain unavailable before evidence and supply the reproduction/regression result |
| Animation, autosave or multi-step behavior | Captioned state captures plus a short recording or browser/test trace where needed to demonstrate the transition |
| Incident affecting user-visible behavior | Safe failure evidence if available and recovery screenshots; include service checks and observation window |
| Backend, migration, CI or documentation only | Screenshots may be **N/A with a specific reason**; provide meaningful alternative proof such as API assertions, PostgreSQL results, workflow output or validated links |

Capture the real application/browser state from the tested implementation. Design
references, mockups, generated images, an editor window or an unrelated green terminal
cannot stand in for a working feature. Inspect every selected image before attaching
it. Use readable crops without concealing failures; record any redaction. Never include
tokens, cookies, secret URLs, private drafts, real member data or sensitive dashboards.
Prefer safe fixtures so the behavior can be shown without redaction.

Give each image descriptive alt text and a nearby caption identifying **scenario,
expected/observed result, route/locale, viewport/browser, environment and tested revision**.
Shared context can be stated once for a clearly grouped set. A filename alone is not
a caption. State screenshot applicability explicitly; “N/A” cannot excuse a UI change
whose browser verification was simply not run. That item stays blocked/not run.
Capture affected Czech and English UI behavior under [localization](../product/localization.md),
including the relevant desktop/mobile states. Engineering captions and reports stay English.

## Attach reviewable artifacts

Prefer inline GitHub attachments for selected screenshots, with CI artifacts for
larger traces/reports. Verify that the resulting PR/issue renders the actual image
and that reviewers can open the linked evidence. An owner's local path, `.local/`
filename, placeholder URL or prose promise to upload later is not an attachment.

GitHub provides [browser attachments](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)
and [CLI media attachments](https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli).
Inspect the installed command's `--help` before using `--attach`; older CLIs may lack
it. Use a supported interface, not an invented upload flag or undocumented endpoint.
Use exact body files and verify the returned attachment URLs in the saved body/comment.
Uploaded files on this public repository must be public-safe before upload.

Do not send evidence to a new external hosting service merely to obtain a URL. If
the supported environment cannot attach it, preserve the local captures and report
the missing upload step; leave acceptance/closure pending. A reviewed fallback is
small, sanitized verification-only images committed under `docs/evidence/`, registered
in `assets/manifest.json` with provenance and the source size limit, and embedded using
commit-pinned GitHub URLs. Do not import these images into runtime assets.

[Actions artifacts expire and require appropriate GitHub access](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts).
Record their run/artifact name and retention or expiration when relying on them. Keep
the essential acceptance summary and selected visual proof in the PR/issue itself;
an expiring archive alone is insufficient durable closure evidence. Recheck links
before closure and restore or regenerate unavailable proof. CI/browser artifact
uploading must be implemented with the application; foundation CI does not yet
capture UI or automatically assess the quality of PR evidence.

## Before resolving an issue or incident

1. Map the issue's acceptance criteria to the actual proof. Refresh affected evidence
   after changes; historical before captures remain labeled with their old revision.
   Verify latest applicable CI, not a previous green PR head.
2. Add the issue/incident acceptance summary with its own captions/selected images
   where applicable and direct links to the detailed PR/test evidence. Do not leave
   only an unqualified “fixed in PR” reference. The same uploaded image can be reused.
3. For an incident, record impact, mitigation/fix, recovery time, what was checked in
   the affected environment and the observation window chosen for that failure mode.
   Local screenshots cannot prove production recovery. Link remaining prevention/root
   cause work to owned follow-up issues; distinguish service restored from permanent
   remediation. Follow [SECURITY.md](../../SECURITY.md) for private security incidents.
4. Re-read the saved evidence record and verify attachments/links. When a relevant
   criterion is failed, blocked, not run or missing proof, keep the item open and
   state the exact next action. Keep a PR draft when its delivery evidence is incomplete.
5. Only then use completion/resolve or an automatic closing keyword within the task's
   authorized scope. Record evidence **before** a merge can trigger `Closes #N`.
   A duplicate, cancelled or won't-do item is closed with its actual disposition and
   rationale/canonical link, not presented as a verified fix. No fabricated screenshot
   is needed for a non-implementation disposition.

Issue forms collect initial observations and an evidence plan, not proof of a fix
that does not exist yet. The implementing agent adds completion evidence later.
When a remote write times out, read the saved body/comments before retrying; do not
duplicate the evidence comment. Never mark completion merely because a comment was
posted or a PR was merged.
