# Background media operations

The persistent menu scene plays one decorative, silent loop behind the shell. The clan
emblem, scrim and vignette are separate overlays; they are never part of the media.

## Configuration

| Source | Values | Notes |
|---|---|---|
| Runtime environment (server-only) | `BACKGROUND_POSTER_URL`, `BACKGROUND_VIDEO_WEBM_URL`, `BACKGROUND_VIDEO_MP4_URL` | Absolute HTTP(S) URLs; parsed once per process, so restart after a change |
| `background.media` site setting | `posterUrl`, `webmUrl`, `mp4Url`, `focalX`, `focalY`, `provenance` | Requires `settings.manage`; same-origin absolute paths or origins listed in `BACKGROUND_MEDIA_ALLOWED_ORIGINS` (also added to the CSP). **Replaces the whole environment configuration** |

Sources are offered WebM (VP9) first, then MP4 (H.264). Without a poster or sources the
CSS/SVG scene is shown. Missing, rejected or undecodable media keeps the poster and never
shows an error surface. Reduced motion, Save-Data, slow connections and narrow coarse
pointers start poster-only and attach no video source until the visitor presses Play.

## Delivered derivatives

Delivered binaries are third-party game imagery. They are never committed:
`apps/web/public/media/background/` is ignored by Git and excluded from the Docker build
context. The 2026-09-26 delivery (manifest `assets/background-media.json`, delivery record
`assets/background-media-delivery.json`, both added by ValkyriaWDG/www#20) contains a
1080p WebM, 1080p and 720p MP4 files and a WebP poster, each named with its SHA-256 prefix.

For a local or cloud preview:

1. Obtain the ZIP through the recorded transfer channel and compare its SHA-256.
2. Inspect entries (flat names only), extract into `.local/`, and run
   `node scripts/media/verify-bundle.mjs <extracted-dir>` (also from ValkyriaWDG/www#20) against the
   checked-in manifest.
3. Copy the four derivatives into `apps/web/public/media/background/` unchanged.
4. Configure the preview's own origin, for example
   `BACKGROUND_VIDEO_WEBM_URL=http://localhost:3000/media/background/<webm-file>`, plus the
   MP4 and poster variables, then restart. Next.js serves public files found at start-up.

## Verification

`pnpm build && DATABASE_URL=<disposable postgres> pnpm test:e2e:media` runs
`apps/web/playwright.media.config.ts` against the standalone build and the delivered files.
It fails when a file is missing or its digest differs from its filename. It checks served
bytes, MIME types, byte ranges and caching; decoding, time advancement and three loops;
the poster; one player across public navigation and static admin routes; manual pause,
reload and resume; hidden-tab pause; rejected media; and zero video requests before an
explicit opt-in under reduced motion, Save-Data and mobile defaults. Measurements and
Czech/English screenshots go to ignored `.local/evidence/background-media/`.

The default `pnpm test:e2e` suite deliberately keeps a missing video URL to prove the
fallbacks; it is not evidence of real playback. CI has no media binaries and does not run
the media suite. Playwright's Chromium has no H.264 decoder, so it plays the WebM; check
MP4 playback separately in a browser with H.264 support (Chrome, Safari or Edge).

## Production delivery

Production needs a separately approved delivery: a read-only mount present at container
start (`/app/apps/web/public/media/background`) or an approved HTTPS static origin added to
`BACKGROUND_MEDIA_ALLOWED_ORIGINS`. It must serve every configured file with correct MIME
types and byte ranges. The application marks content-addressed files
(`<name>-<12 hex>.mp4|webm|webp`) as `public, max-age=31536000, immutable`; an external
origin needs the same policy. Never configure draft-release, signed or expiring download
URLs or owner-local paths. Keep the poster/CSS fallback working until delivery is accepted.
