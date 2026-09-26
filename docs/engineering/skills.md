# Repository skills

This project is developed by agents with reviewable GitHub tasks and executable
checks. Skills live in `.claude/skills/` so a Claude Code Cloud checkout carries the
same procedures as a local checkout. No personal skill directory, paid plugin,
global hook, external orchestrator or owner's filesystem is required.

Claude supports project skills in `.claude/skills/<name>/SKILL.md`, automatic
selection by description and explicit `/skill-name` invocation. See the
[official skill documentation](https://code.claude.com/docs/en/skills).
Other agents should open these same files through the routing below; automatic
discovery in another client is not assumed. Relative links start at the skill file.

| Task | Skill | Detailed procedure |
|---|---|---|
| Start/resume a slice, coordinate work, hand off | [valkyria-delivery](../../.claude/skills/valkyria-delivery/SKILL.md) | [Agent workflow](agent-workflow.md) |
| Game-menu UI, routes, editor UX, responsive/accessibility work | [valkyria-frontend](../../.claude/skills/valkyria-frontend/SKILL.md) | [Application workflows](application-workflows.md) |
| Domain logic, server operations, publication, uploads | [valkyria-backend](../../.claude/skills/valkyria-backend/SKILL.md) | [Application workflows](application-workflows.md) |
| Discord identity, capabilities, sessions, recovery | [valkyria-auth](../../.claude/skills/valkyria-auth/SKILL.md) | [Auth policy](../security/auth-rbac.md) |
| Schema, migrations, backfill, seeds, restore rehearsal | [valkyria-database](../../.claude/skills/valkyria-database/SKILL.md) | [Database workflow](database-workflow.md) |
| Issues, branches, PRs, reviews, CI and dependencies | [valkyria-github](../../.claude/skills/valkyria-github/SKILL.md) | [GitHub workflow](github-workflow.md) |
| Reproduce a bug, select tests, review acceptance evidence | [valkyria-verification](../../.claude/skills/valkyria-verification/SKILL.md) | [Verification workflow](verification-workflow.md) |
| Version, release, image publication, deployment or rollback | [valkyria-release](../../.claude/skills/valkyria-release/SKILL.md) | [Release workflow](release-workflow.md), [deployment contract](../operations/deployment.md) |

Use delivery for orchestration, then load only the skills needed for the actual
change. A UI-only adjustment does not require a full DB/release procedure. A feature
crossing boundaries needs the corresponding contracts before parallel execution.
All delivery follows [the evidence policy](evidence.md): proof in PRs and related
issues/incidents before closure, including captioned screenshots when applicable.

## Maintaining these skills

Keep domain policy in its canonical document and link it from skills. Keep skill
frontmatter deliberately small: exactly `name` and `description`, both plain,
single-line YAML strings. Name matches the directory; descriptions distinguish
tasks before their body is loaded. Do not add secrets, dynamic shell expansions,
permission bypasses, hardcoded model selection or mandatory global dependencies.

When a workflow or command changes, update its skill/guide in the same PR. Verify
local links, frontmatter and the meaningful behavior of added scripts with:

```sh
node scripts/check-foundation.mjs
node --test scripts/tests/*.test.mjs
```

For a substantial risky skill, run a bounded independent scenario using the skill
and raw artifacts, without telling the evaluator the expected answer. Record its
observed decisions and correct demonstrated gaps. Schema validation alone does not
prove useful skill behavior or that a cloud client loaded the skill.
