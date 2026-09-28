# Public cutover verification method

The retained executable harness produced [HTTP 54/55](http-after-01.json) and
[browser 9/10](browser-after-01.json) at 20:40 UTC on 2026-09-28. **Both overall
results are failed.** See [observations and captions](README.md) for the robots
origin defect and five non-prefetch RSC aborts. These source files are copied
byte-for-byte from the observed run; source hashes are recorded in each report.

The actual running identity came from the operator's
[pre-check runtime record](runtime-before-public-checks.json), not the local checkout.
A [later readback](runtime-after.json) confirms the same source/image. The report's
`localHarnessRevision` is distinct from `deploymentIdentity`. These scripts do not
independently derive the container digest from public HTML.

## Scope and boundaries

- Anonymous GET/HEAD requests cover Czech/English hub, HLL and Wardogs pages,
  canonical/hreflang/Open Graph metadata, exact authorized-host redirect destinations,
  robots, sitemap privacy, anonymous access boundaries, six 1200×630 social PNGs and
  approved media headers/1024-byte ranges. Social PNGs are fully decoded with bounded
  input bytes/pixels. Full videos are not downloaded by this HTTP harness.
- Browser scenarios use fresh anonymous contexts, actual Wardogs native playback,
  pause/reload/resume, game/language and same-document news navigation, HLL server/manual
  states, and mobile/touch emulation. No existing owner cookies or authenticated writes
  are involved. The legacy `valkyriahll.cz` site is never requested.
- Initial browser requests are filtered to approved origins and GET/HEAD. Redirect
  hops are observed and unexpected origins fail the run; Playwright routing is not a
  complete pre-network redirect sandbox. WebSocket attempts are blocked and fail.
- Only exact same-origin GET/fetch `net::ERR_ABORTED` events with both `RSC: 1` and
  `Next-Router-Prefetch: 1` are classified as best-effort prefetch cancellation.
  Non-prefetch RSC failures still fail the final network gate. Navigation, media and
  context-disposal cancellation observations remain separate. No broad exemption or
  retry-to-green is used.
- Short video sampling does not prove a complete loop, every codec, constrained-network
  performance or physical-device behavior. Mobile viewport/touch is emulation, not iOS,
  Android or Safari acceptance. Screenshots require separate visual review.
- Anonymous sitemap checks do not establish every private publication-state boundary.
  No Discord/Logi interaction, callback registration, login or production data mutation
  is exercised.

Reports and captures reserve new paths exclusively. Never reuse an existing report ID
or replace failed evidence. Future requests require the deployment owner's actual source,
digest, media origin and authorization. No new production requests were made while copying
these files into the evidence directory.

## Reproduction

Observed environment: Node **24.21.0**, sharp **0.35.4**, Playwright **1.63.0**, explicit
Chrome for Testing **154.0.8037.57**. The browser executable fingerprint is in the browser
report. Choose an installed checkout and the same isolated browser when reproducing;
the commands below use portable environment references instead of private machine paths.

From the repository root, set `VERIFICATION_DEPENDENCY_ROOT` to an installed checkout
and `VERIFICATION_BROWSER_EXECUTABLE` to the explicit Chrome for Testing executable.
Local checks make no production requests:

```powershell
$proof = 'docs/evidence/unified-cutover-2026-09-28'
node --check "$proof/http-smoke.mjs"
node --check "$proof/browser-smoke.cjs"
node --test "$proof/harness.test.cjs" "$proof/request-classification.test.cjs"
```

The preserved [local assertion output](local-tests.txt) records **25/25** passes:
metadata/index directives, full PNG decode/truncated and oversized rejection,
exclusive creation, and 16 narrow cancellation-classifier cases. It is a local
harness check, not public acceptance.

After a genuinely new deployment observation, use a **new** report ID and supply the
freshly observed identity. This example describes the recorded cutover's inputs; do
not assume they identify a future running image:

```powershell
$revision = '5e83abc91560480e21b60c4a2638c0b52b0e1720'
$digest = 'sha256:79bf4ea15dd185f0618775fee2a794f2e5d024a116943224a1a4a1dcb7afef48'
node "$proof/http-smoke.mjs" --stage after --origin https://valkyria.cz --media-origin https://valkyria.cz --dependency-root $env:VERIFICATION_DEPENDENCY_ROOT --revision $revision --digest $digest --identity-ref runtime-before-public-checks.json --report-id http-after-new-observation
node "$proof/browser-smoke.cjs" --media-origin https://valkyria.cz --dependency-root $env:VERIFICATION_DEPENDENCY_ROOT --revision $revision --digest $digest --identity-ref runtime-before-public-checks.json --browser-executable $env:VERIFICATION_BROWSER_EXECUTABLE --browser-product 'Chrome for Testing' --report-id browser-after-new-observation
```

The original invocation used report IDs `http-after-01` and `browser-after-01` and
identity reference `runtime-after.json`, whose later readback is separately preserved.
The earlier identity snapshot is retained as `runtime-before-public-checks.json` to
keep the timing of these observations explicit.
