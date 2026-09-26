# Asset provenance and delivery

The repository is public. Keep enough references to make the design reproducible,
without turning it into a game asset mirror.

| Asset class | Location / treatment |
|---|---|
| Supplied clan logo | `assets/brand/valkyria-logo.png`; exact original, 733 × 811 RGBA |
| Supplied Wardogs captures | `docs/design/references/`; reference-only, never copy into app public output |
| Legacy site graphics | URL inventory in research; review individual use and provenance before copying |
| Raw game archives/Bink/AVI | Local-only, excluded from Git and build context |
| Approved web video/poster | Versioned external delivery or read-only deployment media; record digest and rights |
| Fonts/icons | Maintained licensed packages/files with original license notices; do not extract game fonts |

The supplied logo is the clan mark for this project, not a general-purpose open-source
asset. Keep its aspect ratio and original file intact. Create browser variants only
when needed and retain provenance. Do not redraw it with a generator or substitute
the Wardogs wolf emblem. Use opacity/filter at render time for the faded center.

Every shipped asset needs a manifest entry recording source, usage, size, digest,
rights status and transformations. The existing [manifest](../../assets/manifest.json)
records the 13 captures and logo. It is an integrity inventory, not a claim of third-party
ownership or a general redistribution license. The source screenshots retain their
original third-party game imagery and are excluded from the Apache code license.

Runtime CMS uploads use equivalent database Asset/AssetUsage records and persistent
private media storage; they are not committed to Git or added to the source manifest
by an editor. The [editorial media contract](../product/editorial-and-matches.md) defines
safe uploads, image metadata, draft visibility and publication-aware delivery.

Screenshots contain incidental player names, currency and server listings. Do not
transcribe these into production profiles, analytics, copy, SEO or fictional data.
Do not promote gameplay statistics as official clan statistics.

## Cloud media handover

The cloud agent receives committed reference images but cannot read a Steam folder
on the owner's PC. Video is still pending at foundation time. Use the
[video pipeline](video-pipeline.md) and [local inventory](../research/wardogs-local-assets.md).
Owner delivery should include the approved MP4/WebM/poster, stable download location
accessible to the task, SHA-256, file metadata and usage approval/provenance.
Do not commit expiring signed URLs or access tokens. Do not claim a final background
is complete when only a CSS fallback or an unrelated placeholder is present.

If source assets remain unavailable, build the complete media component against a
neutral original CSS fallback and synthetic test clip. Finish every independent part
of the task, list the missing asset precisely, and keep production media disabled.

## Reference index

See [reference index](../design/references/README.md). Static captures establish visual
geometry and styling; motion timings in the design spec are proposed targets because
the screenshots cannot prove the original animation curves.
