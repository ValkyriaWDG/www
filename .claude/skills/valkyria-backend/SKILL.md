---
name: valkyria-backend
description: Implement or review Valkyria server use cases, queries, publication workflows, match records and media integrity at the documented application boundaries.
---

# Valkyria backend

Apply the [working agreement](../../../AGENTS.md), inspect [current status](../../../docs/STATUS.md) and the actual package/scripts before choosing commands. The foundation does not yet imply a working API, schema, scheduler or integration.

## Intake

Read the relevant [architecture](../../../docs/architecture/overview.md), [domain model](../../../docs/architecture/data-model.md) and [editorial/match contract](../../../docs/product/editorial-and-matches.md). Identify the actor, capability, resource scope, state transition and public/private output for the assigned behavior. Permission changes also require the [auth policy](../../../docs/security/auth-rbac.md).

## Execute

1. Trace route/server action → validated input → authorized use case → repository/transaction → explicit DTO. Keep routes thin and data access server-only; reuse the documented modules rather than adding a new service by default.
2. Implement invariants in the server/database boundary, including concurrency and bounded queries. Coordinate schema changes with reviewed migrations and disposable PostgreSQL; do not substitute SQLite or touch production data.
3. For editorial work, preserve separate draft/live revisions and immutable scheduled revision targets. Public body, title, slug, cover and SEO come from the published snapshot. A scheduled update must not hide or alter the currently live article.
4. Validate rich-content JSON independently of the editor. Scope uploads and delivery to the asset's domain/publication state; protect private draft media, referenced assets and unpublish/cache invalidation. Runtime uploads stay outside Git and the image.
5. Keep fixture creation/scheduling/results in M2. Unknown scores remain null; game-specific validation must not invent Wardogs rules. Rosters and availability remain M4 unless assigned.
6. Follow the [backend workflow](../../../docs/engineering/application-workflows.md#backend) for transaction, publication, media and scheduler evidence.

## Evidence and handover

Test observable state transitions, negative access/publication cases and relevant concurrency using the real PostgreSQL repository boundary. Mock external services at adapters; never describe a mock as live Discord or deployed scheduler verification.

Report changed contracts, migrations/configuration, actual checks and any operational follow-up. A finished local publisher CLI is distinct from an installed production timer. Preserve publication/deployment gates and the task's external-action scope.
