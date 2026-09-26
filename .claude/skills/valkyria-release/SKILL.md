---
name: valkyria-release
description: Prepare or verify a Valkyria application release with version notes, exact commit and CI evidence, container publication gates and deployment handover. Use for release tasks rather than routine feature implementation.
---

# Release preparation and verification

Read [the release workflow](../../../docs/engineering/release-workflow.md) and the
canonical [deployment contract](../../../docs/operations/deployment.md).

1. Establish the requested operation and current stage from the task, checkout and
   status. The foundation has no deployable app, published image or application release.
   Skill invocation adds guidance, not registry, GitHub or production authorization.
2. Prepare the complete reviewable candidate: version/changelog proposal, scoped diff,
   migration/media implications and relevant local evidence. Preserve existing task
   authorization; do not ask again for operations already authorized.
3. Pin the accepted full commit SHA. Require real application CI for that SHA; a green
   foundation job or a skipped publisher is not release verification. Follow the
   current manual main-only publication gate and prove DockerHub privacy before a push.
4. If publication is authorized, verify workflow head SHA, image revision and digest
   agree. Never overwrite an issued version tag or promote an unverified image.
5. Report prepared, tagged, published and deployed states separately, with evidence and
   exact remaining actions. Deployment and production migration follow their own scope
   and the canonical runbook; never infer them from release preparation.

When schema changes are present, use [the database workflow](../../../docs/engineering/database-workflow.md).
No missing credential, approval or service justifies a fabricated passing result or
disabling a gate. Complete the work that does not depend on that missing input.
