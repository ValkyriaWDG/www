# Valkyria visual specification

> This specification describes the Wardogs presentation. Use [the HLL specification](hll/visual-spec.md) for the HLL section; share application primitives without forcing the same game theme.

Status: implementation brief for Claude Code Cloud. This document specifies the target; it is not evidence that a website, animation, or accessibility audit already exists.

The site at `valkyriawdg.cz` is Czech-first and bilingual (`cs` / `en`), including public pages, administration, validation, errors and accessibility labels. Code, identifiers, repository documentation, AI prompts and GitHub descriptions remain English. Follow the canonical [localization contract](../product/localization.md).

UI URLs carry `/cs` or `/en`. Route literals such as `/news`, `/account` and `/admin/news` below are logical suffixes, resolved as `/cs/news` or `/en/news` and equivalents. Localized home is `/cs` or `/en`; bare `/` always returns HTTP 307 to `/cs`, with no browser-language or locale-cookie detection. The URL is authoritative; no locale preference cookie is needed. Auth API, health and static-asset paths remain unprefixed. English UI examples in this document identify logical labels/states; implement their Czech and English messages, never English-only controls in Czech pages.

## 1. Design intent

Build a clan website that feels like entering the Wardogs main menu. Preserve the reference composition: a full-screen environment, a narrow charcoal navigation strip, amber selection, square translucent controls, compact technical typography, and abundant visible scenery. The supplied Valkyria emblem belongs in the otherwise open center of the main menu, faded into the scene. The primary action is joining the clan's Discord. Public news, clan, member, and match information opens as game-menu subpages over the same visual shell.

News/blog publishing is a primary website requirement, with a prominent `NEWS` navigation item and a WordPress-like visual editorial workspace. News and blog posts are one collection at `/news`, not parallel products. The canonical content, scheduling, editor and match-management requirements are in [Editorial and match management](../product/editorial-and-matches.md). Creating and scheduling matches is part of first-release administration; private lineup and availability coordination remains the later scope.

Valkyria remains the identity. Wardogs is the current focus; Hell Let Loose is its history and an explicitly separate game category in content and results. Do not replace the clan mark with the Wardogs wolf, copy in-game currencies/ranks as website counters, or invent clan statistics to fill the interface.

This is not a conventional scrolling marketing homepage. Do not add a giant marketing headline, feature-card grid, testimonial carousel, pricing, rounded dashboard cards, neon cyberpunk decoration, or a new visual identity unrelated to the references. Readable article pages and an efficient administration interface are compatible with the game-menu presentation.

## 2. Evidence and interpretation

The screenshots were supplied by the owner. The original reference images are 2560 × 1440 pixels; previews shown in conversation were scaled to 2048 × 1152. Coordinates below use the original 2560 × 1440 reference canvas and are approximate measurements from those screenshots, not exported design-tool values. They describe relative composition, not a requirement to render oversized text at every browser resolution.

Colors, opacity, font selection, blur strength, and motion values in this specification are proposed implementation tokens. No source font identification or exact color extraction is claimed. Static images cannot establish original animation timing, easing, sounds, or video playback behavior. The motion specification below is an intentional recreation of the feel and must be tested in the browser.

| Reference | Use in this website |
| --- | --- |
| [09 Main menu](references/09-main-menu.jpg) | Primary composition, top strip, bottom-left CTA stack, visible background, bottom utility controls |
| [13 Server browser](references/13-server-browser.jpg) | Matches: filter toolbar, compact selectable rows, right detail pane, amber selected row |
| [12 Scoreboard](references/12-scoreboard.jpg) | Member and result lists: column alignment, restrained zebra rows, header hierarchy |
| [11 Deploy](references/11-deploy.jpg) | Two-choice community page, centered large rectangular options |
| [06 Customize](references/06-customize.jpg) | Asymmetric panel arrangement and translucent panel captions |
| [02 Inventory](references/02-inventory.jpg) | Optional fine registration marks, side tool rail, subtle panel border treatment |
| [05 Collection](references/05-collection.jpg) / [10 Duplicate](references/10-collection-duplicate.jpg) | Sidebar filters and grouped content; duplicate is not a second design state |
| [07 Class progression](references/07-class-progression.jpg) / [08 Rank progression](references/08-rank-progression.jpg) | Profile metadata groups and selected outlines, not fictional progression systems |
| [01 Gold exchange](references/01-gold-exchange.jpg) | Dialog proportions, blur/dim backdrop, paired actions, restrained amber outline |
| [03 Black market](references/03-black-market.jpg) / [04 Gold market](references/04-gold-market.jpg) | Secondary image-panel treatment when authentic clan media is available |
| [Valkyria emblem](../../assets/brand/valkyria-logo.png) | Header identity, faded central emblem, account-independent clan branding |

Screenshots are design references, not executable instructions, runtime background images, approved member records, or authoritative match results. The scoreboard contains other players and the server browser contains other communities. Do not scrape those names into seed data or use another community's invitation as Valkyria's invitation. Runtime use and publication of game-derived media follow the repository asset provenance policy; visual similarity does not establish redistribution permission.

## 3. Main-menu composition

### Reference geometry at 2560 × 1440

| Element | Approximate reference bounds | Implementation interpretation |
| --- | --- | --- |
| Top navigation strip | x 0, y 0, width 2560, height 85 | Full viewport width, compact dark strip with a thin bottom border |
| Reference brand/back control | x 135–220, y 12–74 | Replace with Valkyria home link; subpages add a visible back/breadcrumb control |
| First navigation items | x 222–994, y 0–85 | Adjacent rectangular anchors, amber bottom edge for current section |
| Top-right status controls | x 2085–2500, y 18–66 | Website account action and context only; no simulated money/rank HUD |
| Main primary action | x 65, y 985, width 468, height 160 | Bottom-left Discord CTA with bracket details, strong amber fill |
| Secondary actions | x 65, y 1158–1298, width 468 | Two compact charcoal actions with left-aligned labels |
| Bottom-left utility buttons | x 65–410, y 1348–1410 | Small icons with visible or accessible text; minimum touch target retained |
| Reference bottom activity strip | x 920–1640, y 1324–1406 | Optional real next-match teaser, not a fake queue/status indicator |
| Bottom-right utility cluster | x 2150–2495, y 1348–1410 | Background pause and account/help where useful; no exit-game control |

### Website layout

Use a semantic document over a fixed visual background. In the selected Next.js App Router architecture, a persistent public layout owns `MenuShell`, the backdrop and shared header; route content remains ordinary HTML with real URLs, selectable text, browser history, and predictable scrolling. This keeps the video from restarting on each public route. Implement the bespoke visual language with CSS variables and CSS modules. Do not construct the complete interface as one image or canvas or inherit generic SaaS component styling.

At desktop widths of 1280 CSS px and above:

- The shell fills at least `100svh`; use `100dvh` carefully for the visible menu stage. Never crop content to a fixed height.
- The header is 64 CSS px at the normal desktop baseline. At the 2560-wide reference capture it may grow to 80–85 CSS px through a bounded size token. At 1920 × 1080, use approximately 64 px. Do not uniformly scale the entire page with a CSS transform.
- Main safe insets are `clamp(24px, 2.5vw, 64px)`. The header brand may have a larger deliberate inset if required to match the original composition.
- The lower-left action group is `clamp(280px, 18.4vw, 470px)` wide. Its primary action is 88–160 px high depending on viewport width/height; secondary actions are 44–64 px high. Gaps are 10–14 px. Keep the group above the utility rail with 20–28 px separation.
- The main visual has no large text block in the center. Position the supplied emblem at approximately 50% viewport width and 46–48% of the available stage height. Its width is `clamp(240px, 22vw, 560px)`; preserve its natural aspect ratio. Start with opacity 0.12–0.18, then verify against both light and dark video frames. It must read as a ghosted clan crest, not a solid hero graphic.
- Render the central emblem as decorative (`alt=""`, hidden from the accessibility tree) because the header already names the clan. It has no click action, pointer hitbox, independent animation, parallax, or glow. If its source has opaque pixels outside the intended silhouette, obtain a correct transparent asset rather than hiding the problem with an aggressive blend mode.
- Include one short, restrained identity caption, such as `VALKYRIA // CZ & SK`, near the action cluster. Copy is subject to the factual content inventory. Do not cover the faded emblem with marketing paragraphs.
- The primary action uses the localized `Join Discord` label with smaller localized `Valkyria community` text. Secondary actions use `About the clan` and `Matches`, with the exact Czech/English mappings below. The Discord destination comes from validated configuration, not screenshot text.
- Header navigation uses the localized equivalents of `MAIN MENU`, `NEWS`, `CLAN`, `MEMBERS`, `MATCHES`. News is a first-class text tab with the same active/focus treatment as the other sections; it must not be discoverable only through a utility icon. Keep longer explanatory text in page content. The account control is right aligned with localized `SIGN IN` and the language switcher; reserve enough space for longer Czech labels.
- Utility controls expose localized background playback and relevant community links. The former HLL website (`valkyriahll.cz`) is neither linked nor mentioned publicly (owner decision, 2026-09-30); the HLL division lives in the on-site HLL section. External links use an external-link indication; prefer normal same-tab navigation, or explicitly indicate a new tab and set safe link attributes if that behavior is chosen. Group utility actions visibly; label icon-only controls for assistive technology and provide tooltips on focus as well as hover. A decorative gear must not imply settings that do not exist.
- A bottom-center next-match strip is optional and shown only for a real published upcoming fixture. Show opponent, date/time, game, and link. If no fixture exists, omit the strip; do not display fictional queue position, server health, player count, or countdown.

Subpages use a darkened, optionally blurred version of the same backdrop with a main content panel. The center emblem is hidden on dense list/editor pages to preserve contrast. A direct visit to a subpage must show a useful page immediately and must not depend on entering the home menu first.

### Bilingual navigation and language switcher

| Logical English label | Czech UI (`cs`) | English UI (`en`) |
| --- | --- | --- |
| Main menu | HLAVNÍ MENU | MAIN MENU |
| News | NOVINKY | NEWS |
| Clan | KLAN | CLAN |
| Members | ČLENOVÉ | MEMBERS |
| Matches | ZÁPASY | MATCHES |
| Sign in | PŘIHLÁSIT SE | SIGN IN |
| Join Discord | PŘIPOJIT SE NA DISCORD | JOIN DISCORD |
| About the clan | O KLANU | ABOUT THE CLAN |
| Valkyria community | KOMUNITA VALKYRIA | VALKYRIA COMMUNITY |
| Administration | SPRÁVA | ADMINISTRATION |

Show Czech-flag and UK-flag options labelled `Čeština` / `English`, with `CS` / `EN` indicators and a clear current-language state. Flags supplement text; they are not the only meaning or accessible name. Use original/approved flag graphics with decorative alternative text when adjacent text supplies the name; do not depend on platform flag-emoji rendering. Each option has an explicit accessible name in the interface locale, such as `Přepnout na angličtinu` on Czech pages or `Switch to Czech` on English pages, keyboard activation, visible focus and a minimum 44 px touch target. The active option announces its selected/current state. Keep the control discoverable in desktop chrome and the mobile header/menu without reducing the CTA or navigation to unreadable sizes.

Switching keeps the same logical entity and safe filters when a valid published counterpart exists. Resolve the destination from entity identity and its published locale slug, not by blindly replacing a URL prefix. For an article without a published target translation, navigate to that locale's news list, show a localized availability notice and offer a safe explicit source-language link to the published article. Never reveal an unpublished translation, auto-translate, or silently render one language under the other locale's URL.

The UI language switcher and the editor's content-language selector are distinct. Before switching either away from unsaved work, use the canonical draft/dirty-state guard; let the editor save safely, stay, or explicitly discard. Do not save one translation into the other. A locale change preserves permitted account state but never creates permissions. Core static pages require both approved translations for launch; absent member biographies or match recaps get explicit localized absence states as defined by the localization contract.

## 4. Proposed design tokens

Use named CSS tokens. Values are initial targets to tune against the references and measured contrast; they are not claims about the original game's values.

| Token | Initial value | Use |
| --- | --- | --- |
| `--color-scene-base` | `#11110f` | Immediate background before media loads |
| `--color-chrome` | `#1b1c19` | Header and durable high-contrast regions |
| `--color-panel` | `rgb(20 21 19 / 0.88)` | Content panels; avoid excessive transparency under text |
| `--color-panel-soft` | `rgb(42 43 39 / 0.76)` | Menu buttons and decorative side regions |
| `--color-row` | `rgb(50 51 47 / 0.86)` | Alternating rows |
| `--color-row-alt` | `rgb(27 28 25 / 0.90)` | Alternating rows |
| `--color-border` | `#55564e` | Quiet panel outline; do not rely on it as the only control boundary |
| `--color-border-strong` | `#a8a89a` | Interactive boundary and hovered surface |
| `--color-text` | `#f2f1e8` | Primary text |
| `--color-text-muted` | `#b8b9ad` | Secondary labels on sufficiently dark backgrounds |
| `--color-text-dim` | `#8c8e83` | Nonessential decoration only if contrast is insufficient for text |
| `--color-accent` | `#d9ad32` | Selection edges, current navigation, focus detail |
| `--color-accent-surface` | `#6f5417` | Opaque base for primary action and selected row |
| `--color-accent-wash` | `rgb(188 140 22 / 0.30)` | Amber hover/selected gradient |
| `--color-brand-orange` | `#f49b00` | Valkyria identity, mainly within the supplied logo |
| `--color-brand-red` | `#f04424` | Valkyria identity, not a universal error color |
| `--color-success` | `#8bcc8a` | Confirmed positive state with text/icon |
| `--color-warning` | `#efcc72` | Pending/stale state with text/icon |
| `--color-danger` | `#ffaaa1` | Validation/error text on charcoal |
| `--color-focus` | `#fff0ab` | Two-pixel visible focus outline with two-pixel offset |
| `--radius-panel` | `0px` | Square game-menu surfaces |
| `--radius-control` | `0px` or `2px` | Tiny antialiasing radius only; no pills |
| `--border-hairline` | `1px` | Rules and panel edges |
| `--border-selected` | `2px` | Selection/active outline |
| `--space-1` through `--space-8` | `4, 8, 12, 16, 24, 32, 48, 64px` | Shared spacing scale |
| `--layer-background` | `0` | Scene and poster |
| `--layer-scene-treatment` | `1` | Noninteractive scrim and vignette |
| `--layer-emblem` | `2` | Decorative faded emblem |
| `--layer-content` | `10` | Public page content |
| `--layer-header` | `20` | Header and utilities |
| `--layer-popover` | `40` | Menus, tooltips |
| `--layer-dialog` | `60` | Dialog and its backdrop |
| `--layer-notice` | `70` | Critical visible notification, without stealing focus |

Suggested primary button fill: a shallow vertical gradient from `rgb(118 87 12 / 0.78)` to `rgb(155 117 24 / 0.92)` over an opaque-enough base, with an amber outline and tiny light inner brackets. Avoid shiny bevels, large shadows, animated shimmer, and always-on glows. Background treatment should primarily use a subtle dark scrim and bottom/edge vignette. Add grain only if a small licensed texture or CSS implementation is available and it does not cause artifacts or reduce legibility.

### Typography

Use a licensed condensed sans-serif with Czech Latin Extended glyphs as well as English and international member names. Initial candidate: self-hosted Barlow Condensed for navigation, short headings, and numeric score treatment; Barlow for paragraphs, forms, and dense data. Record the actual font source and license when selected. Do not extract packaged game fonts for the website without cleared usage rights. Fallbacks must preserve readable widths; font subsetting must not remove Czech glyphs.

| Role | Desktop baseline | Small screens | Treatment |
| --- | --- | --- | --- |
| Page heading | 36–44 px / 1.05, weight 600–700 | 28–32 px | Condensed, optional uppercase |
| Primary menu CTA | 24–32 px / 1.1, weight 500–600 | 22–26 px | Uppercase, letter spacing 0.14em |
| Navigation label | 16–18 px / 1.1, weight 500 | 15–17 px | Uppercase, spacing 0.10em |
| Panel heading | 20–24 px / 1.2, weight 600 | 20 px | Condensed, spacing 0.03em |
| Body copy | 16–18 px / 1.55, weight 400 | 16 px / 1.55 | Sentence case, no tracking |
| Data row | 16–18 px / 1.3, weight 400–500 | 16 px | Tabular numerals for scores/times |
| Metadata | 13–14 px / 1.35, weight 500 | 13–14 px | Short labels only, restrained uppercase |

Never reproduce the reference's smallest illegible labels literally. Keep meaningful text at least 13 CSS px and body text 16 CSS px. Test `PŘIPOJIT SE NA DISCORD`, `PŘIHLÁSIT SE`, `ČLENOVÉ`, `PŘÍŠTÍ ZÁPAS`, `JOIN DISCORD`, `MEMBERS`, and long international member names in the actual loaded font. Include lowercase/uppercase Czech diacritics in font evidence; do not shrink Czech text merely to preserve English widths. Tracked uppercase is for short controls, not paragraphs.

## 5. Components and contracts

Names below describe responsibility and may be adapted to repository conventions. Props are contracts to implement, not existing API definitions.

| Component | Main inputs | Visual/behavioral contract |
| --- | --- | --- |
| `MenuShell` | `section`, `backgroundMode`, children | Persistent scene + header; supports home, public detail/list, account and admin variants |
| `BackgroundMedia` | `poster`, `sources`, `playbackPreference`, `onPlaybackStateChange` | Shows poster first; handles loading, playing, paused, blocked, unavailable; contains no mandatory content |
| `ClanEmblem` | `variant: header / faded / content`, `size` | Supplied asset, preserved proportions; meaningful alternative text only when the mark provides information |
| `MenuNavigation` | `items`, `currentPath`, `accountState` | Real anchors, current-page semantics, keyboard reachable controls |
| `LanguageSwitcher` | `locale`, `counterpartHref`, `availability`, `dirtyState` | Czech/UK flags plus Čeština/English and CS/EN; safe entity-aware routing, missing-translation notice and unsaved-draft guard |
| `GameButton` | `intent: primary / secondary / danger`, `size`, `pending`, `disabled`, `href?`, `onClick?` | Anchor for navigation, button for action; one unambiguous accessible label; pending blocks duplicate mutations |
| `UtilityButton` | `label`, `icon`, `pressed?`, `onClick` | 44 × 44 px minimum tap target; tooltip is not the only accessible name |
| `SectionFrame` | `title`, `description?`, `toolbar?`, children | Square dark surface, slim title strip, predictable padding; no mandatory nested scroll areas |
| `FilterToolbar` | `filters`, `query`, `onChange`, `resultCount` | Search, game/status filters, reset; reflects filter state in URL where shareable |
| `SelectionTable` | `rows`, `columns`, `selectedId?`, `sort`, `onSort`, `rowHref` | Semantic table; a real link per row; sortable headings use buttons and `aria-sort` |
| `DetailPane` | `title`, `metadata`, `body`, `actions` | Desktop contextual detail alongside list; direct detail route exists independently |
| `MemberSummary` | `displayName`, `avatar`, `publicRoles`, `gameTags`, `profileHref` | Public projection only; avatar fallback; no private Discord IDs or permission details |
| `MatchSummary` | `game`, `opponent`, `startAt`, `status`, `publishedScore?` | Clear timezone and status; cancelled/unknown/unpublished score handled explicitly |
| `NewsSummary` | `title`, `excerpt`, `cover?`, `publishedAt`, `category?`, `href` | Prominent public news collection; real publication metadata and descriptive article link |
| `RichTextEditor` | `document`, `readOnly`, `validation`, `onChange` | WordPress-like visual editing with accessible toolbar and supported content nodes; canonical data contract comes from the editorial specification |
| `PublishPanel` | `status`, `saveState`, `publishAt?`, `timeZone`, `permissions`, `onSave`, `onPreview`, `onPublish` | Clear draft/autosave/revision/preview/publish/schedule distinction; no visual-only authorization |
| `ContentLocaleSelector` | `contentLocale`, `translationStates`, `dirtyState`, `onChange` | Separate from interface language; shows independent translation draft/published/scheduled state and protects unsaved work |
| `MediaPicker` | `allowedKinds`, `selectedAsset?`, `uploadPermission`, `onSelect` | Search/select/upload approved media; thumbnail, alt text, caption, provenance and clear progress/failure states |
| `StatusBadge` | `status`, `label` | Text plus icon/border; color is supplemental |
| `ModalDialog` | `title`, `description?`, `open`, `onClose`, `actions` | Reserved for bounded tasks; focus management and Escape support; route content is not trapped in a modal |
| `FeedbackNotice` | `kind`, `message`, `retry?` | Inline stable feedback; error details useful to the user without credentials or stack traces |

### Shared interaction states

| State | Appearance | Behavior |
| --- | --- | --- |
| Default | Charcoal fill, quiet outline, high-contrast label | All controls remain identifiable over variable scenery |
| Hover | Slight amber/gray lift and brighter border | No layout shift or dependence on hover to reveal the only action |
| Focus visible | Distinct pale outline outside the existing selected border | Focus is distinguishable from selection and survives high-contrast mode |
| Current navigation | Amber text/edge with short bottom gradient | `aria-current="page"`; do not use ARIA tab roles for page navigation |
| Selected row | Amber 2 px outline + subdued amber fill | Selection retained in URL when it identifies a route; unselected text remains legible |
| Pressed | Slight darker fill | No physical displacement that moves the hit target |
| Pending | Label remains understandable; short progress indicator | `aria-busy` where appropriate; prevent duplicate submission; preserve dimensions |
| Disabled | Subdued but understandable appearance | Native disabled controls where possible; a reason is visible when useful; no hover action |
| Error | Inline pale-red text and specific recovery action | Associate errors with affected field; preserve entered data |
| Empty | Short factual explanation and applicable reset/action | Distinguish no data from no filter matches and load failure |

Decorative brackets, crosshairs, tiny separators and `//` prefixes can be CSS/SVG details; they must not enter the accessibility tree. Use original simple geometry or licensed icons. No Wardogs glyph dump is required.

## 6. Background media and performance

The owner is converting a source background to AVI. AVI is an intermediate, not a browser delivery format. The implementation must consume web-ready, reviewed derivatives supplied through the approved asset process. Do not commit a large AVI, Bink source, packaged game archive, or unreviewed extracted material simply to make cloud development convenient.

Target delivery contract:

- A still poster in an optimized image format, with a known resolution and provenance; MP4/H.264 as the broad-compatibility baseline and optionally WebM/VP9 if conversion quality and size justify it. Encode without an audio stream.
- Preserve the entire available owner-supplied AVI timeline, approximately 192.45 seconds before frame-rate quantization. Use a 1920 × 1080, 30 fps derivative with an approximately 60 MiB primary transfer budget. The [full-length delivery](../assets/background-media-full-2026-09-26.md) supersedes the former 12–30-second / 8–12 MB target. Do not trim, fade, reverse, time-limit or otherwise edit a shorter loop. Inspect and report the natural end-to-start discontinuity; optimize encoding/resolution without removing time.
- `muted`, `loop`, `playsInline`; handle rejected playback promises. Background audio is off and never starts automatically. No faux loading screen while media downloads.
- `object-fit: cover` with a configurable focal point. Preserve the environment's sense of scale. Test 16:9, 16:10, ultrawide and portrait crops; the UI's usable area must not depend on a specific building being visible.
- Use an immediate CSS background color and poster to prevent a white/black flash. Fetch video after the essential shell/first content is available. Prefer `preload="none"` until motion is allowed; avoid fetching video at all for reduced motion or explicit data-saving modes.
- `prefers-reduced-motion: reduce` selects the static poster by default. Where `navigator.connection.saveData` is supported and true, also prefer the poster. On narrow/coarse-pointer devices, defaulting to poster is acceptable and should have a visible opt-in play control.
- Provide a visible `Pause background` / `Play background` control with `aria-pressed` or an equally clear state contract. Store the preference locally without requiring an account. Pause while the document is hidden; resume only if the user's preference permits it.
- If the video is missing, unsupported, slow, blocked, offline, or fails after starting, retain the poster. The entire site remains usable. A decorative-media failure must not display a blocking alert or an application error screen.
- On subpages, darken the backdrop and optionally apply a modest blur. Do not run several large blur layers or re-render the video with every state update. Respect device performance; a stronger dark scrim is an acceptable low-cost alternative.
- Stable image dimensions, font preloading limited to necessary faces, and bounded visual effects prevent layout shifts. On a representative mobile production build, target LCP ≤2.5s, CLS ≤0.1, and INP ≤200ms; report lab environment and actual measurements rather than claiming field metrics.

If the real backdrop is not yet available or approved, implement the full media contract against a clearly marked development fixture and use an original charcoal/CSS fallback for production. Do not bake a screenshot containing somebody else's game HUD into the runtime scene.

## 7. Motion specification

These are proposed timings, not observations of the game's actual animation.

| Interaction | Motion target | Duration / easing |
| --- | --- | --- |
| First shell render | Header and controls appear once; optional short opacity transition only after meaningful content is present | 160–220ms, `ease-out` |
| Button hover/focus | Background and border color transition | 100–140ms, `ease-out` |
| Navigation change | Active edge/color changes; route content cross-fades and may translate upward no more than 6 px | 160–200ms, `cubic-bezier(.2,.8,.2,1)` |
| Detail selection | Detail content fades while its panel geometry stays stable | 120–180ms, `ease-out` |
| Dialog open | Backdrop fades; panel fades with ≤8 px movement or ≤0.99→1 scale | 140–180ms, `ease-out` |
| Dialog close | Opacity change only | 100–140ms, `ease-in` |
| Background-mode transition | Scrim/blur changes without restarting the video | 180–240ms, `ease-out` |
| Toast/inline success | Brief fade, no dramatic slide or bounce | 120–180ms |

No repeated pulsing CTA, automatic carousel, mouse-follow effect, slow typewriter copy, prolonged entrance sequence, flashing selection, or mandatory animation before navigation. Hover does not play audio. `prefers-reduced-motion` removes transforms and looping UI effects; remaining state changes are immediate or ≤50ms. A paused background stays paused across routes.

## 8. Responsive behavior

Breakpoints are layout decisions, not device detection. Test actual content at the boundaries, portrait/landscape rotation and 200% zoom.

| Available width / height | Required behavior |
| --- | --- |
| ≥1600 px and adequate height | Full composition with large negative space, faded center crest, lower-left action stack; list/detail split around 66%/34% |
| 1280–1599 px | Smaller chrome and action stack; same visual hierarchy; dense lists keep only useful columns |
| 768–1279 px | Condensed header, fewer inline utilities; list/detail may split 60%/40% if readable or switch to stacked view; center crest yields to content |
| <768 px | Poster first, compact header with accessible localized navigation including News; visible flag-and-text language control; single-column panels; primary actions in document flow, not fixed over content; crest becomes a restrained background accent; localized HLL link retained |
| Height <720 px | Compact utility rail, action stack moves into normal flow if necessary; allow page scrolling, no clipped CTA or inaccessible footer |
| Ultrawide | Scene fills width; cap reading/list content around 1800–2048 px with deliberate side space; do not stretch text lines or rows indefinitely |

Mobile home is still a game menu: clan mark/header, visible scene or poster, clear primary action, compact secondary choices, utility controls. Do not miniaturize a 2560-wide desktop screenshot. Header/navigation controls must remain usable at 320 CSS px width. Apply safe-area insets on phones. If a menu disclosure opens, its close control and first item are keyboard reachable; Escape closes it and returns focus to the trigger.

At small widths, lists become compact row summaries with a detail link. Keep opponent/name, game, date or result visible; optional numeric columns move into the detail view. If a true data table needs horizontal scrolling, contain it in a labelled region with a visible affordance and do not force the entire page to overflow. Avoid multiple nested scrollbars; desktop reference frames may suggest an inset scroll area, but document scrolling is the default for web accessibility.

## 9. Content and failure states

- Do not hardcode member names, results, counters, invitations or clan history from the game UI. Use verified content sources and explicit preview fixtures. Never show preview fixtures as production facts.
- Member display names may be long, contain emoji and international characters. List labels can truncate after one or two lines; the full name must remain available on the detail page. Do not rely on `title` tooltips as the only way to read it.
- Headings wrap naturally; body text uses a readable line length of roughly 60–75 characters. Do not truncate articles or rules in fixed-height panels.
- Missing avatar: neutral original silhouette/initials fallback with reserved dimensions. Missing image: omit the image region or use an approved neutral placeholder; never a broken-image icon.
- Unknown score is `—` with `The result has not been published yet`; it is not `0 : 0`. Upcoming, live, completed, postponed and cancelled match states are textually distinct. A live badge requires a trustworthy source.
- Empty members: `No member profiles have been published yet.` Empty matches: `No matches are scheduled yet.` Filter-empty: `No results match these filters.` with `Clear filters`.
- Loading: preserve structure with low-motion skeletons or a short textual status. Slow loading includes a retryable state; never an endless spinner with no explanation.
- Read error: retain navigation and context, show `The data could not be loaded.` and `Try again`. Authentication expiry takes the user to a clear sign-in path; never misrepresent expired permissions as a generic network error.
- Missing Discord configuration: render a useful unavailable message without an active broken button. Development can show an explicit configuration note outside production UI. Do not silently substitute a different Discord server.
- Format dates/numbers through the active URL locale: `cs-CZ` for Czech and `en-GB` for English, with `Europe/Prague` as the display timezone and an explicit zone where ambiguity matters. Store/transport timestamps independently of display formatting. Preserve correct daylight-saving behavior; language switching never changes the event instant.

## 10. Accessibility and interaction requirements

Target WCAG 2.2 AA for the actual website. These requirements intentionally improve on any inaccessible aspect of the game screenshot.

- Provide a localized skip-to-main link, semantic header/navigation/main/footer regions, one clear page heading and meaningful localized page titles. Set document `lang` to the active `cs` or `en` route; mark intentionally quoted source-language passages appropriately rather than mislabelling an untranslated page.
- Navigation uses anchors and browser history; actions use buttons. Keep back/forward, reload, new-tab opening and copied detail URLs functional. Do not hijack global browser shortcuts.
- Keyboard order follows visual/semantic reading order: skip link, brand/navigation, account, primary content, utilities. Do not assign positive `tabindex` values to mimic game focus.
- Arrow-key interaction is only used for genuine widgets following their expected pattern. A visual row selection is not a reason to replace a normal table with a complicated ARIA grid.
- Maintain text contrast of at least 4.5:1 for normal text, 3:1 for large text, and 3:1 for essential control boundaries/focus. Measure composite backgrounds over bright and dark video frames. Increase panel opacity when needed.
- Focus must remain visible, unobscured by a sticky header/footer, and distinct from active row state. Set suitable scroll margin for focused/anchored content.
- Use at least 44 × 44 px targets for touch utilities and critical controls. Do not convey results, roles, permission failures or validation only through color.
- Dialogs have an accessible name, initial focus chosen for the task, focus containment, Escape dismissal when safe, and restoration to the invoking control. Warn before discarding entered changes; confirm only consequential destructive actions.
- Announce submit/load outcomes through a restrained live region. Do not announce every decorative transition, frame of video, or keystroke in a search box. Debounced result counts may use a polite announcement.
- Escape may close a temporary overlay; it must not log out, leave an editor unexpectedly, or navigate away from a normal page. Keyboard help must describe only shortcuts that actually work.
- Test 200% zoom, reduced motion, keyboard-only use, forced colors/high contrast, and screen-reader labels. Do not disable browser zoom or hide focus outlines for appearance.

## 11. Administrative visual boundary

Administration is a distinct route group with the same palette, type and rectangular components, but a quieter static background and denser, readable forms. Prioritize content editing, saving, error recovery and permission clarity over cinematic motion. The public main menu does not expose internal roster statuses, audit entries, Discord role IDs, private notes or attendance.

Account controls may link an authorized user to `ADMINISTRATION`; visual hiding is only a convenience, never authorization. A user who directly opens a restricted URL gets a proper server-enforced access result. A role-refresh failure is visible in account/admin context with a useful retry path; do not falsely label a member as an administrator because old UI state persists.

Forms use persistent labels, clear required-field text, inline errors, a stable primary save action and a visible saved/unsaved state. Long forms scroll normally. Reuse the game-style dialog only for short confirmations. The later lineup tools use an actual readable list or board; drag and drop, if added, always has a keyboard/button alternative.

### Visual editorial workspace — first release

The news authoring workspace must feel familiar to an administrator used to WordPress: post list with `New post`, a title field, large visual writing canvas, a formatting toolbar, a media/cover picker and a clearly separated document/publication panel. This is an interaction requirement, not an instruction to embed WordPress or replace the selected application architecture. Do not substitute a raw Markdown textarea, JSON input or developer-only file editing for the requested visual editor.

Provide readable rich-text authoring for the canonical supported headings, paragraphs, emphasis, lists, quotes, links, image blocks and basic tables, with clear formatting and undo/redo controls. Localize toolbar labels/tooltips, validation and status messages to the UI locale, expose pressed states, support keyboard formatting and preserve visible focus. Table headers and cell operations must work using a keyboard; wide tables scroll within the public article rather than overflowing the page. Pasting must produce supported sanitized content; do not allow arbitrary HTML/script or require users to clean source markup. Selection-based formatting may have a contextual toolbar, but essential actions remain available without a mouse or hover.

Desktop editor layout: quiet static dark surface, a wide readable writing column and a narrower document panel for status, excerpt, slug, category, cover and publication time. On small screens, the document panel becomes an accessible disclosure or stacked section; controls must remain reachable without trapping the editor in a tiny viewport. Preview uses the actual public article treatment, including the approved cover and responsive image behavior, and clearly labels unpublished output.

Expose explicit Czech/English content tabs or a language selector with per-translation availability and publication state. The interface can be Czech while editing English content, or the reverse; both active locales are clear. Drafts, revisions, preview, schedules and published snapshots are independent per translation. Publishing Czech cannot publish an English draft. Cover/body captions, alternative text and other localized metadata follow the selected content locale's contract. All status labels remain in the interface locale.

Display `Unsaved changes`, `Saving…`, `Draft saved`, `Save failed`, or a revision-conflict message based on actual server state. Autosave never publishes a draft or overwrites the live version of an already published article without the explicit action defined by the canonical editorial workflow. Revision history identifies saved versions and provides a safe restore-to-draft flow. Publication controls distinguish `Save draft`, `Preview`, `Publish`, `Update`, `Schedule` and `Unpublish` where each action is applicable; the server enforces permissions independently of visible controls.

The schedule control shows an explicit date, time and timezone plus an understandable confirmation of when the post becomes public. Preserve the canonical document's scheduling semantics and failure states; do not implement a decorative datetime field without real publication behavior. Unsaved changes, expired sessions, concurrent editing and failed autosave retain recoverable work safely and offer clear recovery paths without pretending success.

The media manager/picker supports upload progress, validation failure, processing, ready, selection and referenced/in-use states. Show thumbnail, filename, dimensions, alt text, caption and provenance where applicable; distinguish a post's cover from inline images. A meaningful image requires appropriate alternative text, while an explicitly decorative image can have empty alt text. Prevent destructive removal of a referenced asset without an explicit safe workflow. Ordinary editorial image management does not grant permission to change the global background/video settings.

The match administration list offers an unmistakable `New match` action and a complete first-release create/edit/schedule/publish workflow. Use the old site's public match overview as a content reference and the Wardogs browser as the visual reference; do not assume unseen legacy admin behavior. An event's start time and an article's publication schedule are different concepts. Internal rosters, attendance, squads and availability belong to M4 and must not become prerequisites for creating a public fixture.

## 12. Visual acceptance evidence

Produce actual browser captures in a deterministic preview state. Freeze the video on a documented approved poster/frame for comparison; hide variable timestamps/cursors and wait for fonts. Do not call a mockup or unlaunched HTML file a successful browser verification. Record the tested commit, browser, viewport and media state.

Required captures:

1. Home at 2560 × 1440 and 1920 × 1080: top chrome, lower-left action hierarchy, open scenery and faded center emblem are clearly comparable with reference 09.
2. Members at 1920 × 1080: readable table/list, selected or focused profile, meaningful empty/error variant.
3. Matches at 1920 × 1080: filters/list/detail composition comparable with reference 13, clear result and upcoming-state differences.
4. Clan/about page at 1440 × 900 in both Czech and English: readable translated copy and preserved visual shell without oversized marketing sections.
5. Home and matches at 390 × 844 and 320 × 568: no clipped actions, inaccessible navigation or page-wide horizontal overflow.
6. Home at 2560 × 1080: ultrawide scene crop and bounded content.
7. Home with reduced motion and with the video URL unavailable: poster/fallback, operable controls, no blocking loader.
8. Keyboard focus on navigation, primary CTA and a list action; sign-in error; restricted administration route result.
9. Admin editor with validation errors and pending/save-success states after that phase is implemented.
10. `NEWS` active in desktop navigation and accessible in the mobile menu; public news list and long article with approved cover/inline media at desktop/mobile sizes.
11. News editor with formatting toolbar, cover/media picker, autosave success/failure, revision conflict/history, preview and scheduled publication states. Verify the editor is operable using a keyboard and at mobile width.
12. Match administration list and `New match` form with explicit start-time timezone, validation and published/unpublished states.
13. Paired `/cs` and `/en` desktop/mobile captures showing the localized primary menu, account/validation labels, Czech/UK flag-and-text switcher and correct font glyphs. Verify visible focus and no Czech-label clipping.
14. Entity/filter-preserving language switch, missing published article translation with localized list/notice/source-language link, and an unsaved-editor switch guard. Show independent Czech/English draft/publication states; a screenshot alone does not replace the associated routing/publication tests.

Acceptance is a composition and usability review, not arbitrary pixel identity across every browser. The nonnegotiable visual traits are narrow dark chrome, square translucent surfaces, amber selection, condensed short labels, a landscape-led homepage, a visible but faded Valkyria crest, and practical game-menu subpages. Any deliberate departure is explained with evidence, especially for responsiveness, accessibility and unavailable media.
