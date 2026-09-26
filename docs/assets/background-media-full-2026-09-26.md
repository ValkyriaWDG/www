# Full-length Wardogs background media — 2026-09-26

The owner requires the **entire available AVI timeline**. This delivery replaces the
[15-second edited candidate](background-media-2026-09-26.md), which was rejected for
being shortened. Its files and proof remain historical; they do not verify this delivery.

Status: all three full-length renditions passed complete decoding and native Chromium
playback checks. Sequential source decoding recovered all 11,547 complete video frames
with zero decode errors. The ZIP is uploaded to a GitHub draft and its authenticated
download matches the recorded digest. Access from a Claude Cloud session, application
integration and production hosting remain untested.

## Source and editing contract

The owner-supplied `UI_frontendvideo_v_4K.avi` is 287,362,713,428 bytes, raw BGR24,
3840 × 2160 at 60 fps, with PCM audio. Its SHA-256 is
`7778762d9660aa89b3ee85fc0182661dc7e315572c1faf90d98bf3f611fab1f7`.
The original file remains unchanged and outside Git.

The AVI has unfinished duration/index fields: ordinary ffprobe metadata reports
0.866667 seconds, while a physical RIFF inventory found **11,547 complete video
chunks, equivalent to 192.45 seconds at 60 fps**. Reading with FFmpeg's `+ignidx`
input flag allowed sequential conversion of the available timeline. The native
decoder log reports 11,547 video packets read, 11,547 frames decoded and zero decode
errors, matching the independent physical inventory. Full-length here means the
timeline covered by all available complete video frames in this AVI; it does not
prove that an upstream export finished correctly or that missing data can be recovered.

The installed `UI_frontendvideo_v4_4K.bk2` has a header duration of approximately
180.1667 seconds. That does not match this AVI's available timeline. The AVI's exact
Bink source is unconfirmed; do not claim the v4 Bink and AVI are identical sources.

All renditions must be encoded directly from the original AVI. Preserve chronological
playback from its first available frame to its last available frame, at normal speed.
No trimming, time limit, shortened highlight, fade/crossfade, reversal or artificial
loop edit is authorized. Remove audio, reduce resolution/frame rate for web delivery,
and strip inherited metadata; keep menus, blur, vignette and clan crest in the app.
The natural end-to-start discontinuity must be inspected and reported without editing
it away. Do not silently shorten the footage to satisfy a transfer budget.

## Renditions and budget

| File | Dimensions | Bytes / MiB | Duration / encoding |
|---|---|---|---|
| `wardogs-menu-full-1080p-619b27261fc9.mp4` | 1920 × 1080 | 51,032,923 / 48.67 | 192.466016 s; H.264 High 4.0, faststart |
| `wardogs-menu-full-720p-040c3de21de3.mp4` | 1280 × 720 | 13,654,192 / 13.02 | 192.466016 s; H.264 High 3.1, faststart |
| `wardogs-menu-full-1080p-b7aa9380dd06.webm` | 1920 × 1080 | 19,561,104 / 18.65 | 192.466 s; VP9 |
| `wardogs-menu-full-poster-f31f6824f259.webp` | 1920 × 1080 | 181,198 / 0.17 | WebP; primary time 2.0 s / frame 60 |

Every video contains **5,774 frames at 30 fps**, YUV420P and zero audio streams.
Full SHA-256 values:

```text
619b27261fc903b26fcef14ee42a1a7bbd58953140568e1803f7a6c25f26455b  wardogs-menu-full-1080p-619b27261fc9.mp4
040c3de21de316f2360aa6fdc50ca67ea32e621bce17599e2942acb6ede41b4e  wardogs-menu-full-720p-040c3de21de3.mp4
b7aa9380dd06f3d7e638bb9d45a63ef646a9517ea8dd0a4b1abb6b0206b0a309  wardogs-menu-full-1080p-b7aa9380dd06.webm
f31f6824f25971d4e70660b4e6834e533af1e13f8a458c4e6fd4b577abd3ce8c  wardogs-menu-full-poster-f31f6824f259.webp
```

The 30 fps output rounds the 11,547-frame, 60 fps source up by half an output frame
(approximately 0.016667 seconds): nominal frame duration is 192.466667 seconds,
with less than one millisecond of container rounding. This is not a time edit.
The [external manifest](../../assets/background-media.json) is the canonical file
inventory. Full frame counting confirmed the output metadata, and atom inspection
confirmed `moov` before `mdat` in both MP4s. Complete `ffmpeg -v error -xerror -i FILE
-f null NUL` decoding passed for all three videos. These checks and the successful
source decode are recorded separately from the native browser playback evidence below.

The primary's first and last images were visually inspected: the same fixed camera
is retained, with natural lighting/particle differences at the wrap and no artificial
dissolve. Comparison of its final frame with the last complete raw source frame,
downscaled to 1920 pixels using the same processing with normalized single-frame
time bases and timestamps, measured SSIM 0.982111. This
supports recovery of the available tail; it does not establish a seamless loop or
replace full-file decode/playback verification. Final output color tags are BT.709
matrix, primaries and transfer with limited (`tv`) range.

The primary transfer budget is **approximately 60 MiB for the full timeline**.
Prefer a smaller compact/alternate rendition without removing time. Keep the poster
under 250 KiB where practical. The earlier 8–12 MiB and 12–30-second loop targets
are superseded. Poster-first mobile, reduced-motion and save-data behavior remain
required; load one chosen rendition only, with HTTP byte ranges and immutable caching.

## Reproduce conversion

The [video pipeline](video-pipeline.md#local-preparation-and-source-integrity) records
the actual primary and combined alternate encoder commands with portable paths.
The tool was FFmpeg `9.0.2-essentials_build-www.gyan.dev`. Primary H.264 uses slow/
CRF 23/High 4.0, while compact H.264 uses slow/CRF 24/High 3.1 and VP9 uses CRF 32.
Both MP4s use four reference frames and faststart. The alternate pass decodes the
original AVI once and splits a shared uncompressed 1080p filter output into WebM
and the further-downscaled 720p branch; it never reads the encoded primary MP4.
The poster alone is extracted from primary frame 60 at WebP quality 80. Keep all
processing outside Git and verify newly encoded bytes independently before assigning
their filenames.

## Package and cloud handoff

The package is `valkyria-background-media-full-2026-09-26.zip`, **84,333,534 bytes**.
Its SHA-256 is
`bea4f8426482da1a284ea8d34df9e0aba4c7b211135b9de156d6c9e848c34f17`.
It is uploaded as asset `590796329` under draft release name/tag
`media-background-full-2026-09-26`. GitHub's asset digest and the independently hashed
authenticated download match. No public Git tag or published release was created.
The [delivery record](../../assets/background-media-delivery.json) identifies the
transfer channel; access from the actual Claude Cloud session has not been tested.

Use the [integration handoff](../handoff/background-media-integration.md) with the
existing app adapter and current application branch. Verify that the delivery record
and manifest describe this full-length package, not the superseded short package,
before download/extraction or configuration. Keep media binaries outside Git. A draft
release transfers files; it is not the public runtime origin or production deployment.

## Measured browser results

The [native-browser report](../evidence/background-media-full-2026-09-26/media-qa.json)
passed in **Chromium 153.0.8010.12** on Windows against actual local HTTP media bytes.
All three renditions passed playback/time/frame advancement, pause/resume and middle/
near-end seeking with no media or page errors. Fingerprints remained stable throughout.
The primary completed **one uninterrupted natural wrap at rate 1 in 192.5042 seconds**,
with zero dropped frames during that measured loop. No three-loop run is claimed.

The actual [desktop](../evidence/background-media-full-2026-09-26/media-qa-1920x1080.png)
and [narrow-screen](../evidence/background-media-full-2026-09-26/media-qa-390x844.png)
captures show the primary and compact videos respectively, paused after approximately
three seconds of playback. Their separate capture states each recorded three dropped
frames; that observation is distinct from the zero-drop full-loop measurement. These
are standalone media QA captures, not website integration or mobile website UX proof.

## Full-length acceptance plan

The [evidence index](../evidence/background-media-full-2026-09-26/README.md) provides
reproduction steps and the limits of the completed checks. Measured results are recorded in
[core validation](../evidence/background-media-full-2026-09-26/core-validation.json)
and the [source decode record](../evidence/background-media-full-2026-09-26/source-decode.json).
The [timeline contact sheet](../evidence/background-media-full-2026-09-26/timeline-contact.jpg)
shows sampled full-length frames; it does not replace uninterrupted playback evidence.

Record evidence for this package under a distinct full-length evidence directory.
Include the manifest and harness hashes, exact commands, tool/browser versions,
expected/observed results and tested filenames. Do not reuse the short candidate's
450-frame decode, three-loop result or screenshots as proof of this timeline.

1. Verify source and all final derivative fingerprints. Check dimensions, frame rate,
   duration, frame count, pixel format and zero audio streams; independently decode
   every output from beginning to EOF. Confirm both MP4s have `moov` before `mdat`.
2. Inspect representative beginning, middle and near-end frames from the new outputs.
   Check scene continuity, framing and any source defects, including the true final
   available frames. Report the actual end-to-start transition without claiming a
   seamless source or introducing a fade.
3. Serve actual bytes with correct MIME types and byte-range responses. For every
   rendition, test native playback and increasing `currentTime`/decoded-frame counters,
   pause/resume, successful middle and near-end seeks, and absence of media errors.
   Never mock `HTMLMediaElement.play` or replace real media responses.
4. By default, play the primary MP4 at rate 1 from the beginning through **one complete
   uninterrupted natural loop wrap**. Record elapsed time, loop count, decoded/dropped
   frames and errors. Seeks are separate checks and cannot count as this loop. An
   optional `--loops 3` run is additional evidence only when actually executed.
5. Capture real desktop and narrow-screen media-viewer screenshots with exact file
   identity, timestamp and viewport. Label them standalone media QA. Confirm before/
   after fingerprints so an encode changing during a run cannot produce accepted proof.
6. The cloud app independently verifies overlays/readability, reduced motion,
   poster-only zero-request states, autoplay failure, manual/hidden-tab pause and one
   persistent player across routes. Report Safari/iOS, Firefox and production HTTP
   delivery as untested unless corresponding evidence exists.

Full-length media decoding and the measured Chromium checks above passed. Claude Cloud
session access, actual application integration, Safari/iOS, Firefox and production
hosting remain untested. Update those statuses only with corresponding evidence.
