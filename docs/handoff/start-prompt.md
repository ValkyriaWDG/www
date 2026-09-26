# Paste into Claude Code Cloud

Use the following prompt with repository **ValkyriaWDG/www**, starting from **main**.
For an already-running implementation, keep its current branch and use the
[media integration handoff](background-media-integration.md); do not restart work.

---

Implement the new Valkyria clan website in this repository. The preparation and design
decisions are already committed; your task is application implementation, not another
planning-only deliverable.

First read `AGENTS.md`, `CLAUDE.md`, `docs/STATUS.md`, and the complete
`docs/handoff/claude-code-cloud.md`. Follow its reading order and open the actual
reference images in `docs/design/references/`, especially `09-main-menu.jpg`,
`13-server-browser.jpg`, `12-scoreboard.jpg`, and `assets/brand/valkyria-logo.png`.

This project uses fully agentic development. Read `docs/engineering/skills.md` and
use the committed `.claude/skills/valkyria-delivery/SKILL.md` to orchestrate the work.
Load the relevant frontend, backend, auth, database, GitHub and verification skills
for each slice. Use release procedures when preparing release evidence; they do not
authorize publication or deployment. Coordinate bounded agents when useful, preserve
shared-file ownership and leave a durable checkpoint. If slash commands are unavailable,
read the skill files directly. Do not depend on personal plugins or the owner's machine.

Fixed requirements:

- Czech-first public and admin interface with Czech (`cs`) and English (`en`) routes.
  Add a visible Czech/UK flag switcher with CS/EN text and accessible language labels.
  Keep code, comments, technical docs, GitHub descriptions and AI prompts in English.
  Canonical domain: https://valkyriawdg.cz. Read `docs/product/localization.md` for
  `/cs` and `/en` routing, translated CMS revisions/publication, missing-translation
  behavior, metadata and bilingual evidence. This is part of M1–M3.
- Recreate the supplied Wardogs main-menu composition and interaction style: persistent
  cinematic backdrop, dark translucent square panels, amber active states, bottom-left
  Discord CTA, and the supplied Valkyria emblem faded into the open center.
- Build the clan presentation, members, matches/results, news and community links,
  then Discord login, server-enforced role mapping and content administration.
- NEWS/blog is a primary menu section. Admins need a WordPress-like rich-text editor,
  image/media library, draft autosave, revisions, preview, publish/unpublish and scheduled
  posts. A textarea or Markdown-only editing workflow is insufficient. Read
  `docs/product/editorial-and-matches.md` for the mandatory workflows.
- Include first-release match creation, fixture scheduling, result entry and rich-text
  recaps inspired by the old site's public match pages. Only roster/availability is later.
- Provide a visible HLL WEBSITE link to https://valkyriahll.cz/ on desktop/mobile and
  clan/community pages, plus an HLL match archive link where useful.
- Next.js/React/TypeScript with next-intl, PostgreSQL/Drizzle, Better Auth, pnpm,
  bespoke CSS tokens/modules. Resolve and pin compatible versions during bootstrap.
- Follow the security, data, accessibility, media and Docker contracts in the handoff.
  Match/roster organization is secondary, after the public website and web admin work.
- This is a cloud checkout: no access to the owner's PC or production secrets. Actual
  background derivatives are prepared; read `docs/assets/background-media-2026-09-26.md`
  and obtain the ZIP through its recorded channel. Preserve the safe fallback and verify
  the real media separately. Do not invent clan records or integration success.

Execute M1–M3 in `docs/implementation/plan.md` in reviewable increments. Prove the visual
shell with screenshots early, then finish the real routes, database, auth and admin.
Run meaningful checks, keep `docs/STATUS.md` current, and open a PR from your task branch
when ready if GitHub access permits. Record any environment-blocked verification exactly.
Attach criterion-specific proof and real, captioned screenshots when applicable to
the PR. Before resolving related issues/incidents or adding closing keywords, record
their acceptance/recovery evidence there too. Follow `docs/engineering/evidence.md`;
missing screenshots, inaccessible artifacts or unrun checks keep acceptance open.
Do not deploy, change DNS, publish an image or send live Discord messages. Do not add AI
co-author trailers, generated-by footers or session links to commits/PRs.

Start now: inspect the repository and references, give a concise execution sequence,
then implement. Do not stop after a generic scaffold or a plan.
