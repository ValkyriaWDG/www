# Robots runtime-origin regression

Issue [#53](https://github.com/ValkyriaWDG/www/issues/53): the same production image
was moved to `https://valkyria.cz`, but its statically generated `/robots.txt`
retained the old build-time Host and Sitemap. HTML metadata and the dynamic sitemap
already used the running origin. The production cutover's failed HTTP report is
retained separately; these observations are local regression proof, not deployment.
The subsequent [production acceptance](production/README.md) records the actual
`e03d3c5` promotion, immutable image and separate 55/55 public HTTP result.

Application fix: `73737b9824331d5b144534cbc81cebdc339e6491`, based on
`5e83abc91560480e21b60c4a2638c0b52b0e1720`. Only the metadata route rendering policy,
its production HTTP regression and the previous-image rehearsal pin changed.

## Actual observations

The [local record](local-proof.json) identifies versions, commands, build ID, exact
source-file fingerprints and the complete passing HTTP response.

1. Before the fix, a production build made at loopback port 3137 was served at port
   3138. The new HTTP test failed because Host still advertised port 3137. The
   [frozen static response](red-robots.txt) preserves that defect.
2. After `dynamic = 'force-dynamic'`, a fresh production build used
   `APP_URL=https://build-origin.invalid` and ran at `http://127.0.0.1:3138`.
   Host and Sitemap used the runtime origin; robots was absent from the static
   prerender manifest.
3. An initial assertion incorrectly expected `no-store`. Installed Next.js 16.3.6's
   dynamic text metadata loader instead sets `public, max-age=0, must-revalidate`.
   That failed 5/6 run remains recorded. The assertion was corrected to this actual
   revalidation contract, without changing the origin or privacy expectations.
4. The final sharing/SEO suite passed **6/6**, **0 skips**, **0 retries** in 6.8 seconds,
   asserting both origin directives, root/social allowances and all seven private
   exclusions. Build, lint, typecheck and foundation checks also passed.

CI already builds at `http://localhost:3000` and starts its standalone fixture server
at `http://127.0.0.1:3100`, so the committed regression exercises different origins in
the regular pipeline. Use the existing isolated E2E database procedure; never target
production. From `apps/web`, after a build with a different `APP_URL`:

```sh
pnpm exec playwright test e2e/social-seo.spec.ts --project chromium --workers 1
```

The local disposable PostgreSQL 18.4 database and owned mock/server processes were
cleaned up. CI separately uses its declared PostgreSQL version and image rehearsal.
The rollback pin is the actual current unified image `5e83abc` / `79bf4e…`; no new
image was published or deployed by this local check.

Screenshots: **N/A** for the machine-readable text endpoint; the actual built HTTP
response is the relevant proof. Issue #46's browser cancellation investigation is
unaffected. Publication, current-image readiness and public canonical recovery are
recorded separately in the production acceptance linked above; the original failed
cutover report is preserved.
