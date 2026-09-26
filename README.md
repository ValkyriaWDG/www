# Valkyria

English-language community website for **Valkyria**, built around a Wardogs-inspired
game-menu experience and the clan's Hell Let Loose heritage.

**Target domain:** `valkyriawdg.cz` · **Repository:** [ValkyriaWDG/www](https://github.com/ValkyriaWDG/www)

> Current stage: repository foundation and cloud implementation handoff.
> The application, login, database migrations and deployable image are not implemented yet.

## Start here

| Audience | Entry point |
|---|---|
| Owner starting Claude Code Cloud | [Copy-ready prompt](docs/handoff/start-prompt.md) |
| Implementation agent | [Detailed handoff](docs/handoff/claude-code-cloud.md) and [AGENTS.md](AGENTS.md) |
| Product/design | [Brief](docs/product/brief.md), [visual specification](docs/design/visual-spec.md), [screen map](docs/design/screen-map.md) |
| Engineering | [Architecture](docs/architecture/overview.md), [data model](docs/architecture/data-model.md), [auth/RBAC](docs/security/auth-rbac.md) |
| Delivery | [Implementation plan](docs/implementation/plan.md), [backlog](docs/implementation/github-backlog.md), [deployment](docs/operations/deployment.md) |
| Current evidence | [Status](docs/STATUS.md) |

## Product direction

A cinematic backdrop with a faded Valkyria crest, compact top navigation, amber
selection states and sharp translucent panels. Public pages cover the clan, members,
news, matches/results and Discord. Authorized administrators manage content; match
availability and rosters are a later milestone. The entire interface is English-only.

The [reference captures](docs/design/references/README.md) and
[supplied clan logo](assets/brand/valkyria-logo.png) are committed so cloud agents can
inspect the actual inputs. Large game/video sources remain outside the repository.

## Structure

```text
apps/                 Web application and optional Discord-worker boundaries
packages/             Database and shared integration contracts
assets/               Clan logo and provenance manifest
docs/product/         Scope and editorial requirements
docs/design/          Visual specification, route map and reference captures
docs/architecture/    System design, data model and decisions
docs/security/        Authentication and capability policy
docs/research/        Dated legacy-site and local-media inventories
docs/handoff/         Claude Cloud brief and copy-ready starting prompt
docs/implementation/  Milestones, backlog and verification requirements
docs/operations/      Release and rollback contract
infra/                Sanitized deployment examples
scripts/              Executable foundation checks
.github/              CI, publication gate, ownership and contribution templates
```

## Verify the foundation

With Node 24 and Git available, from the repository root:

```sh
node scripts/check-foundation.mjs
node scripts/check-commit-attribution.mjs
```

There is no application dev server yet. Planned application commands are listed in
[the implementation plan](docs/implementation/plan.md). CI checks the foundation now
and activates real application checks when the web package is introduced. Container
publication is explicitly disabled until application and operator setup are complete.

## Sources and license

The [legacy website audit](docs/research/legacy-site-audit.md) records verified sources,
historical facts and unresolved content. Do not treat it as an automatic production seed.
Original source code/documentation uses the existing [Apache-2.0 license](LICENSE).
Branding, screenshots and game media are governed by their separate provenance in
[NOTICE.md](NOTICE.md) and the [asset policy](docs/assets/policy.md).

Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues
privately using [SECURITY.md](SECURITY.md).
