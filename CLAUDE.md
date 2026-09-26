# Claude Code entry point

@AGENTS.md

Read [the cloud implementation handoff](docs/handoff/claude-code-cloud.md) before
coding. It defines the reading order, milestone boundaries, cloud setup, acceptance
criteria and delivery format. The repository is initially a scaffold; there is no
running website yet. Do not mistake the foundation CI for application verification.

Project skills are committed under `.claude/skills/`. Use `/valkyria-delivery` for
task execution and resume; route specialist work through
[the skill catalog](docs/engineering/skills.md). Automatic selection can use each
skill description. If this cloud client does not expose skill commands, open the
corresponding `SKILL.md` directly and follow it. No global installation is required.

Use `.claude/settings.json` attribution settings. Do not append AI co-author,
generated-by or session-link footers. Do not relax permissions or install global
hooks to bypass the environment. Build from committed inputs and explicit task access.
