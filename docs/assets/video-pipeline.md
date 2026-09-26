# Background video delivery

Status: the owner's AVI has now been encoded and verified locally. Use the
[2026-09-26 delivery](background-media-2026-09-26.md) and
[external manifest](../../assets/background-media.json) for the actual 1080p/720p
MP4, 1080p WebM, poster and source-index findings. This page remains the general
pipeline. Cloud application integration and production media hosting are separate.

## Delivery contract

Deliver one approved cinematic loop as browser media, plus a still poster from the same approved source. Keep the VALKYRIA logo, vignette, menu and subpage blur in the web UI so they remain responsive and accessible.

| Artifact | Proposed baseline | Initial budget |
| --- | --- | --- |
| Primary loop | MP4 / H.264, `yuv420p`, no audio, width up to 1920 px, up to 30 fps | 10–20 seconds, preferably under 8 MiB; hard review threshold 12 MiB |
| Optional alternate | WebM / VP9, same framing and duration, no audio | Prefer smaller than MP4; omit if it adds delivery complexity without a measurable benefit |
| Poster | WebP with JPEG fallback if required by the final support matrix | Up to 1920 px, target under 250 KiB |
| Compact rendition | Optional 1280 px derivative, no audio | Under 4 MiB; mobile defaults to poster rather than video |

These are project budgets and starting points, not verified measurements or guarantees. Preserve source aspect ratio. Do not upscale small footage or publish a 4K original merely because it is available. If the loop cannot meet the budget at acceptable quality, shorten the segment or reduce its resolution and frame rate.

The ambient footage has no informational content: no audio, captions or transcripts are required for this decorative layer. Meaningful video content elsewhere needs its own accessible presentation. Do not reuse game music or sound effects as interface feedback.

## Local preparation after the AVI is complete

Work outside Git using `incoming/` and `staging/` directories created for the media conversion. The example paths below are illustrative and are not existing repository assets. Keep original files unchanged. Use a trusted FFmpeg build with the required encoders; inspect available encoders before running a recipe.

1. Confirm the AVI export has completed and its size is stable. Preview it to identify the correct menu scene and a calm, seamless segment without logos, UI, black frames or transitions.
2. Inspect the completed source. Record the stream metadata and select start/duration deliberately. The sample recipes use the first 15 seconds only as an example; they do not establish a seamless loop.

```sh
ffprobe -v error -show_format -show_streams -of json incoming/background.avi
```

3. Encode the MP4. Adjust `-ss` and `-t` to the chosen segment. If the source is below 30 fps, keep its frame rate instead of using `fps=30`.

```sh
ffmpeg -n -ss 0 -i incoming/background.avi -t 15 -map 0:v:0 -an -sn -dn -map_metadata -1 -map_chapters -1 -vf "fps=30,scale='min(1920,iw)':-2,setsar=1" -c:v libx264 -preset slow -crf 24 -maxrate 4M -bufsize 8M -pix_fmt yuv420p -movflags +faststart staging/wardogs-menu.mp4
```

This recipe re-encodes rather than renaming the AVI, explicitly excludes audio and other streams, and strips inherited container metadata. MP4 `faststart` places indexing information near the beginning of the file. See [FFmpeg command options](https://ffmpeg.org/ffmpeg.html), [H.264 encoder options](https://ffmpeg.org/ffmpeg-codecs.html#libx264_002c-libx264rgb) and [MP4 muxer options](https://ffmpeg.org/ffmpeg-formats.html#mov_002c-mp4_002c-ismv).

4. Optionally encode WebM directly from the same original segment, then compare quality, size and playback on the supported browsers.

```sh
ffmpeg -n -ss 0 -i incoming/background.avi -t 15 -map 0:v:0 -an -sn -dn -map_metadata -1 -map_chapters -1 -vf "fps=30,scale='min(1920,iw)':-2,setsar=1" -c:v libvpx-vp9 -crf 33 -b:v 0 -row-mt 1 -pix_fmt yuv420p staging/wardogs-menu.webm
```

Encoder availability and options depend on the installed build; consult [FFmpeg's libvpx documentation](https://ffmpeg.org/ffmpeg-codecs.html#libvpx). A constant-quality setting does not guarantee the size budget.

5. Export a representative poster from the approved final clip. Select the timestamp after reviewing the footage.

```sh
ffmpeg -n -ss 2 -i staging/wardogs-menu.mp4 -frames:v 1 -map_metadata -1 -c:v libwebp -quality 78 -update 1 staging/wardogs-menu-poster.webp
```

6. Run `ffprobe` on both delivered videos and verify zero audio streams, dimensions, duration, codec, pixel format and size. Play at least three loops to inspect the seam. Record SHA-256 values, FFmpeg version and exact conversion commands. Do not declare the conversion validated from process exit status alone.

## Cloud handoff and storage

Deliver approved derivatives through a maintainer-provided artifact location available to the cloud agent. A private attachment or expiring signed URL is a delivery channel, not the permanent public runtime URL; do not commit credentials or signed URLs. The cloud agent must report absent assets and continue against the fallback.

Use an approved static-media origin or a read-only deployment media mount; do not commit MP4/WebM files into this repository. Raw AVI/Bink files and game archives are never application dependencies. Do not create paid storage as part of this handoff. Record permanent URLs or mount locations and response requirements in deployment configuration; use HTTPS and the correct `video/mp4`, `video/webm` or `image/webp` content type.

Name finalized artifacts with a content hash, update their manifest together, and serve them with long-lived immutable caching. Support byte-range requests for video. The app image or an external host must actually include every declared asset. Avoid a runtime URL that only works on the maintainer's PC, relies on a developer login, or points to an expiring download.

The manifest must distinguish pending candidates from approved production assets. Record source and derivative SHA-256, rights/provenance reference, byte size, duration, width, height, frame rate, codec, audio-track count, poster relation and storage location. A filename or screenshot alone is not proof of the footage's identity or usage status.

## Browser behavior requirements

- Render the poster and a readable dark overlay immediately; content and navigation must not wait for decoding. Use `100dvh` where suitable and `object-fit: cover`; keep the scene's useful center away from the primary menu.
- A single persistent video element belongs to the application shell. Route changes must not create overlapping players or restart the download.
- Only attach video sources when animation is enabled. Use muted inline playback and looping. Handle a rejected `play()` promise and media errors by retaining the poster. Browser autoplay policies still apply. See the [HTML video reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video).
- Provide a visible keyboard-accessible “Pause background” / “Play background” control with its current state. Persist the preference locally. Do not force fullscreen or autoplay sound.
- With `prefers-reduced-motion: reduce`, render only the poster until the visitor explicitly opts in. Respond to preference changes during the session. The browser exposes this preference through a [CSS media feature](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion).
- On mobile, save-data connections where detectable, and slow connections where detectable, start with the poster and offer an explicit opt-in. Feature-detect connection APIs; their absence must not cause an error.
- Pause when the document is hidden. Resume only when the page is visible and user/device preferences still permit motion. Pause the video behind dense subpages if performance requires it; preserve the same scene and apply the specified overlay/blur.
- `preload="none"` is a hint, not a substitute for withholding source URLs. Tests must confirm zero video requests in poster-only states. Do not preload both formats or multiple sizes.
- The video is decorative: `aria-hidden="true"`, no focus target and no pointer interactions. The pause control remains accessible outside the hidden layer. Use a still frame in visual regression tests so screenshots are deterministic.

## Acceptance evidence

The implementation PR must show desktop and narrow-screen captures; demonstrate video success, rejected autoplay, missing video, reduced motion, hidden-tab pause and manual pause; and report transfer size plus main-thread/decode behavior on a midrange device profile. Check that text remains readable on both the brightest and darkest frames. Document which checks used real delivered media and which used the fallback. A missing production clip is an explicit outstanding asset task, never a reason to fabricate a delivered file or claim end-to-end video verification.
