# UI round 12: match statistics on phones, editor outline, audit log, login order and touch targets (2026-10-03)

Before: main `22034ca` (the PR #95 merge), captured by the round 12 audit from its local
standalone build. After: branch `feat/hll-platform-handoff` at `6a5922f` (code unchanged
since `57c153a`).

All captures come from standalone production builds served locally with the synthetic e2e
fixtures (`LOGI_READERS_SOURCE=synthetic-fixture`), the missing-video fallback and the
local Discord mock, captured in Chromium with Playwright (Europe/Prague, 1× pixel ratio)
by the audit scripts (full page; signed-in captures use synthetic sessions; the Players
tab capture clicks the tab first). Every image is registered in `assets/manifest.json`.

The audit covered the public HLL/Wardogs match details with the statistics tabs,
tournaments, members, login and team pages and the signed-in audit log, member,
tournament, match, news, page, field-manual and media screens, in cs/en at 1440×900,
1024×768 and 390×844, with overflow, text-clip, sub-44 px control, console/page-error,
4xx, raw-key and axe checks. It found 17 issues; 16 are fixed (see `docs/STATUS.md`,
"Public and administration UI round 12") and the raw audit action keys stay as a
technical read-only log by design. The same scripts ran again on the fixed build:
no axe violation, page error or horizontal overflow on any of the 220 cases (120 public,
72 signed-in, 28 statistics/import variants); the only 4xx responses are the six intentional
`/neexistuje` probes, the only console errors are the expected 404s of the missing-video
fixtures, and the raw `seed.page.insert` key in the audit log remains by design.

| Scenario | Before | After |
|---|---|---|
| `/cs/hll/matches/<historical fixture>` (Players tab): Phone match statistics, Czech. Before: the players table was cut at the viewport edge after the kills column with no scroll affordance ("ZABIT" header clipped), so the remaining metrics were unreachable. After: a labelled, focusable scroll region with a faded trailing edge; the player column stays sticky at a readable width while the metric columns scroll. | [before](before/hll-match-players-cs-390x844.webp) | [after](after/hll-match-players-cs-390x844.webp) |
| `/cs/hll/matches/<historical fixture>`: Phone match page, Czech. Before: the summary and weapons tables were clipped at the right edge (the opponent column half visible) and the rounds table repeated "Warfare" in a mode column. After: both tables fit the 314 px region, the shared mode is a match fact plus a hidden caption, and the rounds table keeps score and result on screen. | [before](before/hll-match-detail-cs-390x844.webp) | [after](after/hll-match-detail-cs-390x844.webp) |
| `/cs/wardogs/matches/<verified result fixture>`: Phone Wardogs match page, Czech. Before: the rounds table spent a column on "Synthetic mode" three times and the result column fell off the screen. After: mode in the match facts, score and result visible without scrolling. | [before](before/wardogs-match-detail-cs-390x844.webp) | [after](after/wardogs-match-detail-cs-390x844.webp) |
| `/cs/hll/matches/<historical fixture>`: Desktop match page, Czech. Before: "Zaznamenané body 3 · 2", the rounds section shared its name with the "Mapy a kola" section (axe `landmark-unique`), the "SHF" badge repeated beside "SHF (Osa)" and a mode column. After: "3 : 2" like the result, a uniquely labelled rounds region, the badge omitted beside a name that starts with it, mode as a fact; axe passes. | [before](before/hll-match-detail-cs-1440x900.webp) | [after](after/hll-match-detail-cs-1440x900.webp) |
| `/cs/login`: Phone login, Czech, Logi not configured. Before: a disabled "Pokračovat přes Logi" button came first, then the notice, then Discord; the two text links were 25 px rows. After: the working Discord form comes first, the Logi notice follows without a dead button, and the text links are 44 px rows. | [before](before/login-cs-390x844.webp) | [after](after/login-cs-390x844.webp) |
| `/en/hll/tournaments/<league fixture>`: Desktop tournament page, English. Before: the generic link label stayed Czech ("Web soutěže (ukázka)") on the English page and the link was a 25 px text row. After: "Tournament website (ukázka)" with the trailing note kept, in a 44 px row. | [before](before/hll-tournament-en-1440x900.webp) | [after](after/hll-tournament-en-1440x900.webp) |
| `/cs/admin/audit`: Phone audit log, Czech. Before: the time cell wrapped over four lines in a 38 px column (the row link measured 38×83 px) and action keys broke at every dot, so each event took a tall narrow block. After: the table keeps a 44rem minimum width inside a scroll region with a one-line time cell, one-line keys and a 44 px row link. | [before](before/admin-audit-cs-390x844.webp) | [after](after/admin-audit-cs-390x844.webp) |
| `/cs/admin/tournaments/<id>`: Tournament editor, Czech. Before: "Odkazy" and the prose tab titles were h3 directly under the h1 (axe `heading-order`) and the linked match was an inline text link. After: an h2 outline, a hint on the link label field and a 44 px linked-match row; axe passes (the pages look nearly identical, the change is structural). | [before](before/admin-tournament-editor-cs-1440x900.webp) | [after](after/admin-tournament-editor-cs-1440x900.webp) |
| `/cs/admin/matches/<hll id>`: HLL match editor, Czech. Before: the round map name field was the narrowest column ("Hürtgen Fores" clipped). After: the map name gets the wider first track of the round row. | [before](before/admin-hll-match-editor-cs-1440x900.webp) | [after](after/admin-hll-match-editor-cs-1440x900.webp) |
| `/cs/admin/manual/<id>`: Field-manual editor, Czech. Before: "Zdroj a řazení" was a plain stacked form with a body heading that stretched across the full page width under the sidebar, unlike the other editor panels. After: a panel with the shared header style in the editor column width. | [before](before/admin-manual-editor-cs-1440x900.webp) | [after](after/admin-manual-editor-cs-1440x900.webp) |
| `/cs/admin/news/<id>?lang=en`: Phone news editor on the English version, Czech UI. Before: the rich-text image node used a 13 px checkbox, 40 px inputs and select and a 36 px remove button, and the toolbar buttons were 40 px wide. After: a 24 px checkbox in a 44 px row, 44 px inputs/select/buttons and 44 px-wide toolbar buttons. | [before](before/admin-news-editor-image-cs-390x844.webp) | [after](after/admin-news-editor-image-cs-390x844.webp) |

Tests on `6a5922f` (local, Node 22.22.2 in this container): `pnpm lint`, `pnpm typecheck`,
`pnpm test:unit` (96 files, 1039 tests), `node scripts/check-foundation.mjs`, `pnpm build`;
`playwright test --project=chromium --project=chromium-admin`: 243 passed, 107 opt-in captures skipped;
`npx vitest run --project integration`: 50 files, 513 tests passed.
New or extended assertions: `e2e/public-matches.spec.ts` (390 px match tables: result
column on screen, summary fits, sticky player cell of readable width after scrolling,
edge state, axe on the HLL match detail), `e2e/admin-shell-layout.spec.ts` (axe on the
tournament and member editors, audit time cell, one-line keys and row link at 390 px),
`e2e/shell.spec.ts` (1024 px account tooltip), `e2e/auth.spec.ts` (login provider order
without Logi), `e2e/team-pages.spec.ts` (team page titles) and `e2e/legacy-parity.spec.ts`
("3 : 2" recorded points).
