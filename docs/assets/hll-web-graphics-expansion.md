# Additional HLL web graphics and custom production brief

Research date: 2026-09-28. This extends the [initial media handoff](hll-media-research.md)
for the original WWII Hell Let Loose. It is a selection and production brief; no
new web graphics have been implemented or deployed.

The follow-up downloaded and decoded **20 additional source images**: ten from
official developer articles and ten from community repositories, totaling
**37,641,864 bytes**. All originals were visually inspected; byte counts and SHA-256
values were independently compared with the retained downloads. No URL/hash duplicates
the initial 39-image selection. Three black role-icon variants and neutral-background
diagnostic canvases were additionally inspected but are not counted as candidates.
Original downloads and diagnostic images remain in ignored local research storage.

## Select by purpose

Use game imagery where the page identifies a real map, class or vehicle. Use original
Valkyria composition for category covers, announcements, scores and onboarding.
This keeps reference material recognizable while giving the site a consistent identity.

| Website slot | Preferred material | Treatment |
|---|---|---|
| Server browser row/detail | Map-specific environmental image | Map slug and source version must match; a neutral fallback beats the wrong location |
| Match announcement/result | Original Valkyria template with a map/photo slot | Published opponent, date, score and status supplied by the CMS; no fabricated match data |
| Manual category | One coherent set of eight cover compositions | Reuse approved photos with the same tonal treatment; title remains localized HTML |
| Role/equipment guide | Verified class/vehicle reference | Preserve silhouette and labels; identify the applicable game update/platform |
| Tactical explanation | Author-created diagram over a suitable map or schematic | Legend, textual equivalent and explicit game-version review; public teaching examples only |
| FAQ/recruitment | Small consistent UI icons and clan mark | No image required for every answer; avoid unrelated historical photos or modern military hardware |
| HLL homepage | Clan battle recording and its still poster | Keep the existing media component and fallback; promotional trailers are not clan footage |

The [additional image catalog](hll-web-image-candidates.json) records individually
inspected downloads. The original 39-image catalog remains unchanged so its verification
counts retain their meaning. Public image URLs in either catalog are research sources,
not an instruction to hotlink them from visitors' browsers.

## Strongest additional HLL sources

| Source / catalog ID | What it provides | Best placement |
|---|---|---|
| [Official Update 19](https://www.hellletloose.com/blog/update-19-changelog), `expansion-04-smolensk-station` | Clean 1920 × 1032 rail-yard panorama with no baked headline | Smolensk server/map card or editorial cover |
| Same article, `expansion-06-kv2` and `expansion-07-bishop` | Two 3840 × 2160 vehicle renders with actual transparency | Armor/artillery identification panels; preserve the full barrel, tracks and antenna |
| Same article, `expansion-08-soviet-uniforms` | 3022 × 1700 Soviet squad scene | Roles/teamwork cover; source context is uniform promotion, not a clan match |
| Same article, `expansion-05-smolensk-map` | 1065 × 1065 tactical map | Expandable map-reading illustration, with full grid and legend |
| [Dev Brief 217](https://www.hellletloose.com/blog/dev-brief-217-juno-beach), `expansion-01` through `03` | Juno bunker, river and factory scenes | Specific map articles; April 2026 experimental/playtest source, with baked English labels and Update 20 branding |
| [Official Update 21](https://www.hellletloose.com/blog/hll-u21-changelog), `expansion-09` and `10` | Rifle-grenade equipment image and wide changelog banner | Equipment detail and update-specific news; keep the existing labels and native banner ratio |
| [HLL CRCON](https://github.com/MarechJ/hll_rcon_tool), `crcon-*` | Small Foy landscape, tactical base map and role glyphs | Server thumbnails, manual map detail and clearly labeled role references |
| [Maps Let Loose](https://github.com/mattwright324/maps-let-loose), `mll-*` | Foy terrain-access overlay, its legend and an artillery overlay | Reference for authored teaching diagrams; overlays need the corresponding aligned base map |
| [Default Garrisons](https://github.com/l1tku/hll-default-garrisons), `default-*` | High-resolution Foy base map and warning marker | Zoomable public map guide/reference, not a prebuilt live tactical service |

Official article images have traceable publisher provenance, but no blanket
fan-site republication statement was found in these pages. Community repositories
are discovery sources: CRCON's software MIT license does not independently establish
ownership of game art; Default Garrisons explicitly excludes its game imagery from
MIT. Preserve the pinned source revision and each candidate's specific rights note.

Maps Let Loose's terrain-access overlay is not a self-contained map or a claim of
WCAG accessibility. Keep it aligned with the correct map version, preserve the key,
and provide a textual explanation that does not rely only on color. Its tactical
annotations require current gameplay review before becoming instructional advice.

## Reusable UI illustration resources

These resources complement HLL-specific photographs; they do not identify actual game
equipment or replace the clan crest.

| Resource | Concrete starting points | Use / constraints |
|---|---|---|
| [Lucide](https://lucide.dev/) | [Book open](https://lucide.dev/icons/book-open), [radio](https://lucide.dev/icons/radio), [server](https://lucide.dev/icons/server), [users](https://lucide.dev/icons/users) | Preferred consistent outline vocabulary for manual, communication, servers and recruitment. The [license file](https://github.com/lucide-icons/lucide/blob/main/LICENSE) includes ISC and the MIT notice for Feather-derived icons; retain applicable notices when importing |
| [Game-icons.net](https://game-icons.net/faq.html) | [Walkie Talkie by Delapouite](https://game-icons.net/1x1/delapouite/walkie-talkie.html) | Alternative illustration vocabulary, with author-specific credit. This specific icon is CC BY 3.0 and a generic device, not an accurate WWII radio. Do not mix filled game icons and outline UI icons in the same control set |
| [ambientCG](https://ambientcg.com/) | Paper/fabric material library | Optional source for a restrained paper or canvas background. [Publisher license](https://docs.ambientcg.com/license/) states CC0 for asset downloads and preview renders. No individual material was downloaded or visually approved in this pass; choose a small color texture, not a large PBR bundle |

The icon pages and license documents above were read. The texture entry is a library
lead, not a verified individual image. Do not treat it as part of the decoded-image
count or add a dependency merely because the source is listed here. CSS can supply
the subtle grid, rules and surface shading without another raster download.

## Art direction references, not an asset pack

[Gaynor Larrigan's Tobruk portfolio](https://gaynor.artstation.com/projects/Zl2OQm)
documents environment work for the original HLL map and is useful for architectural
and lighting direction. Its page says all rights reserved; it is not a redistribution
pack. [Mortain environment art](https://www.artstation.com/artwork/lDwgwG) is another
lead, but the research reader returned the ArtStation shell rather than the project
images. Neither portfolio contributes a downloaded or visually approved candidate.

Use attributed source references to guide composition. Prefer the reviewed official
map photos or fresh clan captures for actual publication; do not assume an artist's
portfolio carries the publisher's press permissions.

## Custom batch to make next

Follow the [HLL visual specification](../design/hll/visual-spec.md) and current scoped
tokens in `apps/web/src/styles/tokens.css`: cool charcoal `#171a1f`, off-white
`#f0efea`, muted khaki `#c5b967`, flat panels and thin dividers. Reuse the project's
licensed typography and original Valkyria crest. The following is a proposed batch,
not a claim that these deliverables already exist.

1. **Eight manual covers:** Getting started; Objectives and modes; Roles and equipment;
   Communication; Logistics and vehicles; Armor and artillery; Spawns and engineering;
   Squad leader fieldcraft. Compose at 1600 × 900 and export responsive 16:9 variants.
   Show one recognizable subject, maintain a consistent dark lower edge and leave
   room for the HTML title. Avoid text, fake UI, ranks and watermarks baked into covers.
2. **Three editorial templates:** News/recruitment, upcoming match and match result.
   Maintain editable sources and export 1200 × 630 sharing cards plus 1600 × 900 web
   covers. Reserve explicit crest, image, headline and optional verified data slots.
   Design for a long Czech title and short English title; do not flatten content
   before localization. Mark development placeholders as samples.
3. **Four explanatory diagrams:** Garrison vs outpost; supply delivery flow; squad
   communication responsibilities; reading a public map/legend. Use editable SVG or
   structured layout with HTML descriptions. Validate rule values against the current
   game before including distances, timers, resource costs or role limits. Do not
   reproduce private tactical plans or turn a generated map into authoritative data.
4. **Small category/FAQ icon set:** Reuse one licensed family where possible; draw
   missing category symbols consistently. Six to eight icons should cover joining,
   communication, servers, rules, manual, events and support. Test legibility at
   24–32 px and supplement icons with text labels.
5. **Background posters:** Derive each poster from its selected clan video, preserving
   its source identity. Inspect bright and dark scenes under the real navigation
   before accepting a poster or video; allow a static-only experience.

## Prompt for a future custom art pass

Use the following as a production brief after selecting the particular cover or
template. It is not an instruction to generate all site media in one image.

> Create one original visual for the Valkyria Hell Let Loose community website,
> following the selected category and supplied approved visual references. Use a
> restrained WWII field-manual atmosphere: cool charcoal, muted khaki, off-white,
> natural lighting and subtle texture. Maintain one readable focal point at small
> size and a quiet area for a separate localized title. Output a 16:9 composition
> without baked text, game UI, invented insignia, logos or statistics. Do not redraw
> the supplied Valkyria crest; it will be placed separately. Use generative imagery
> only for decorative atmosphere. Accurate game maps, equipment and teaching diagrams
> must use verified source material or explicit authored geometry. Deliver the
> editable composition/source, source provenance, focal point and export variants.

For social templates, replace the final aspect-ratio requirement with 1200 × 630 and
reserve editable slots for the actual title, date, opponent and result. Keep the
source layers separate from photographic backgrounds and preserve the supplied mark.

## Acceptance for the later implementation

- The selected asset has a recorded source, credit/license or intended-use status,
  source hash, transformation and localized description under the [asset policy](policy.md).
- A map thumbnail identifies the map it labels; a role image identifies its role.
  Custom decorative art is not presented as a gameplay screenshot or evidence of a match.
- Cover crops work in the actual desktop and mobile cards; maps and instructional
  labels remain readable without cropping. Static content remains usable without video.
- The page uses responsive local/managed delivery, no accidental original-size PBR
  downloads, no third-party image hotlinks and no 16-video autoplay grid.
- Record actual CS/EN application captures and interactions when integrating media.
  Research contact sheets do not satisfy application acceptance or close #36.
