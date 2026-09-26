# Legacy site audit and migration notes

Observed: **2026-09-26, approximately 10:40 UTC**. Source owner supplied the site as a migration reference. This is a bounded read-only audit of public HTTP responses, not a database export or a live Discord audit. Machine-readable observations are in [legacy-content.json](legacy-content.json).

## What is established

- Valkyria is a Czech and Slovak gaming community with an established Hell Let Loose competitive history. Its public home page gives **2022** as the starting year. These facts can inform the new About copy; do not present the new Wardogs division as having competed since 2022. [Home](https://valkyriahll.cz/), [About](https://valkyriahll.cz/about)
- Discord is the community's main coordination and recruitment channel. The advertised invite is [discord.gg/vlkhll](https://discord.gg/vlkhll). The existing HLL name in the invite is intentional evidence, not a reason to invent a replacement. [About](https://valkyriahll.cz/about)
- The community announced its Wardogs server on **17 September 2026**. The announcement emphasizes teamwork, support for new players, and fair play. It describes competitive Wardogs as an interest dependent on future game support; it does not establish an existing Wardogs league record. [Announcement](https://valkyriahll.cz/clanky/wardogs-oznameni)
- The server page and announcement both advertise Wardogs server ID `eef9c6d0-8c6e-45b6-a58f-53ac66f4a075`, region **EUROPE WEST**. The launch article specifies Amsterdam and an intended later move to Prague. This is published information, not proof of current server reachability, location, capacity or map. Refresh before launch. [Server page](https://valkyriahll.cz/servery), [Announcement](https://valkyriahll.cz/clanky/wardogs-oznameni)

The owner has selected **English-only content** and **valkyriawdg.cz** as the new canonical domain. Adapt the verified Czech/Slovak facts into original English copy; do not translate the entire legacy site wholesale or introduce an i18n requirement. Suggested positioning: **“Valkyria — a Czech and Slovak gaming community. From Hell Let Loose to Wardogs, together.”** Lead with Wardogs on the new landing screen; preserve Hell Let Loose as explicitly labelled heritage and match archive. The old domain remains the research source; this audit makes no DNS changes.

## Links captured from the public HTML

| Purpose | Advertised destination | Migration treatment |
| --- | --- | --- |
| Community Discord | https://discord.gg/vlkhll | Primary join action; check invite validity before launch |
| HLL competitive application | https://discord.com/channels/963323629242826762/1210328709417013339 | Members-only destination; keep under HLL context until owners confirm Wardogs recruitment flow |
| YouTube | https://www.youtube.com/@VALKYRIA_HLL | Optional social link; preserve branding pending editorial change |
| Steam group | https://steamcommunity.com/groups/vlkhll | Optional social link |
| Instagram | https://www.instagram.com/valkyriahll/ | Optional social link |
| Facebook | https://www.facebook.com/groups/1611704832777331 | Optional social link |
| Legacy support link | https://transparentniucty.moneta.cz/256862392 | Existing public reference; financial/support section requires a separate editorial decision |

Source: [home](https://valkyriahll.cz/) and [about](https://valkyriahll.cz/about). Destinations were extracted from live site HTML; external account ownership, redirects and invitation permissions were not separately verified. Do not infer Discord guild authorization or role IDs from these public links.

## Historical numbers: evidence only, not production seed

All observations below have `doNotAutoPublish: true` in the JSON. They are approximate marketing counters or dated schedules, not synchronized application data.

| Source | Published claim | Meaning / issue |
| --- | --- | --- |
| Home | 3500+ community members | No counter timestamp or live Discord proof |
| Home | 100+ competitive team members | HLL wording, not Wardogs roster |
| About | 3500+ Discord members | Same nominal audience as home |
| About | 150+ clan members | Different population or stale value compared with the home figure; do not reconcile by guessing |
| About | 100+ matches played | Historical community/HLL claim, not Wardogs wins or matches |

[Home](https://valkyriahll.cz/), [About](https://valkyriahll.cz/about).

The home page exposes the following HLL results; the three result detail pages were also fetched directly:

| Date | Competition | Match | Reported result | Source |
| --- | --- | --- | --- | --- |
| 2026-09-20 | ECL #26 S2 | VLK vs 404 | 2:3 | [Match 207](https://valkyriahll.cz/matches/207) |
| 2026-09-13 | Friendly | VLK vs 82AD | 0:5 | [Match 210](https://valkyriahll.cz/matches/210) |
| 2026-08-30 | Friendly | VLK vs EJIG | 3:2 | [Match 205](https://valkyriahll.cz/matches/205) |

These are HLL sector-style scores; a future score model must not hard-code this scale for Wardogs. Match detail pages have HLL map/faction data and 49vs49 formats. Do not convert them to Wardogs fixture data. Individual player statistics were not collected.

At observation time, home listed HLL fixtures on 2026-09-27 (YOKO), 2026-10-04 (EJIG, ECL #26 S2), and 2026-10-11 (331). An unplayed detail page renders **0:0**; this is a display placeholder, not a result. Fixture seeds must represent unknown scores with null and a scheduled state. [Match 211](https://valkyriahll.cz/matches/211), [Home](https://valkyriahll.cz/).

The [ECL autumn 2026 page](https://valkyriahll.cz/turnaje/ecl-2026-fall) says Division III and shows a table dated **24 August 2026** whose zero results conflict with its later completed match listing. Keep the source table date and flag it as stale; do not import the zeros as a current standing.

## Navigation and content migration

| Legacy route | Observed purpose | Proposed use |
| --- | --- | --- |
| `/` | Community presentation, articles, matches, join action | Rewrite for new game-menu home |
| `/about` | Community identity, history, recruitment | Reuse verified facts with new original copy |
| `/clanky/wardogs-oznameni` | Dated Wardogs launch announcement | Useful transition/history item |
| `/servery` | HLL and Wardogs server sections | Wardogs connection information after refresh |
| `/matches` and `/matches/:id` | HLL fixture and result archive | Preserve explicit game identity and legacy deep links |
| `/turnaje/ecl-2026-fall` | HLL tournament detail | Historical competitive context |
| `/faq` | HLL recruitment/VIP/training questions | Rewrite game-neutral answers; old answers not captured |
| `/guide`, `/zebricky`, `/events`, `/tournaments` | Linked public sections | Inventory only; not exhaustively crawled |

Current live navigation differs from older search/index snapshots: a previously indexed Members link is not present in the freshly fetched home/about navigation. Do not assume a public member directory is part of the verified migration corpus. No personal member roster was exported.

The public page includes HLL: Vietnam promotional placeholder content. It is not evidence that a Vietnam division or live server exists.

## Verified CSS and typography

Live stylesheet: [1a0676e9f8711c36.css](https://valkyriahll.cz/_next/static/css/1a0676e9f8711c36.css). Its filename is deployment-specific; resolve the stylesheet from HTML again if it changes.

| Token | Exact value from stylesheet | Suggested interpretation |
| --- | --- | --- |
| Light primary/ring | `hsl(24.6 95% 53.1%)` | Legacy bright orange |
| Dark primary/ring | `hsl(20.5 90.2% 48.2%)` | Legacy deep orange |
| Dark background/card | `hsl(20 14.3% 4.1%)` | Very dark warm neutral |
| Dark foreground | `hsl(60 9.1% 97.8%)` | Warm near-white |
| Dark secondary/border | `hsl(12 6.5% 15.1%)` | Warm dark panel edge |
| Dark muted foreground | `hsl(24 5.4% 63.9%)` | Secondary text |
| Radius | `0.3rem` | Legacy site value; new menu may use squarer corners |

The CSS names **Inter**, weight range **100–900**, normal style and `font-display: swap`. The bundled Latin font URL is [e4af272ccee01ff0-s.p.woff2](https://valkyriahll.cz/_next/static/media/e4af272ccee01ff0-s.p.woff2); a separate Latin-ext subset is present for Czech/Slovak text. The legacy font is not evidence of the Wardogs game's font. Select any new condensed heading font separately with a redistributable license and complete Czech/Slovak glyph support.

Use the verified legacy orange as a brand reference alongside the supplied orange/red clan logo. Wardogs amber selection states, translucent panels, typography and screen composition come from the user-supplied screenshot brief; they are not CSS extracted from this website.

## Artwork URL inventory

Each URL below was found in the live page HTML (directly or via a decoded Next image URL) and returned HTTP 200 to a HEAD request on 2026-09-26. Sizes are server-reported bytes, not hashes or downloaded-file validation. No images or fonts were bulk-downloaded by this audit.

| URL path on https://valkyriahll.cz | Bytes | MIME | Evidence/use candidate |
| --- | ---: | --- | --- |
| `/vlk.png` | 139901 | image/png | Header/footer community mark |
| `/vlk_logo_bg.webp` | 40540 | image/webp | Home Open Graph image |
| `/valkyria_header.png` | 48690 | image/png | Home/About wordmark |
| `/images/teams/vlk_logo.png` | 139901 | image/png | Valkyria match-team mark; same size alone does not prove same bytes |
| `/wardogs-banner.webp` | 111134 | image/webp | Home Wardogs hero artwork |
| `/hll-banner.webp` | 221484 | image/webp | HLL historical hero artwork |
| `/join_us.webp` | 1045572 | image/webp | About recruitment artwork |
| `/content/articles/wd-server-thumb.jpg` | 215968 | image/jpeg | Wardogs article thumbnail |
| `/content/articles/wd-server-banner.jpg` | 74686 | image/jpeg | Wardogs article server banner |
| `/images/wardogs/wardogs_logo.webp` | 4490 | image/webp | Wardogs trademark in article |
| `/images/icons/games/wardogs_logo.webp` | 4490 | image/webp | Wardogs trademark on server page |

Public availability does not establish a media license. Prefer the clan logo supplied by the owner, maintain provenance, and keep third-party game artwork distinct from repository code licensing. For a selected asset, download only that asset, record SHA-256, dimensions and attribution, and apply the repository asset policy before redistribution. Do not hotlink legacy Next image transform URLs in production.

## Coverage limits and implementation handoff

- Evidence was refreshed with direct HTTPS GET for home, About, server page, announcement, FAQ, ECL autumn page, and four match detail pages. Search extracts alone were not treated as current state.
- No authenticated routes, private Discord messages, bot state, admin APIs, game-server ports or local credentials were accessed.
- HLL live-server counts, video feed and event feed are client-dependent sections and were not validated. Their absence from static HTML is not evidence of zero servers or events.
- FAQ HTML exposed questions but no answer text in the captured visible markup. Do not invent legacy admission, VIP or attendance rules.
- Preserve legacy match URLs as external archive links until a deliberate migration and redirect plan exists.
- New public member profiles should use owner-approved publishable fields and consent-aware visibility, not an automatic scrape of old player data.
- The included JSON is a research dataset with source and publication flags. The application must not import it as production seed data.
