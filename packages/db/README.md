# @valkyria/db

Drizzle ORM schema and reviewed PostgreSQL migrations for the Valkyria web application.
This package is server-only: never import it from a client component.

| Path | Purpose |
|---|---|
| `src/schema/` | Table definitions grouped by domain (auth, access, content, media, members, matches, settings, audit) |
| `drizzle/` | Generated and reviewed SQL migrations plus Drizzle journal metadata; applied migrations are immutable |
| `src/migrate.ts` | Serialized migration runner (advisory lock, bounded timeouts, sanitized errors) |
| `src/client.ts` | `createDb(url)` pool + Drizzle instance factory |

Generate a migration after changing the schema, then review the SQL before committing:

```sh
pnpm db:generate            # drizzle-kit generate (reads schema only)
pnpm db:migrate             # explicit runner against DATABASE_URL
```

Never use `drizzle-kit push` and never migrate on application startup. See the
[database workflow](../../docs/engineering/database-workflow.md) and the
[data model](../../docs/architecture/data-model.md).
