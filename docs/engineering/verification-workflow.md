# Verification and debugging workflow

Use the [acceptance matrix](../implementation/verification.md) for product-specific
scenarios. This document describes selecting evidence and interpreting failures.

## Establish what can run

The current foundation has Node 24 scripts and no application. These commands are
available from the repository root without app services:

```sh
node scripts/check-foundation.mjs
node --test scripts/tests/*.test.mjs
node scripts/check-commit-attribution.mjs
```

After bootstrap, inspect `package.json`, workspace manifests and CI before invoking
the planned `pnpm lint`, `typecheck`, `test:unit`, `test:integration`, `build` and
`test:e2e` commands. Their existence and meaningful execution are part of bootstrap
acceptance. A missing required script is a gap to implement, not a skipped success.
Use an isolated synthetic PostgreSQL database for integration/migration checks.

## Select checks by risk

| Change | Minimum useful evidence |
|---|---|
| Prose or skill routing | Foundation links/hygiene and skill structure; scenario review for risky procedures |
| Foundation validation or release guard | Positive and negative fixtures proving the invariant; foundation test runner |
| UI/style | Build/typecheck plus affected browser journey, inspected desktop/mobile screenshots and keyboard behavior |
| Domain operation | Business rule tests and real PostgreSQL transaction/constraint cases where persistence matters |
| Permissions/session | Direct server requests for allowed/denied, stale/revoked, wrong owner/scope and outage paths |
| Editor/media/publication | Private/public boundary, schema validation, malicious content, concurrent save and scheduling retry cases |
| Migration | Fresh DB, upgrade from previous schema/data, repeat/partial failure and restore/compatibility rehearsal |
| Dependency/CI/image | Frozen installation, affected app suite, workflow permissions/cache provenance and non-publishing image build |

Required CI remains required even if a narrower local check is enough to diagnose a
bug. Do not expand or repeat unrelated tests after sufficient checks pass unless new
changes, failures or risks justify it. Use tests of behavior and invariants rather
than asserting implementation wording or adding tests for every reversible prose edit.

## Debug with evidence

1. Record expected behavior, observed behavior, revision, input and environment.
   Reproduce minimally; sanitize request/log data before attaching it anywhere public.
2. Identify the failing boundary: UI state, transport, session/capability, domain,
   transaction, external adapter or runtime configuration. Follow the request rather
   than patching every suspicious layer.
3. Form one hypothesis and gather a discriminating observation. Change the smallest
   relevant part. A flaky test needs a race/timing/isolation explanation; retries and
   longer sleeps alone do not resolve it.
4. Add a regression case for the original failure where justified. Run the affected
   suite and applicable integration/browser checks. Diagnose a baseline failure
   separately; do not silently weaken thresholds, skip tests or use `continue-on-error`.

For UI evidence, fix viewport, content, fonts and background frame. Inspect actual
images and network behavior. Missing final video limits visual acceptance; it does
not justify omitting pause/reduced-motion/save-data tests. Automated accessibility
results do not replace keyboard/focus checks or imply certification.

## Review and report

Use [the evidence policy](evidence.md) for PR proof, screenshot applicability/captions,
artifact delivery and issue/incident acceptance before closure. A local capture must
be attached or linked in a reviewable form; include explicit alternative proof for
nonvisual changes. Record incident recovery in the affected environment, not only a
successful local regression test.

Review the whole diff including configuration and generated migrations. Record
findings with file/line, triggering input, consequence and a suggested correction.
Check public-file hygiene and asset provenance. Keep critical auth, data-loss and
draft-leak findings open until resolved or explicitly excluded by a scoped decision.

Evidence record:

```text
Requirement | command/scenario | revision | passed/failed/blocked/not run
Artifact or sanitized log | limitations | next step if incomplete
```

Mocked Discord proves the adapter contract, not live OAuth. An image build proves
buildability, not runtime health. Runtime health does not prove DB upgrade/restore.
Foundation CI proves none of those. Match hosted results to the latest PR head SHA;
follow [the GitHub procedure](github-workflow.md) before delivery. Report stale or
unavailable evidence precisely, and continue independent work where possible.
