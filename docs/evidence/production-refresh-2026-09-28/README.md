# Production refresh verification

Public verification for the next accepted Wardogs website deployment. **The before-state is recorded;
after-deployment verification has not run.** Promotion is waiting for the article layout-shift fix
tracked by [issue #43](https://github.com/ValkyriaWDG/www/issues/43). This directory does not establish
that a new container has been published or deployed.

## Before-state

[HTTP observations](http-before.json): **24 of 37 checks passed, 13 failed** against the accepted target
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

An earlier local diagnostic pass over-required an explicit `og:url` on home/member-list pages and
`no-store` on the sitemap. These were harness assumptions, not accepted application requirements.
The final harness checks an `og:url` for consistency when supplied and accepts either `no-store` or
`max-age=0, must-revalidate` without stale allowances for the sitemap. The initial diagnostic output
and its exact harness are preserved locally; the linked baseline was collected again with the final
HTTP harness that will also be used after deployment. Homepage canonical presence remains mandatory.

## Reproducible public reads

Both scripts run from a checkout with Node 24; the browser script additionally resolves the existing
application Playwright dependency. No PostgreSQL instance, owner cookies or provider credentials are
used. HTTP requests use only anonymous GET/HEAD; the browser uses new isolated contexts and blocks
other methods and external origins. Neither script submits login, changes content or edits infrastructure.

The HTTP script verifies root redirect, health, Czech/English canonicals and reciprocal languages,
Open Graph/Twitter metadata, real 1200×630 social PNG headers/signature/dimensions, robots, sitemap,
anonymous privacy cache, and the four approved media derivatives through HEAD and 1,024-byte ranges.
It never downloads whole video files, saves response HTML or serializes cookies.

The browser script is prepared for six bounded checks: Czech and English desktop metadata/native
playback, manual pause/reload/resume, Czech and English mobile poster/metadata, and no uncaught errors
or write attempts. It saves four actual public captures. Mobile/touch is emulation; these are short
playback measurements, not full-loop, all-codec or physical-device qualification. Captures must be
inspected separately before their captions and asset-manifest entries are accepted.

Before-state command, run from the repository root:

```sh
node docs/evidence/production-refresh-2026-09-28/http-smoke.mjs --stage before
```

After the deployment operator verifies the actual running source label and pulled digest, use their
observed values, with a sanitized public deployment-evidence filename:

```sh
node docs/evidence/production-refresh-2026-09-28/http-smoke.mjs --stage after --revision <observed-full-sha> --digest sha256:<observed-digest> --identity-ref <deployment-record.json>
node docs/evidence/production-refresh-2026-09-28/browser-smoke.cjs --revision <observed-full-sha> --digest sha256:<observed-digest> --identity-ref <deployment-record.json> --browser-executable <explicit-isolated-browser-path> --browser-product "Google Chrome for Testing"
```

Placeholders are instructions, not deployment claims. Reports record the operator-supplied identity
and distinguish it from the local harness revision/hash and observed browser version/executable hash.
Existing report files are never overwritten; use `--report-id <safe-name>` for a new attempt and retain
the original result. JSON reports save selected public metadata and bounded diagnostic fields only.

## Status and limits

- HTTP harness syntax check and the real before-state run completed. A nonzero exit is expected while
  target SEO functionality is absent; it is not swallowed or relabeled as passing.
- Browser harness syntax/help checks passed; real after-deployment execution is **not run**.
- No new screenshots or manifest entries exist yet. After captures will use actual production pages;
  synthetic content or earlier local images cannot substitute for deployment evidence.
- Public checks cannot prove authenticated authorization, role synchronization, every unpublished
  content boundary, actual social-network unfurling, or the host/container identity. Those require their
  separate evidence. No issue closure is justified by this before-state package.
