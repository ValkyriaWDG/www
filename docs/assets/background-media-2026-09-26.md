# Wardogs background media delivery — 2026-09-26

> Historical candidate, superseded by the [full-length delivery](background-media-full-2026-09-26.md).
> The owner rejected this shortened 15-second edit. Measurements below describe only
> these old files; they are not proof of the full available AVI timeline.

The owner's AVI has been converted into real web media. The source is unchanged;
the background is the industrial forest/main-menu scene in reference 09, without
game UI or a baked-in clan logo. The archived [manifest](../../assets/history/background-media-short-2026-09-26.json)
records exact filenames, SHA-256, provenance and encoding metadata.

| File | Dimensions | Size | Encoding |
| --- | --- | ---: | --- |
| `wardogs-menu-1080p-557223e28449.mp4` | 1920 × 1080 | 3,957,214 B / 3.77 MiB | H.264 High 4.0, YUV420P, faststart |
| `wardogs-menu-1080p-865e3f2e8b52.webm` | 1920 × 1080 | 1,708,459 B / 1.63 MiB | VP9 Profile 0, YUV420P |
| `wardogs-menu-720p-4976aeadb297.mp4` | 1280 × 720 | 1,068,473 B / 1.02 MiB | H.264 High 3.1, YUV420P, faststart |
| `wardogs-menu-poster-64b3059d7225.webp` | 1920 × 1080 | 182,728 B / 178.45 KiB | WebP, first master frame |

Every video is **15 seconds, 450 frames, 30 fps, with no audio**. WebM is 56.8%
smaller than the primary MP4 and is included as an optional first source. The compact
MP4 is available for an explicit lightweight rendition; mobile still defaults to a
poster under the product policy. No runtime hosting or application integration is
implied by the file preparation.

## Receive the files

The transfer package is `valkyria-background-media-2026-09-26.zip`. It includes the
four derivatives, `manifest.json`, `SHA256SUMS`, a local `preview.html`, preview env
example and a copy-ready Claude prompt. Open the preview and press play to inspect it.
Read the archived [delivery record](../../assets/history/background-media-short-delivery-2026-09-26.json) for its digest
and available transfer channel. A draft asset requires repository write access;
the owner can instead attach the ZIP directly to the cloud task.

The package is deliberately outside Git. Only metadata, instructions and evidence
are committed. Follow [cloud integration](../handoff/background-media-integration.md)
to use the existing application's media adapter; do not replace the shell or use
GitHub download redirects as runtime URLs. Production media storage remains unset.

## Source and loop construction

`UI_frontendvideo_v_4K.avi` is 287,362,713,428 bytes: raw BGR24, 3840 × 2160 at
60 fps with PCM audio. SHA-256 is
`7778762d9660aa89b3ee85fc0182661dc7e315572c1faf90d98bf3f611fab1f7`.
Size and modification time were stable throughout a three-minute streaming hash.

The AVI's duration/index headers disagree: ffprobe reports 0.866667 seconds.
A positional RIFF inspection found 11,547 complete video chunks, equivalent to
192.45 seconds at 60 fps. The final AVIX segment has 152 complete frames but
unfinished length/index fields. This is a physical frame inventory, not a claim
that the whole source was visually reviewed or decoded. The chosen first 16 seconds
were decoded successfully; the output files have valid independent containers.

The loop plays source time 1 through 16 seconds. During its last second, source
15–16 seconds fades into source 0–1 seconds; the next iteration continues at source
time 1. The camera remains fixed and movement is never reversed. A small moving
helicopter also participates in that dissolve; this is an edited ambient loop,
not a claim that the arbitrary original interval was naturally seamless.

The poster comes from frame zero of the same lossless loop master. Menus, blur,
scrim, vignette and the faded Valkyria crest remain application overlays.

## Reproduce encoding

Use FFmpeg/ffprobe 9.0.2 with libx264, libvpx-vp9, libwebp and FFV1. The Windows
package used here came from [Gyan's builds](https://www.gyan.dev/ffmpeg/builds/),
linked by the [official FFmpeg download page](https://ffmpeg.org/download.html).
Its SHA-256 is in the manifest and matched the vendor's checksum. Binaries are not
committed or included in the transfer package.

Run these commands in a separate staging directory. `source.avi` is a read-only
reference to the existing original; do not duplicate the 287 GB file. `-n` prevents
overwriting results. Rename final derivatives using their measured hashes.

```sh
ffmpeg -n -threads 4 -i source.avi -t 16 -map 0:v:0 -an -sn -dn -map_metadata -1 -map_chapters -1 -vf "fps=30,scale=1920:-2:flags=lanczos,setsar=1" -c:v ffv1 -level 3 segment-16s.mkv

ffmpeg -n -threads 4 -i segment-16s.mkv -filter_complex_threads 4 -filter_complex "[0:v]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,settb=AVTB,split=2[mainin][headin];[mainin]trim=start=1:end=16,setpts=PTS-STARTPTS[main];[headin]trim=start=0:end=1,setpts=PTS-STARTPTS[head];[main][head]xfade=transition=fade:duration=1:offset=14,format=yuv420p[out]" -map "[out]" -t 15 -an -sn -dn -map_metadata -1 -map_chapters -1 -c:v ffv1 -level 3 -threads 6 -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv loop-master.mkv

ffmpeg -n -threads 3 -i loop-master.mkv -map 0:v:0 -an -sn -dn -map_metadata -1 -map_chapters -1 -c:v libx264 -preset slow -crf 23 -maxrate 4M -bufsize 8M -profile:v high -level:v 4.0 -refs 4 -pix_fmt yuv420p -movflags +faststart -brand mp42 -threads 4 -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv menu-1080p.mp4

ffmpeg -n -threads 3 -i loop-master.mkv -map 0:v:0 -an -sn -dn -map_metadata -1 -map_chapters -1 -vf scale=1280:720:flags=lanczos -c:v libx264 -preset slow -crf 24 -maxrate 2M -bufsize 4M -profile:v high -level:v 3.1 -refs 4 -pix_fmt yuv420p -movflags +faststart -brand mp42 -threads 4 -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv menu-720p.mp4

ffmpeg -n -threads 3 -i loop-master.mkv -map 0:v:0 -an -sn -dn -map_metadata -1 -map_chapters -1 -c:v libvpx-vp9 -crf 32 -b:v 0 -row-mt 1 -cpu-used 2 -pix_fmt yuv420p -threads 4 -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv menu-1080p.webm

ffmpeg -n -i loop-master.mkv -frames:v 1 -an -map_metadata -1 -c:v libwebp -quality 80 -update 1 poster.webp
```

Thread scheduling/build differences can change encoded hashes on another machine.
Verify the delivered bytes against the manifest; a new encode needs a new manifest.
See [xfade](https://ffmpeg.org/ffmpeg-filters.html#xfade) for the overlap operation.

Observed color metadata in these files is `color_space=bt709` and `color_range=tv`.
The commands requested BT.709 primaries/transfer, but this filter/encoder run left
those two output tags unspecified. The manifest's BT.709 description identifies
the conversion matrix; it does not assert that all three color tags survived.

## Verification and evidence

Encoding and decoding ran on Windows with FFmpeg 9.0.2. The standalone media QA
ran in Chromium 153.0.8010.12 against the actual files over a loopback HTTP server.
No video playback methods or media responses were mocked.

- FFprobe counted exactly 450 decoded frames in each rendition, matching its
  dimensions, 30 fps, 15-second duration and YUV420P format; each has one video
  stream and zero audio streams. Complete `ffmpeg -v error -xerror -i INPUT -f null
  NUL` decoding passed for all three files (`/dev/null` on Linux).
- MP4 atom inspection confirmed `moov` before `mdat` in both renditions. All four
  derivative hashes and sizes match the manifest.
- Browser playback advanced native time and decoded-frame counters; pause stopped
  time advancement and resume restarted it. The 1080p MP4 completed three natural
  loop wraps at playback rate 1 without a media error. Raw results are preserved in
  the [evidence directory](../evidence/background-media-2026-09-26/README.md).
- Representative frames and the seam contact sheet were inspected: fixed framing,
  no embedded game menu, and no fade to black. The intentional dissolve is retained.
  Numerical seam deltas are supplementary evidence, not a visual-quality score.

These checks prove media files and native browser playback. The cloud agent still
needs to verify actual app compositing/readability, reduced motion, save-data,
mobile defaults, pause persistence and navigation. Safari/iOS, Firefox and
production HTTP delivery were not tested in this media task. Issues #2 and #6
remain open until their broader acceptance criteria have evidence.
