# First observed Watchtower replacement

This intermediate deployment was verified on 2026-09-29. It includes PR #61;
PR #66 merged while its publisher was running and requires the subsequent release.

- Source: `6c5f5c7e6e4602091b5494e16cc1bd03a927a53a`.
- Image: `majorluk/valkyria-www@sha256:b5f636fcc3b36f87ca8e5234ffd968c307627783f9367b99070dde929428ab65`.
- [Exact-main CI](https://github.com/ValkyriaWDG/www/actions/runs/36558406801)
  and [protected publisher](https://github.com/ValkyriaWDG/www/actions/runs/36562842108)
  both passed.
- [Authenticated registry metadata](registry-before-publish.json) verified the approved
  public repository. [Independent registry verification](registry-verification.json)
  hashes the OCI index, platform manifest and configuration; immutable and production
  tags match the publisher digest and source.
- [Promotion](promotion.json) records identical migration and runtime fingerprints.
- [Runtime readback](runtime-after.json) records a natural Watchtower replacement at
  **11:54:46 UTC / 13:54:46 Europe/Prague**, one selected container, one update, no failure.
  Exact image identity, effective environment/mounts/security, configuration files and
  unrelated running containers were checked. All four readiness checks, 15 HTTP routes,
  video byte range, publication timer and backup timer passed. No migration ran.

The [focused browser report](browser-after-01.json) passed **13/13** checks in actual
anonymous production, CS/EN, Chrome for Testing 154 / Playwright 1.63.0. HLL and
Wardogs crest geometry, opacity and filter match at 1920x1080 and 390x844; crests are
hidden on news pages. Zero page errors, HTTP errors or non-prefetch request failures;
103 exact optional-prefetch cancellations were recorded. This narrow full-navigation
check does not close the broader client-navigation issue #46.

All four unmodified viewport captures were visually inspected. They show the same
coloured ghosted clan crest in both game menus, legible Czech controls and loaded
backgrounds, without horizontal overflow. They are production evidence for the source
above, not for the later PR #66 header change:

| Capture | Route / viewport | Observed result |
|---|---|---|
| [HLL desktop](browser-after-01-hll-cs-desktop.png) | `/cs/hll`, 1920x1080 | Crest width 422.39 px, opacity 0.12, no grayscale |
| [Wardogs desktop](browser-after-01-wardogs-cs-desktop.png) | `/cs/wardogs`, 1920x1080 | Same crest dimensions and centre |
| [HLL mobile](browser-after-01-hll-cs-mobile.png) | `/cs/hll`, 390x844 | Crest width 241.80 px, opacity 0.11, readable menu |
| [Wardogs mobile](browser-after-01-wardogs-cs-mobile.png) | `/cs/wardogs`, 390x844 | Same crest dimensions and centre |

The initial runtime verifier [failed](runtime-initial-failure.json) at its media request:
the default Python User-Agent received HTTP 403. A controlled comparison returned 403
with that agent and 206 / 1,024 bytes with the named release-verification agent. The
verifier was corrected to use its existing named User-Agent consistently, then all
checks passed. No application or Cloudflare rule was changed to hide the failure.

Authentication/provider configuration was preserved. Watchtower reuses the running
container environment; newly stored environment-file entries are not activated by
this image replacement. Live authenticated editorial and provider workflows, physical
devices, complete video-loop playback and automatic rollback were not tested here.
