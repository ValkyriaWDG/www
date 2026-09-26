---
name: valkyria-backend
description: Implement or review Valkyria server use cases, queries, publication workflows, match records and media integrity at the documented application boundaries.
---

# Valkyria backend

Apply the [working agreement](../../../AGENTS.md), inspect [current status](../../../docs/STATUS.md) and the actual package/scripts before choosing commands. The foundation does not yet imply a working API, schema, scheduler or integration.

## Intake

Read the relevant [architecture](../../../docs/architecture/overview.md), [domain model](../../../docs/architecture/data-model.md), [localization contract](../../../docs/product/localization.md) and [editorial/match contract](../../../docs/product/editorial-and-matches.md). Identify the actor, capability, resource/translation scope, locale, state transition and public/private output for the assigned behavior. Permission changes also require the [auth policy](../../../docs/security/auth-rbac.md).

## Execute

1. Trace route/server action → validated input → authorized use case → repository/transaction → explicit DTO. Keep routes thin and data access server-only; reuse the documented modules rather than adding a new service by default.
2. Implement invariants in the server/database boundary, including concurrency and bounded queries. Coordinate schema changes with reviewed migrations and disposable PostgreSQL; do not substitute SQLite or touch production data.
3. For editorial work, use one entity with independent `cs`/`en` translations, draft/live revisions and exact translation/locale targets for immutable scheduled publication. Public body, title, slug, cover, SEO, taxonomy labels and alt/caption come from that locale's published snapshot. No automatic translation/publication; a pending or cancelled scheduled update cannot alter either live translation. Resolve published language counterparts by identity, with the documented missing-translation behavior.
4. Validate rich-content JSON independently of the editor. Authorize the exact resource/translation; changing locale grants no privilege. Scope uploads/delivery to effective publication, preserve private draft media and references across locales, and include locale in public queries/cache invalidation. Runtime uploads stay outside Git and the image.
5. Keep fixture creation/scheduling/results in M2. Match facts, dates, scores and member names stay shared; optional localized recap/biography uses per-locale publication with the global privacy gate. Unknown scores remain null; game-specific validation must not invent Wardogs rules. Rosters and availability remain M4 unless assigned.
6. Follow the [backend workflow](../../../docs/engineering/application-workflows.md#backend) for transaction, publication, media and scheduler evidence.

## Evidence and handover

Test observable state transitions, negative access/publication cases, locale cache isolation and translator concurrency using the real PostgreSQL repository boundary. Prove mismatched translation/locale references and unauthorized draft/schedule/media access fail without altering the other locale. Mock external services at adapters; never describe a mock as live Discord or deployed scheduler verification.

Report changed contracts, migrations/configuration, actual checks and any operational follow-up. A finished local publisher CLI is distinct from an installed production timer. Preserve publication/deployment gates and the task's external-action scope.
