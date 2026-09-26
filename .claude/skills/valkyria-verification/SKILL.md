---
name: valkyria-verification
description: Diagnose a Valkyria regression or verify a completed change using risk-based tests, visual evidence, and exact-revision CI results.
---

# Verify behavior and diagnose failures

Use [the verification workflow](../../../docs/engineering/verification-workflow.md)
and the relevant rows of [the acceptance matrix](../../../docs/implementation/verification.md).
Select checks from the changed behavior and trust boundaries, not file count.

For a failure, first record expected/observed behavior and a minimal reproduction.
Trace the request across browser, server policy, domain operation and database as
applicable. Test one supported hypothesis before changing code. Add a regression
test at the boundary that failed; do not weaken an assertion to make CI green.

For delivery, inspect the whole integrated diff, verify the real manifest commands,
run relevant checks, then inspect visual/browser artifacts rather than relying on
the process exit code alone. Security changes need denied-access and stale/revoked
state evidence; migrations need fresh and upgrade databases. Link to specialist
skills for their domain-specific procedures.

An independent reviewer receives the diff, requirements and raw evidence. Reviewers
report actionable findings with locations, trigger and consequence. The integrator
verifies each finding, repairs it and reruns affected checks. Review cannot invent
missing app, live-provider, image or production evidence.

Report each check as passed, failed, blocked or not run, with revision and artifact.
If source changed after verification, rerun the affected checks and wait for CI on
the new PR head. Never describe Foundation-only CI as application acceptance.

Apply [the evidence policy](../../../docs/engineering/evidence.md) to the PR and each
related issue/incident before closure. Map criteria to expected/observed results,
tested revision/context and accessible proof. Attach inspected real screenshots with
captions for visual behavior; document a specific N/A reason and alternative proof
for nonvisual work. Missing capture/upload or stale CI leaves acceptance incomplete.
For incidents, verify recovery in the affected environment and record its observation
window; a local fix alone cannot establish service restoration.
