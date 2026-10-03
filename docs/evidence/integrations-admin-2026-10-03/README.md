# Integration health administration and public server presentation (2026-10-03)

Branch `feat/integrations-admin` merged with main `dbef6e0`; captures from the local
standalone production build of `1bfd2af` with the synthetic e2e fixtures (synthetic
server sources for both games, no Logi source, the e2e Discord role mapping) and the
missing-video fallback, taken in Chromium with Playwright (Europe/Prague, 1× pixel ratio)
by `e2e/visual-admin-integrations.spec.ts` (`CAPTURE_EVIDENCE=1`). Signed-in captures use
synthetic administrator sessions against the local Discord mock. Every image is registered
in `assets/manifest.json`.

Acceptance of the read-only part of #22 on this slice: an administrator with
`settings.manage` sees, per game, the server-status source, the configured public
servers and the current public overview, per Logi source one state per purpose derived
from the website's own collector tables, webhook/command queue aggregates and the Discord
role-mapping summary; no key, base URL, address, scope key or raw provider payload is
rendered or serialized; editors and match managers are denied on the direct URL. The same
page edits the allowlisted `servers.presentation` setting (display name, visibility,
order), which every public overview read applies, so a hidden server disappears from the
servers page, the Wardogs home overview and the polling route, and a renamed server shows
its website name.

| Capture | What it shows |
|---|---|
| [integrations-cs-1440x900-full](integrations-cs-1440x900-full.webp) | Administrator, /cs/admin/integrations at 1440×900 (full page): website collector health with the scope notice, both games on labelled synthetic fixtures with their current public state, no Logi source configured (nothing shown as healthy), webhooks/commands disabled and the six-entry e2e Discord role mapping. No key, host or URL from the configuration is rendered. |
| [integrations-en-390x844](integrations-en-390x844.webp) | Administrator, /en/admin/integrations on a 390×844 phone: the English page wraps server rows, badges and the Logi/Discord fact lists without horizontal overflow. |
| [integrations-en-390x844-logi](integrations-en-390x844-logi.webp) | Administrator, /en/admin/integrations on a 390×844 phone, scrolled to the Logi section: SSO disabled/not configured, Discord membership source, webhooks and commands disabled, and the honest "No Logi source is configured" empty state. |
| [integrations-cs-1440x900-presentation-dirty](integrations-cs-1440x900-presentation-dirty.webp) | Administrator, /cs/admin/integrations at 1440×900: the server presentation form with an unsaved display name and order for the synthetic Wardogs server and the synthetic HLL "Charlie" server unchecked (amber hidden marker); the sticky bar reports "2 servery změněny – neuloženo". Nothing was saved for this capture. |

Verification on `1bfd2af` (local, synthetic data):
- `pnpm lint`, `pnpm typecheck`: no findings.
- `pnpm test:unit`: 89 files, 951 tests passed.
- `pnpm test:integration` (PostgreSQL): 49 files, 508 tests passed, including `tests/integration/admin-health.test.ts`
  (denials incl. a stale administrator, never-ran/unknown health, seeded fresh/stale/error
  and bootstrap scopes, health projection of the active generation only, inbox/command
  aggregates, server sources with invalid configuration and a throwing provider, and the
  exposure assertion that the serialized DTO contains no key, secret, base URL, origin,
  hostname, address or scope key) and `tests/integration/settings-presentation.test.ts`
  (denials, validation codes, store/apply/audit shape/conflict/clear).
- `playwright test --project=chromium --project=chromium-admin`: 227 passed, 99 opt-in captures skipped. `e2e/admin-integrations.spec.ts`
  covers the Czech and English health view without configuration internals and without
  `/api/servers/` polling, the denial of editors and match managers on the direct URL,
  and the presentation journey: client validation, rename of the Wardogs server and
  hiding of `synthetic-charlie`, the public pages and the polling route reflecting it
  (`livePlayers: null` for the hidden server), an aborted save keeping the values, and the
  override cleared at the end. Before the full run the two specs ran alone on the
  pre-merge build (3 passed) and surfaced two capture/test corrections: the form notice is
  read instead of every page alert, and the full-page capture ends scrolled to the bottom
  so the sticky save bar sits at its natural place.
- `playwright test --project=chromium-admin-capture e2e/visual-admin-integrations.spec.ts`:
  3 passed, 4 captures above.
- `node scripts/check-foundation.mjs`: passed.

Limitations: no Logi source is configured in the e2e environment, so the healthy, stale,
unavailable and bootstrapping Logi states are proven by the seeded PostgreSQL cases only;
the captures show the honest "no Logi source" state. Hosted runtime facts and production
activation stay out of scope. The presentation cache is per process and cleared by the
saving process; other instances converge within 15 seconds (runbook).
