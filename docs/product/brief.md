# Product brief

Status: implementation baseline, 2026-09-26. Owner: Valkyria / @KasheK420.

## Outcome

Create the public home and administration workspace of Valkyria, a Czech/Slovak
gaming clan with Hell Let Loose history and a growing Wardogs focus. The experience
should feel like entering the Wardogs main menu: cinematic moving background,
sharp dark translucent panels, amber selection states, restrained motion, and the
supplied Valkyria emblem faded into the open center of the scene.

**The public and admin interface supports Czech (primary/default) and English on
`valkyriawdg.cz`.** Provide a Czech/UK flag language switcher with accessible text labels.
Code, documentation, GitHub descriptions and AI prompts remain English. The
[localization contract](localization.md) defines routes, translated CMS publication,
fallback states, SEO and verification. Preserve diacritics in member display names.
The old `valkyriahll.cz` site is a research source; its replacement/redirect is not authorized.

## Priorities

1. Distinctive, faithful menu shell; readable, responsive and fast without video.
2. Prominent news/blog, clan story, games, public member profiles, matches/results and Discord entry.
3. Discord sign-in and secure web administration of published content.
4. Explicit mapping of Discord guild roles to application capabilities.
5. Secondary milestone: player availability, squads and roster management. Creating,
   scheduling and publishing matches belongs to the first release.

Public content must work without login. Logging in does not require a public member
profile and does not automatically make a visitor a clan member. Joining Discord and
signing in are separate actions with separate explanations.

## First release scope

- Home menu, clan/history, member directory + profile, match list + details/results,
  news list + article, community/Discord links and minimal privacy information.
- Approved editorial content, real publish/draft states, deliberate honest empty states.
- Admin CRUD for content, profiles, matches and results, with authorization and audit trail.
- Discord OAuth, durable sessions, role sync and optional provisioned local admin login.
- Settings for public links and approved background media, with preview and validation.
- WordPress-like rich-text news/blog administration, media library, autosave, revisions,
  preview, publish/unpublish and scheduled publication; a plain textarea is insufficient.
- Explicit first-release match creation, fixture scheduling and result entry for admins.
- Discoverable external `HLL WEBSITE` link to `https://valkyriahll.cz/` on desktop/mobile.
- Working Docker image and migration procedure; first live deployment remains an operator task.

The detailed mandatory workflows are in [editorial and match requirements](editorial-and-matches.md).

Do not invent wins, ranks, current roster sizes, testimonials, server occupancy,
official Wardogs APIs or partnerships. Seed only reviewed facts from the
[legacy audit](../research/legacy-site-audit.md). Research is evidence, not auto-publishable content.

## Deferred scope

Full tournament platform, automated game telemetry, game launcher integration,
payments, merchandise, public registration by password, chat system, unrelated bots,
mobile application and multi-tenant clan hosting. Match organization is a separate
second milestone and must not delay the public presentation.

## Editorial rules

Use direct community language, not corporate marketing. State the transition to
Wardogs without erasing HLL history. Keep game-specific results and dates explicit.
Use approved public display names only; never import identities from reference
screenshots. Retain the orange Valkyria brand accent while matching the amber
Wardogs interaction treatment. Detailed visual decisions live in the visual spec.

## Inputs that remain open

| Input | Safe implementation behavior until supplied |
|---|---|
| Final MP4/WebM/poster + redistribution provenance | Static original CSS fallback and labeled preview fixtures |
| Discord application, guild and exact role IDs | Login unavailable state; no privileged role assignment |
| Current public roster and results | Empty state; synthetic fixtures only in explicit demo/test mode |
| DockerHub repo and deployment secrets | Build locally/CI; publication gate remains disabled |
| Approved privacy retention policy and contact route | Draft privacy copy; review before production |

These inputs do not block building the site, adapters, tests and admin workflows.
They do block claiming that live integrations, content or deployment are complete.
