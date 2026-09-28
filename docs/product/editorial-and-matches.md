# News, visual editing and match management

Required first-release scope clarified by the owner on 2026-09-26. This extends the
[product brief](brief.md); it is implementation direction, not an implemented CMS.
The public site and administration are bilingual, with Czech (`cs`) as the default
and English (`en`) available through the visible flag-and-language switcher. Code,
documentation, agent prompts and GitHub prose remain English. Follow the canonical
[localization contract](localization.md); English labels below describe actions and
must have Czech UI equivalents.

## News and blog are a primary feature

Use one editorial collection at `/[locale]/news` and `/[locale]/news/[slug]` for announcements,
blog posts, match reports and clan updates, where `[locale]` is `cs` or `en`. Expose
**NOVINKY / NEWS** in the primary desktop and mobile
menu; a utility icon alone is insufficient. Keep the cinematic homepage composition,
with at most a small genuine latest-post teaser if it fits. No demo post appears in production.

The public listing includes title, cover/thumbnail, excerpt, date, approved author
label, category/tags and game context. Provide pagination and useful category/game/search
filters, honest empty states and direct links. Articles have readable rich content,
cover/inline images, captions, publication/update dates and related posts where relevant.
Metadata/canonical/OG rendering uses published fields only. Public RSS/feed is optional,
but any implemented feed must obey the exact same locale-specific publication gate.

The [sharing workflow](../engineering/seo-and-sharing.md) generates branded 1200 × 630
PNG templates for published articles and matches from those same public projections.
The editor's sharing section previews only the selected translation's published image.

Each post/page is one entity with a `ContentTranslation` for each available locale;
do not create unrelated duplicate posts for translations. Each translation owns its
slug, draft and published revisions, title, body, excerpt, cover presentation, SEO,
author label and publication state. Czech and English publication, unpublication and
scheduling are independent explicit actions. Creating, saving or publishing one locale
does not translate or publish the other. Core static pages require both translations
for launch; news may have only one published translation.

Find a language-switch counterpart by stable entity identity and its published
translation, never by replacing a URL prefix or guessing a translated slug. If an
article has no published English counterpart, switch to `/en/news` with a localized
notice and a labeled link to the available source-language published article. A direct
request for an absent or unpublished translation returns 404; it must not render a
draft or silently serve another language under that translation's URL. Apply the
canonical missing-translation behavior in the other direction as well. Lists, search,
related posts, metadata and any feeds include only published content for their locale.

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

`/[locale]/admin/news`: searchable paginated posts table with author, category, modification
time and separate Czech/English publication and schedule states. Add **New post** and per-row edit,
preview, duplicate, publish/unpublish/archive actions subject to authorization.
`/[locale]/admin/news/new` creates an entity and its chosen-language draft;
`/[locale]/admin/news/[id]` edits the selected translation. Keep the UI language distinct
from the content language: an administrator using Czech controls can edit an English
translation. Show the chosen content language on save, preview, publish, schedule,
restore and unpublish actions so the affected translation is unambiguous.

Editor layout: title and rich body in a wide central column; publication/metadata
panel beside it on desktop and stacked on mobile. Required fields: title, locale-scoped unique slug,
excerpt, rich body, cover, category/tags, game context, approved author label and optional
SEO title/description. Changes to a published slug need a controlled redirect record
in the same locale and route namespace. Categories/tags use stable shared keys with
localized labels, not duplicated taxonomies inferred from translated display text.
The effective term labels displayed with a post belong to its published revision
snapshot; editing a locale or a mutable taxonomy label does not silently change live copy.
The author label never exposes an internal account/email automatically.

Required behaviors:

1. Manual save plus debounced server draft autosave with clear `Saving`, `Saved`,
   `Unsaved changes` and `Save failed` states. Never publish via autosave.
2. Private preview using the same renderer and styling as the public article, clearly
   marked draft and authorized/no-store. An opaque preview URL alone is not authorization.
3. Explicit publish/update/unpublish and optional scheduled publication with time zone.
   Scheduling is required for the completed editorial module; see the runner contract below.
4. Separate draft and published revision pointers for each translation. Editing/autosaving
   either language cannot change its live version or the other language's saved/live
   content until the relevant explicit authorized action.
5. Bounded revision history with author/time and restore **to draft**. Revision storage
   is an application feature, not a requirement for a paid editor extension.
6. Optimistic concurrency per translation: explain conflicts without silently overwriting
   another editor. Czech and English translators must not overwrite each other's work.
   Warn about unsaved changes. Preserve an unsent draft in memory on failure; do not
   persist private editorial content in browser storage by default.

Scheduled publishing uses a durable PostgreSQL schedule tied to an exact translation,
locale and immutable saved revision. Provide a bundled idempotent publisher CLI (e.g. `scripts/publish-due.mjs`)
and operator-configured minute timer; no in-request `setTimeout` as a scheduler. Atomically
publish only due, still-approved revisions for that translation, emit a locale-aware
audit event and invalidate affected locale pages plus the other locale's cached
counterpart links/hreflang/switch availability and shared sitemap/availability entries.
Cancelling/rescheduling or losing the granting account's publication authority
must be handled explicitly; fail closed until reapproved. Detect a stalled runner,
show overdue status and support safe retry. Record runner installation and timezone/DST
tests in release readiness before claiming scheduling works in production.

Represent scheduling separately from live publication for each locale. A first unpublished
scheduled translation remains private until due; scheduling an update to an already
published translation must keep its existing published revision visible. Show the
localized equivalent of `Published · update scheduled` as a
composite admin state rather than hiding the live article behind a single scheduled flag.
Public title, slug, cover, excerpt, author label and SEO come from the published revision's
metadata snapshot, not mutable draft fields. Cancelling a scheduled update preserves
that entire live revision and its existing canonical route.
For local-admin schedules, use the narrow durable delegation defined in the
[authorization contract](../security/auth-rbac.md); do not replay an old MFA session.

## Media library and safe image uploads

`/[locale]/admin/media` provides authorized image upload, thumbnails, searchable metadata,
localized alt/caption authoring, ownership/provenance and usage references. Store the
effective alt text, caption and presentation in each language's immutable content revision;
editing the library or another translation must not mutate an already published snapshot.
Asset bytes/provenance may be shared. Editors/admins can
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
Unpublish/revoke should remove anonymous delivery when no published reference remains
across either locale and any permitted owning domain; retain bytes still used by an
authorized published translation. Draft-only locale references never permit anonymous delivery;
account for CDN invalidation. Runtime media provenance belongs in DB Asset records,
not a new source-code commit for every upload. Background game videos retain the
separate approved-delivery policy and are not accepted by this image uploader.

## Match overview and authoring belong to the first release

Public `/[locale]/matches` separates localized **Upcoming** from **Results**, with game/status/competition
filters, opponent search, dates and pagination. Use a compact Wardogs-style list/detail
screen. Match rows show start time, competition/type, both teams with available logos,
explicit status and either `VS`/unknown or the verified result. Show postponement and
cancellation clearly; an unplayed fixture must never appear as a `0:0` result.

`/[locale]/admin/matches` includes localized **New match**, searchable list/status filters and edit,
preview, publish/unpublish, postpone/cancel and result-entry flows.
`/[locale]/admin/matches/new` creates a draft; `/[locale]/admin/matches/[id]` edits it. Admins and the
explicit match-manager role can create/schedule/publish fixtures in M2. This work must
not be postponed to the secondary roster-management phase.

Match form groups:

| Group | Fields / behavior |
|---|---|
| Identity | Game, opponent display name/short code, optional approved opponent logo |
| Context | Competition or friendly/scrim type, optional season, format/best-of, optional team size |
| Schedule | Date/time + explicit zone; scheduled/postponed/live/completed/cancelled separate from draft/published |
| Game details | Optional maps/rounds, objective and sides/factions only when applicable to the selected game |
| Public presentation | Optional Czech/English rich-text preview/recap with independent draft/live revisions, localized cover alt/caption and approved VOD/event links |
| Result | Nullable per-team scores, outcome, provisional/verified flag and source; game-specific validation |
| Private administration | Internal notes strictly separated from public DTO/rendering |

Detailed match pages include the public fixture facts, game-appropriate rounds/result,
recap and VOD links. Validate conflicting dates/statuses, missing required result data
and stale edit versions. Publishing or changing a result is audited. Squad assignment,
availability, substitutes and lineup locking remain M4; fixture authoring is v1.

One shared match owns its dates, opponents, scores, status and result facts; translation
must not duplicate them or alter those facts implicitly. Format dates/numbers and status
labels for the UI locale without changing stored instants or results. Optional recaps
and member biographies follow the same per-locale published-revision boundary. Member
names remain unchanged. Missing localized prose shows an honest localized absence label
and a link to an available published source-language version; never fill it with a draft
or present untranslated prose as translated. Match publication and member publication/
consent remain global gates, so a translated recap/biography cannot expose a private entity.

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

Expose a localized **HLL WEBSITE** link → `https://valkyriahll.cz/` in the shared desktop/mobile utility
navigation or footer, and as an explicit localized `Hell Let Loose website` link on
`/[locale]/clan` and `/[locale]/community`. The matches page may additionally offer
a localized `HLL match archive` →
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
- Czech-default and English desktop/mobile visitors can find localized NEWS, MATCHES
  and HLL WEBSITE links and the language switcher without signing in.
- Two translators edit Czech and English for the same entity concurrently; saving,
  publishing, restoring or scheduling one never alters the other translation's revision,
  slug, SEO or image alt/caption. Same-translation conflicts are explicit.
- Switching to an available counterpart uses that translation's real published slug;
  a missing English article leads to `/en/news` with the localized source-link notice.
  Direct unpublished translation URLs, previews, APIs and assets cannot leak drafts.
- Shared match facts and member names remain identical across languages; only localized
  labels/formatting and independently published prose change. Global privacy gates still apply.

Primary editor integration references:
[Tiptap React](https://tiptap.dev/docs/editor/getting-started/install/react),
[Next.js setup](https://tiptap.dev/docs/editor/getting-started/install/nextjs),
[JSON/HTML output](https://tiptap.dev/docs/guides/output-json-html).
Verify APIs/licenses against the versions pinned during implementation.
