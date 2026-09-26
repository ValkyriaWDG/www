# ADR 0001: One modular web application

Status: Proposed implementation baseline selected for this handoff.
Date: 2026-09-26. Decider: repository owner; changes require a documented rationale in PR.

## Context

The team needs a polished clan presentation, modest editorial administration and
later match coordination. It has an existing container/PostgreSQL hosting model.
The implementation agent runs in a cloud checkout without production access.

## Options

| Option | Complexity | Hosting cost | Fit |
|---|---|---|---|
| Next.js modular app + PostgreSQL | Low/medium | One app container + existing DB | Shared types, server rendering, custom visual shell |
| React SPA + separate FastAPI API | Medium/high | Two app runtimes + DB | Familiar but duplicates validation/build/deployment boundaries |
| Static site + hosted CMS/auth | Medium | Additional vendors/services | Fast public site but fragmented admin/RBAC and provider coupling |

## Decision and consequences

Choose Next.js with server-side modules, Drizzle migrations and Better Auth for
maintained authentication primitives. Keep custom authorization in one explicit
policy module. Use ordinary pnpm workspaces; no Turborepo or microservice platform
until measurements show a need. CSS modules and tokens provide visual control.

This reduces deployment and cross-origin auth complexity while retaining testable
domain boundaries. It requires care with server/client imports, cache separation,
framework security updates and long-lived background tasks. Discord gateway work
must run in a worker, never in a serverless request or layout lifecycle.

Revisit if a distinct external API/mobile client becomes an actual requirement or
the bot needs independent scaling. Do not split services just to resemble an enterprise.

## Implementation actions

- [ ] Bootstrap the web and real package scripts with exact versions.
- [ ] Prove the shell visually before filling every feature.
- [ ] Implement schema, policy tests and migrations before enabling admin writes.
- [ ] Prove container startup, health, upgrades and rollback.

Primary references: [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting),
[Better Auth Discord](https://better-auth.com/docs/authentication/discord),
[Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql).
