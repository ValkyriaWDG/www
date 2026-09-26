# Valkyria

Czech-first bilingual community website for **Valkyria**, built around a Wardogs-inspired
game-menu experience and the clan's Hell Let Loose heritage.

**Target domain:** `valkyriawdg.cz` · **Repository:** [ValkyriaWDG/www](https://github.com/ValkyriaWDG/www)

> Current stage: application implementation (M1–M3) in progress on a task branch.
> See [status](docs/STATUS.md) for what is implemented and verified; live Discord OAuth,
> the final background video and production deployment remain operator inputs.

## Start here

| Audience | Entry point |
|---|---|
| Owner starting Claude Code Cloud | [Copy-ready prompt](docs/handoff/start-prompt.md) |
| Implementation agent | [Detailed handoff](docs/handoff/claude-code-cloud.md) and [AGENTS.md](AGENTS.md) |
| Product/design | [Brief](docs/product/brief.md), [visual specification](docs/design/visual-spec.md), [screen map](docs/design/screen-map.md) |
| Engineering | [Architecture](docs/architecture/overview.md), [data model](docs/architecture/data-model.md), [auth/RBAC](docs/security/auth-rbac.md) |
| Agent execution | [Skill catalog](docs/engineering/skills.md), [task workflow](docs/engineering/agent-workflow.md), [verification](docs/engineering/verification-workflow.md) |
| Delivery | [Implementation plan](docs/implementation/plan.md), [backlog](docs/implementation/github-backlog.md), [deployment](docs/operations/deployment.md) |
| Current evidence | [Status](docs/STATUS.md) |

## Product direction

A cinematic backdrop with a faded Valkyria crest, compact top navigation, amber
selection states and sharp translucent panels. Public pages cover the clan, members,
news, matches/results and Discord. Authorized administrators manage content; match
availability and rosters are a later milestone. Public and admin UI support Czech
(default) and English with a visible Czech/UK flag language switcher. Code, technical
documentation, GitHub descriptions and AI prompts stay English. See
[the localization contract](docs/product/localization.md).

News/blog includes WordPress-like rich-text editing, image management, drafts/revisions,
preview and publishing. Admin match creation, scheduling and result entry belong to the
first release. A visible HLL WEBSITE link keeps the existing HLL community accessible.
See [editorial and match requirements](docs/product/editorial-and-matches.md).

The [reference captures](docs/design/references/README.md) and
[supplied clan logo](assets/brand/valkyria-logo.png) are committed so cloud agents can
inspect the actual inputs. Large game/video sources remain outside the repository.

## Structure

```text
apps/web/             Next.js application (routes, components, domain modules, CLIs, tests)
apps/discord-worker/  Reserved optional Discord role-event worker (M4)
packages/db/          Drizzle schema, reviewed SQL migrations and migration runner
packages/contracts/   Reserved for integration contracts with real multiple consumers
assets/               Clan logo and provenance manifest
docs/product/         Scope and editorial requirements
docs/design/          Visual specification, route map and reference captures
docs/architecture/    System design, data model and decisions
docs/security/        Authentication and capability policy
docs/research/        Dated legacy-site and local-media inventories
docs/handoff/         Claude Cloud brief and copy-ready starting prompt
docs/implementation/  Milestones, backlog and verification requirements
docs/engineering/     Agent, FE/BE, migration, GitHub and release procedures
docs/operations/      Release and rollback contract
infra/                Sanitized deployment examples
scripts/              Executable foundation checks
.github/              CI, publication gate, ownership and contribution templates
.claude/skills/       Eight repository-owned skills for Claude Cloud and other agents
```

## Develop and verify

Requirements: Node 24 (see `.nvmrc`), pnpm via Corepack (`packageManager` pins the
version) and a disposable PostgreSQL (e.g. `docker compose -f infra/compose.dev.yaml up -d`).
Copy `.env.example` to `apps/web/.env.local` and set at least `DATABASE_URL` and
`BETTER_AUTH_SECRET` (≥32 random characters). Never use production credentials locally.

```sh
pnpm install --frozen-lockfile
pnpm db:migrate                       # explicit migration runner (never on app start)
pnpm db:seed                          # idempotent production-safe seed (core pages, taxonomy)
pnpm db:fixtures -- --allow-fixtures  # synthetic dev/test fixtures only
pnpm dev                              # http://localhost:3000 → /cs
```

| Command | Responsibility |
|---|---|
| `pnpm lint` / `pnpm typecheck` | ESLint (Next.js rules) and strict TypeScript incl. `packages/db` |
| `pnpm test:unit` | Vitest: policy, i18n parity/ICU, routing rules, rich-text/editor schema, media/background logic |
| `pnpm test:integration` | Vitest against real PostgreSQL (`DATABASE_URL`; creates `<db>_tpl`/`<db>_w*` clones) |
| `pnpm build` | Next.js standalone build + bundled CLIs (`apps/web/dist/cli`) and migrations |
| `pnpm test:e2e` | Playwright against the built standalone server and a disposable `<db>_e2e` database |
| `pnpm test:e2e:media` | Actual delivered background media (not in CI; see [background media](docs/operations/background-media.md)) |
| `docker build -f apps/web/Dockerfile .` | Non-root production image (see [deployment](docs/operations/deployment.md)) |
| `pnpm check:foundation` / `pnpm test:foundation` | Repository hygiene, links, asset provenance and skill checks |

CI runs all of the above plus a container startup/migration/health smoke test. Container
publication stays disabled until the release gate in [deployment](docs/operations/deployment.md).

## Sources and license

The [legacy website audit](docs/research/legacy-site-audit.md) records verified sources,
historical facts and unresolved content. Do not treat it as an automatic production seed.
Original source code/documentation uses the existing [Apache-2.0 license](LICENSE).
Branding, screenshots and game media are governed by their separate provenance in
[NOTICE.md](NOTICE.md) and the [asset policy](docs/assets/policy.md).

Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues
privately using [SECURITY.md](SECURITY.md).
