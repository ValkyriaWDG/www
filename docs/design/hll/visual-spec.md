# Valkyria HLL visual and interaction specification

**Date:** 2026-09-28
**Status:** Implementation handoff; the owner approved an HLL-inspired direction and a fullscreen scenic background, replacing the earlier central-video-box proposal. Layout values, colors and motion below are proposed implementation targets derived from the supplied references. They are not extracted game design tokens.
**Scope:** Extend `ValkyriaWDG/www`; do not create a second application, CMS, identity store or database. This document supplies the HLL visual direction previously left undecided in the [website prompt](../../handoff/hll-claude-code-cloud.md). Preserve the [unified-platform decision](../../architecture/decisions/0002-unified-valkyria-platform.md) and the separate Logi integration contract. This document does not authorize production cutover.

## 1. Intended experience

The HLL section should feel like opening a military game's community menu: a calm cinematic scene, an open left navigation, tall condensed headings, flat translucent surfaces, thin dividers and a restrained khaki highlight. Its purpose is immediately clear: Valkyria's HLL community, people, news, fixtures/results, servers and guides. The clan's battle footage fills the entire viewport behind the interface, rather than occupying the soldier's central presentation area. Visitors must be able to read, navigate and join the community without waiting for video or authentication.

Keep Valkyria's existing crest and shared identity prominent. The HLL game title is the division label; it does not replace the clan brand. Give HLL and Wardogs separate theme/media configuration over shared accessible primitives. HLL uses cool gray, smoke, off-white and khaki; the Wardogs presentation retains its own approved treatment. Do not apply an existing Wardogs-specific visual instruction globally to the new HLL section.

Adapt the reference vocabulary to web behavior. Do not reproduce game inventory, ranks, account XP, fake resources, faction affiliation, spawn buttons, decorative server queues or invented members. No random counters, fake live activity, game-client cursor, menu sound or autoplay audio. Editorial images and game assets require recorded provenance; screenshots are design references, not permission to extract textures, fonts or individual UI graphics. Do not trace player names or scores from the references into production data.

## 2. Reference map

All supplied originals are 1920 × 1200. Their final repository location is `docs/design/references/hll/`, retaining the original filenames below. The delivery manifest is authoritative for copied paths and hashes. It does not depend on the owner's local Steam directory.

| Ref | Original filename | Read this aspect | Website application |
|---|---|---|---|
| 01 | `20260920205625_1.jpg` | Two team tables, centered score, group totals and restrained separators | Completed match summary and optional approved statistics |
| 02 | `20260928153014_1.jpg` | Open left menu, upper-left identity, large central stage and quiet bottom utilities | HLL landing navigation; clan battle footage becomes a fullscreen background |
| 03 | `20260928153017_1.jpg` | Grouped list on the left, central identity, contextual information on the right | Member/team list and profile; no copied progression system |
| 04 | `20260928153022_1.jpg` | Large image cards with bottom labels and dark gradients | Recruitment, training categories and featured editorial collections |
| 05 | `20260928153028_1.jpg` | Three-part deployment composition and unavailable-action state | Match briefing with event facts, approved map/cover and participation information |
| 06 | `20260928153031_1.jpg` | Khaki selected row, role grouping, compact contextual panel | Role/category filtering and selected member states |
| 07 | `20260928153035_1.jpg` | Selected list item linked to a central context pane | Selected fixture/briefing state; no public tactical coordinates |
| 08 | `20260928153038_1.jpg` | Gameplay visual tone and environmental detail | Footage direction only; the image is not the missing video |
| 09 | `20260928153041_1.jpg` | Map detail, legend and readable spatial frame | Optional published guide/map illustration with textual equivalent |
| 10 | `20260928153050_1.jpg` | Search rail plus image-led 3-column manual grid | Guides and searchable knowledge content |
| 11 | `20260928153107_1.jpg` | Clear settings categories, aligned labels and value controls | Website preferences and disciplined admin forms |
| 12 | `20260928153234_1.jpg` | Server list without a selection; generous contextual area | Honest unselected server state |
| 13 | `20260928153237_1.jpg` | List/detail server layout, selected row and contextual CTA | Server overview/detail with observed data and freshness |

Observed anchors in ref 02: the left content begins approximately 80 px from the edge, branding begins around 120 px from the top, the menu occupies the lower-left area around y=630–930, and utility text sits around y=1020–1060. Ref 10 uses a roughly 370 px search rail, a 60 px gap and three image columns. Ref 13 gives approximately 58% of the working width to the list and 42% to details. These explain composition, not fixed positioning requirements for every device. The web adaptation must reflow at short heights and under text zoom.

## 3. Visual tokens and typography

Use scoped CSS variables and existing CSS-module/component conventions. Introduce an `hll` theme boundary, not a duplicate global stylesheet. The following estimates are a starting palette; confirm actual foreground/background contrast after compositing over the brightest approved video frame.

| Suggested token | Initial value | Use |
|---|---|---|
| `--hll-bg` | `#171A1F` | Page fallback and underlay |
| `--hll-panel` | `#25282D` | Opaque reading/admin surface |
| `--hll-panel-overlay` | `rgba(20, 23, 27, .88)` | Tables and short labels over scenery |
| `--hll-panel-hover` | `#363A40` | Hover row or secondary action |
| `--hll-text` | `#F0EFEA` | Main text |
| `--hll-text-muted` | `#C1C3C5` | Secondary text; never reduce required copy to near-invisible gray |
| `--hll-accent` | `#C5B967` | Selected link, focus accent, result emphasis |
| `--hll-accent-fill` | `#B7AA5C` | Filled primary/selected surface with dark text |
| `--hll-on-accent` | `#171A1F` | Text on khaki fill |
| `--hll-divider` | `#62666C` | Decorative rules; strengthen control borders where needed |
| `--hll-focus` | `#F1DE8C` | 2 px focus ring with 3 px offset |
| `--hll-success` / `--hll-warning` / `--hll-danger` | `#9FC9AA` / `#E1CC84` / `#F1A0A0` | Status text plus icon/word, never color alone |
| `--hll-radius` | `2px` | Mostly square panels and buttons |
| `--hll-space-*` | `4, 8, 12, 16, 24, 32, 48, 64px` | Common spacing scale |

Typography is a web-font choice, not identification of the game's proprietary font. The existing repository already supplies self-hosted OFL Barlow and Barlow Condensed: reuse Barlow Condensed for large headings and Barlow for body/UI text. Verify the bundled files cover Czech/Latin-extended glyphs and retain their license. No additional font is needed for the first implementation. If measured legibility later justifies a replacement, Roboto Condensed and Source Sans 3 are possible alternatives subject to a separate glyph/license/weight review. Keep a system sans-serif fallback and at most one heading family plus one body family. Do not fetch fonts from third-party services on each page view.

- Page title: condensed bold, 56/60 px at wide desktop, 40/44 px at tablet, 32/36 px at mobile. Uppercase through styling only where appropriate; keep the underlying localized text readable to assistive technology.
- Masthead (landing and content pages alike), owner decision 2026-09-29: the Wardogs top strip with the same classes, height, crest, control positions, sizes and breakpoints, in HLL colours, so nothing in it moves when switching games. After the crest, a 22–28 px title and a 13 px `Hell Let Loose` division label fit the strip; phones show the crest only, as Wardogs does. The crest is the Wardogs strip mark, a sharp original with its aspect ratio intact.
- Menu: 22/28 px desktop and 18/24 px compact; 0.025–0.045 em tracking. Body: 17/27 px; small metadata: 14/20 px minimum. Dense desktop table cells may use 14/20 px, with controls still at least 44 px high.
- Long-form article width: 65–72 characters; headings retain the condensed voice, paragraphs use the body family. Use tabular numerals for scores/times.
- Prove Czech glyphs with `Příští zápas`, `Členové`, `Příručka`, `Změnit hru`, `Žluťoučký kůň úpěl ďábelské ódy`. Never substitute a separate font only for accented letters without inspecting the result.

## 4. Shared frame, route and navigation contract

Target canonical origin is `https://valkyria.cz` after a separately approved cutover. The routes below are target UI routes, not claims about deployed endpoints. Reconcile exact guide/server/community slugs with the website route inventory before coding; keep English path segments and CS/EN labels.

| Target route | Czech label | English label | Primary layout |
|---|---|---|---|
| `/{locale}` | Komunita Valkyria | Valkyria community | Shared hub with two game choices |
| `/{locale}/hll` | Hlavní menu | Main menu | Open menu over a fullscreen cinematic scene |
| `/{locale}/hll/news` and `/news/{slug}` | Novinky | News | Editorial list and readable article |
| `/{locale}/hll/clan` | O klanu | Clan | History, identity and recruitment |
| `/{locale}/hll/members` and `/members/{slug}` | Členové | Members | Search/group list and approved profile |
| `/{locale}/hll/matches` and `/matches/{slug}` | Zápasy | Matches | Fixtures/results list and briefing |
| `/{locale}/hll/servers` | Servery | Servers | Observed server list/detail |
| `/{locale}/hll/field-manual` and `/{locale}/hll/field-manual/{slug}` | Příručka | Field manual | Search, category cards and article |
| `/{locale}/hll/community` | Přidej se | Join us | Recruitment and verified Discord/Logi links |
| `/{locale}/account`, `/{locale}/admin/...` | Účet, Administrace | Account, Administration | Shared neutral frame with explicit scope |

Owner decision (2026-09-29): the hub `/{locale}` uses the owner-supplied community cover as its full-viewport background (Hell Let Loose soldier left, Wardogs operator right, dark centre; [asset record](../assets/policy.md)). The heading sits centred in the dark gap from 768 px up; the game cards' top panels are windows onto their own game's half; the scene's ghosted crest is not repeated there. Shared pages keep the drawn landscape.

The landing menu order is News, Matches, Servers, Members, Field manual, Clan, Join us. News stays a primary destination, not a small footer icon. Account/sign-in, preferences, game and language controls are utilities. On content pages retain a clear `Main menu` link and compact access to the same destinations; use an accessible navigation drawer when they do not fit.

Persistent shared masthead: Valkyria identity and community link on the left; active game, language and account on the right. At 1920 px the proposed safe horizontal inset is 80 px; use `clamp(20px, 4.2vw, 80px)`, maximum working width 1760 px. Shared controls occupy a minimum 64 px high row. Use a full game-name control (`Hell Let Loose` / `Wardogs`); avoid an unexplained icon or an unlabeled abbreviation.

Game switching preserves locale and a meaningful page category. From an HLL match detail with no mapped Wardogs counterpart, switch to the Wardogs matches list and briefly explain the destination; do not fabricate a same-slug counterpart. Language switching preserves the entity only when the other translation is published. Otherwise use the localized relevant list with a notice and a safe link to the published source-language article. Keep `Čeština / CS` with Czech flag and `English / EN` with UK flag; flags are supplemental to text.

URL state is authoritative. `/` deterministically redirects to `/cs`; no language guessing may override a deep link. Back/forward and refresh must preserve selected filters/details where represented in the URL. Sign-in remains the single website session across both game sections. Do not put separate HLL/Wardogs logins in the visual design. An unavailable integration shows an honest unavailable state and working public navigation, not a login loop.

## 5. HLL landing composition

At 1920 × 1200, place a 340 px wide menu lane at x=80. Owner decisions (2026-09-28, 2026-09-29): the landing uses the same top strip as HLL content pages and Wardogs (see §3), so logo, game switch, language and account sit exactly where Wardogs has them; the reference's y=80–180 identity band is not used. The menu may begin around y=380–440 to preserve the open composition while fitting seven 48 px links, a clear Discord CTA and utilities. The poster and video plane are fixed to all four viewport edges, behind the complete interface. Use `object-fit: cover` with a reviewed focal point. There is no central aspect-ratio card, masked edge, reserved empty media panel or missing-footage label. Keep important scenery away from the left navigation; a strong left readability gradient and quieter bottom veil protect foreground text.

The background is the visual focus; do not cover its center with KPI tiles. One compact editorial strip in the lower right may show the next published fixture and latest published news, each with a real link. Omit a teaser when no record exists. The primary CTA is `Připojit se na Discord / Join Discord`, with verified destination. `Přihlášení / Sign in` remains separate from recruitment. Playback controls live in the utility footer outside the decorative media layer.

Use plain text navigation at rest. Hover adds a subdued surface and short khaki marker; active destination adds a persistent marker and `aria-current="page"`. A focused item has a visible external ring independent of selection. A 2–4 px marker may move at most 4 px on entry; no layout shift or continuous pulsing. The lower utility row offers motion preference, privacy, credits/asset attribution and links relevant to the shared platform. Do not add `Quit`, game purchase actions or a fake game version.

At desktop heights below 850 px, reduce vertical gaps and start the menu directly below identity. At any height where it will not fit, let the document scroll. Never scale the whole interface down, clip bottom actions, or require browser fullscreen. On narrow screens the scene still fills the viewport: identity, visible navigation, news/fixture strip and footer remain in normal document flow above it. No fixed interactive overlay may hide links behind mobile browser chrome.

## 6. Content-page composition

For content pages, pause the decorative video and use its stable poster with a dim overlay; a single softly blurred background plane is sufficient. Tables, forms and article text get stable, nearly opaque surfaces. Opening a content page must not initiate another video download. The selected clip stays assigned for returning to the landing page.

Use title + optional subtitle, then a secondary tab/filter row separated by thin rules. Primary content starts 24–32 px below filters. Avoid large empty decorative panels when real content needs space. A back link is a real route to its logical parent; browser Back remains normal. Detail pages are routable content, not mandatory modal windows.

### News and article pages

Use a featured lead article with a 16:9 image and 2–3 supporting cards, then a chronological list. On desktop, 3 card columns; tablet 2; mobile 1. Cards use square edges, 16 px padding and an image-bottom gradient only behind short titles. Display title, date, category and a two-line excerpt; keep the full title available on the detail page and never encode essential text inside the image. No mandatory cover: a restrained labeled text card is valid.

Article detail has a clear HLL context, title, publication/update dates, cover caption/credit, readable body and related links. Show `Updated` only when backed by a relevant published revision. Public articles receive neither editor JavaScript nor drafts, private integration data or unpublished translated content. Keep shared/community article canonical ownership from the platform decision: linking it from HLL does not require duplicating its body or URL.

### Matches, results and briefing

Use local navigation `Nadcházející / Upcoming`, `Výsledky / Results`, and optional calendar view over the same collection. Filters for type, date and competition use real available values. Desktop rows show date/time, opponent, map/mode, lifecycle and result; mobile uses stacked rows with the same meaning. A pending fixture displays `Výsledek není k dispozici / Result unavailable`, never `0–0` as a placeholder.

Match detail borrows the deployment composition: 280–320 px facts/sections rail; flexible 16:9 approved map/cover and briefing; 300–360 px participation/source panel. Stack these as heading/result, facts, action, briefing and optional statistics on mobile. Show schedule in the current locale with `Europe/Prague` timezone and an explicit CET/CEST or localized timezone label. Store/interpret the source instant; do not treat schedule strings as browser-local times. Include daylight-saving boundary evidence.

Completed results borrow ref 01: prominent teams and confirmed score, short status text, map/round summary, then optional statistics. Distinguish provisional, confirmed, corrected and withdrawn states. A score seen in footage or a CRCON snapshot is not automatically a confirmed clan result. Corrections carry published update time/source; retractions remove outdated promotional summaries while keeping an honest state explanation.

Render an actual semantic statistics table only when the approved source supplies those fields. Column headers spell out meaning; an icon is supplementary. Preserve missing values as an em dash with accessible `Not available`. Do not invent win rate, K/D, attendance or team assignment. Wide tables may scroll within a labeled region; core match facts remain visible without horizontal scrolling. No public tactics, private roster availability, raw platform IDs or admin chat.

Participation controls point to the verified Logi workflow initially, labeled `Přihlášení v Logi / Sign up in Logi`. Any later embedded signup must use the agreed canonical contract, showing eligibility, capacity, waiting list, close time, pending and unknown outcome distinctly. This spec does not create a second roster engine. No successful-signup state without canonical acknowledgement; unknown outcome offers refresh/check status rather than blind resubmission.

### Servers

Adapt refs 12–13 as a desktop 58:42 list/detail split with a 24 px gap. List rows are at least 64 px high and show approved name, map thumbnail or neutral fallback, population when known, mode and freshness. Use explicit row links/buttons and a selected state; do not make nonsemantic divs into a simulated game grid. On desktop, selection updates `?server=<public-id>` and the detail panel without moving keyboard focus; a `View details` link supports narrow screens and direct linking.

The unselected detail panel says `Vyberte server / Select a server`. This differs from no configured servers, no filter matches, loading and a source failure. The selected panel shows name, map, observed population, last observation and permitted connection action. Display current score, queue or timer only if the provider actually returns them with usable freshness. Never present collector-to-server latency as the visitor's own ping. If latency is available, label its measurement origin; otherwise omit it.

Use `Aktuální / Current`, `Neaktuální / Stale`, `Neznámý / Unknown` with source/observation time. A timeout does not mean offline, empty, or full. Reserve offline for a source that can establish it. Once data expires, stop any extrapolated countdown and label the last observation. Refresh cannot create overlapping polls or an endless spinner; retain prior data with a stale label and bounded retry. Auto-refresh should not reorder a focused row or announce every poll to screen readers.

Use `Připojit / Connect` only for a verified supported game/platform launch path. Otherwise offer explicit connection instructions and copy a safe public address when approved; copy reports completion and never includes a password. No fake join queue, VIP reservation, rentable-server link or broad server discovery. The initial list is the configured, authorized Valkyria server set. On mobile, use list-to-detail navigation with a visible back link and preserved list/filter position.

### Members and clan

Use ref 03's grouped list/detail vocabulary for approved teams and people. Left: search and actual groups; center: selected member's consented avatar/crest, display name, public bio and HLL affiliation; right: explicitly published community responsibilities or related content. Do not map game-class levels to invented member seniority. A member who appears in both divisions remains one identity with scoped affiliations.

Search uses public display names only. Private/nonconsenting members are absent from count, results and related projections; never show a hidden member as an anonymous empty card. Profiles can function without photos or statistics. Long names wrap; meaningful role names remain readable. Use a calm empty state when no profiles are approved. Clan content covers verified history, values and recruitment with editorial image/text sections, not invented numerical achievements.

### Field manual and training

Adapt ref 10: 280–320 px search/category rail, 32 px gap and 3-column image-card grid at wide widths. Rail becomes an ordinary search/filter section above a 2-column tablet or 1-column mobile grid. Provide real labels for search and categories. Categories should come from published content; initial editorial possibilities include Getting started, Communication, Infantry roles, Armor, Maps and Clan procedures. Do not render empty categories merely to match the reference's nine cards.

Search states are initial browse, searching, results, no results, error. An empty search starts with categories/latest guides, not `No search results`. Show query, result count and clear-filter action; debounce remote search around 250 ms and cancel obsolete requests. Prefer URL query state for shareable searches. An article can have a table of contents, textual steps, captioned diagrams and source/update date. Public map illustrations need a descriptive text/legend; keep operational stratmaps and spawn locations in the authorized Logi context. Do not build an interactive tactical-map editor as part of this visual slice.

Recruitment/training collections may use ref 04's large portrait cards, but contain real community/training categories with approved imagery. At most four at wide widths, two at tablet, one at mobile; title outside the image remains available. No inaccessible click-only carousel.

## 7. Shared administration and preferences

Administration remains at `/{locale}/admin/...` in one neutral Valkyria frame, with HLL/Wardogs/community scope visibly next to the page title and publication target. Reuse the existing rich-text CMS, media library, translations, drafts, autosave/revisions, preview, scheduling and publish/unpublish workflow. Inspect actual current code and route names before extending it; a settings-like visual treatment is not a replacement editor implementation.

- Editorial rows show title, locale, game/audience, draft/published/scheduled state, author/update time and permitted actions. Filters do not grant access. Keep the current publication visible while a newer draft is edited.
- Editor: readable toolbar/body center and 280–320 px publication sidebar for locale, game/audience, taxonomy, cover, alt/caption/credit, schedule and preview. Below 1024 px the sidebar follows the editor, with a compact sticky save-status/action bar that never covers the focused field. Use explicit autosave status and recoverable error text, and guard navigation with unsaved changes.
- Preview shows exact locale/game context and a clear draft banner; share previews only through the existing authorized mechanism. Publishing to another game is a scoped action, not a cosmetic theme switch. Source-controlled Logi operational fields appear read-only with source/freshness and an `Open in Logi` link rather than a competing edit form.
- Media selection requires approved game/audience and provenance. Include real cover/focal-point preview at desktop and mobile crops. A missing file, rejected format or stale revision has a concrete field-level error. Never preview a private file via a public asset URL.
- Preferences borrow ref 11's aligned rows for language shortcut, motion/video preference and accessibility-related display choices. Use native labeled switches/selects/buttons rather than left/right arrows as the only control. Store a local motion preference defensively; unavailable browser storage must not break navigation. A global motion preference applies consistently across both games.
- HLL background configuration manages a reviewed clip set: stable ID, poster, rendition URLs/MIME, dimensions/duration/bytes, focal point, enabled status, provenance and rights record. Configuration must distinguish valid available media from unverified/dead URLs. No credentials in URLs. No upload/feature activation claim until implemented and tested.

All admin validation, confirmation, denied, integration-disabled and session-expired states are Czech/English. Show access loss without exposing stale privileged content or discarding an unsaved draft silently. Server-side enforcement remains authoritative.

## 8. Component contracts and interaction states

The names below describe responsibilities; reuse an equivalent existing component rather than creating duplicate primitives.

| Component | Inputs / states | Required behavior |
|---|---|---|
| `GameShell` | locale, active game, section, content/landing/admin mode | Persistent game/language controls; one navigation landmark; theme scoped to game |
| `MenuLink` | label, href, current, optional external indicator | Link semantics, visible focus/current, 44 px target, no hover-only description |
| `SectionNavigation` | routes or local panels, active ID | Route navigation uses links; true local tabs use tablist/tabpanel semantics and arrow keys |
| `CinematicStage` | validated clip set, poster, media policy, current selected ID | Stable selection lifecycle, policy-gated source attachment, external pause/play control |
| `ContentCard` | title, href, image/alt/credit, category/date, excerpt | One unambiguous primary link; safe image fallback; text remains meaningful without image |
| `RecordTable` / `RecordList` | typed public rows, sort/filter/page, selection | Real table or list, labeled sorting, stable keys/focus, empty/error separate from no matches |
| `ServerDetail` | snapshot, source, observedAt, freshness, connection capability | No assumed zeros/latency/queue; real safe connect/copy behavior |
| `MatchSummary` | lifecycle, result state, source, localized schedule, optional rounds | Unknown/provisional/confirmed/corrected/withdrawn rendered distinctly |
| `DataNotice` | loading/empty/stale/unknown/error/denied, retry capability | Human-readable next step; one polite announcement on meaningful state change |
| `ConfirmDialog` | action/target, consequence, pending/unknown/error | Focus trap/restore; safe initial focus; Escape before dispatch; no duplicate mutation |

For ordinary controls specify rest, hover, focus-visible, pressed/current, disabled and pending. Disabled controls have a nearby explanation when the action would otherwise be expected. Pending actions preserve labels and dimensions, disable duplicate dispatch and expose `aria-busy`. Unknown mutation outcome is not failure or success; prompt checking authoritative status. Loading placeholders reserve media/table dimensions and do not fabricate numbers.

Card titles may wrap to three lines in grids; detail titles remain complete. Display names wrap to two lines before offering the full text through an accessible detail link. Server names may be long/untrusted: escape markup, preserve layout, and show full text in details. Never rely on hover tooltips for essential content. Allow descriptive article text to expand naturally.

## 9. Video selection and playback lifecycle

**No HLL clan video has been supplied yet.** Keep the configured clip set empty until real recordings arrive; do not substitute Wardogs video, tutorial footage, an animated screenshot or a generated soldier. The default fullscreen poster is `/images/hll/scene-poster.webp`, with provenance in the asset manifest; the CSS underlay and subtle clan crest remain fallback layers. Owner decision (2026-09-29): the landing's ghosted crest is the Wardogs landing emblem, with the same size, position, colour and opacity above the scene veil, and it is hidden on content pages. Do not show a production placeholder announcing missing footage. The final footage asset acceptance remains open until real media is supplied and inspected.

The owner wants multiple clips later, randomly selected on a fresh opening and stable while browsing. Use the following precise contract:

1. Server rendering produces deterministic HTML, accessible navigation and a stable default poster/underlay covering the viewport without affecting content geometry. Do not call random selection in SSR and hydrate with a different selection. Do not use a random server response that defeats page caching solely for decorative media.
2. A browser-lifetime provider, mounted above locale/game route transitions where feasible, chooses one valid enabled HLL clip once after hydration on the first HLL entry. If the set is empty, remain on the poster. If there is one clip, choose it. If there are several, equal probability is sufficient; a fresh opening may legitimately choose the same one again.
3. A fresh full document load/reload is a new selection opportunity. Client-side links, filters, language changes, history traversal, preference dialogs, re-renders, game switches away/back and BFCache restore retain the chosen HLL ID. Do not store the chosen ID persistently in localStorage/sessionStorage if that would prevent fresh-load selection. Store playback preference separately. Preserve selection even when policy prevents playback.
4. Attach a video source only after evaluating motion/data policy. Use muted, inline playback and one video element; background audio is never enabled. Resolve the play promise. The poster stays until a decoded frame is ready; failed autoplay leaves a usable static page with an explicit play affordance where appropriate.
5. Keep the selection for the browser lifetime. Mount media in the persistent HLL shell: HLL content routes retain the same element/time, pause it and expose the dimmed poster. A direct content-page load must not attach a video source. Returning to the HLL landing resumes playback only if the shared motion policy allows it. If a game/locale transition unmounts the decoder, preserve the chosen clip and saved position without rerolling. Do not run both games' decoders concurrently. Pause when not on the landing, document hidden or user-paused.
6. `prefers-reduced-motion: reduce`, available `Save-Data`/`navigator.connection.saveData`, or a user's video-off preference defaults to poster-only with **no video source/preload requests**. Mobile/coarse-pointer layouts default to poster-only and an explicit play control. An intentional local play action can allow the selected clip for that visit, but never silently overrides a later user stop or newly enabled reduced-motion preference. React to preference changes; absence of the Save-Data API is not proof of a fast connection.
7. On the landing, pause/play is an ordinary focusable text/icon button in the utility footer with localized accessible name and current state; keep it outside decorative `aria-hidden` media. Content-page controls are disabled and explicitly describe the still-image state; they cannot override the reading-page pause rule. With no configured clip, omit playback controls. A decorative background video is not a screen-reader content item. If the same footage later becomes an editorial player with meaningful sound/information, provide conventional controls and appropriate captions/transcript in that separate context.
8. On network/decode failure try at most one compatible alternate rendition of the **same** clip if policy allows. Otherwise hold the poster, show a restrained playback-unavailable hint next to the control and keep navigation working. No endless retry or random cycling through the entire library. A removed/invalid selected ID falls back to a poster for the visit rather than continual reselection.
9. Loop the same selected clip if continuous decorative playback is enabled. Do not shuffle at each loop. Preserve the full owner-supplied duration unless the owner approves an edit; do not silently trim a long clip to meet an arbitrary duration target. A content review can request a separate loop edit explicitly.

Each clip needs stable ID, poster, approved rendition list, MIME, dimensions, duration, bytes, focal point, source/rights record and enabled state. Select a compact rendition once for narrow playback and a desktop rendition once for wide playback; avoid redownloading a new rendition on every resize. Use standard browser-compatible encodings confirmed by actual playback. Reuse the repository's media delivery policy: do not place large MP4/WebM/AVI sources in Git. Cloud preview assets and eventual production delivery are separate operations; local file paths are not browser URLs.

Use `object-fit: cover` only with an approved focal point for scenery; footage with meaningful edge content requires another approved rendition/crop or a separate editorial player. No logo, subtitle or score may be cropped inadvertently. Apply a left readability gradient behind the menu and a mild overall veil, preserving scenery across the viewport. Do not blur/filter the moving video continuously on low-end devices; dim the static content-page poster separately.

## 10. Responsive, accessibility and motion requirements

| CSS viewport width | Composition |
|---|---|
| 1440 px and wider | Open menu over fullscreen scene; 3-column manual/news; full list/detail where useful |
| 1024–1439 px | Narrower menu and title; 2-column cards; simplify optional contextual panels before compressing body text |
| 768–1023 px | Stacked foreground content over fullscreen scene; compact shared controls; filters above lists; optional detail panels become routable sections |
| Below 768 px | One column; 20 px gutters (16 px at 360–390 widths if needed); visible menu or labeled drawer; poster-first video |

Breakpoints describe behavior, not device detection. At 320 CSS px and 200% text zoom, controls and paragraphs reflow without page-wide horizontal overflow. At 400% zoom on a wide desktop, use the compact layout. Permit bounded horizontal scrolling for genuinely two-dimensional statistics/maps, with a text alternative and labeled region. Respect safe-area insets; use dynamic viewport units only where supported and never fixed-height clipping of content.

Keyboard order follows reading order: skip link, shared identity/game/language/account, section navigation, title and controls, content, utilities. Use native links/buttons/form controls. Tab/Shift+Tab moves through actions; Enter follows links; Space activates buttons. Escape closes a drawer/dialog and restores its opener, but does not hijack ordinary browser history or dismiss an already-sent mutation. Do not globally capture game shortcuts such as WASD, M or F. If a true local tablist is used, implement arrows/Home/End; ordinary navigation links keep normal browser behavior.

Set the page language, descriptive titles, one primary heading and meaningful landmarks. On route navigation, expose the new title and move focus to the main heading when appropriate without stealing focus during polling/filter typing. Tables need captions/header associations and `aria-sort` on active sorting headers. Decorative icons/images have empty alternatives; meaningful images have authored localized alt text. Aim for 4.5:1 normal text and 3:1 large text/control contrast; test the composite, not merely the token pair. Focus is never conveyed by color alone. Touch targets are at least 44 × 44 CSS px with separation.

Proposed animation timings are web targets; still screenshots cannot establish the game's actual animation curves:

| Interaction | Target motion |
|---|---|
| Link/row hover and selection | 120 ms color/background transition; no resize |
| Drawer/dialog | 160–180 ms opacity and at most 8 px translate; preserve focus |
| New content pane | 140–180 ms opacity; no blocking route splash |
| Poster to decoded video | 180–240 ms opacity; prevent flash of black |
| Reduced motion | Immediate state changes; no translate, fade sequence, particles or video autoplay |

No continuous decorative particles, weapon flashes, parallax or camera movement beyond the supplied footage. Media review must check flashing sequences; CSS dimming is not a substitute for selecting safe footage. Preserve playback pause across route changes. For data updates use a quiet last-updated text change, not a flashing score.

## 11. Performance and missing-content policy

Proposed acceptance targets: LCP ≤2.5 s, INP ≤200 ms and CLS ≤0.1 under the agreed representative test profile; record the actual environment and measurements. They are targets, not current results. Reserve all media dimensions, render text/menu without video and keep public article bundles separate from the rich editor. Reuse the application's existing budget tooling and report any intentional exception rather than inventing passing commands.

Target a responsive hero poster ≤250 KB desktop / ≤150 KB compact and no mandatory video bytes before policy allows. Use a single chosen rendition; never preload every clip. Start video after useful content/interaction is ready so the poster/menu wins resource priority. For footage planning, propose roughly 2–4 Mbit/s desktop and 0.8–1.5 Mbit/s compact as initial encoding budgets, then inspect quality and publish actual bytes/duration. A long full-length clip is an explicit streaming transfer, not part of the initial page-weight budget. If its size is impractical, offer an approved encoding/edit decision; do not silently shorten the source.

Use immutable versioned URLs for approved media, correct MIME and byte-range support. Keep a poster available without authentication when the corresponding public media is approved. No upstream API failure may block the site shell or produce a blank page. Empty editorial/member data, disabled Logi, missing final footage and unavailable server telemetry each have distinct useful states. Development fixtures must be labeled synthetic and cannot ship as real community history.

## 12. Implementation order and proof

1. Inspect current `www` source and open work. Establish the shared route/theme/media-provider boundaries without changing the working Wardogs presentation. Resolve the new HLL direction against stale `visual undecided` text; keep platform/auth/data contracts authoritative.
2. Build the accessible HLL landing with stable poster fallback, game/language switching and real links. Develop one list/detail screen and one manual/news screen using representative **synthetic** records, including long Czech text and missing data. Review the resulting composition before replicating it across pages.
3. Wire published CMS and agreed adapter DTOs, including freshness and privacy states. Reuse shared editor/admin behavior; implement no duplicate Logi operations. Confirm direct URLs, browser history, current section, translation fallback and game switching.
4. Finish video lifecycle tests with explicitly labeled test media; keep actual HLL footage acceptance separate. Once supplied, validate every real rendition and chosen focal point, full duration/loop boundary, playback policy and cloud-delivery URLs.
5. Capture and inspect evidence from the real implementation. Include exact source revision/dirty state, environment, route, locale, viewport, browser, data provenance, tested behavior and limitation in each caption. Publish reviewable evidence in the PR and related issue before claiming acceptance; do not present this handoff or static mockups as implemented proof.

Required visual proof set:

- HLL landing: 1920×1200 to compare composition with ref 02, a short 1366×768 viewport, 390×844 mobile and 320 px reflow. Include CS and EN and the actual Czech font glyphs.
- Main menu focus, open mobile navigation, game switch and language switch. Verify game navigation preserves the one website session while resource permissions remain scoped. Preserve a Wardogs baseline screenshot and functional regression evidence.
- News list/detail, members list/profile, manual browse/search/no-result, match scheduled/confirmed/unknown/corrected, server unselected/selected/stale/unavailable. Screenshots can use labeled synthetic data until integrations are real; backend privacy behavior needs separate tests.
- Admin HLL scope, rich editor, cover/media preview, unsaved-navigation guard, published-vs-draft translations, denied wrong-game scope, save failure and Logi-disabled/read-only source states.
- Video poster-only, paused and playing states; include blocked-autoplay and failed-rendition behavior. Screenshots prove appearance only. Network assertions must prove zero video requests under reduced motion/data saving/mobile default, one selected clip per document, no reroll across internal navigation/locales/history, no parallel Wardogs/HLL decoders, and fresh-load selection within the enabled set. A fresh load is not required to choose a different clip.

For deterministic visual comparisons, select an approved fixed test clip/frame through the test harness and label that setup; production behavior remains random-on-fresh-open. Exercise random selection separately with controlled tests. Verify visible text contrast over the brightest selected footage frame, keyboard traversal, zoom, screen-reader names, restored focus and source failure handling. Final-media browser proof must use the actual delivered files and report their manifest hashes; mocked playback cannot close that gate.

**Ready-for-review outcome:** the unified site exposes a coherent HLL menu and complete content journeys, retains the shared CMS/session and working Wardogs section, is usable without motion or live integrations, and records any missing footage/hosted-Logi acceptance explicitly. No production deployment, confirmed server statistics or supplied HLL video is implied by this document.
