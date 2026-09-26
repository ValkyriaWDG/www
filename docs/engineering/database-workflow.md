# Database workflow

This is the operational guide for implementing the [data model](../architecture/data-model.md)
within the [modular architecture](../architecture/overview.md). It does not introduce
a database, migrations or runnable app commands into the foundation.

## Establish the target and tools

Inspect the assigned change, current schema, generated migration metadata, SQL history,
lockfile and package scripts. The planned owner is `packages/db`; the future explicit
runner is `pnpm db:migrate`, bundled in the image as `scripts/migrate.mjs`. These names
are requirements from [the implementation plan](../implementation/plan.md), not commands
available in the current scaffold. Discover the actual implementation before running them.

Use the pinned Drizzle version and its matching migration tooling. Generate SQL from
the intended schema change, then inspect it; generation does not establish correctness.
Consult the [Drizzle migration documentation](https://orm.drizzle.team/docs/migrations)
for the installed version rather than copying an unrelated tutorial's configuration.

Development and integration tests use an isolated PostgreSQL service supplied by the
task environment or the project's implemented development setup. Verify the database
is disposable and belongs to this task before migration, seeding or reset. Record a
sanitized environment label, database role and PostgreSQL version; never print a full
connection string. Use the production-supported major version for migration evidence.
Do not substitute SQLite or a repository mock for PostgreSQL behavior.

Cloud work does not have the owner's local secrets or production database. Do not read
parent-workspace configuration, import real member/account data, expose a public database
port, or create a paid hosted database to complete tests. A provided secret stays in the
runtime environment and out of commands, logs and artifacts. If no test PostgreSQL can
run, implement/review the migration and tests, run independent checks and report the
database scenarios as not run. Do not claim migration readiness from TypeScript alone.

## Preserve migration history

Applied or shared migration SQL is immutable. Add a forward migration to correct it;
do not edit checksums, delete journal rows or reset a shared database to make history
appear consistent. A migration known to be unshared and unapplied may be regenerated
within its owning task. Do not assume a file is unapplied merely because it is new in
the current checkout. Preserve generated metadata and migration ordering together.

Review the generated diff for unintended drops/recreates, nullability/default changes,
unique constraints, foreign-key delete behavior, indexes and data conversion. Preserve
the model's text Discord IDs, UUID entities and timezone-aware timestamps. Distinguish
unknown match scores from zero. Authentication-library tables must remain compatible
with the pinned library's required schema and upgrades.

The migration runner must record successful application exactly once, serialize competing
runners and fail with a sanitized error. Use a transaction when the SQL supports it.
Document any required nontransactional DDL and its recovery behavior explicitly; do not
blindly wrap every statement in one transaction. Set appropriate bounded lock/statement
timeouts in the implemented runner and surface timeout failure rather than retrying DDL
indefinitely. Rerunning the migration runner should be safe; that does not require hiding
unexpected schema drift with `IF NOT EXISTS` on every statement.

Do not use schema push as the delivery path, and do not apply migrations on application
startup. Changes run through reviewed SQL and the explicit runner in development, CI
and the separately authorized production migration step.

## Expand, migrate, contract

For changes that affect existing data or the previous image, describe three steps in
the PR even if the first step is the only one implemented now:

| Step | Required behavior |
|---|---|
| Expand | Add compatible tables/columns/indexes. Keep the previous image able to read/write while the new image is introduced. |
| Migrate | Backfill with bounded batches and resumable progress; validate row counts, nulls, uniqueness and referential integrity before switching readers. |
| Contract | Remove old fields/paths only in a later explicitly planned change after consumers and the rollback window no longer depend on them. |

Do not interpret a rename as permission to drop and recreate populated columns. A
backfill must handle concurrent writes according to the feature's consistency model
and must not expose partially converted private data. Prefer a roll-forward correction
after a failed change; image rollback is safe only when the previous image is compatible
with the current schema and stored data. A destructive down migration is not a default
rollback mechanism.

Editorial JSON has its own schema version, separate from SQL migration history. Keep
published and scheduled immutable revisions readable across an application rollback;
introducing new editor nodes or attributes may require a compatible reader before writers
are enabled. Restoring a revision creates a new draft. Public title, slug, SEO, media and
body still come from the published snapshot. Do not rewrite historic content or delete
scheduled/published revisions as an incidental cleanup. Apply the
[editorial contract](../product/editorial-and-matches.md) and [access policy](../security/auth-rbac.md).

## Verify the affected persistence behavior

Use synthetic fixtures with no real credentials, Discord identities, private rosters
or uploaded originals. Production seed behavior stays separate from explicit test/demo
fixtures; neither may create a default privileged account. Keep seeds idempotent.

| Scenario | Evidence |
|---|---|
| Fresh database | Complete committed migration chain reaches the expected schema; meaningful repository operations work. |
| Upgrade | Previous accepted schema plus synthetic populated records upgrades without losing required data. |
| Retry and contention | Re-running the explicit runner applies nothing twice; simultaneous runners cannot corrupt history. |
| Affected constraints | Test actual nullability, uniqueness, foreign keys, transaction rollback and optimistic-concurrency conflicts. |
| Publication and privacy | Draft autosave, scheduled updates and revoked authority cannot change/leak the published projection or private media. |
| Compatibility | Previous supported app can operate on expanded schema and supported stored JSON during the rollback window. |
| Backup/restore rehearsal | Restore a synthetic database and matching media set into a separate disposable target, then verify references and usable content. |

Select feature-specific negative tests from [the verification matrix](../implementation/verification.md).
For schedule changes include immutable target revision, cancellation/retry, grant version
change and the scoped local-admin delegation. For media changes include AssetUsage checks
and anonymous access after unpublishing. Roster concurrency tests apply when that later
feature is implemented, not as a prerequisite to every migration.

Run the actual implemented integration command, not a no-op alias. Do not weaken a
constraint or skip migration tests solely to obtain green CI. Reset only a verified
disposable test target; never point reset/drop helpers at a supplied production URL.

## Handover

The PR records the migration IDs, changed invariants, previous-schema baseline, exact
commands and outcomes, backfill plan, lock/size assumptions, rollback compatibility and
remaining operator work. State which tests used a real PostgreSQL service. Keep SQL
fixtures public-safe and runtime dumps out of Git and public CI artifacts.

Production migration requires the separately authorized operation, verified DB/media
backups and restore evidence from [deployment](../operations/deployment.md). Preparation
does not authorize production access. Continue the local implementation and review work
when deployment credentials or production scheduling are outside the task.
