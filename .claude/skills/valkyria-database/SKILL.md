---
name: valkyria-database
description: Implement or review Valkyria PostgreSQL schema changes, Drizzle migrations, data backfills and persistence tests. Use when a task changes stored data or database behavior.
---

# Database changes

Read [the database workflow](../../../docs/engineering/database-workflow.md), then the
[data model](../../../docs/architecture/data-model.md). For affected permissions or
private records, read [auth and RBAC](../../../docs/security/auth-rbac.md).

1. Inspect the actual schema (`packages/db/src/schema`), migration history
   (`packages/db/drizzle`), package scripts and task scope. Use `pnpm db:generate`
   and the explicit `pnpm db:migrate` runner; never treat an unlisted command as available.
2. Confirm the target is the task's disposable development/test PostgreSQL database.
   Work from synthetic records; do not import a production dump or search outside the
   checkout for credentials. Keep connection strings out of output.
3. Produce reviewed forward SQL and any bounded backfill. Preserve applied migration
   history and prove compatibility across the documented rollback window. Use explicit
   migration execution; do not use schema push or migrate on application startup.
4. Verify fresh install, previous-schema upgrade, runner retry and the affected data
   invariants against PostgreSQL (`DATABASE_URL=… pnpm test:integration` clones a
   migrated template database per test file). Test actual constraints and publication/access rules,
   not only mocked repositories. Record unavailable database checks as unrun.
5. Return migration IDs, exact verified commands, compatibility/backfill evidence and
   remaining operator work. A local migration task does not authorize production access.

Use [the release workflow](../../../docs/engineering/release-workflow.md) only when
the task also includes release preparation. Follow existing task authorization without
repeated permission requests; finish independent work if an external prerequisite is absent.
