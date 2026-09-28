# Claude Code entry point

@AGENTS.md

For the unified platform/HLL task read [the current Claude handoff](docs/handoff/hll-claude-code-cloud.md)
first, including its committed screenshots, design spec and legacy inventory. The
Wardogs application and the unified platform extension are implemented; start from
[current status](docs/STATUS.md), the assigned issue and the actual source. Older
[foundation instructions](docs/handoff/claude-code-cloud.md) remain historical context
where compatible; do not restart the app from a scaffold or rebuild completed
milestones. Foundation CI alone does not establish application or production verification.

The website is Czech-first with Czech/English switching using Czech/UK flags and
text labels. Code, technical documentation, GitHub descriptions and AI prompts stay
English. Follow [the localization contract](docs/product/localization.md), including
localized admin UI and independent published content translations.

Project skills are committed under `.claude/skills/`. Use `/valkyria-delivery` for
task execution and resume; route specialist work through
[the skill catalog](docs/engineering/skills.md). Automatic selection can use each
skill description. If this cloud client does not expose skill commands, open the
corresponding `SKILL.md` directly and follow it. No global installation is required.

Delivery includes [feature/fix proof and captioned screenshots when applicable](docs/engineering/evidence.md)
in the PR and in related issues/incidents before closure. A local image path or an
unexplained passing check is not reviewable proof; incomplete evidence leaves acceptance open.

Use `.claude/settings.json` attribution settings. Do not append AI co-author,
generated-by or session-link footers. Do not relax permissions or install global
hooks to bypass the environment. Build from committed inputs and explicit task access.
