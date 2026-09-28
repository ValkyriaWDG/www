# HLL clan footage delivery slot

The owner will supply clan stream/battle recordings. No final HLL clip or poster is delivered yet. Keep raw recordings, AVI, MP4/WebM and expiring URLs out of Git. Reuse the repository's external/versioned media delivery process and record source, owner permission, SHA-256, dimensions, codecs, duration, byte size, poster and encode command.

Use an approved playlist of clan footage. Choose one enabled clip once per fresh document opening; keep it stable across in-app routes and game/language switching during that visit. Download only the selected rendition. A reload/new visit may choose again; tests use an injected deterministic selector. On failure, try at most one compatible rendition of the same clip if playback policy permits, then hold the poster. Do not select another clip during that visit or retry indefinitely. No background sound, stream embeds, player chrome or invented clips.

Muted inline autoplay is best-effort, with poster before playback, visible pause/resume, preference persistence and a static fallback for reduced motion/data saving. Do not re-randomize on renders or create hydration mismatch. Keep full supplied approved timelines; do not silently crop them to a short loop. Raw VOD capture/selection and publication require the owner's later source delivery.

See [design behavior](../../../docs/design/hll/visual-spec.md) and [existing media operations](../../../docs/operations/background-media.md). The example manifest is intentionally empty and does not configure the application.
