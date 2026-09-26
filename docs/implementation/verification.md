# Acceptance and verification matrix

Foundation check proves file hygiene, JSON parsing, local links and asset digests. It
does not prove application behavior. All requirements below are for the implementation.

| Area | Required evidence |
|---|---|
| Reproducible build | Clean checkout, pinned Node/pnpm, frozen install, lint/typecheck/unit/integration/build |
| Home/menu | Actual screenshots against reference 09 at 2560×1440, 1440×900 and mobile widths |
| Lists/detail | Match/member filters, sorting, selection, pagination and detail URLs; reference 13/12 comparisons |
| Navigation | Direct URL, refresh, browser back/forward, focus restoration, 404 and title/metadata |
| Motion/video | Allowed autoplay, rejected playback, missing source, pause preference, hidden tab, reduced-motion and save-data |
| Mobile/accessibility | 360 and 390 px wide, 200% zoom, keyboard, focus visibility, semantic headings, contrast and no horizontal page overflow |
| Content | Only published data accessible; draft/preview cannot leak through endpoints, cache or SEO |
| Rich-text CMS | Create formatted post + cover/inline image, autosave/reload, preview, publish; restore to draft without changing live content |
| Editorial media | Reject hostile/oversized uploads and pasted markup; scoped access, draft assets private, safe referenced-asset deletion |
| Scheduled posts | Due/cancel/reschedule/retry, preserve live revision/metadata during scheduled updates, UTC/DST boundaries, scoped local-admin delegation/revocation, stalled runner, no double publication |
| Match authoring | Create/publish fixture, postpone/cancel, record verified result; unknown score remains null; scope checks |
| HLL links | NEWS and HLL WEBSITE discoverable without login on desktop/mobile; correct external HLL domain/archive |
| OAuth/session | State/redirect handling, expiry/logout/revocation, unavailable provider and safe errors |
| Roles | Unmapped/missing/wrong guild, stale snapshot, 429/outage, role removal, mapping-version change |
| Server permissions | Direct API calls deny editor-to-match escalation, cross-user edits and cross-match IDOR |
| Admin recovery | No public password signup, provisioning/MFA gate, no social-provider linking/bypass, rate limit, one-use recovery and session revocation |
| DB | Fresh migration, upgrade from previous schema, idempotent seed, transaction/uniqueness behavior |
| Container | Build/start as non-root, liveness, readiness failure/recovery, no secrets in layers, SBOM and image scan |
| Production release | Digest matches accepted commit, backup/restore, authorized live login + admin behavior, rollback path |

Use Vitest for domain/policy tests, PostgreSQL integration tests and Playwright for
user journeys. Mock Discord at the adapter/network boundary; mock success is never
reported as successful live Discord OAuth or gateway verification. Include a malicious
return URL and stale role update in initial-release negative cases. Concurrent roster
assignment and capacity/lock tests are required in M4 when roster management is implemented.

Automated accessibility checks complement manual keyboard/screen-reader testing;
they do not certify accessibility. Motion may be approximated from static screenshots;
record the final proposed timing and prove reduced-motion behavior.

Visual checks use a deterministic approved/synthetic poster or fixed video frame,
fixed content and fonts, and documented browser/version/viewport. Do not bless a new
snapshot just to hide a regression. Do not report pixel-perfect fidelity when the final
background video is missing; identify that acceptance item separately.

Performance measurements must state device/network/tool, cache state and build revision.
Media bytes are separate from initial JS. Home navigation should be usable before the
background video loads. Inspect actual network activity to prove no video source request
under reduced-motion/save-data, not just whether playback stopped visually.

Keep a concise evidence table in `docs/STATUS.md`: check, command/scenario, revision,
result, artifact path/link and limitations. Mark `not run`, `blocked`, `failed`, `passed`
explicitly. Never publish real credentials, session cookies or private member records
inside logs, screenshots, CI artifacts or test fixtures.
