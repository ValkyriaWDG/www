# Approved Logi readers: League preview and Warcon on the Wardogs pages (2026-10-03)

Branch `feat/logi-readers` merged with main `86b6061`; captures from the local standalone
production build of `1342841` with the synthetic e2e fixtures and the synthetic reader
source (`LOGI_READERS_SOURCE=synthetic-fixture`: labelled `[SYNTHETIC]` data validated
through the same closed wire schemas as a hosted read), the missing-video fallback and
the local Discord mock, taken in Chromium with Playwright (Europe/Prague, 1× pixel
ratio) by `e2e/visual-wardogs-readers.spec.ts` and `e2e/visual-admin-integrations.spec.ts`
(`CAPTURE_EVIDENCE=1`). Every image is registered in `assets/manifest.json`.

Acceptance of #87 on this slice (local synthetic proof, hosted activation open): the
Wardogs server detail shows the approved Warcon live facts and the last five rounds
without player rows, Steam IDs, panel or join identifiers or connection IDs; a Wardogs
match with an editorial League URL shows an unverified League preview with its
observation time and never a result; the readers report their capability state on the
integrations administration page; a hidden or unpublished server never surfaces Warcon
data; HLL pages are untouched.

| Capture | What it shows |
|---|---|
| [server-detail-warcon-cs-1440x1050](server-detail-warcon-cs-1440x1050.webp) | Visitor, /cs/wardogs/servers?server=synthetic-wardogs at 1440×1050: the synthetic Wardogs server detail followed by the "Live (Warcon)" section (synthetic-data note, map, players 12 / 98, named scores Alpha 0 · Bravo 12 · Charlie 7, round time, rotation, "Current" freshness badge with the observation time) and the "Recent matches" list of five synthetic rounds with peak players, final scores and winner; no player rows, Steam IDs or connection identifiers. |
| [match-league-preview-cs-1440x1050](match-league-preview-cs-1440x1050.webp) | Visitor, /cs/wardogs/matches/ukazka-wardogs-nadchazejici at 1440×1050: the published upcoming Wardogs fixture with its CMS result block (no result yet) and, below, the "League preview" section labelled as an unverified preview from Wardogs League with synthetic-data note, fixture number and title, type/status/scheduled time, three team codes with names, map/zone/lighting, hosting, map vote, four progress steps, the observation time badge and the source link; the preview shows no result. |
| [server-detail-warcon-en-1440x1050](server-detail-warcon-en-1440x1050.webp) | Visitor, /en/wardogs/servers?server=synthetic-wardogs at 1440×1050: the synthetic Wardogs server detail followed by the "Live (Warcon)" section (synthetic-data note, map, players 12 / 98, named scores Alpha 0 · Bravo 12 · Charlie 7, round time, rotation, "Current" freshness badge with the observation time) and the "Recent matches" list of five synthetic rounds with peak players, final scores and winner; no player rows, Steam IDs or connection identifiers. |
| [match-league-preview-en-1440x1050](match-league-preview-en-1440x1050.webp) | Visitor, /en/wardogs/matches/ukazka-wardogs-nadchazejici at 1440×1050: the published upcoming Wardogs fixture with its CMS result block (no result yet) and, below, the "League preview" section labelled as an unverified preview from Wardogs League with synthetic-data note, fixture number and title, type/status/scheduled time, three team codes with names, map/zone/lighting, hosting, map vote, four progress steps, the observation time badge and the source link; the preview shows no result. |
| [server-detail-warcon-cs-390x844](server-detail-warcon-cs-390x844.webp) | Visitor, /cs/wardogs/servers?server=synthetic-wardogs at 390×844: the synthetic Wardogs server detail followed by the "Live (Warcon)" section (synthetic-data note, map, players 12 / 98, named scores Alpha 0 · Bravo 12 · Charlie 7, round time, rotation, "Current" freshness badge with the observation time) and the "Recent matches" list of five synthetic rounds with peak players, final scores and winner; no player rows, Steam IDs or connection identifiers. |
| [match-league-preview-cs-390x844](match-league-preview-cs-390x844.webp) | Visitor, /cs/wardogs/matches/ukazka-wardogs-nadchazejici at 390×844: the published upcoming Wardogs fixture with its CMS result block (no result yet) and, below, the "League preview" section labelled as an unverified preview from Wardogs League with synthetic-data note, fixture number and title, type/status/scheduled time, three team codes with names, map/zone/lighting, hosting, map vote, four progress steps, the observation time badge and the source link; the preview shows no result. |
| [server-detail-warcon-en-390x844](server-detail-warcon-en-390x844.webp) | Visitor, /en/wardogs/servers?server=synthetic-wardogs at 390×844: the synthetic Wardogs server detail followed by the "Live (Warcon)" section (synthetic-data note, map, players 12 / 98, named scores Alpha 0 · Bravo 12 · Charlie 7, round time, rotation, "Current" freshness badge with the observation time) and the "Recent matches" list of five synthetic rounds with peak players, final scores and winner; no player rows, Steam IDs or connection identifiers. |
| [match-league-preview-en-390x844](match-league-preview-en-390x844.webp) | Visitor, /en/wardogs/matches/ukazka-wardogs-nadchazejici at 390×844: the published upcoming Wardogs fixture with its CMS result block (no result yet) and, below, the "League preview" section labelled as an unverified preview from Wardogs League with synthetic-data note, fixture number and title, type/status/scheduled time, three team codes with names, map/zone/lighting, hosting, map vote, four progress steps, the observation time badge and the source link; the preview shows no result. |
| [integrations-cs-1440x900-full](integrations-cs-1440x900-full.webp) | Administrator, /cs/admin/integrations at 1440×900 (full page): website collector health with the scope notice, both games on labelled synthetic fixtures with their current public state, no Logi source configured (nothing shown as healthy), the "Čtečky Wardogs (League, Warcon)" block showing both readers as Nastaveno on the synthetic fixture source with their last-attempt facts, webhooks/commands disabled and the six-entry e2e Discord role mapping. No key, host, URL or connection ID from the configuration is rendered. |
| [integrations-en-390x844-logi](integrations-en-390x844-logi.webp) | Administrator, /en/admin/integrations on a 390×844 phone, scrolled to the Logi section: SSO disabled/not configured, Discord membership source, webhooks and commands disabled, the honest "No Logi source is configured" empty state and the "Wardogs readers (League, Warcon)" block with both readers Configured on the synthetic fixture source, stacked without horizontal overflow. |

Verification on `1342841` (local, synthetic data):
- `pnpm lint`, `pnpm typecheck`: no findings.
- `pnpm test:unit`: 96 files, 1033 tests passed.
- `pnpm test:integration` (PostgreSQL): 50 files, 513 tests passed, including
  `tests/integration/matches-league-url.test.ts` (canonical storage, Wardogs-only rule in
  the service and the `match_league_url_ck` constraint, HLL-scoped manager denied with a
  `game_scope` audit row, no URL in audit rows), `admin-health.test.ts` (reader states
  unconfigured/configured/unsupported and the exposure assertion with reader keys and an
  approved connection configured) and the migration chain `0011_taxonomy_admin` →
  `0012_league_match_url`.
- `playwright test --project=chromium --project=chromium-admin`: 237 passed, 107 opt-in captures skipped on `7b4c4cf`
  (`e2e/wardogs-warcon.spec.ts`: server detail with live facts and five rounds in cs/en at
  1440 and 390 px with axe and overflow checks, the match page with the League preview,
  the polling route carrying the Warcon DTO only for listed approved servers without
  identities and rejecting other query keys; `e2e/admin-integrations.spec.ts` with the
  readers block; the Wardogs home unchanged). The first full run on `533c9a0` failed ten
  cases: the Warcon panel had been added to the Wardogs home overview as well, which
  pushed the utility rail below short windows and duplicated the synthetic notice, the
  round list was counted with nested items and the polling assertion matched the
  existing live-players key; the panel left the home and the specs were corrected.
  After the row layout of `1342841` the Wardogs specs ran again: 48 passed (the eight captures, `wardogs-warcon`, `wardogs-servers` and `shell` specs; the CSS-only change needs no other suite).
- Reader unit tests cover 200/401/403/404/429 with `Retry-After`/503, malformed JSON,
  schema violations, timeout/abort and redirects, the URL policy, configuration rules
  and the cache transitions (fresh → failed pull → unavailable with the last observation
  time kept; stale after the lifetime; League never blocking a page once a preview
  exists).
- `playwright test --project=chromium --no-deps e2e/visual-wardogs-readers.spec.ts`:
  8 passed; `--project=chromium-admin-capture --no-deps e2e/visual-admin-integrations.spec.ts`:
  3 passed (two of its captures above show the readers block).
- `node scripts/check-foundation.mjs`: passed.

Limitations: no hosted Logi key, connection or League page was used; the producer
contract comes from Logi PR #158 at `c42ea770c307793494ae159a924f86e3c6ced50d` and its
recorded fixtures (see `apps/web/src/modules/integrations/logi/fixtures/provenance.md`).
The operator questions that gate hosted activation are listed in the
[readiness map](../../integrations/logi/readiness-2026-10-03.md).
