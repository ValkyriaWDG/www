# Contributing

Read [AGENTS.md](AGENTS.md). Open an issue for a material scope or architecture change.
Use [the repository skills](docs/engineering/skills.md) and
[GitHub workflow](docs/engineering/github-workflow.md) for agent-delivered work.
Use `feat/`, `fix/`, `docs/` or `chore/` branches and conventional commit subjects.
Keep one reviewable purpose per pull request. Link the issue, state the behavior,
include relevant screenshots and exact verification results.

The site and its interface copy are English-only. Code, documentation and commit
messages use English. The repository owner may discuss work in Czech.

Use Node 24 and the package manager pinned in `package.json`. Currently
`node scripts/check-foundation.mjs` checks the scaffold without installing dependencies.
The future app commands are specified in [the plan](docs/implementation/plan.md),
and must be implemented as real checks before application delivery.

Do not upload secrets, database dumps, raw game archives, full-resolution video
masters or unapproved member data. See [asset policy](docs/assets/policy.md).
Report security findings privately as described in [SECURITY.md](SECURITY.md).

Code owners review protected changes. Squash merges are preferred. AI assistance is
allowed; artificial AI co-author trailers and promotional generated-by text are not.
Do not remove human contributions or falsify authorship.
