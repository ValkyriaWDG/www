# Background video delivery

Status: the full available AVI timeline has been encoded and passed complete decoding
and native Chromium playback checks. Follow the
[full-length delivery](background-media-full-2026-09-26.md) for source-index findings,
measured results and verified draft transfer. The previous 15-second edited candidate
is superseded; its proof does not validate the full-length files. Claude Cloud session
access, application integration and production media hosting remain untested.

## Delivery contract

Deliver the full available cinematic timeline as browser media, plus a still poster
from the same source. Preserve its normal-speed chronological sequence without trim,
time limit, fades, reversal or artificial loop edits. Keep the VALKYRIA logo, vignette,
menu and subpage blur in the web UI so they remain responsive and accessible.

| Artifact | Proposed baseline | Initial budget |
| --- | --- | --- |
| Primary video | MP4 / H.264, `yuv420p`, no audio, width up to 1920 px, up to 30 fps | Full available timeline; approximately 60 MiB for this source |
| Optional alternate | WebM / VP9, same framing and duration, no audio | Prefer smaller than MP4; omit if it adds delivery complexity without a measurable benefit |
| Poster | WebP with JPEG fallback if required by the final support matrix | Up to 1920 px, target under 250 KiB |
| Compact rendition | Optional 1280 px derivative, same full duration, no audio | Prefer smaller than primary; mobile defaults to poster rather than video |

Budgets are targets, not verified measurements or duration limits. Preserve source
aspect ratio and full available duration. Do not upscale small footage or publish a
4K original merely because it is available. Optimize encoding or resolution when
needed and report the measured tradeoff; never shorten the footage to meet a budget.

The ambient footage has no informational content: no audio, captions or transcripts are required for this decorative layer. Meaningful video content elsewhere needs its own accessible presentation. Do not reuse game music or sound effects as interface feedback.

## Local preparation and source integrity

Work outside Git using `incoming/` and `staging/` directories created for the media
conversion. The commands below preserve the actual full-delivery encoder arguments;
only input/output paths are normalized for portability. They ran with FFmpeg
`9.0.2-essentials_build-www.gyan.dev`; the tool package digest is in the
[manifest](../../assets/background-media.json). Keep original files unchanged.
Use a trusted build with the required encoders and preserve its version in new proof.

1. Record source SHA-256, size and modification time before/after reading. Stable size
   does not prove a completed export. This AVI has unfinished index fields; preserve
   the original and document the physical-frame inventory and recovery limitations.
2. Inspect the available source from beginning to end and record metadata. Do not
   select a short segment or claim the installed Bink is the exact source without
   matching evidence. Record source defects and the natural wrap transition honestly.

```sh
ffprobe -v error -show_format -show_streams -of json incoming/background.avi
```

3. Encode the complete available input. For this source, `-fflags +ignidx` bypasses
   the unfinished AVI index. There is deliberately no `-ss`, `-t` or trim/fade filter.
   If a different source is below 30 fps, preserve its frame rate instead of using
   `fps=30`. The following is the actual primary conversion, with portable paths.

```sh
ffmpeg -hide_banner -n -xerror -fflags +ignidx -i incoming/background.avi -map 0:v:0 -an -sn -dn -map_metadata -1 -map_chapters -1 -vf "fps=30,scale=1920:-2:flags=lanczos:out_color_matrix=bt709:out_range=tv,setsar=1,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709" -c:v libx264 -preset slow -crf 23 -maxrate 4M -bufsize 8M -profile:v high -level:v 4.0 -refs 4 -threads 6 -pix_fmt yuv420p -movflags +faststart -brand mp42 staging/full-1080.mp4
```

This recipe re-encodes rather than renaming the AVI, explicitly excludes audio and other streams, and strips inherited container metadata. MP4 `faststart` places indexing information near the beginning of the file. See [FFmpeg command options](https://ffmpeg.org/ffmpeg.html), [H.264 encoder options](https://ffmpeg.org/ffmpeg-codecs.html#libx264_002c-libx264rgb) and [MP4 muxer options](https://ffmpeg.org/ffmpeg-formats.html#mov_002c-mp4_002c-ismv).

4. Encode the compact MP4 and WebM in one second read of the same full original.
   The shared uncompressed 1080p filter output feeds VP9 and a further 720p scale;
   neither video is transcoded from a lossy encoded rendition. This is the actual
   alternate conversion with portable paths, including explicit BT.709 conversion
   and tags. Compare all outputs' duration, quality, size and supported-browser playback.

```sh
ffmpeg -hide_banner -loglevel verbose -n -xerror -fflags +ignidx -i incoming/background.avi -filter_complex_threads 4 -filter_complex "[0:v]fps=30,scale=1920:-2:flags=lanczos:out_color_matrix=bt709:out_range=tv,setsar=1,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709,split=2[webm][compact];[compact]scale=1280:720:flags=lanczos[small]" -map "[webm]" -an -sn -dn -map_metadata -1 -map_chapters -1 -c:v libvpx-vp9 -crf 32 -b:v 0 -row-mt 1 -cpu-used 4 -threads 6 -pix_fmt yuv420p staging/full-1080.webm -map "[small]" -an -sn -dn -map_metadata -1 -map_chapters -1 -c:v libx264 -preset slow -crf 24 -maxrate 2M -bufsize 4M -profile:v high -level:v 3.1 -refs 4 -threads 4 -pix_fmt yuv420p -movflags +faststart -brand mp42 staging/full-720.mp4
```

Encoder availability and options depend on the installed build; consult [FFmpeg's libvpx documentation](https://ffmpeg.org/ffmpeg-codecs.html#libvpx). A constant-quality setting does not guarantee the size budget.

5. Export the poster from the primary at 2.0 seconds (frame 60), using the actual
   invocation below with portable paths.

```sh
ffmpeg -hide_banner -n -ss 2 -i staging/full-1080.mp4 -frames:v 1 -an -map_metadata -1 -c:v libwebp -quality 80 -update 1 staging/poster-2s.webp
```

6. Independently decode every complete output and verify zero audio streams,
   dimensions, duration, frame count, codec, pixel format, size and fingerprints.
   Test real playback plus middle/near-end seeks for every rendition. The default
   browser acceptance includes one uninterrupted natural primary-video loop at rate 1;
   optional three-loop testing is claimed only if executed. Follow the detailed
   [full-length acceptance plan](background-media-full-2026-09-26.md). Do not declare
   validation from an encoder exit status or from the old short-clip evidence.

For each final video, the complete decode check is `ffmpeg -v error -xerror -i FILE
-f null NUL` on Windows (`/dev/null` instead of `NUL` on Linux). Record exit status
and errors. Final hash-based filenames are assigned only after encoding and validation;
use the manifest to map the portable staging names to delivered files. Encoder/build
differences may change bytes, so never reuse an old digest for a newly encoded file.

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
