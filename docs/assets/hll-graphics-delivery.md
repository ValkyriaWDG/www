# HLL graphics and fullscreen background

This delivery follows the owner's request to fill the entire HLL viewport with
video, as in the Wardogs section. It replaces the central rectangular stage and
adds usable artwork to the manual, coverless HLL news and sharing cards.

The actual clan recording is still pending. An empty clip configuration displays
the shipped HLL still image and subdued Valkyria emblem; it does not enable a
tutorial, intro or substitute battle video. Playback tests use labelled synthetic
media and prove the component, not delivery of the final recording.

## Runtime artwork

Ten local WebP images total **746,768 bytes**. The 1920 × 1080 background poster is
52,936 bytes; the nine 1280 × 720 illustrations range from 25,056 to 151,748 bytes.
No runtime hotlink, game archive, extracted font or tutorial video is required.

| File in `apps/web/public/images/hll/` | Placement |
|---|---|
| `scene-poster.webp` | Full-viewport still and missing/failed video fallback |
| `getting-started.webp` | Getting started |
| `objectives-and-modes.webp` | Objectives and modes, when published in the CMS |
| `roles-and-equipment.webp` | Roles / equipment |
| `communication.webp` | Communication |
| `logistics-and-vehicles.webp` | Vehicles / logistics |
| `armor-and-artillery.webp` | Armor / artillery (the default HLL sharing background is now the graphics-pack scene; see [graphics pack integration](graphics-pack-2026-09-29.md#implemented-integration)) |
| `spawns-and-engineering.webp` | Spawns / engineering |
| `squad-leader-fieldcraft.webp` | Leadership |
| `news.webp` | Coverless HLL news with the existing faded clan emblem |

[The catalog](../../assets/hll-runtime-artwork.json) records exact source URLs,
source hashes, derivative hashes, sizes, dimensions, transformations and rights.
Sources are official Steam listing screenshots and one official Update 19 image.
These are editorial game illustrations, not instructions, evidence of a clan
event, or a general grant to reuse publisher artwork. See [NOTICE](../../NOTICE.md).
Community map overlays and unreleased/playtest candidates remain research only.

The mechanical derivative recipe was Sharp `resize(width, height, { fit: 'cover',
position: 'centre', withoutEnlargement: true }).webp({ quality: 82, effort: 6 })`,
without metadata retention. Inputs were checked against the research catalog
hashes before conversion. No image was redrawn or composited into invented
gameplay. The emblem and label overlays are application presentation.

## Placement and editorial precedence

- Published CMS covers always win over these defaults. A draft/private cover
  never becomes public through the fallback or sharing route.
- Manual category cards still appear only when the category has published
  articles in the requested game and language. Aliases map the existing six CMS
  category keys to the artwork; new categories are not seeded by this change.
- Manual list/search article cards use the corresponding category illustration
  only when the article has no cover. Unknown categories remain text-only.
- Only HLL news gets HLL scenery. Wardogs keeps its presskit treatment; shared
  community posts remain neutral.
- Sharing uses the existing 1200 × 630 server-rendered template with HLL khaki,
  slate, local artwork and localized news/fixture/result labels. Published entity
  game scope overrides query parameters. Generic game landing/list metadata
  carries `game=hll` or `game=wardogs`; shared pages stay neutral. Version `v=3`
  (graphics pack backgrounds and map briefing) invalidates earlier template URLs.
  Match results are never fabricated.

## Background behavior

One fixed scene fills the viewport with `object-fit: cover`. A left-side scrim
protects the menu; content pages use a stronger veil and pause the video. The
persistent HLL shell retains the selected clip, element and playback time while
navigating within HLL. Language/history handoff and fresh-opening selection use
the existing reviewed clip-set contract. A fresh opening may select the same clip.

The controls are real localized buttons outside the decorative scene. Mobile,
reduced motion, Save-Data and slow-connection defaults keep the poster and make
no video request until allowed by the existing motion policy. Direct entry to a
reading page never attaches a video source. Playback rejection, failed media and
failed configured posters fall back to the shipped still. Empty configuration
shows no unusable video controls.

## Footage handover and recommended encoding

Send the original match recording or a stable download link. A whole match is
acceptable input. Prefer spectator/cinematic footage without HUD, chat, stream
overlays or abrupt cuts. Do not first convert to AVI or reduce the source quality.
Retain the source provenance and permission to use the clan recording.

Recommended background selection: **60–120 seconds**, with up to **180 seconds**
when useful. This is a delivery target, not a browser duration limit. Longer clips
are technically supported, but increase transfer and offer little benefit when
visitors quickly open a content page. Selection/trimming must follow the owner's
choice; the existing Wardogs full-timeline requirement remains unchanged.

| Input/output | Recommendation |
|---|---|
| Source | Original 1080p or 1440p, 30–60 FPS; retain higher-quality source if available |
| Desktop | 1920 × 1080, 30 FPS, MP4/H.264 fallback; WebM/VP9 where useful |
| Compact | 1280 × 720 or smaller after real-device review, 24–30 FPS |
| Audio | Remove completely from background renditions; do not autoplay match comms |
| Size target | About 15–40 MB for a 1–2 minute desktop candidate; measure motion/quality, not a hard cap |
| Poster | One representative optimized WebP still, readable under the menu scrim |
| Delivery | Versioned read-only media outside Git; correct MIME, byte ranges, cache headers and MP4 faststart |

Mobile uses its poster first. Browsers generally permit muted/no-audio autoplay,
but rejection must still be handled: [MDN autoplay guidance](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).

Use `HLL_BACKGROUND_CLIPS_JSON` as specified in
[`media.ts`](../../apps/web/src/modules/hll/media.ts). Each enabled entry needs an
ID, provenance, rights record, real duration/byte sizes, poster and desktop/compact
renditions. Never enter estimated byte counts into production configuration.
Inspect every selected clip and test complete playback, seeking, reload selection,
fallback, pause, mobile and reduced motion before enabling the actual recording.

## Verification and release

See [delivery evidence](../evidence/hll-graphics-2026-09-28/README.md) for exact
checks and inspected captures. This change has no database migration or credential
requirement. Existing HLL media configuration remains compatible. Deployment is a
separate owned operation; an open graphics PR does not change production.
