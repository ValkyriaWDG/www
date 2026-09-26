# Paste into Claude Code Cloud

Use the following prompt with repository **ValkyriaWDG/www**, starting from **main**.

---

Implement the new Valkyria clan website in this repository. The preparation and design
decisions are already committed; your task is application implementation, not another
planning-only deliverable.

First read `AGENTS.md`, `CLAUDE.md`, `docs/STATUS.md`, and the complete
`docs/handoff/claude-code-cloud.md`. Follow its reading order and open the actual
reference images in `docs/design/references/`, especially `09-main-menu.jpg`,
`13-server-browser.jpg`, `12-scoreboard.jpg`, and `assets/brand/valkyria-logo.png`.

Fixed requirements:

- English-only public and admin interface. Canonical domain: https://valkyriawdg.cz.
- Recreate the supplied Wardogs main-menu composition and interaction style: persistent
  cinematic backdrop, dark translucent square panels, amber active states, bottom-left
  Discord CTA, and the supplied Valkyria emblem faded into the open center.
- Build the clan presentation, members, matches/results, news and community links,
  then Discord login, server-enforced role mapping and content administration.
- Next.js/React/TypeScript, PostgreSQL/Drizzle, Better Auth, pnpm, bespoke CSS tokens/modules.
- Follow the security, data, accessibility, media and Docker contracts in the handoff.
  Match/roster organization is secondary, after the public website and web admin work.
- This is a cloud checkout: no access to the owner's PC or production secrets. The final
  background video is pending; finish the media component with its safe fallback and
  report final-video verification separately. Do not invent clan records or integration success.

Execute M1–M3 in `docs/implementation/plan.md` in reviewable increments. Prove the visual
shell with screenshots early, then finish the real routes, database, auth and admin.
Run meaningful checks, keep `docs/STATUS.md` current, and open a PR from your task branch
when ready if GitHub access permits. Record any environment-blocked verification exactly.
Do not deploy, change DNS, publish an image or send live Discord messages. Do not add AI
co-author trailers, generated-by footers or session links to commits/PRs.

Start now: inspect the repository and references, give a concise execution sequence,
then implement. Do not stop after a generic scaffold or a plan.
