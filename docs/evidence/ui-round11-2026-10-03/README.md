# UI round 11: hydration, League preview order, administration landmarks, editor CSP, copy and touch targets (2026-10-03)

Before: main `e46c67c` (the PR #94 merge), captured by the round 11 audit from its local
standalone build. After: branch `feat/hll-platform-handoff` at `b5a40d9`.

All captures come from standalone production builds served locally with the synthetic e2e
fixtures (`LOGI_READERS_SOURCE=synthetic-fixture`), the missing-video fallback and the
local Discord mock, captured in Chromium with Playwright (Europe/Prague, 1× pixel ratio)
by the audit scripts (full page; signed-in captures use synthetic sessions). Every image
is registered in `assets/manifest.json`.

The audit covered 28 public cases (hub, both landings, the Wardogs servers page with the
Warcon panel, the matches list and the upcoming fixture with the League preview, HLL
servers, field manual and FAQ, news, members, clan, community) and 56 signed-in
administration cases, in cs/en at 1440×900 and 390×844 plus the Wardogs home at
1280×700, with overflow, text-clip, sub-44 px control, console/page-error, 4xx, raw-key
and axe checks. It found twelve issues; all are fixed (see `docs/STATUS.md`, "Public and
administration UI round 11"). The same scripts ran again on the fixed build: no axe
violation on any of the 122 cases, no page error, no horizontal overflow; the only
console errors are the expected 404s of the missing-video fixtures.

| Scenario | Before | After |
|---|---|---|
| `/cs/wardogs/matches/<upcoming fixture>`: Phone match page, Czech. Before: the "Náhled z League" section was auto-placed into the hidden toolbar row above the match card while saying the result "above" is the clan's. After: the preview follows the match detail; "Termín" instead of a second "Naplánováno", a labelled aligned "Postup" list, freshness badge plus plain observation text, the dashed synthetic note. | [before](before/wardogs-match-league-cs-390x844.webp) | [after](after/wardogs-match-league-cs-390x844.webp) |
| `/cs/wardogs/matches/<upcoming fixture>`: Desktop match page, Czech. Before: uppercase green observation badge, unlabelled progress list with ragged step labels, muted synthetic line. After: the same treatment as the Warcon panel. | [before](before/wardogs-match-league-cs-1440x900.webp) | [after](after/wardogs-match-league-cs-1440x900.webp) |
| `/cs/wardogs/servers?server=synthetic-wardogs`: Wardogs server detail, Czech. Before: sentence-case fact labels, each round stacked over three rows, "řádky hráčů se nezobrazují", 12 / 98 players against 0 / 98 in the detail panel. After: uppercase tracked labels like the detail panel, one compact row per round, visitor wording, consistent player count. | [before](before/wardogs-server-warcon-cs-1440x900.webp) | [after](after/wardogs-server-warcon-cs-1440x900.webp) |
| `/en/wardogs/servers?server=synthetic-wardogs`: Wardogs server detail, English. Before: the page hydrated with React error #418 because Node rendered "Sat 3 Oct, 17:07 CEST" and Chromium "Sat, 3 Oct, 17:07 CEST" for the round times. After: deterministic "Sat 3 Oct, 19:20 CEST" labels built from date parts; the audit script and `e2e/wardogs-warcon.spec.ts` record no page or console error. | [before](before/wardogs-server-warcon-en-1440x900.webp) | [after](after/wardogs-server-warcon-en-1440x900.webp) |
| `/cs/wardogs`: Wardogs home on a phone. Before: the server name link was 28 px tall. After: a 44 px row; the overview is otherwise unchanged (the Warcon panel never reached the home). | [before](before/wardogs-home-cs-390x844.webp) | [after](after/wardogs-home-cs-390x844.webp) |
| `/cs/admin/integrations`: Integrations administration, Czech, full page. Before: the readers block printed the English "synthetic fixture source (tests and review captures only)" and "Liga Wardogs". After: "syntetický zdroj – jen testy a kontrolní snímky" and "Wardogs League"; the administration bar is a labelled region instead of a second banner. | [before](before/admin-integrations-cs-1440x900.webp) | [after](after/admin-integrations-cs-1440x900.webp) |
| `/cs/admin/integrations`: Same page on a phone. Before: 22 px "Zobrazit na webu" checkboxes. After: 24 px boxes in 44 px label rows. | [before](before/admin-integrations-cs-390x844.webp) | [after](after/admin-integrations-cs-390x844.webp) |
| `/cs/admin`: Administration overview, Czech. Before: the account label truncated to "SYNTHETIC ADMINISTRA…" and axe reported two banner landmarks. After: the full name fits (16em, `title` on the button) and axe passes. | [before](before/admin-overview-cs-1440x900.webp) | [after](after/admin-overview-cs-1440x900.webp) |
| `/cs/admin/matches/<id>`: Wardogs match editor, Czech. Before: the League URL input sat about 80 px lower than its neighbours because of a long hint, and the editor injected a nonce-less style the CSP refused. After: the three inputs align on their bottom edge with a one-sentence hint; no CSP console error; "Odkazy na videa (VOD)" is an h2. | [before](before/admin-match-editor-cs-1440x900.webp) | [after](after/admin-match-editor-cs-1440x900.webp) |

Tests on `b5a40d9` (local): `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` (96 files,
1035 tests), `node scripts/check-foundation.mjs`, `pnpm build`;
`playwright test --project=chromium --project=chromium-admin`: 240 passed, 107 opt-in
captures skipped; `npx vitest run --project integration`: 50 files, 513 tests passed.
New or extended assertions: `e2e/wardogs-warcon.spec.ts` (no page/console error on the
server detail and the match page in both locales, preview below the match detail at
390 px, progress label and badge words, deterministic round-time labels, 44 px event link),
`e2e/admin-shell-layout.spec.ts` (labelled region and one banner with axe on `/cs/admin`,
phone touch targets, editor toolbar tab stop, VOD h2, no `style` without nonce and no CSP
console error on the match and news editors, axe on the editor at 390 px),
`e2e/admin-integrations.spec.ts` ("Wardogs League", the Czech synthetic detail, no raw
code), `e2e/shell.spec.ts` (home server link ≥44 px at 390 px),
`src/i18n/date-format.test.ts` (cs/en, summer/winter time, invalid input).
