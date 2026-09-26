# Cloud background media integration

Integrate the supplied Wardogs menu derivatives into the existing application in PR #19.
This is media delivery and cloud-preview verification, not production deployment or an
application release. The original AVI stays on the owner's computer.

Use the [full-length delivery](../assets/background-media-full-2026-09-26.md). The owner
rejected the earlier 15-second edited loop: every rendition must preserve the entire
available approximately 192.45-second source timeline, with frame-rate/container
rounding recorded in its manifest. No trimming, fades, reversal, time limit or shorter
substitute is permitted. Read the new report's current verification status before use.

## Receive and verify the bundle

1. Obtain the supplied ZIP and manifest through the delivery channel recorded in the
   handoff. A local ZIP path is not cloud access. Draft release assets may require an
   authenticated GitHub client; do not assume anonymous download or invent a public URL.
   If delivery is inaccessible, report that dependency and continue unrelated app work.
   The exact ZIP digest and draft asset are in
   [the delivery record](../../assets/background-media-delivery.json). With suitable
   repository authentication, run:

   ```sh
   gh release download media-background-full-2026-09-26 --repo ValkyriaWDG/www --pattern valkyria-background-media-full-2026-09-26.zip --dir .local/media-download
   ```
2. Confirm the delivery record and manifest name the full-length package. Its uploaded
   draft asset and authenticated download were verified, but the actual Claude Cloud
   session's access remains untested. Keep that dependency open if download is blocked.
   Verify the ZIP digest when supplied and every derivative's filename, byte size and
   full SHA-256 against the manifest. Read the source/provenance and usage status.
   Use the exact provided names; placeholders in this guide are not real artifact names.
   After unpacking, the repository provides
   `node scripts/media/verify-bundle.mjs <unpacked-bundle-directory>` to compare every
   derivative and the delivered manifest against the committed trust anchor.
3. Inspect archive entries before extraction. Reject absolute paths, parent traversal or
   unexpected files. Extract only the verified web derivatives into
   `apps/web/public/media/background/`, preserving their supplied filenames.
4. Add `apps/web/public/media/background/` to the repository ignore rules before extraction.
   Global MP4/WebM ignores do not cover the poster. Keep all delivered binaries out of
   Git; do not use force-add or Git LFS as a workaround. Keep the source AVI/Bink local.

The external delivery manifest is distinct from `assets/manifest.json`: its existing
`assets[].path` entries are validated as committed local files. Do not insert remote URLs
there as file paths. Link the supplied external manifest from the handoff instead.

## Use the existing adapter

The inspected PR #19 implementation already follows this chain:

`src/lib/site-config.ts` → `src/modules/settings/public.ts` →
`src/lib/background-media.ts` → `src/components/shell/menu-shell.tsx` →
`src/components/shell/background-media.tsx`, all under `apps/web/`.

`getBackgroundMedia()` returns `{ posterUrl, sources, focalPoint }`.
`BackgroundMedia` takes `posterUrl`, `sources: { src, type }[]` and optional `focalPoint`;
source types are `video/mp4` and `video/webm`. The configured order is WebM, then MP4.
The persistent locale layout owns the player. Keep the logo, scrim and vignette as overlays.
Recheck current PR code before editing; do not replace the shell or create a second player.

For a preview served at `http://localhost:3000`, use its real origin and manifest filenames:

```dotenv
BACKGROUND_VIDEO_MP4_URL=http://localhost:3000/media/background/<provided-mp4-filename>
BACKGROUND_VIDEO_WEBM_URL=
BACKGROUND_POSTER_URL=http://localhost:3000/media/background/<provided-poster-filename>
```

Fill WebM only if that verified derivative exists. These server env fields currently
require **absolute HTTP(S) URLs**; `/media/...` alone fails env validation. Do not use
`NEXT_PUBLIC_` aliases. Same-origin preview media works with the existing CSP. An unrelated
HTTP media origin is not added to CSP; do not weaken headers to make a download URL play.

A stored `background.media` setting replaces the entire env background configuration.
Inspect it if valid env values appear ignored. Its shape is
`{ posterUrl, mp4Url, webmUrl, focalX, focalY, provenance }`, with default focus 50/50.
It accepts same-origin absolute paths or allowlisted HTTPS origins. Changes require
`settings.manage`; `BACKGROUND_MEDIA_ALLOWED_ORIGINS` controls external admin origins and
CSP. Use the supported settings flow, not an unreviewed database update. Env changes need
a preview restart because the parsed server environment is cached.

## Verify actual media separately from fallback tests

`apps/web/playwright.config.ts` currently sets the MP4 URL to the deliberately missing
`/e2e-missing/background-loop.mp4`. `e2e/shell.spec.ts` intercepts that path and some tests
simulate playback. Preserve those deterministic checks; their pass is not delivered-video
decoding or visual fidelity evidence. Add a separate controlled test/preview using the
verified full-length video and poster without overriding `HTMLMediaElement.play`.
The short candidate's browser evidence cannot satisfy these checks.

- Confirm actual bytes decode, `currentTime` advances and the expected scene is visible.
  Inspect metadata for dimensions, duration, frame rate, pixel format and zero audio tracks.
- For every rendition, verify middle and near-end seeks against the actual full file.
  Separately play the primary MP4 from the beginning through one uninterrupted natural
  loop wrap at rate 1. Record elapsed time, decoded/dropped frames and errors; seeking
  cannot count as this loop. Optional `--loops 3` testing is reported only if executed.
  Inspect bright/dark frame readability, unchanged aspect ratio and the natural wrap;
  report any discontinuity without editing it away.
- Verify poster display, failed/rejected playback, manual pause persistence, hidden-tab
  pause and one player retained across public route navigation. Admin routes stay static.
- In reduced-motion, save-data and the applicable mobile default state, assert **zero video
  requests before explicit opt-in**. `preload="none"` alone does not prove this.
- Capture Czech/English desktop and narrow-screen evidence with tested SHA, browser,
  viewport and exact media digest/state. Use a fixed poster/frame for deterministic visual
  comparisons; distinguish those captures from the actual playback check.

## Keep production delivery independent

An authenticated draft release or ZIP attachment is a transfer channel, not the public
runtime origin. Do not publish a tag/release, expose a new server or deploy merely to make
the clip reachable. No anonymous download, final domain hosting or production approval is
implied by receipt. Report cloud accessibility and preview verification separately.

Later production delivery needs an approved static origin or read-only media mount with
HTTPS, correct MIME types, video byte ranges and immutable caching for hash-named files.
Every configured file must actually be present there. Do not point runtime configuration
at an expiring/signed download, owner-local path or unverified GitHub redirect. Keep the
poster/CSS fallback functional until that independent delivery is accepted.
