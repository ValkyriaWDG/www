# Valkyria

Czech-first bilingual community website for **Valkyria**, with HLL and Wardogs
game-menu sections, shared CMS and identity.

**Live canonical domain:** [valkyria.cz](https://valkyria.cz) · **Repository:** [ValkyriaWDG/www](https://github.com/ValkyriaWDG/www)

> The unified hub, HLL and Wardogs sections were deployed on 2026-09-28. The old WDG
> hosts redirect to the canonical site; `valkyriahll.cz` retains the legacy website.
> The subsequent [robots-origin hotfix](docs/evidence/robots-runtime-origin-2026-09-28/production/README.md)
> is deployed and passed 55/55 public HTTP checks. See [status](docs/STATUS.md) for the
> exact current identity; the [original cutover](docs/evidence/unified-cutover-2026-09-28/README.md)
> retains its failed reports. Browser-network investigation, live authentication,
> hosted Logi and HLL battle footage remain open.

## Start here

| Audience | Entry point |
|---|---|
| Owner resuming Claude Code Cloud | [Current status](docs/STATUS.md), assigned issue and the [unified platform / HLL prompt](docs/handoff/hll-claude-code-cloud.md) |
| Implementation agent | [Current handoff](docs/handoff/hll-claude-code-cloud.md), [detailed foundation handoff](docs/handoff/claude-code-cloud.md) and [AGENTS.md](AGENTS.md) |
| Product/design | [Brief](docs/product/brief.md), [HLL scope](docs/product/hll/README.md), [HLL visual specification](docs/design/hll/visual-spec.md), [Wardogs specification](docs/design/visual-spec.md), [screen map](docs/design/screen-map.md) |
| Engineering | [Architecture](docs/architecture/overview.md), [data model](docs/architecture/data-model.md), [auth/RBAC](docs/security/auth-rbac.md) |
| Agent execution | [Skill catalog](docs/engineering/skills.md), [task workflow](docs/engineering/agent-workflow.md), [verification](docs/engineering/verification-workflow.md) |
| Delivery | [Implementation plan](docs/implementation/plan.md), [backlog](docs/implementation/github-backlog.md), [deployment](docs/operations/deployment.md) |
| Current evidence | [Status](docs/STATUS.md) |

## Product direction

One community platform with separate game presentations: Wardogs retains its cinematic
backdrop, top navigation and amber selection; HLL uses a left menu, cool charcoal
layers and khaki highlights over future clan battle footage. Public pages cover the
clan, members, news, matches/results, servers, the editable Field Manual and Discord.
Authorized administrators manage editorial content. Public and admin UI support Czech
(default) and English with a visible Czech/UK flag language switcher. Code, technical
documentation, GitHub descriptions and AI prompts stay English. See
[the localization contract](docs/product/localization.md).

News/blog includes WordPress-like rich-text editing, image management, drafts/revisions,
preview and publishing. Reuse existing match management for reviewed historical import
and editorial publication; future event/sign-up/roster operations use hosted Logi where
its capabilities are verified, without creating a second writable operational master.
The game switch keeps both sections under one canonical origin; legacy HLL
external links remain until the reviewed content migration is accepted. The
[current integration contract](docs/integrations/logi/contract.md) governs this extension
over the earlier standalone [editorial and match requirements](docs/product/editorial-and-matches.md).

The [reference captures](docs/design/references/README.md) and
[supplied clan logo](assets/brand/valkyria-logo.png) are committed so cloud agents can
inspect the actual inputs. Large game/video sources remain outside the repository.
Selected [January 2026 Wardogs presskit originals](docs/assets/presskit-2026-01.md)
also have a source catalog and an offline gallery for editorial/game-logo review.

## Structure

```text
apps/web/             Next.js application (routes, components, domain modules, CLIs, tests)
apps/discord-worker/  Historical placeholder; hosted Logi is the selected integration
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
scripts/              Repository checks, release qualification and operator tooling
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
publication uses the separate protected manual workflow in [deployment](docs/operations/deployment.md).

## Sources and license

The [legacy website audit](docs/research/legacy-site-audit.md) records verified sources,
historical facts and unresolved content. Do not treat it as an automatic production seed.
Original source code/documentation uses the existing [Apache-2.0 license](LICENSE).
Branding, screenshots and game media are governed by their separate provenance in
[NOTICE.md](NOTICE.md) and the [asset policy](docs/assets/policy.md).

Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues
privately using [SECURITY.md](SECURITY.md).
