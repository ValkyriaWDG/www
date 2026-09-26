# Current status

Updated: 2026-09-26. Stage: **foundation / implementation handoff**.

## Prepared

- Public repository structure, contribution/security/ownership files and agent instructions.
- English-only product brief for `valkyriawdg.cz`.
- Detailed game-menu visual specification, screen map, 13 reference captures and exact logo.
- Architecture, domain model, Discord/local-admin access contract and release plan.
- Legacy site research and read-only local Wardogs media inventory.
- Claude Cloud detailed handoff and copy-ready prompt.
- Foundation CI and gated future application/container publication workflows.

## Not implemented

Website application, real database schema/migrations, login, role sync, admin UI,
match coordination, Dockerfile/runtime image and live deployment. The final background
video is still pending owner delivery. Source video identity/animation was not decoded
or verified by the inventory.

## Verification

| Check | Result |
|---|---|
| `node scripts/check-foundation.mjs` | Passed: documentation links, JSON, required files, asset hashes and basic hygiene |
| `node scripts/check-commit-attribution.mjs` | Passed against current history |
| `pnpm install --frozen-lockfile --ignore-scripts` | Passed for dependency-free foundation workspace |
| YAML parse of workflows/templates/Compose/workspace | Passed with PyYAML |
| Independent design/auth/CI consistency review | Completed; identified handoff inconsistencies corrected |
| Isolated negative fixtures | Passed: tracked env, altered asset, missing app manifest, AI co-author and cloud-session footer were rejected |
| Hosted GitHub Actions | [Initial foundation CI passed](https://github.com/ValkyriaWDG/www/actions/runs/36237469190) for `0550ec0`; Application correctly skipped |

No application/container/live checks are claimed by this document.

## GitHub preparation

Description, target homepage, topics, four milestones and [eight open implementation
issues](implementation/github-backlog.md) are configured. Private vulnerability reporting,
Dependabot vulnerability alerts, secret scanning and secret push protection are enabled.
Container publication has an owner-reviewed environment and is disabled by repository
variable. Main requires a pull request, current **Quality gate**, resolved conversations
and linear history; force pushes/deletion are disabled, including for administrators.
No mandatory external reviewer is configured because the owner must be able to merge
after checks without approving their own PR. Latest checks remain visible in
[GitHub Actions](https://github.com/ValkyriaWDG/www/actions/workflows/ci.yml).

## Next action

Start Claude Code Cloud against main using [the starting prompt](handoff/start-prompt.md).
Implement [M1–M3](implementation/plan.md), then handle the secondary match-management
milestone separately. Supply approved web media and Discord/registry configuration
through private environment channels when live integration is due.
