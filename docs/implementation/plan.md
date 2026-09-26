# Implementation sequence

The foundation is complete only when the documented repo, references and handoff are
on main and foundation CI passes. The following application milestones remain unimplemented.
Each numbered step maps to a GitHub issue; see [backlog](github-backlog.md).

## M1 — Public experience

1. **Toolchain and runnable shell.** Bootstrap Next.js/TypeScript with pnpm, exact versions,
   lint/typecheck/test/build scripts, PostgreSQL development service, a standalone Docker
   build and no-secrets development defaults. Establish `@valkyria/web` workspace name.
   Acceptance: install/build from clean Linux checkout, app and image start, liveness and
   readiness contract, CI application job actually runs. No fake tests/no-op scripts.
2. **Wardogs visual system and menu.** Build tokens, tabs, panels, table, CTA, modal and
   persistent media controller. Central faded Valkyria emblem. Compare screenshots at the
   specified viewports, test keyboard, pause, reduced motion and no-video state. Complete
   this visual gate before filling many pages with a weak shell.
3. **Public content and data model.** Implement `/clan`, `/members`, profiles, `/matches`,
   match/results detail, `/news`, articles and `/community`, plus privacy page. Use real
   publication-aware repository adapters. Approved facts only; empty states for missing
   content. Store draft content safely and synthetic fixtures only for development/tests.

## M2 — Identity and web administration

4. **Authentication and access policy.** Discord identity, verified guild role mapping,
   freshness/revocation, provisioned MFA admin recovery and audit trail. Prove the negative
   cases in the security contract. No default administrator or browser-side role trust.
5. **Editorial administration.** Authorized CRUD, preview/publish/unpublish, profile approval,
   match/result publication, validated settings and audit read. Match authorization
   is separate from content-editor rights. Every mutation validates and authorizes server-side.

## M3 — Release readiness

6. **Hardening and delivery.** Complete browser/visual/security integration tests, static asset
   provenance, video receipt, performance budgets, migration+restore rehearsal, image scan,
   publication configuration and operations documentation. Record exact revision/digest.
   Production deploy, Discord bot sending and DNS changes require an operator task.

## M4 — Secondary match coordination

7. **Availability and roster management.** After M1–M3, implement assignments, substitutes,
   squad capacities, match-scoped manager/captain permissions, lock state and audit.
   Prove conflict/double-assignment/IDOR cases. Do not invent in-game telemetry APIs.
8. **Discord event adapter.** Connect the existing bot or dedicated worker to the validated
   versioned role-sync contract; handle signatures, replay/out-of-order events and periodic
   reconciliation. Role changes must revoke website permissions. Outbound notifications
   are opt-in future scope, never sent as tests to a real guild by default.

## Required scripts once the app exists

| Command | Real responsibility |
|---|---|
| `pnpm dev` | Web development server |
| `pnpm lint` | Source linting |
| `pnpm typecheck` | TypeScript checks including shared packages |
| `pnpm test:unit` | Policies, formatting, publication rules and media preference logic |
| `pnpm test:integration` | Migrations + repositories/security using disposable PostgreSQL |
| `pnpm build` | Production web build and required shared artifacts |
| `pnpm test:e2e` | Playwright with managed local webServer; no production credentials |
| `pnpm db:migrate` | Explicit migration runner, also bundled as image `scripts/migrate.mjs` |
| `pnpm check:foundation` | Keep repository/link/provenance checks passing |

Application CI activates when `apps/web/package.json` is added. The first runnable-app
PR must supply every required command and a Dockerfile; do not disable the quality gate
to land an incomplete scaffold. Add image startup/readiness and scan evidence in release work.

## Working method

Use task branches and focused PRs. Prefer a vertical slice with meaningful tests, then
extend; document acceptance evidence in the PR and `docs/STATUS.md`. If context ends,
leave a precise checkpoint and next command. Do not mark a milestone finished because
only its mock/UI layer exists. Missing external credentials do not block unrelated work.
