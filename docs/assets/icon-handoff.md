# Interface icon handoff

Prepared 2026-09-29 for the graphics implementation accompanying PR #70.
This is a source-asset delivery. No application component, route, permission or
production content is changed by this pack.

- [Catalog with SVG hashes, dimensions and meanings](../../assets/icons/valkyria-ui/catalog.json)
- [Offline contact sheet](../../assets/icons/valkyria-ui/contact-sheet.html)
- [Actual local browser captures and verification](../../assets/icons/valkyria-ui/evidence/README.md)
- [Asset policy](policy.md)

## Identity and interface graphics

Use the supplied [Valkyria crest](../../assets/brand/valkyria-logo.png) for the clan,
with its complete aspect ratio and provenance. Use the separately delivered official
HLL/Wardogs logo assets for game identification. None of these icons is a clan
emblem, game logo, Discord mark, rank or faction badge.

The inspected app already uses crest derivatives in the shared/HLL header and
community hub. Compare those derivatives with the supplied original; do not redraw
the emblem. At inspection, the HLL hub card used a styled text span and the game
switch used localized game names. The parallel logo integration replaces the
typographic approximation while preserving an accessible textual game name.

## Existing icons and concrete gaps

The [UI icon module](../../apps/web/src/components/ui/icons.tsx) already covers
news, community chat, globe, external links, playback, menu, close, user, chevrons,
sorting, search, information, check, warning, error, dot and shield. Keep those
exports. The [editor toolbar](../../apps/web/src/components/editor/icons.tsx) already
has formatting, link, image and table glyphs; do not duplicate that system.

Text-only controls are functional. The following are additive targets, not claims
that those features are broken. Use icons where scanning improves. Do not decorate
every table cell or the entire text-first HLL main-menu lane.

Paths below are relative to **apps/web/src/**. Existing routes retain their
**/cs** or **/en** prefix and applicable **/hll** or **/wardogs** scope.

| SVG / suggested export | Existing integration target | Preserve |
|---|---|---|
| members.svg / MembersIcon | components/hub/community-hub.tsx members link; components/public/members-list-screen.tsx roster heading | Actual labels; no rank/count implied |
| match.svg / MatchIcon | Hub matches link; components/public/matches-screen.tsx; components/shell/home/next-match-strip.tsx | Upcoming/results distinction and real data; never means victory |
| trophy.svg / TrophyIcon | components/public/tournaments-screen.tsx; existing authorized tournament admin entry | Competition destination, no invented achievement |
| server.svg / ServerIcon | components/servers/server-browser.tsx generic thumb placeholder or heading | Explicit reachability/freshness text; no fabricated live status |
| manual.svg / ManualIcon | components/field-manual/manual-screen.tsx; existing manual admin entry | Published content; landing menu stays text-first |
| calendar.svg / CalendarIcon | Fixture date label; components/admin/schedule-panel.tsx heading | Actual locale/date/timezone, DST choices and pending state |
| filter.svg / FilterIcon | components/ui/filter-bar.tsx existing filter group presentation | Existing search glyph, URL filters and segmented links; no new drawer |
| refresh.svg / RefreshIcon | Server browser refresh button; components/admin/news-editor.tsx conflict reload | Cooldown/disabled state, observation time and conflict flow |
| copy.svg / CopyIcon | components/servers/copy-address.tsx button | Visible public address and copied/failed announcement |
| settings.svg / SettingsIcon | Existing settings entry in components/admin/admin-nav.tsx; components/admin-community/settings-form.tsx | Capability checks and unsaved-change guard |
| upload.svg / UploadIcon | components/admin/media-uploader.tsx file-selection button | Allowed image types, label, validation, progress and failures |
| preview.svg / PreviewIcon | News editor and components/admin/revision-history.tsx preview actions | Preview authorization, translation/revision and new-tab disclosure |
| save.svg / SaveIcon | News editor, components/admin/media-detail.tsx and settings save | Save differs from publish; disabled/busy/failure labels |
| history.svg / HistoryIcon | News editor revision disclosure; components/admin/revision-history.tsx | Stored revisions, restore confirmation and disclosure semantics |
| edit.svg / EditIcon | components/admin/post-row-actions.tsx direct edit link | Existing URL/authorization; publication remains a separate action |
| delete.svg / DeleteIcon | components/admin/media-detail.tsx existing delete action | Confirmation and references-in-use refusal; never archive/unpublish/cancel |

The catalog's English/Czech glossary states meanings. It does not introduce new
translation keys or override the existing dictionaries.

## Integration contract for Claude

1. Reuse the existing **Icon** wrapper in components/ui/icons.tsx. Add named exports
   by copying only each canonical SVG's geometric children. Convert attribute
   spelling to JSX where needed. Preserve the 24 × 24 viewBox, fill none,
   currentColor stroke, width 1.75, square caps and miter joins. No package,
   font, loader or client-side SVG fetch is needed.
2. Prefer inline React SVG. An external SVG inside an HTML image has its own
   document and does **not** inherit the surrounding currentColor; it may appear
   black on dark surfaces. Source files under assets/ are not runtime URLs.
   Explicitly register any selected runtime copies and test their color behavior.
3. Keep glyphs decorative with aria-hidden true and focusable false. Buttons/links
   own localized names, keyboard behavior and focus. Retain visible text.
   An exceptional icon-only utility needs a CS/EN accessible name plus a visible
   focus/hover tooltip; an SVG title alone is insufficient.
4. Use the existing **GameButton icon prop**. Default to 20–24 CSS px; reviewed
   16px metadata glyphs do not define the hit area. Keep a 44px touch target where
   possible, current theme colors, clear focus/disabled states and at least 3:1
   contrast for meaningful icons/control boundaries.
5. Keep glyphs static. Existing busy text/progress conveys actual work; adding
   refresh/upload glyphs does not require perpetual motion. Freshness, selection,
   destructive intent and outcomes must not rely only on color.
6. Do not use raw HTML injection or CMS-provided SVG markup. This source pack is
   not an SVG-upload feature. Keep editor validation and server permissions intact.

## Verification and remaining acceptance

The validator checked all sixteen originals as XML, allowing only passive
svg/path/circle/rect geometry and declared attributes. It checked SHA-256/bytes,
positive in-viewBox bounds and exact source/contact-sheet geometry. Chromium
rendered 128 samples per viewport at 1440px and 390px without external HTTP
requests, page errors or horizontal overflow. Both full-page captures were
visually inspected for clipping, blank glyphs, legibility and light/dark contrast.

Reproduce from the repository root with the available project Playwright runtime:

~~~sh
node --check assets/icons/valkyria-ui/verify.mjs
node assets/icons/valkyria-ui/verify.mjs
~~~

For a separately provisioned runtime, append
**--playwright-package "/absolute/path/to/@playwright/test/package.json"**.
The command checks the catalog and writes screenshots/report under the pack's
evidence/ folder. Recapture is an intentional evidence update: review new images
and update catalog capture hashes/dimensions if rendering changes. Refresh source
or HTML digests before recapturing modified input. Keep the root manifest in sync.

These captures show the **icon contact sheet**, not the website or a bilingual
route test. Claude must verify the integrated app and capture actual CS/EN desktop
and mobile screens: hub/header with supplied crest/game marks, server refresh/copy,
and editor save/preview/upload. Include focus and relevant pending/error states.
Confirm labels, accessible names, routes and action behavior survive; check for
hydration errors. Register runtime copies/derivatives in the root manifest.
Application integration, exact-head CI and deployment remain separate evidence.
