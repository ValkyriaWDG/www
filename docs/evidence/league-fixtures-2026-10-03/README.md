# Wardogs League tracked fixtures reader on the Wardogs matches page (2026-10-03)

Branch `feat/logi-league-fixtures` on main `85c5737`; captures from the local standalone
production build of `66ba8a6` with the synthetic e2e fixtures and the synthetic reader
source (`LOGI_READERS_SOURCE=synthetic-fixture`: labelled `[SYNTHETIC]` fixtures validated
through the same closed wire schema as a hosted `league-fixtures` read), the missing-video
fallback and the local Discord mock, taken in Chromium with Playwright (Europe/Prague, 1×
pixel ratio) by `e2e/visual-wardogs-readers.spec.ts` and `e2e/visual-admin-integrations.spec.ts`
(`CAPTURE_EVIDENCE=1`). Every image is registered in `assets/manifest.json`.

Acceptance of this #87 follow-up (local synthetic proof, hosted activation open): the
Wardogs matches page lists the Wardogs League fixtures Logi tracks for the clan after the
unfiltered Upcoming list, with kickoff, teams, map, localized League type and status,
freshness and tracking badges, the observation time and links to Wardogs League, to the
clan's own match page when a published match carries the same League link, and to the
Logi roster page only for a published Logi event; a fixture never carries a result; the
section is absent from the results view, filtered or paged lists, the shared list, the
HLL matches page and the Wardogs home; the administration integrations page reports the
third reader state, including the explicit-grant (403) and not-deployed (404) reasons.

| Capture | What it shows |
|---|---|
| [matches-league-fixtures-cs-1440x1050](matches-league-fixtures-cs-1440x1050.webp) | Visitor, /cs/wardogs/matches at 1440×1050: the Upcoming list of the Wardogs section followed by the "Tracked Wardogs League fixtures" section labelled as an unverified overview with synthetic-data note and three synthetic fixtures (two current tracked fixtures with kickoff, three team codes with names, map · zone · lighting, type/status and links to Wardogs League and, for the alpha fixture, to the clan's own match page; one paused fixture without a kickoff marked stale); no result appears. |
| [matches-league-fixtures-en-1440x1050](matches-league-fixtures-en-1440x1050.webp) | Visitor, /en/wardogs/matches at 1440×1050: the Upcoming list of the Wardogs section followed by the "Tracked Wardogs League fixtures" section labelled as an unverified overview with synthetic-data note and three synthetic fixtures (two current tracked fixtures with kickoff, three team codes with names, map · zone · lighting, type/status and links to Wardogs League and, for the alpha fixture, to the clan's own match page; one paused fixture without a kickoff marked stale); no result appears. |
| [matches-league-fixtures-cs-390x844](matches-league-fixtures-cs-390x844.webp) | Visitor, /cs/wardogs/matches at 390×844: the Upcoming list of the Wardogs section followed by the "Tracked Wardogs League fixtures" section labelled as an unverified overview with synthetic-data note and three synthetic fixtures (two current tracked fixtures with kickoff, three team codes with names, map · zone · lighting, type/status and links to Wardogs League and, for the alpha fixture, to the clan's own match page; one paused fixture without a kickoff marked stale); no result appears. |
| [matches-league-fixtures-en-390x844](matches-league-fixtures-en-390x844.webp) | Visitor, /en/wardogs/matches at 390×844: the Upcoming list of the Wardogs section followed by the "Tracked Wardogs League fixtures" section labelled as an unverified overview with synthetic-data note and three synthetic fixtures (two current tracked fixtures with kickoff, three team codes with names, map · zone · lighting, type/status and links to Wardogs League and, for the alpha fixture, to the clan's own match page; one paused fixture without a kickoff marked stale); no result appears. |
| [integrations-cs-1440x900-full](integrations-cs-1440x900-full.webp) | Administrator, /cs/admin/integrations at 1440×900 (full page): website collector health with the scope notice, both games on labelled synthetic fixtures with their current public state, no Logi source configured (nothing shown as healthy), the "Čtečky Wardogs (League, Warcon)" block showing the three readers (League preview, tracked League fixtures, Warcon) as Nastaveno on the synthetic fixture source with their last-attempt facts, webhooks/commands disabled and the six-entry e2e Discord role mapping. No key, host, URL or connection ID from the configuration is rendered. |
| [integrations-en-390x844-logi](integrations-en-390x844-logi.webp) | Administrator, /en/admin/integrations on a 390×844 phone, scrolled to the Logi section: SSO disabled/not configured, Discord membership source, webhooks and commands disabled, the honest "No Logi source is configured" empty state and the "Wardogs readers (League, Warcon)" block with the three readers (League preview, tracked League fixtures, Warcon) Configured on the synthetic fixture source, stacked without horizontal overflow. |

Tests on the branch head (local, Node 22.22.2): `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`
(99 files, 1064 tests), `node scripts/check-foundation.mjs`, `pnpm build`; the full browser
suite `playwright test --project=chromium --project=chromium-admin` 249 passed (111 opt-in
captures skipped) and `npx vitest run --project integration` 514 tests in 50 files passed,
both on an isolated port and database. Hosted activation is not part of this evidence: no
`league-fixtures` response of the hosted producer exists yet, and the League key needs the
explicit grant before anything real is listed.
