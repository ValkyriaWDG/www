# Wardogs January 2026 presskit

Seven selected originals are available in
[`assets/presskit/wardogs-january-2026/`](../../assets/presskit/wardogs-january-2026/catalog.json).
The image bytes are unchanged; repository filenames are normalized. The
[catalog](../../assets/presskit/wardogs-january-2026/catalog.json) records source
mapping, dimensions, sizes, hashes and provenance. The repository
[asset manifest](../../assets/manifest.json) provides the integrity inventory.
The full [26-file source inventory](presskit-inventory.json) remains separate from
this seven-file selection; the January label names the package, not the creation
date of every included file.

Open the [offline asset gallery](presskit-preview.html) in a browser from a local
checkout. It loads only committed files, uses system fonts and requires no server,
package installation or network connection. The gallery is an asset review, not
the website or evidence that application integration is complete.

## Intended use

| Original | Appropriate placement | Presentation and limits |
| --- | --- | --- |
| `key-art-1080p.png` | News announcement or introduction to Wardogs | Preserve the complete composition and large baked-in wordmark with `contain`; do not crop letters or add another game wordmark over it. |
| `flying.jpg` | Recruitment illustration, community banner or related news | Preserve the helicopter and rotors above the valley, toward the upper center-right. Review any cover crop at narrow widths. It does not depict a verified Valkyria operation. |
| `foundry.jpg` | Editorial illustration for Wardogs news or a game overview | Retain the soldier at the left and enough industrial interior to explain the scene. Do not invent an official map name from the filename. |
| `tank.jpg` | Match announcement or training article illustration | Preserve the soldier assisting a teammate in the foreground and the tank on the right. Identify it as illustrative game media, not proof of a clan match, result, roster or training session. |
| `fullmark-white.svg` | Small game identifier on a dark surface | Preserve the whole mark, intrinsic ratio and clear surrounding space. |
| `fullmark-black.svg` | Small game identifier on a light surface | Use the provided black variant, without a CSS recolor filter. |
| `fullmark-full.svg` | Game identifier with the supplied amber accent | Use on a dark surface: the main lettering is white. The gallery's light sample exposes its low contrast; use `fullmark-black.svg` on light surfaces. |

The Wardogs marks identify the game. The supplied
[Valkyria crest](../../assets/brand/valkyria-logo.png) remains the clan identity,
including the faded center emblem. Presskit artwork does not replace the cinematic
background contract, member portraits or authentic match/result evidence. Do not
turn visible characters, equipment or scene details into fictional clan records.

## Runtime composition

- Keep all seven source files unchanged. Application optimization may create
  separately tracked derivatives or responsive image responses; preserve source
  attribution and record any transformation. This delivery creates no derivatives.
- Use the catalog dimensions for intrinsic image sizing. Do not stretch an image
  to fill an unrelated ratio. A news cover and its full article image may use
  different presentation rules while sharing the same original.
- Start key art and all logos with `object-fit: contain; object-position: 50% 50%`.
  Use a quiet backing surface for any letterboxing. Key art's existing wordmark
  must remain fully visible at both viewport sizes.
- For photographic/editorial covers, begin with `object-fit: cover` in a 16:9
  container and inspect the crop. Store an explicit focal position if needed;
  `50% 50%` is a starting point, not an approved crop. Avoid ultra-wide cropping
  when it removes the subject. Prefer the complete image on narrow screens.
- Put headings and controls in a readable adjacent panel. If a design places text
  over an image, measure contrast against the actual crop and add a scrim; do not
  assume that every frame or scene has the same contrast.
- Use appropriately sized responsive output in the application rather than making
  every mobile visitor download the largest original. Preserve aspect ratio and
  load below-the-fold images lazily. The review gallery intentionally uses originals.
- Keep SVG originals external through an image component unless separately
  reviewed for inline use. Use the supplied variant rather than rewriting paths,
  recoloring the mark or changing its letter spacing.

## Czech and English descriptions

Use the catalog's localized alt-text suggestions as starting points, then adapt
them to the actual placement and crop. Describe visible content rather than
claiming a Valkyria event. Keep visible explanatory captions in the active locale.
Where a logo's adjacent text already says “Wardogs”, use empty alt text to avoid
repetition. A linked image needs an accessible destination name; a decorative
background uses empty alt text and must not carry information available nowhere else.

## Provenance and acceptance

The selection comes from the supplied January 2026 Wardogs presskit. No license
file or separate usage grant was found in the supplied source package. The
catalog's source records and [NOTICE](../../NOTICE.md) distinguish these third-party
assets from the repository's Apache-2.0 code/documentation license. Their inclusion
does not claim publisher endorsement or a general redistribution license.
The official presskit page links an archive with the matching package name; the
remote archive was not downloaded for byte comparison with the supplied directory.

Before calling application integration complete, verify the selected source hash,
responsive crop, intrinsic ratio, loading behavior and Czech/English alt/caption
context in the actual application. Capture desktop and narrow layouts with clear
captions under the [evidence policy](../engineering/evidence.md). Gallery rendering
proves only that the committed source files can be reviewed offline. See the
[captured review and reproducible checks](evidence/presskit-2026-01/README.md).

## Application placements (1.0.0)

| Original | Placement | Presentation |
| --- | --- | --- |
| `key-art-1080p.png` | Clan page, above the story | 16:9 frame, `contain`, WebP 960/1920 |
| `flying.jpg` | Community page, after the Discord / how-to-join choices | Complete 16:9 frame, WebP 800/1600 |
| `fullmark-white.svg` | Placeholder of coverless Wardogs news cards and related posts | Byte-identical copy, decorative (the card names the game) |

`apps/web/scripts/build-presskit-derivatives.mjs` regenerates the registered derivatives
in `apps/web/public/presskit/`. Captions state that the artwork is the game's press-kit
media and does not show a Valkyria event. `foundry.jpg`, `tank.jpg` and the other marks
remain available; editors can upload them through the media library for articles.
