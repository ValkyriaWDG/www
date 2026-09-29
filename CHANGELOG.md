# Changelog

## Unreleased

- Import the legacy HLL archive through a resumable, provenance-preserving operator
  pipeline: articles, manuals, FAQ/history, tournaments, matches, images and individual
  statistical rounds. Preserve unknown sides and quarantine conflicting source exports.
- Resolve historical HLL detail URLs only to published canonical content, and allow
  match administrators to import a completed result from a configured CRCON game link.
- Show bounded live HLL round-player statistics with visible refresh/pause and stale
  states; keep provider credentials and private account fields off the public API.
- Keep the mobile match editor within its viewport while retaining toolbar scrolling
  and show its correct game-specific public address.
- Add localized homepage canonicals and branded news, match and site sharing images,
  editorial sharing previews and published-article structured data.
- Revalidate durable authorization for Discord sessions and scheduled publishing;
  keep hosted Logi integration and live sign-in acceptance deferred.
- Stabilize mobile article metadata while font subsets load independently, preserving
  the existing desktop layout and unchanged layout-shift budgets.
- Qualify the pinned Trixie runtime, cold-mobile page budgets, previous-image rollback
  and encrypted paired-backup byte verification; refresh CI action pins and media tests.

The legacy import requires migrations `0005`–`0008`, a reviewed private source bundle,
and an explicit paired database/media migration. Once unknown historical sides are
imported, the previous reader requires the pre-import database/media snapshot for
rollback; an image-only rollback is unsafe. Live HLL reads require approved CRCON
source configuration. These source changes are not a deployment claim; see
[current status](docs/STATUS.md) for the accepted revision,
publication, production checks and remaining browser/authentication/operational limits.

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
- Wardogs presskit placements: key art on the clan page, a recruitment illustration on
  the community page and the game wordmark on coverless Wardogs news, captioned as game
  media with localized alt text and responsive derivatives.

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
