# Server polling readiness

This is local synthetic browser proof for PR #77's loading-state correction, not a
production observation. The accepted migration image remains source `609528d`.
[Captions, timestamps and source-file hashes](captures.json) bind the captures to
the tested working tree on `f8e79b0`, Chromium and the 1280 x 720 viewport.

The first [PR CI run](https://github.com/ValkyriaWDG/www/actions/runs/36695583373)
expected one poll after a 31-second clock jump but observed zero. Both initial
guards could pass on SSR HTML before the polling effect existed. All recorded JS
downloads had finished; the trace does not record effect registration. A controlled
local probe against the unchanged `609528d` build held 15 client chunks, passed the
original guards and reproduced that zero-request failure. This establishes the
missing readiness boundary, not the precise scheduling of the original CI worker.

The hook now marks readiness after registering its timer and listeners. Both
controls stay disabled until then. The clock-driven tests wait for this state.
The new regression holds scripts, checks pending/disabled controls and zero requests
after 31 seconds, releases scripts, checks readiness and expects exactly one poll
after the next 31 seconds. Existing failure/empty, pause/manual and hidden-tab
checks are unchanged. No assertion, timeout, retry or branch protection was relaxed.

Local verification passed: production build, scoped ESLint, full typecheck,
766 unit tests across 69 files and four focused browser scenarios (10.2 seconds).
The controlled pre-fix probes failed as expected. The browser run also logged two
Next.js destination-stream-closed notices during the existing navigation scenario;
all four scenarios passed. Full CI is required before merge.

Reproduce with the repository's disposable E2E database configuration:

```sh
pnpm build
CAPTURE_EVIDENCE=1 pnpm --filter @valkyria/web exec playwright test e2e/server-live-players.spec.ts --project chromium
```

Pending controls while client scripts are held; the automatic-update checkbox is
disabled. This actual browser element capture does not include player data.

![Synthetic browser capture: polling controls pending hydration](polling-controls-pending.png)

Ready controls after timer/listener registration; automatic updates can be toggled.
Manual Refresh remains disabled during its normal initial cooldown.

![Synthetic browser capture: polling controls ready](polling-controls-ready.png)
