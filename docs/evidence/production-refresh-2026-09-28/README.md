# Production refresh verification

Public verification of the Wardogs deployment on 2026-09-28. **HTTP acceptance passed 37/37 checks.**
The expanded browser run passed 6/7 scenarios but **failed its request-failure gate**; it is not a
fully passing browser acceptance result. Both failed browser runs and all eight captures are preserved.

The operator's [deployment record](deployment-record.json) and independent
[runtime readback](runtime-after.json) establish source `9a872918ad4d89935eb26118d853d40776af7d66` at
`majorluk/valkyria-www@sha256:cab3230e760ced4e10a52c00327d863ca5c704093cd81ef61ea000b38d368e93`.
[Main CI](main-ci-qualification.json), [PR CI](pr-ci-qualification.json) and
[image publication](publication.json) are separate from the public observations below. Public HTTP or
browser observations alone cannot establish a container digest.

Runtime readback reports healthy configuration/database/schema/media checks, UID 10001, a read-only
root, dropped capabilities, no published ports and Watchtower disabled. No new migration was applied;
Discord credentials remain absent and local administrator login remains disabled. The publisher and
backup timers are active; the first natural publisher run after promotion succeeded. Paired backup
checksums/readability passed, but **no new semantic restore was performed**. Complete host media hashes
were checked separately by the operator; HTTP proof below checks delivery without downloading full videos.

## Before-state

[Reviewed HTTP observations](http-before-reviewed.json): **24 of 37 checks passed, 13 failed** against the accepted target
behavior. Failures are preserved as the baseline, not described as successful acceptance:

- `/cs` and `/en` have no canonical or reciprocal language links, reproducing
  [issue #29](https://github.com/ValkyriaWDG/www/issues/29).
- Home, news and match-list metadata lack the new social images and large Twitter cards in both locales.
- All six `/api/social/{cs,en}/{site,news,matches}?v=1` endpoints return 404.
- `robots.txt` does not yet allow `/api/social/` explicitly.
- Root-to-Czech redirect, health, public page responses, other checked canonicals/language alternates,
  anonymous login/admin privacy cache, sitemap public routes and all media HEAD/range checks pass.

The live deployment identity is deliberately **unknown in this report**. Local harness revision is
recorded separately and is not a claim about the running container. The operator-supplied
[registry preflight](registry-preflight.json) establishes that the existing Docker Hub repository is
public; it does not identify a new image or prove a deployment.

The [original baseline](http-before.json) is retained unchanged. Review strengthened the harness:
public indexing rejects both meta/header `noindex` or `none`; social PNG checks now force a complete
Sharp RGBA decode with a 756,000-pixel input limit and a 5 MiB response limit. These verification changes
do not change application behavior. The repeated before run still observes the same 13 missing-feature
failures. Social endpoints returned HTML 404s during both before runs; all six fully decoded PNG checks
pass after deployment. The original and reviewed reports each record their exact harness hash.

An earlier local diagnostic pass over-required an explicit `og:url` on home/member-list pages and
`no-store` on the sitemap. These were harness assumptions, not accepted application requirements.
The final harness checks an `og:url` for consistency when supplied and accepts either `no-store` or
`max-age=0, must-revalidate` without stale allowances for the sitemap. The initial diagnostic output
and its exact harness are preserved locally; the linked baseline was collected again with the final
HTTP harness used after deployment. Homepage canonical presence remains mandatory.

## After-state and browser diagnosis

| Evidence | Result | Interpretation |
| --- | --- | --- |
| [HTTP after](http-after.json) | 37 passed, 0 failed | All 13 prior missing-feature checks now pass, including homepage canonical/alternates, social metadata, six decoded PNGs and robots allowance. |
| [Original browser](browser-after.json) | 5 passed, 1 failed | Visual/media/locale scenarios passed; 36 fetch failures tripped the final gate. Original error codes/headers were not captured and cannot be reconstructed. |
| [Prefetch diagnostic](prefetch-diagnostic.json) | 24 observed aborted prefetches | Every observed failure in this separate diagnostic had exact `net::ERR_ABORTED`, `RSC: 1` and `Next-Router-Prefetch: 1`. Twelve occurred before locale navigation; all occurred before context disposal. |
| [Reviewed browser](browser-after-reviewed.json) | 6 passed, 1 failed | The added client navigation scenario passed. Fifty best-effort prefetch aborts were separated, but two non-prefetch RSC aborts still fail the request gate. |

The [original browser harness](browser-smoke-initial.cjs) remains byte-for-byte identical to its recorded
SHA-256 `f5361315a7e284315285e27f11f5380ac456513f1966e204da52b58039cace56`. The correction only classifies an
exact same-origin GET/fetch `net::ERR_ABORTED` carrying both RSC and prefetch headers as best-effort
prefetch cancellation. [Sixteen predicate tests](request-classification.test.cjs) passed, including
negative cases for missing/mismatched headers, actual RSC navigation, other errors, origins and methods.
All HTTP error, page error, origin, write and WebSocket gates remain. This is a harness correction,
not an application repair or a retroactive reclassification of the first report.

The second run additionally clicks the real menu into news and back home in both locales. Localized
headings, absence of the news-load error, active menu state and a retained in-memory document token
prove rendering and client navigation without a full-document fallback. This passed. Nevertheless,
`GET /en/news` and `GET /en` each reported a non-prefetch RSC `net::ERR_ABORTED` outside disposal; the
narrow classifier correctly leaves them as failures. No HTTP >=400, page errors, unexpected origins,
writes or WebSocket attempts were observed in either browser run. No retry-to-green was performed.

One [phase-timestamp diagnostic](navigation-diagnostic.json), using its preserved
[script](navigation-diagnostic.cjs), then waited six seconds after each rendered route. `/en/news`,
`/en` and `/cs/news` received HTTP 200 `text/x-component` and reported `net::ERR_ABORTED` 5–41 ms later,
before their successful same-document render. `/cs` completed normally. The later menu action and
context disposal had not yet occurred, so this observation does **not** support simply attributing
the aborts to rapid successive clicks or cleanup. Rendering remained settled through the observation
intervals; no page error or boundary violation was recorded. The underlying cancellation cause is
unresolved; these observations neither prove a user-visible outage nor justify relaxing non-prefetch
failure acceptance. The diagnostic is not a third acceptance retry and did not change the classifier.
Follow-up investigation is tracked by [issue #46](https://github.com/ValkyriaWDG/www/issues/46).

Installed Next.js 16.3.6 source `dist/client/components/segment-cache/cache.js:2464-2490` explicitly
cancels a prefetch reader at a byte boundary; `router-reducer/fetch-server-response.js:295-347` also
cancels unused response clones. However, those static/shell clone paths require cache-component
configuration. The inspected local build has both `cacheComponents` and
`experimental.cachedNavigations` disabled; `apps/web/next.config.ts` enables neither.
The HMR abort wrapper is development-only. These inactive paths must not be offered as
the likely navigation cause. Local configuration is not independent attestation of
the deployed browser bundle, and no cancelling actor has been identified.
The inspected `cache.js` SHA-256 is `8f4226c929b6bd902f24c2b9eef25a6600efc50c37d2b19019d8c99d877c08dd`.
The inspected `fetch-server-response.js` hash is
`24857f50a53fc1f8058a0af15b006b3586dc1c581c9feb04443f0f9d284621c5`.
The next bounded experiment is a local synthetic standalone comparison with/without
Playwright routing, correlating actual signal/stream cancellation with CDP failures.
Instrumentation must first distinguish explicit abort, stream cancellation, socket
reset and cancellation of only one tee branch. It has not been run here.

Both browser runs used Google Chrome for Testing **154.0.8037.57**, Playwright **1.63.0** and fresh
anonymous contexts on Windows x64, headless. HTTP used Node **v24.21.0** and Sharp **0.35.4**. The browser
selected the approved 1080p WebM and advanced at native speed; pause/reload/resume passed. Each mobile
capture recorded the approved poster, paused time zero, empty `currentSrc`, no attached sources and
zero media requests before opt-in. These are short playback checks, not a new full-length loop test.
The original Czech sample recorded 4 dropped frames out of 84; its English sample and both reviewed
samples recorded zero drops. This package does not certify playback smoothness on other devices.

## Inspected captures

All eight actual production captures were visually inspected: localized menu text and active language
state are visible, the clan watermark and Wardogs composition are preserved, controls are readable and
no horizontal overflow or clipped primary action is visible at the tested dimensions. A still screenshot
cannot prove playback or metadata; use the corresponding JSON observations. Failed-run screenshots are
retained as visual evidence and do not turn the overall run into a pass.

| Capture | Caption |
| --- | --- |
| [Original CS desktop](browser-after-home-cs-desktop.png) | `/cs`, 1440×900; Czech menu over native video, pause control, clan watermark. Original 5/6 run. |
| [Original EN desktop](browser-after-home-en-desktop.png) | `/en`, 1440×900; English selected through the language switcher. Original 5/6 run. |
| [Original CS mobile](browser-after-home-cs-mobile.png) | `/cs`, 390×844 touch emulation; poster, play opt-in and compact menu. Original 5/6 run. |
| [Original EN mobile](browser-after-home-en-mobile.png) | `/en`, 390×844 touch emulation; English poster layout, zero video requests before opt-in. Original 5/6 run. |
| [Reviewed CS desktop](browser-after-reviewed-home-cs-desktop.png) | `/cs`, 1440×900; actual menu and playing background. Reviewed 6/7 run. |
| [Reviewed EN desktop](browser-after-reviewed-home-en-desktop.png) | `/en`, 1440×900; English menu and language selection. Reviewed 6/7 run. |
| [Reviewed CS mobile](browser-after-reviewed-home-cs-mobile.png) | `/cs`, 390×844 touch emulation; approved poster and visible play control. Reviewed 6/7 run. |
| [Reviewed EN mobile](browser-after-reviewed-home-en-mobile.png) | `/en`, 390×844 touch emulation; approved poster and compact controls. Reviewed 6/7 run. |

Mobile captures are not physical Android/iOS evidence. Screenshot hashes, dimensions and byte sizes
are recorded alongside each run. Game imagery is evidence only and is excluded from the code license.

## Reproducible public reads

Both scripts run from a checkout with Node 24 and installed application dependencies: HTTP uses Sharp
for full image decoding, and the browser script resolves Playwright. No PostgreSQL instance, owner
cookies or provider credentials are used. HTTP requests use only anonymous GET/HEAD with automatic
redirects disabled. The browser uses new isolated contexts and filters initial routed requests to
same-origin GET/HEAD. Playwright may follow redirect hops without routing them again, so this is **not
a complete pre-network isolation boundary**. Every observed request/response origin is checked and
any unexpected-origin hop or write attempt fails the run. WebSocket routing blocks connection attempts
and records them as failures. Neither script intentionally submits login, changes content or edits
infrastructure; no current application external request or WebSocket is expected.

The HTTP script verifies root redirect, health, Czech/English canonicals and reciprocal languages,
Open Graph/Twitter metadata, fully decoded 1200×630 social PNGs, robots, sitemap,
anonymous privacy cache, and the four approved media derivatives through HEAD and 1,024-byte ranges.
It never downloads whole video files, saves response HTML or serializes cookies.

The current browser script performs seven bounded checks: Czech and English desktop metadata/native
playback, manual pause/reload/resume, client menu navigation in both locales, Czech and English mobile
poster/metadata, and no uncaught errors or network/write failures. Playback must select an approved same-origin 1080p MP4/WebM path from the
media manifest; the poster must be the approved same-origin poster. Mobile checks require paused video,
time zero, empty `currentSrc`, no attached sources and zero media-type/video-extension requests through
the completed screenshot. Non-cancelled same-origin request failures and HTTP statuses >=400 fail the
run; legitimate aborted navigation/media/context-disposal requests and narrowly identified best-effort
RSC prefetch cancellations are listed separately. It saves four actual public
captures. Mobile/touch is emulation; these are short
playback measurements, not full-loop, all-codec or physical-device qualification. Captures must be
inspected separately before their captions and asset-manifest entries are accepted.

Before-state command, run from the repository root:

```sh
node docs/evidence/production-refresh-2026-09-28/http-smoke.mjs --stage before --report-id http-before-reviewed
```

After the deployment operator verifies the actual running source label and pulled digest, use their
observed values, with a sanitized public deployment-evidence filename:

```sh
node docs/evidence/production-refresh-2026-09-28/http-smoke.mjs --stage after --revision <observed-full-sha> --digest sha256:<observed-digest> --identity-ref <deployment-record.json>
node docs/evidence/production-refresh-2026-09-28/browser-smoke.cjs --revision <observed-full-sha> --digest sha256:<observed-digest> --identity-ref <deployment-record.json> --browser-executable <explicit-isolated-browser-path> --browser-product "Google Chrome for Testing" --report-id browser-after-reviewed
```

Placeholders are instructions, not deployment claims. Reports record the operator-supplied identity
and distinguish it from the local harness revision/hash and observed browser version/executable hash.
Existing report files are never overwritten; use `--report-id <safe-name>` for a new attempt and retain
the original result. JSON reports save selected public metadata and bounded diagnostic fields only.

The executed after commands used the exact revision/digest above and `--identity-ref deployment-record.json`.
The first browser command used the preserved initial script bytes, before the classifier correction,
with default report ID `browser-after`; the corrected command used `browser-after-reviewed`. The
isolated executable SHA-256 was `6b5da320179b656aefdb74ff10bc0bd33ba8d5ea869347e04e0a6b2bdd815e96`.

```sh
node --check docs/evidence/production-refresh-2026-09-28/browser-smoke.cjs
node --test docs/evidence/production-refresh-2026-09-28/request-classification.test.cjs
node docs/evidence/production-refresh-2026-09-28/navigation-diagnostic.cjs <explicit-isolated-browser-path>
```

The prefetch diagnostic's exact [source](prefetch-diagnostic-original.cjs) is retained. It takes the
isolated executable as its first argument, runs from the repository root, and writes
`production-refresh-request-diagnostic.json` next to itself; the original captured result is preserved
here as `prefetch-diagnostic.json`. The diagnostic does not replace acceptance assertions.

## Status and limits

- HTTP syntax/before/after checks completed; the after command exited 0 with 37/37 checks passed.
- Browser syntax and 16 classifier tests passed. Both browser acceptance commands exited 1; their
  results remain failed (5/6 and 6/7), with an unresolved non-prefetch RSC cancellation boundary.
- Eight real screenshots were inspected and retained; they do not prove the failed request gate passed.
- Public checks cannot prove authenticated authorization, role synchronization, every unpublished
  content boundary, actual social-network unfurling, Safari/iOS or physical mobile behavior. Host/runtime
  identity comes from the operator's separate readback. Authentication remains intentionally disabled.
