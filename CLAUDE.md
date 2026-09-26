# Claude Code entry point

@AGENTS.md

Read [the cloud implementation handoff](docs/handoff/claude-code-cloud.md) before
coding. It defines the reading order, milestone boundaries, cloud setup, acceptance
criteria and delivery format. The repository is initially a scaffold; there is no
running website yet. Do not mistake the foundation CI for application verification.

Use `.claude/settings.json` attribution settings. Do not append AI co-author,
generated-by or session-link footers. Do not relax permissions or install global
hooks to bypass the environment. Build from committed inputs and explicit task access.
