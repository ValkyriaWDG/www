# HLL graphics and tutorial media handoff

Research date: 2026-09-28. Scope: the original World War II **Hell Let Loose**.
This document proposes assets for the unified site's HLL section. It adds no runtime
media, gives no blanket redistribution approval and does not change the
[asset policy](policy.md).

## Recommended direction

Use reviewed clan captures or original-HLL promotional photos for category covers,
news and sharing cards. Use the existing clan manual's annotated illustrations and
selected instructional clips inside relevant guide pages. Keep the homepage's
background reserved for the owner's forthcoming clan battle recordings, with the
existing static fallback until they are delivered.

The existing [HLL design captures](../design/references/hll/README.md) remain design
references. They are not runtime backgrounds, a source of production roster data or
a license to crop the game's embedded card art into the website.

## Installed-game findings

The read-only inventory of the `HLL/` game subtree found:

| Material | Count | Measured finding |
|---|---:|---|
| Loose MP4 videos | 158 | 2,624,918,815 bytes: **2.625 GB decimal**, approximately **2.445 GiB** |
| Tutorial videos | 151 | Under `Content/Movies/HowToPlayVideos/`; includes PC/console variants |
| Company/middleware intros | 7 | Black Matter, Cover6, Expression, Flix Interactive, Team17, Unreal and Vivox logos |
| Packaged content | 1 PAK + 1 SIG | `Content/Paks/HLL-WindowsNoEditor.pak` is 68,466,161,002 bytes; archive remained unopened |
| Loose images or fonts | 0 | No PNG/JPG/WebP/SVG or font files found in this subtree |

All 158 videos were successfully inspected with ffprobe. There are 153 H.264 and
five HEVC video streams; 75 clips contain audio. 137 clips measure 1920 × 1080,
seven 3840 × 2160 and fourteen other dimensions. Durations range from 1.233 to
116.950 seconds. Tutorials total about 43m56s including variants and overlapping
topics; this is not one continuous film.

One small frame per clip was decoded for local review. All eight contact sheets
and the 16-candidate topic sheet were inspected. This establishes sampled subject
matter, not complete playback, loop quality or current gameplay-rule accuracy.
Two black samples were not shortlisted. No game executable or archive extractor
was run. The absence of loose images does not prove that images are absent from
the package.

**No standalone cinematic/menu background movie was identified among the loose
files.** The seven non-tutorial movies are logo intros. The menu soldier/stage may
be engine-rendered; that is an inference, and the package contents were not checked.

The [tutorial candidate catalog](hll-tutorial-candidates.json) records exact
game-relative paths, topic, source SHA-256, bytes, measured dimensions, codec,
duration, audio presence and proposed use for 16 candidates. It is research
metadata, not a runtime manifest or asset delivery. The source movies, diagnostic
frames and local contact sheets are **not committed and are not available to a
cloud checkout**. A future implementation must not depend on a local Steam path.

## First eight category covers

Create a coherent set of eight 16:9 covers with a readable focal point and consistent
dark overlay. Keep labels in HTML, not baked into the image, for CS/EN localization.

| Category | Cover proposal | Detail illustrations / clips |
|---|---|---|
| Getting started | Welcoming infantry/teamwork scene | [Basic settings](https://valkyriahll.cz/guide/zakladni-nastaveni); refresh outdated OS/game screenshots |
| Objectives and modes | Recognizable landscape/objective scene | [Modes](https://valkyriahll.cz/guide/herni-mody); catalog `game-objectives` |
| Roles and equipment | Squad/role scene without account UI | [Roles](https://valkyriahll.cz/guide/role); `rifle-grenades`; validate each role/icon mapping |
| Communication | Squad coordination scene | `communication-markers`; explain the marker wheel with localized text |
| Logistics and vehicles | Supply/transport vehicle scene | [Vehicles](https://valkyriahll.cz/guide/vozidla); `commander-supplies`, `supply-truck-crates`, `support-supplies` |
| Armor and artillery | Tank or artillery scene | [Tanks](https://valkyriahll.cz/guide/tanky); `armor-tanks`, `tank-repair`, `artillery-loading`, `artillery-shells` |
| Spawns and engineering | Garrison/construction scene | [Spawns](https://valkyriahll.cz/guide/spawny); `engineer-fortifications`, `halftrack-deployment` |
| Squad leader fieldcraft | Terrain/map-planning scene | [Squad leader manual](https://valkyriahll.cz/guide/prirucka-sl); retain the context of annotated tactical examples |

Movement clips (`movement-vaulting`, `movement-leaning`) fit Getting started and
fieldcraft. `antitank-gun` and `tank-cosmetics` serve specific equipment/editorial
pages. Do not imply these game-supplied tutorials depict a Valkyria event.

The FAQ does not need a photograph in every accordion row. Prefer the clan mark
and a small consistent licensed icon set for joining, Discord, expectations and
support; link to illustrated manual chapters where an image teaches something.

## Existing web and official sources

The [legacy manual](https://valkyriahll.cz/guide/prirucka-sl) is especially useful
for annotated teaching material. A separate read-only web inventory found **73
distinct non-logo image URLs** across eight guide categories. Sixteen images from
the publisher-provided [original-HLL Steam gallery](https://store.steampowered.com/app/686810/Hell_Let_Loose/)
and the legacy HLL banner bring the list to **90 distinct image URLs**. All 90
answered HTTP HEAD with 200 during research.

A bounded selection of **39 original images (26,782,719 bytes)** was then downloaded
into ignored local research storage: all 16 Steam gallery images, five spawn
illustrations, four logistics illustrations, thirteen squad-leader diagrams and
the legacy banner. All 39 decoded successfully and were visually reviewed through
three labelled contact sheets; eleven representative originals were also viewed.
The [image candidate catalog](hll-image-candidates.json) records source URLs,
decoded dimensions, exact source-byte SHA-256, visual descriptions, proposed uses,
crop guidance and review status for every selection. No image binaries or local
machine paths are included. This is a shortlist, not runtime asset approval.

The strongest promotional selections are:

| Catalog ID | Visible subject | Recommended use |
|---|---|---|
| `official-steam-05` | Two soldiers coordinating at a ruined urban corner | Communication, recruitment and general clan news; preserve the pair on the left |
| `official-steam-07` | Tank column in rainy blue-grey light | Armor cover; preserve turret and barrels |
| `official-steam-14` | Artillery crew and gun behind sandbags | Artillery guide or equipment news; preserve both crew and gun |
| `official-steam-15` | Helmeted soldier portrait with ruins and sparks | Roles, training and sharing cards; keep face on the left and title on the right |

For instructional detail, prioritize `legacy-spawny-02` (garrison recognition),
`legacy-vozidla-02` (supply trucks), `legacy-prirucka-sl-03` (map/objectives) and
`legacy-prirucka-sl-06` (annotated position planning). Keep these diagrams at their
native aspect ratio with `object-fit: contain`; do not crop labels or force them
into cinematic covers. The catalog maps candidates to the eight categories above.
Steam image 11 is too dark and blurred for a useful small cover; image 10 decodes
to 1920 × 1051 despite its URL suffix. The 1800 × 900 legacy banner is a painted
battle scene, not evidence of a clan match. Visual review does not establish
current instructional accuracy, authorship or publication approval.

Prioritize the five spawn illustrations, four logistics illustrations and thirteen
squad-leader diagrams for provenance and accuracy review. Two migration defects
already need attention: the legacy Support role references a `sniper.png` image,
and the Gameplay chapter is an under-construction placeholder. Twenty-five armor
illustrations are externally hosted on Imgur; obtain attributable originals or
replace them with fresh reviewed captures/diagrams rather than preserving hotlinks.

The current [Team17 press archive](https://www.team17.com/press-kit-archive) points
to a **Hell Let Loose: Vietnam** kit. It is the wrong game for these pages. The
older [original-HLL publisher announcement](https://www.cosmocover.com/newsroom/team17-and-black-matter-announce-partnership-on-hell-let-loose/)
links a historical kit whose download endpoint returned 403 to the research tool;
that is an access limitation, not proof the kit no longer exists. The
[Team17 creator hub](https://www.team17.com/press-and-creator-hub) is the appropriate
source for requesting a current WWII HLL kit and its permitted fan-site uses.
No outreach has been sent.

The [official original-HLL page](https://www.hellletloose.com/game/hll) also links
tutorial playlists. Prefer an attributed external link/provider embed for creator
videos unless separate source delivery and permission permit self-hosting. The
Steam trailer gallery can supply official trailer links, not an automatically
approved background download. The [Valkyria channel](https://www.youtube.com/@VALKYRIA_HLL)
is a source-selection starting point for the owner's future footage handoff.

## News, sharing and video delivery

- Prepare an original 1200 × 630 sharing-card layout and 16:9 news-cover layout
  using the Valkyria mark, actual title/date/category and an approved image. Keep
  CS/EN copy editable. Promotional imagery does not establish a match result.
- Select the original photo before producing responsive variants. Record source,
  author/credit, use status, focal point, localized alt text, transformation and
  content version in the source manifest or CMS asset record.
- Treat instructional video as user-initiated, lazy-loaded detail content. Show
  a poster first; do not download/autoplay a grid of 16 videos. The bunker source
  alone is 116.95s and 75.75 MB.
- These installed sources are already MP4; RAD/AVI conversion is unnecessary.
  Five sources are HEVC, and some have multiple audio/data streams. Approved web
  outputs need measured browser-compatible encodes, explicit audio treatment,
  metadata removal, hashes and full-timeline verification through the
  [video pipeline](video-pipeline.md). Tutorial audio needs captions/accessibility
  consideration; decorative backgrounds remain muted.
- Deliver approved clan background recordings and their posters through the
  [HLL media slot](../../assets/hll/backgrounds/README.md). Preserve the selected
  full source timeline and the existing once-per-document clip-selection behavior.

Publication work should be a small, reviewable batch: eight cover selections,
the highest-value existing guide diagrams, then individually justified clips.
Keep raw videos, archives, local diagnostic previews and personal/account captures
out of the public repository. Installed files and public image URLs remain source
candidates until their intended use and provenance are recorded under the existing
asset policy. The code license does not relicense third-party imagery.
