## Change

Describe the concrete problem and resulting behavior. State the scope a reviewer
can verify without reading the task conversation.

## Issue acceptance

Related issue(s): use `Refs #N` for partial work; use a closing keyword only when
this PR fulfills the entire issue and its required evidence is also posted on that
issue or incident. Do not rely on automatic closure to add evidence afterwards.

State which acceptance criteria are complete and which remain open, including
dependencies and missing operator inputs. A mock does not complete a live check.

## Demonstrated behavior

Follow [the evidence policy](https://github.com/ValkyriaWDG/www/blob/main/docs/engineering/evidence.md). Complete this section
with observed results before claiming completion; a test plan is not execution proof.

Tested commit SHA:

Environment: OS/runtime or deployment, browser/version and viewport for UI, and
whether data/integrations are synthetic, mocked or live. Identify the affected route.

| Acceptance criterion / bug | Steps or command | Expected result | Observed result / status | Reviewable evidence |
|---|---|---|---|---|
| Identify one criterion | Reproducible steps | Expected behavior | Passed / failed / blocked / not run, with actual outcome | Link to the artifact, test output or run |

Use links a reviewer can open; local paths alone are not attachments. Summarize what
each artifact proves. Preserve concise proof where an expiring CI artifact would
otherwise leave a closed issue without evidence. Record meaningful limitations.

## UI captures or justified alternative

For a UI feature or fix, attach real captures of the changed application with descriptive
alt text and a caption explaining the criterion, visible state and expected/observed
outcome. Record route, viewport/browser, environment and tested revision; shared context
can be stated once for a clearly grouped set. Inspect captures before attaching. Include relevant
desktop and mobile views; explain any viewport that does not apply. Use before/after
captures for a fix when available, or document the original reproduction and show the
corrected state. Design references, generated mockups and unrelated old captures are
not proof of working behavior. Multi-step behavior also needs reproducible steps and
appropriate test or interaction evidence.

For changes with no UI effect, write `Screenshots: N/A` with the reason and meaningful
alternative proof such as focused tests, sanitized API behavior or executable
documentation/link validation. A UI capture that could not be run is blocked/not run,
not N/A. Do not leave this section empty or fabricate a screenshot.

## CI and closure checks

Current PR head SHA and matching CI run / required **Quality gate**:

Separate foundation, application, container and live integration evidence. Refresh
after head changes; do not reuse a previous green run or label skipped checks passed.

- [ ] Each in-scope criterion is backed by current, captioned or explained evidence.
- [ ] Evidence includes tested SHA, environment and reproducible expected/observed results.
- [ ] Linked issues/incidents have their own concise resolution evidence and working links before closure.
- [ ] Unmet acceptance criteria remain open; closing keywords cover only fully completed work.
- [ ] Artifacts and captions contain no credentials, private identities or security-sensitive details.

## Operational impact and handoff

Describe relevant migrations, configuration, asset provenance and rollback needs.
State remaining work and the next owner/checkpoint when applicable. PR creation
does not authorize merge, release, container publication or production deployment.

The owner has requested task-scoped evidence updates/comments on the assigned PR,
issues and incidents. This covers documenting proof here and on linked work items;
it does not authorize unrelated notifications, assignments or operational actions.

No production credentials, private member data, AI co-author/generated-by footers
or cloud session links.
