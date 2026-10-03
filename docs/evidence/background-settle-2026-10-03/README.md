# Background settlement during hydration

The [first publication qualification](https://github.com/ValkyriaWDG/www/actions/runs/37115320010)
for `c1b4a60aadcf2afea8e52c56b4e8ced0dacefe83` failed before publication on
`shell.spec.ts:200`. The same revision's [main CI](https://github.com/ValkyriaWDG/www/actions/runs/37115208354)
passed. The failure is retained, not replaced by an unexplained rerun.

The sanitized [trace extract](trace-proof.json) shows server HTML with background
state `paused` and reason `pending`. The negative "not loading" assertion returned
success; 45 ms later the separate attribute read returned `loading` with reason
`allowed`. Browser policy had initialized between the two observations.

`settledBackgroundState` now reads policy and state together, rejects `pending`
and `loading`, and returns that accepted observation. The existing unavailable
assertion stays intact. No product playback change, timeout increase or retry was
introduced.

Local verification used Node 24.21.0, the existing optimized application build
from `b91136c7aa1f9d5a6562af2b206c03cd7d19021d` (runtime code unchanged), Chromium,
and an isolated loopback PostgreSQL with synthetic fixtures:

```sh
pnpm --filter @valkyria/web exec playwright test e2e/shell.spec.ts --project=chromium --grep 'a missing video keeps' --repeat-each=10
pnpm --filter @valkyria/web exec playwright test e2e/shell.spec.ts --project=chromium
pnpm --filter @valkyria/web exec eslint e2e/support/shell-helpers.ts
pnpm --filter @valkyria/web exec tsc --noEmit
node scripts/check-foundation.mjs
```

Results: 10/10 repeated missing-video checks and 20/20 shell checks passed; scoped
ESLint, TypeScript and Foundation passed. The initial local attempt found the
disposable PostgreSQL stopped; it was started before these browser checks.
No production database was used. Screenshot N/A: this is a test synchronization
change, with the actual CI trace providing the failure proof. Full candidate CI,
publication and deployment are recorded separately in the PR discussion.
