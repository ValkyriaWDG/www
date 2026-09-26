# News, visual editing and match management

Required first-release scope clarified by the owner on 2026-09-26. This extends the
[product brief](brief.md); it is implementation direction, not an implemented CMS.
All public and administration UI remains English-only.

## News and blog are a primary feature

Use one editorial collection at `/news` and `/news/[slug]` for announcements, blog
posts, match reports and clan updates. Expose **NEWS** in the primary desktop and mobile
menu; a utility icon alone is insufficient. Keep the cinematic homepage composition,
with at most a small genuine latest-post teaser if it fits. No demo post appears in production.

The public listing includes title, cover/thumbnail, excerpt, date, approved author
label, category/tags and game context. Provide pagination and useful category/game/search
filters, honest empty states and direct links. Articles have readable rich content,
cover/inline images, captions, publication/update dates and related posts where relevant.
Metadata/canonical/OG rendering uses published fields only. Public RSS/feed is optional,
but any implemented feed must obey the exact same publication gate.

## WordPress-like authoring experience

The owner expects a visual editor that nontechnical admins can use without editing
Markdown, HTML, source files or Git. WordPress is the usability reference, not a
requirement to install WordPress or introduce PHP/a second CMS service.

Baseline: Tiptap's maintained open-source React/ProseMirror editor and appropriate
open-source extensions, pinned during implementation. Store schema-versioned editor
JSON as canonical content. Use validated server-side rendering for public output;
public routes must not download the editor bundle. Do not depend on paid editor/cloud
services, proprietary collaboration/revision plugins or AI writing features.

Required visual controls:

- Paragraphs, H2/H3 headings, bold/italic/underline/strike and clear formatting.
- Bullet and numbered lists, blockquotes, separators, safe links and undo/redo.
- Inline images chosen/uploaded through the media library, alt text, captions and
  constrained alignment/size; a separate cover/featured image.
- Basic tables with header row and keyboard-usable editing; wide tables scroll in articles.
- Paste from common document editors while normalizing unsupported markup/styles.
- Accessible labeled toolbar, keyboard shortcuts and visible formatting/selection states.

Do not permit arbitrary fonts/colors that defeat readability, custom scripts, raw
HTML blocks or unrestricted iframes. Approved VOD links are ordinary validated links
in v1; a future provider embed must have an explicit allowlist and privacy behavior.
Support the documented formatting reliably before adding ornamental editor tools.

## Editorial routes and workflow

`/admin/news`: searchable paginated posts table with author, category, modification
time and draft/scheduled/published/archived state. Add **New post** and per-row edit,
preview, duplicate, publish/unpublish/archive actions subject to authorization.
`/admin/news/new` creates a draft; `/admin/news/[id]` edits it.

Editor layout: title and rich body in a wide central column; publication/metadata
panel beside it on desktop and stacked on mobile. Required fields: title, unique slug,
excerpt, rich body, cover, category/tags, game context, approved author label and optional
SEO title/description. Changes to a published slug need a controlled redirect record.
The author label never exposes an internal account/email automatically.

Required behaviors:

1. Manual save plus debounced server draft autosave with clear `Saving`, `Saved`,
   `Unsaved changes` and `Save failed` states. Never publish via autosave.
2. Private preview using the same renderer and styling as the public article, clearly
   marked draft and authorized/no-store. An opaque preview URL alone is not authorization.
3. Explicit publish/update/unpublish and optional scheduled publication with time zone.
   Scheduling is required for the completed editorial module; see the runner contract below.
4. Separate draft and published revision pointers. Editing/autosaving a published post
   cannot change what visitors see until an authorized update/publish action.
5. Bounded revision history with author/time and restore **to draft**. Revision storage
   is an application feature, not a requirement for a paid editor extension.
6. Optimistic concurrency: explain conflicts without silently overwriting another editor.
   Warn about unsaved changes. Preserve an unsent draft in memory on failure; do not
   persist private editorial content in browser storage by default.

Scheduled publishing uses a durable PostgreSQL schedule tied to an immutable saved
revision. Provide a bundled idempotent publisher CLI (e.g. `scripts/publish-due.mjs`)
and operator-configured minute timer; no in-request `setTimeout` as a scheduler. Atomically
publish only due, still-approved revisions, emit an audit event and invalidate public
caches. Cancelling/rescheduling or losing the granting account's publication authority
must be handled explicitly; fail closed until reapproved. Detect a stalled runner,
show overdue status and support safe retry. Record runner installation and timezone/DST
tests in release readiness before claiming scheduling works in production.

Represent scheduling separately from live publication. A first unpublished scheduled
post remains private until due; scheduling an update to an already published post must
keep its existing published revision visible. Show `Published · update scheduled` as a
composite admin state rather than hiding the live article behind a single scheduled flag.
Public title, slug, cover, excerpt, author label and SEO come from the published revision's
metadata snapshot, not mutable draft fields. Cancelling a scheduled update preserves
that entire live revision and its existing canonical route.
For local-admin schedules, use the narrow durable delegation defined in the
[authorization contract](../security/auth-rbac.md); do not replay an old MFA session.

## Media library and safe image uploads

`/admin/media` provides authorized image upload, thumbnails, searchable metadata,
alt/caption editing, ownership/provenance and usage references. Editors/admins can
manage editorial media; match managers may manage only match-scoped assets. Access
to media does not imply permission to edit global background settings or other domains.

Initially accept JPEG, PNG and WebP images with explicit byte/pixel limits. Verify
decoded format, re-encode safe derivatives, strip EXIF and generate server-controlled
names; reject SVG/HTML/executables and unsupported formats. Do not fetch arbitrary
user-entered remote URLs. Enforce upload authorization, quotas/rate limits and per-asset
scope on the server. Store bytes outside Git and outside application source; use a
dedicated persistent media volume or approved object storage, backed up with the DB.

Keep draft originals/previews private. Expose only intended published derivatives
through a controlled delivery path; a guessable file URL must not leak draft assets.
Asset removal must check references and cannot break another published article.
Unpublish/revoke should remove anonymous delivery when no published reference remains;
account for CDN invalidation. Runtime media provenance belongs in DB Asset records,
not a new source-code commit for every upload. Background game videos retain the
separate approved-delivery policy and are not accepted by this image uploader.

## Match overview and authoring belong to the first release

Public `/matches` separates **Upcoming** from **Results**, with game/status/competition
filters, opponent search, dates and pagination. Use a compact Wardogs-style list/detail
screen. Match rows show start time, competition/type, both teams with available logos,
explicit status and either `VS`/unknown or the verified result. Show postponement and
cancellation clearly; an unplayed fixture must never appear as a `0:0` result.

`/admin/matches` includes **New match**, searchable list/status filters and edit,
preview, publish/unpublish, postpone/cancel and result-entry flows.
`/admin/matches/new` creates a draft; `/admin/matches/[id]` edits it. Admins and the
explicit match-manager role can create/schedule/publish fixtures in M2. This work must
not be postponed to the secondary roster-management phase.

Match form groups:

| Group | Fields / behavior |
|---|---|
| Identity | Game, opponent display name/short code, optional approved opponent logo |
| Context | Competition or friendly/scrim type, optional season, format/best-of, optional team size |
| Schedule | Date/time + explicit zone; scheduled/postponed/live/completed/cancelled separate from draft/published |
| Game details | Optional maps/rounds, objective and sides/factions only when applicable to the selected game |
| Public presentation | Rich-text match preview/recap using the same editor, cover and approved VOD/event links |
| Result | Nullable per-team scores, outcome, provisional/verified flag and source; game-specific validation |
| Private administration | Internal notes strictly separated from public DTO/rendering |

Detailed match pages include the public fixture facts, game-appropriate rounds/result,
recap and VOD links. Validate conflicting dates/statuses, missing required result data
and stale edit versions. Publishing or changing a result is audited. Squad assignment,
availability, substitutes and lineup locking remain M4; fixture authoring is v1.

## Legacy inspiration and HLL links

Public source pages inspected: [match list](https://valkyriahll.cz/matches),
[completed match example](https://valkyriahll.cz/matches/207) and
[scheduled match example](https://valkyriahll.cz/matches/211). Observed patterns include
Upcoming/History separation, dated team/logo rows, competition labels, paginated history,
match metadata, maps/round context and videos. Search/advanced filters above are new
product recommendations, not claims about the old site. Its private admin was not inspected.
Do not copy the old scheduled `0:0` placeholder or assume HLL-specific factions/team
sizes apply to Wardogs. Players/weapons/tactical telemetry is not required; no supported
Wardogs telemetry API has been established.

Expose **HLL WEBSITE** → `https://valkyriahll.cz/` in the shared desktop/mobile utility
navigation or footer, and as an explicit `Hell Let Loose website` link on `/clan` and
`/community`. The matches page may additionally offer `HLL match archive` →
`https://valkyriahll.cz/matches`. Clearly identify these as external links and announce
a new tab if one is used. Keep them discoverable without login. Do not redirect or
replace the old site, and do not hotlink its graphics as runtime assets.

## Acceptance journeys

- An editor creates a formatted post with cover and inline image, saves, reloads,
  previews and publishes; the article matches preview and appears in public news.
- Autosaving edits to a published post changes only the draft; restore a revision to
  draft and prove the live article stays unchanged until explicit publication.
- Schedule an update to a live article, then cancel it: existing body, title, slug,
  cover and SEO must remain unchanged and accessible at the original public route.
- Due scheduling, cancellation, runner retry, timezone boundaries and stale authorization
  behave deterministically. Future/draft content and media stay inaccessible anonymously.
- Unsupported pasted markup, hostile URLs/uploads and editor-to-match privilege escalation
  are rejected; conflict and failed-save states preserve unsent work safely.
- A match manager creates/publishes an upcoming match, postpones it, then records a
  verified result; the public lists and detail reflect the correct transitions.
- Desktop and mobile visitors can find NEWS, MATCHES and HLL WEBSITE without signing in.

Primary editor integration references:
[Tiptap React](https://tiptap.dev/docs/editor/getting-started/install/react),
[Next.js setup](https://tiptap.dev/docs/editor/getting-started/install/nextjs),
[JSON/HTML output](https://tiptap.dev/docs/guides/output-json-html).
Verify APIs/licenses against the versions pinned during implementation.
