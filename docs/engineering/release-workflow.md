# Release workflow

Use this guide for a release candidate and its evidence. The canonical host, registry,
image and migration requirements remain in [deployment](../operations/deployment.md).
The implemented application's version comes from the root `package.json`. A package
version or these instructions alone do not prove a published image or live deployment;
check the current [status](../STATUS.md) and exact revision evidence.

## Distinguish the requested operation

| Operation | Result |
|---|---|
| Prepare release | Reviewable version/changelog proposal, exact candidate and validation/handover evidence |
| Publish version | An authorized immutable Git tag and GitHub release tied to the accepted commit |
| Publish container | An image in the operator-approved public/private registry whose commit and digest are verified |
| Deploy | An authorized operator action promoting that image to a specific environment with migration and live checks |

Determine which operations the current task/session already authorizes and complete
them without asking for permission again. A request to prepare or review a release is
not a request to publish or deploy it. Skills and credentials do not add authorization.
When an external operation is outside scope, finish its concrete candidate and evidence
first, then identify the exact remaining action. Do not create paid resources, alter DNS
or send live Discord messages as a release side effect.

## Version and changelog proposal

Use one application release line rather than inventing separate releases for internal
workspace packages. Follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
with Git tags of the form `vMAJOR.MINOR.PATCH`; use an explicit prerelease suffix when
the release is intentionally a prerelease. Never move, delete/recreate or force-update
an issued version tag. A correction is a new version.

The root `package.json` version is the application release source; keep any exposed application
version synchronized. Private internal package versions need not become independent
release lines. Public behavior, integration/schema compatibility and migration impact
determine the proposed bump; a UI-only patch must not conceal an incompatible data change.

During the first real release preparation, introduce a maintained `CHANGELOG.md` if
one does not yet exist. Add a dated version entry with user-visible changes, fixes,
compatibility/migration notes and material known limitations. Keep unfinished items in
an unreleased section. No invented completed integrations, AI attribution, private
identities, credentials or internal host details belong in release notes. Public security
notes must follow [the security reporting policy](../../SECURITY.md).

The version and changelog changes are part of the reviewed candidate commit. Do not
change version metadata after validating/building an image and then pretend the image
represents the resulting new commit. Record existing tags and the previous accepted
release before proposing the next version; never infer release history from a package
version alone.

## Qualify the exact candidate

Inspect current scripts and [status](../STATUS.md) before selecting checks. Foundation
commands supplement the implemented application commands and image checks.
An all-green foundation run with Application skipped does not qualify an app release.

For an implemented candidate, collect:

- Reviewed scope and a clean candidate commit; resolve user changes without overwriting them.
- Frozen dependency install, real lint/typecheck/unit/PostgreSQL integration/build and
  browser evidence required by [verification](../implementation/verification.md).
- Visual/media acceptance, authorization and editorial workflows, including pending
  external-input limitations that prevent claiming the complete production experience.
- Container build/start as non-root, readiness failure/recovery, image scan, SBOM and
  provenance; verify secrets and runtime uploads are absent from the image layers.
- Migration IDs, backfill/rollback compatibility and synthetic restore rehearsal from
  [the database workflow](database-workflow.md), plus persistence/delivery checks for media.

Pin the **full commit SHA** after the release PR is merged to protected main. Verify the
required Quality gate and its application checks for that exact merged SHA; a prior PR
merge simulation or another main commit is not interchangeable evidence. Confirm the
candidate is the accepted main revision before publication. If checks were unrun or
blocked, keep that state visible and finish unrelated preparation.

## Container publication stays manual and gated

The committed [publisher](../../.github/workflows/container-publish.yml) currently uses
manual dispatch on main with required `expected_sha`, `CONTAINER_PUBLISH_ENABLED=true`, configured DockerHub variables/
secrets and the `container-publish` environment. It reruns CI and publishes an immutable
`sha-<full commit>` image tag. A version tag or GitHub release does not trigger it.
Enable publication only within an authorized publication task; do not enable the gate
merely to make a release-preparation task look complete.

Before an authorized push, use current authenticated registry metadata to verify the
operator-selected DockerHub repository exists and its **public/private visibility matches
the owner's explicit approval**. The website's 2026-09-26 approval permits a public image;
private visibility is not a prerequisite for this release. Record the sanitized repository
identity and visibility result. Local login success does not establish visibility.
If the registry identity/visibility cannot be established, do not push or implicitly
create a different repository. Prepare the remaining candidate artifacts instead.

The current main-only workflow cannot publish an arbitrary historical commit. Pass the
accepted full SHA as `expected_sha`; the guard must match it to the workflow's immutable
SHA before registry login/push. A branch move before dispatch therefore fails closed.
Check the run's head SHA and guard result after dispatch as well. Reconcile a mismatched
candidate and exact-SHA validation without substituting another commit or resetting main.
Do not bypass the guard with a direct local registry push. The input selects an expected
revision; it does not authorize historical builds or replace the other release gates.

For a completed authorized run, verify the run SHA, image source/revision metadata,
`sha-<commit>` reference and registry digest agree. Record the digest returned by the
registry and verify the built artifact's checks, rather than deriving a digest from a
tag name. The workflow passes `SOURCE_REVISION` to the Docker build, pulls the resulting
registry digest and fails if its OCI revision differs from the accepted workflow SHA.
Never overwrite a revision tag with a different artifact. The authorized Watchtower
policy below is the only automated promotion path; do not add `latest` or other aliases.

Only after the candidate's required evidence is complete, perform separately authorized
version publication at that same accepted SHA. The annotated version tag, release notes
and container evidence must identify one revision. Do not publish a successful release
record when its container step was skipped or failed; describe the narrower source-only
result if that is what the task explicitly requested. The committed `Release` workflow
validates `vX.Y.Z` tags against the package version, reruns CI and creates a GitHub release.
It does not publish or deploy an image; container publication remains separately gated
and manual. An image promotion alone does not create a version tag.

## Deployment handover and rollback

A published release is not a deployed release. Provide the operator with the accepted
SHA, version if issued, immutable image digest, CI/build links, migration IDs, required
configuration names, approved media hashes, compatibility notes and unresolved checks.
Runtime secrets remain in protected environment configuration; never paste values into
the handover or release notes.

For an explicitly authorized deployment, follow the canonical runbook in this order:

1. Preserve the current image digest/configuration and establish rollback compatibility.
   Back up the project database together with editorial media metadata/bytes, and prove
   restoration before the production schema change.
2. Apply only reviewed migrations through the image's explicit one-shot migration CLI
   under a migration lock. No schema push, startup migration or schema reset.
3. Start/recreate only the scoped application at the accepted digest. Preserve the
   persistent editorial volume and cache mount, non-root ownership and private delivery;
   verify the actual image paths against the Compose example.
4. Verify liveness, database readiness, public routes, login/admin behavior with an
   authorized test identity, publication/media access and sanitized logs. Configure and
   verify the due-publication timer, overlap protection and overdue monitoring before
   claiming scheduled publishing works in production.
5. Record the observed running digest and exact results. If a check fails, stop further
   promotion and use the documented compatible image rollback or planned roll-forward.
   A backup's existence does not authorize blindly restoring over newer live writes.

The base [Compose example](../../infra/compose.production.example.yaml) keeps
updates opt-in. Production uses the explicitly authorized
[Watchtower policy](../operations/watchtower.md): a dedicated updater tracks
`production` every five minutes. With `WATCHTOWER_PROMOTION_ENABLED=true`, the
qualified publisher advances that tag only when the actual migration bundle,
runner and image runtime contract match its current image. Changed contracts are
held for operator migration/configuration review. Unknown state fails closed.
The workflow verifies alias promotion; runtime readiness and rollback are separate
observations. No source push alone triggers image publication.

## Final evidence

Report version/tag status, full accepted SHA, exact-SHA CI results, approved registry visibility
verification, image digest/publication result, migration/restore status, deployment
target and observed digest if deployed, and remaining limitations. Use `not run`,
`blocked`, `failed` and `passed` distinctly. Update repository status with public-safe
evidence; keep private operational records in their authorized location. A responsive
homepage cannot stand in for verified login, authorization, media privacy or rollback.
