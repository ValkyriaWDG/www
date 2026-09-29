# Latest merged UI deployed through the production channel

Production at **https://valkyria.cz** was verified on **2026-09-29 at 12:20 UTC**
against source **`571475f3f60fb38c7cf14cd6afb4702982ba4681`**, including the crest/editor
fix in [PR #61](https://github.com/ValkyriaWDG/www/pull/61) and the shared HLL/Wardogs
top strip in [PR #66](https://github.com/ValkyriaWDG/www/pull/66).

The accepted image is
`majorluk/valkyria-www@sha256:da884edad5dd00cbf1ed0fd9fcb733cb894de594739b99be5eee5049bcea015b`.
The running reference is `majorluk/valkyria-www:production`. A natural Watchtower
poll replaced the application at **12:19:48 UTC / 14:19:48 Europe/Prague (CEST)**.

## Cause and recovery

The latest source merges had not yet been published and promoted to the production
image channel. Watchtower cannot build a source merge; it consumes the qualified
image after publication. No Cloudflare purge, cache rule or DNS/proxy change was
needed for this recovery.

The first publication deployed `6c5f5c7 / b5f636fc` at 11:54:46 UTC. PR #66 merged
while that publisher was running, so it was independently qualified and published
as the second replacement above. The [initial record](initial/README.md) preserves
that intermediate identity, verification and the corrected media-verifier failure.
No issued immutable tag was overwritten. This record is an observation of the
accepted revision, not a claim about any subsequent deployment.

## Qualification and identity

- [Exact-main CI 36563899286](https://github.com/ValkyriaWDG/www/actions/runs/36563899286)
  and [protected publisher 36565208081](https://github.com/ValkyriaWDG/www/actions/runs/36565208081)
  succeeded at the full source SHA above. Sanitized job metadata is retained in
  [main-ci.json](main-ci.json) and [publisher.json](publisher.json).
- Release qualification passed **500 unit, 291 database, 161 browser, 168 tooling,
  13 encrypted-recovery, 6 real restore and 4 HLL artwork tests**. The 106 opt-in
  browser captures were skipped. Page-budget, image-scan and rollback gates passed;
  passing scans do not mean zero vulnerabilities.
- Authenticated DockerHub metadata verified the approved public repository
  [before dispatch](registry-before-publish.json) and [before environment approval](registry-before-approval.json).
  The normal protected-environment approval was used; no policy was disabled.
- [Promotion](promotion.json) accepted identical migration and runtime fingerprints
  and recorded the previous and candidate digests. No migration ran in production.
- [Independent registry verification](registry-verification.json) hashed OCI index,
  Linux amd64 manifest and config bytes. The immutable SHA tag, production channel,
  publisher digest and OCI revision agree. Linux manifest:
  `sha256:5d8d18ba669f65dc447a089c856318705daee97d39c9e73545690605ba4be610`.

The publisher remains **manual, main-only, exact-SHA and CI gated**. Watchtower polls
every 300 seconds after a compatible image is promoted. A source merge alone does
not publish it. See [the operating guide](../../operations/watchtower.md).

## Acceptance

| Criterion | Steps / expected result | Observed result | Proof |
|---|---|---|---|
| Exact accepted artifact is running | Compare live container image with independently verified publisher digest and OCI source | Passed; source `571475f`, digest `da884eda`; healthy replacement at 12:19:48 UTC | [Runtime readback](runtime-after.json), [registry](registry-verification.json) |
| Automatic update affects only the web | Observe a natural poll, compare application configuration, effective mounts/security, configuration-file hashes, updater and other running containers | Passed; one scanned, one updated, zero failures; comparison unchanged | [Runtime readback](runtime-after.json) |
| Health and public routes survive | GET both health routes, both locales' hub/game landings, HLL news/manual/tournaments, robots; request a video byte range | Passed: 15 HTTP 200 responses, media HTTP 206; config/database/schema/media ready, publish and backup timers active | [16 HTTP/media checks](runtime-after.json) |
| HLL and Wardogs top strips match | In fresh anonymous contexts measure both game landings/news in CS/EN at 1920x1080, 1366x768, 1024x768 and 390x844 | Passed: strip, crest, game/language/account/community/menu boxes match; visible expected controls, no duplicate strip or horizontal overflow | [33-check browser report](browser-after-01.json), six captures below |
| Decorative crests remain consistent | Compare both landings' dimensions, centre, opacity, filter and asset; inspect news | Passed: matching coloured ghosted crests; hidden on news | [Browser report](browser-after-01.json) and captures |
| Strict browser network observations | Observe page errors, HTTP failures, request failures, external origins, writes and WebSockets during the focused routes | Passed: zero page/HTTP/unaccepted network failures or unexpected activity; 252 exact optional RSC prefetch aborts recorded separately | [Browser report](browser-after-01.json) |

The runtime verifier binds the running image ID to `image inspect repository@digest`,
not just a matching revision label. On this Docker 29 store the image ID is the OCI
index digest. The previous image's local repo aliases were empty at the final readback
after replacement; its prior source and digest are independently established in the
initial record. No private environment values or full container inspection are exported.

## Inspected screenshots

All six unmodified PNGs were visually inspected after capture, and file hashes/sizes
were checked against the machine report and `assets/manifest.json`. That inspection
fulfills the report's separate `visualInspection` requirement without modifying the
original report. No redaction or generated image is used. Shared context: actual
anonymous production, source `571475f` and digest above, Czech locale, **Chrome for
Testing 154.0.8037.57 / Playwright 1.63.0**, 12:20:27–12:20:45 UTC. English routes are
measured in the report; these six visual captures are Czech. Mobile uses touch/viewport
emulation, not a physical phone.

| Capture | Route / viewport | Expected and observed |
|---|---|---|
| [Wardogs desktop](browser-after-01-wardogs-cs-desktop.png) | `/cs/wardogs`, 1920x1080 | Reference strip 65 px high; loaded background and ghosted crest |
| [HLL desktop](browser-after-01-hll-cs-desktop.png) | `/cs/hll`, 1920x1080 | Same strip controls/positions and crest geometry, with HLL colours |
| [HLL compact news](browser-after-01-hll-news-cs-compact-1024.png) | `/cs/hll/news`, 1024x768 | Compact strip 123 px high, crest hidden, content readable |
| [Wardogs mobile](browser-after-01-wardogs-cs-mobile.png) | `/cs/wardogs`, 390x844 | Strip 115 px high; game row 358x50 at x16/y56, no overflow |
| [HLL mobile](browser-after-01-hll-cs-mobile.png) | `/cs/hll`, 390x844 | Same mobile strip geometry and crest presentation as Wardogs |
| [HLL mobile news](browser-after-01-hll-news-cs-mobile.png) | `/cs/hll/news`, 390x844 | Same mobile strip, crest hidden, readable empty-news state |

## Reproduction and limits

[browser-verify.cjs](browser-verify.cjs) is the exact capture harness, SHA256
`a052c3475dd382b2a1c0ae5053ce5f6fc271344cc6459dd334f333a99b13fad4`.
The immutable report SHA256 is
`fe5a63fcff71748077d84f05ae23f14be298676fa967c47b1b1e1e2ccec6c035`.
To repeat the focused checks only while this same revision is independently verified
as deployed, use a clean checkout pinned to the full source SHA, installed repository
Playwright dependencies and the documented isolated browser. Copy the harness to a
new output directory so later reports do not alter committed evidence:

```sh
node /path/to/fresh-output/browser-verify.cjs --help
node /path/to/fresh-output/browser-verify.cjs --run \
  --revision 571475f3f60fb38c7cf14cd6afb4702982ba4681 \
  --digest sha256:da884edad5dd00cbf1ed0fd9fcb733cb894de594739b99be5eee5049bcea015b \
  --identity-ref docs/evidence/channel-deployment-2026-09-29/runtime-after.json \
  --report-id fresh-verification \
  --repo-root /path/to/pinned-source \
  --dependency-root /path/to/installed-checkout \
  --browser-executable /path/to/isolated-chrome154
```

The browser does not itself attest container identity; that comes from the independent
runtime record. This focused **full-navigation** run does not close the broader
client-navigation network issue [#46](https://github.com/ValkyriaWDG/www/issues/46).
Optional prefetch aborts are narrowly classified, not a general fetch-failure waiver.
No live authenticated editor mutation, login/role sync, CRCON/Logi workflow, content
import, full video-loop playback, physical-device coverage or automatic rollback was
tested. Editor caret behavior is covered by the release's synthetic CI suite.

Watchtower preserves the current container environment. Newly stored environment-file
values are not activated by an image replacement. Live authentication/providers remain
disabled at this observation. No database schema, content, domain route or unrelated
service was changed. HLL content/provider acceptance and broader launch work remain open.
