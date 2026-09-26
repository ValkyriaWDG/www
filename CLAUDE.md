# Claude Code entry point

@AGENTS.md

Read [the cloud implementation handoff](docs/handoff/claude-code-cloud.md) before
coding. It defines the reading order, milestone boundaries, cloud setup, acceptance
criteria and delivery format. The repository is initially a scaffold; there is no
running website yet. Do not mistake the foundation CI for application verification.

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
