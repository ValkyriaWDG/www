# Changelog

## 1.0.0 — 2026-09-26

First release of the Valkyria website application (milestones M1–M3). Not deployed:
production hosting, DNS, Discord application configuration, media origin and container
publication are separate operator steps (see [deployment](https://github.com/ValkyriaWDG/www/blob/main/docs/operations/deployment.md)).

### Website
- Czech-first `/cs` and English `/en` routes (`/` → `/cs`), Czech/UK flag language switch
  that keeps the current page and safe filters, localized metadata, `hreflang`, sitemap
  and robots.
- Persistent Wardogs main-menu shell: cinematic background with poster, CSS fallback and
  the full-length delivered loop; faded clan crest overlay; motion, Save-Data and mobile
  defaults that download no video before an explicit Play; persistent pause preference.
- Public pages: home with the next match, news list and articles, clan, community and
  Discord, member roster and profiles, match browser with upcoming/results and details,
  privacy; visible HLL WEBSITE links and the HLL match archive link.

### Administration
- Discord sign-in with guild role-to-capability mapping that fails closed on stale or
  unknown roles; local administrator recovery with mandatory MFA; audit log.
- Editorial workspace: visual editor (headings, lists, links, tables, images), media
  library with private derivatives, autosave with conflict handling, revisions and
  restore-to-draft, private preview, publish/unpublish, scheduled publishing with a
  transactional `publish-due` runner, independent Czech and English translations.
- Community administration: matches (fixtures, schedule changes, postponement,
  cancellation, verified or unknown results, recaps), member profiles with consent,
  site settings (Discord invite, community links, background media) and audit reads.

### Operations
- PostgreSQL schema and serialized migrations (Drizzle), seed and synthetic fixture
  CLIs, readiness/liveness endpoints, nonce CSP and security headers.
- Non-root standalone container image with bundled migration and publisher CLIs.
- Checks: lint, strict typecheck, unit, PostgreSQL integration, Playwright journeys and
  visual captures, a separate actual-media browser suite and a backup/restore rehearsal.
