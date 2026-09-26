## Change

Describe the concrete problem and resulting behavior. State the scope a reviewer
can verify without reading the task conversation.

## Issue acceptance

Related issue(s): use `Refs #N` for partial work; use a closing keyword only when
this PR fulfills the entire issue and its required evidence.

State which acceptance criteria are complete and which remain open, including
dependencies and missing operator inputs. A mock does not complete a live check.

## Verification

| Check / scenario | Revision | Result | Evidence / limitation |
|---|---|---|---|
| Replace with an actual command or scenario | Commit SHA | Passed / failed / blocked / not run | Artifact or concise result |

Include applicable tests and desktop/mobile interaction evidence for UI changes.
Identify the current PR head and its CI run with required **Quality gate**.
Separate foundation checks from application, container and live integration checks;
refresh evidence after changes to the head. Do not copy a previous green run.

## Operational impact and handoff

Describe relevant migrations, configuration, asset provenance and rollback needs.
State remaining work and the next owner/checkpoint when applicable. PR creation
does not authorize merge, release, container publication or production deployment.

No production credentials, private member data, AI co-author/generated-by footers
or cloud session links.
