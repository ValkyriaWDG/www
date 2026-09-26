# Wardogs local asset inventory

Recorded: 2026-09-26. Scope: read-only file inventory of the owner's installed game, including loose files and archive filenames. Paths below are relative to the game installation, not to this repository.

Follow-up: an AVI supplied later from outside the game installation was decoded and
converted. See the [verified media delivery](../assets/background-media-2026-09-26.md).
The inventory below remains a record of the original file-only inspection.

## Useful candidates

All filenames in this table begin with `Wardogs/Content/Binks/`.

| Filename | Bytes | MiB | Likely purpose, inferred from filename |
| --- | ---: | ---: | --- |
| `UI_frontendvideo_v4_4K.bk2` | 258,092,948 | 246.14 | Strongest current-menu background candidate; compare visually with reference screenshot 09 |
| `UI_frontendvideo_v3_4K.bk2` | 248,048,600 | 236.56 | Earlier frontend-background candidate |
| `MV_UI_HomeSceneBackground.bk2` | 14,815,700 | 14.13 | Alternate home-scene background candidate |
| `UI_SplashScreen_NoLogo.bk2` | 8,865,088 | 8.45 | Intro/splash candidate without baked-in logo |
| `UI_SplashScreen_Logo.bk2` | 8,391,336 | 8.00 | Intro/splash candidate with a logo |
| `UI_RevealTrailer_Video.bk2` | 9,593,088 | 9.15 | Trailer, not the preferred ambient loop |

The inventory does **not** verify duration, pixel dimensions, frame rate, soundtrack, loop quality, decoded image content, or whether the running game uses v3 or v4. In particular, `4K` is part of a filename, not a measured resolution. These files were not played, decoded, modified, or copied into the repository.

The owner is converting a background clip to AVI using RAD Video Tools. No completed AVI was supplied to this task. No `.avi`, `.mp4`, `.webm`, or `.mov` file was present in the scanned game directory. An export elsewhere on the owner's computer may exist; this inventory does not establish that it is ready.

## Other content

`Wardogs/Content/` contains:

| Type | Count | Meaning for this project |
| --- | ---: | --- |
| `.bk2` | 116 | Loose videos, largely tutorials under `Binks/LearnToPlay/` |
| `.uasset` | 8 | Small Unreal asset files next to some videos; not directly usable web assets |
| `.pak` | 16 | Game content archives; names inspected only |
| `.ucas` | 17 | Packaged game content; not inspected internally |
| `.utoc` | 17 | Packaged content index files; not inspected internally |
| `.sig` | 16 | Package signatures; not relevant to website delivery |

The broader installation also includes engine/runtime files and engine `.pak` files; those are excluded from the game-content archive counts above.

No loose `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`, `.bmp`, `.tga`, `.dds`, `.ttf`, `.otf`, `.woff`, or `.woff2` files were found in the installation. The absence of loose files does not prove assets are absent from the archives. UI textures, icons and fonts may be packaged, but that has not been verified. Do not invent original font names or claim extraction succeeded.

`endgame_wip_VALKYRA.bk2` also exists. Its name is not evidence that it belongs to the VALKYRIA clan or contains the supplied clan logo. Treat it as unrelated game media unless independently established otherwise.

## What the cloud implementation can use

The cloud agent does not have the owner's Steam installation, conversion tools, clipboard files or local export directory. This document is an inventory, not an asset delivery mechanism.

1. Use the repository's supplied visual references and design specification to implement the HTML/CSS menu, typography, borders, gradients and transitions.
2. Keep the supplied clan logo separate from game branding. A faded clan logo is a web overlay, not something to bake into the background footage.
3. Implement the media interface with a static fallback first. It must function when no video URL is configured and when the media request fails.
4. Integrate a video only after the maintainer supplies the finalized web derivatives, provenance record and intended publication/use status. Follow [the video pipeline](../assets/video-pipeline.md).
5. Do not make the build depend on local game paths, raw `.bk2`/AVI files, archive extraction, a game executable, or proprietary conversion tools.

## Provenance and publication status

Status of installed game assets: **third-party source candidates, not shipped and not cleared by this inventory for redistribution**. Local possession and technical readability do not establish a publication license. No game-asset licensing evidence was supplied or verified during this inventory; this is a record of what is known, not a legal determination.

Keep raw videos, game archives, executable files and extracted resources outside the public repository and application image. The repository's software license does not relicense third-party game assets. Maintain separate source attribution and usage terms for any approved web derivatives. A screenshot used as design reference must not silently become a production background or an Apache-licensed application asset.

For each later-delivered derivative record: source filename, supplier, rights holder if known, source/permission reference, allowed uses, attribution requirement, SHA-256, media dimensions, duration, audio-track count, byte size, export date and artifact location. If a game-derived asset remains unavailable, continue with the designed static fallback; media availability does not block layout or application work.
