# UI round 13: administration workflows, denied pages, Logi pages, field manual column and dialogs (2026-10-03)

Before: main `85c5737` (the PR #96 merge), captured by the round 13 audit from its local
standalone build. After: branch `feat/hll-platform-handoff` at `f9330fb` (the fixed build;
the later commits add a test assertion, STATUS and this folder, and merge main `5e7a7d9`).

All captures come from standalone production builds served locally with the synthetic e2e
fixtures (`LOGI_READERS_SOURCE=synthetic-fixture`), the missing-video fallback and the
local Discord mock, captured in Chromium with Playwright (Europe/Prague, 1× pixel ratio)
by the audit scripts: static passes over signed-in and anonymous routes and a functional
walkthrough that performs the editor, match-manager, administrator and member workflows
(FAQ, field manual, news, media, servers, taxonomy, members, matches and tournaments,
settings, account) and captures their public results. Every image is registered in
`assets/manifest.json`.

The audit covered 132 signed-in and 72 anonymous static cases plus 10 walkthrough
scenarios in cs/en at 1440×900, 1024×768 and 390×844, with overflow, text-clip,
sub-44 px control, console/page-error, 4xx, raw-key and axe checks. It found eleven
issues; nine are fixed (see `docs/STATUS.md`, "Public and administration UI round 13")
and two cosmetic ones stay open (a per-session upload progress list and a library
console warning). The same scripts ran again on the fixed build: no axe violation, page
error, raw key or horizontal overflow on 204 static and 202 walkthrough captures.

| Scenario | Before | After |
|---|---|---|
| `/cs/hll/field-manual/<new short article>`: Desktop article with no table of contents, Czech. Before: the article text and the "Zdroj a autoři" panel fell into the 220–280 px navigation track, the text panel about 250 px wide and every provenance value one character per line. After: a single reading column; values on one line. | [before](before/manual-article-short-cs-1440x900.webp) | [after](after/manual-article-short-cs-1440x900.webp) |
| `/en/hll/field-manual/<new short article>`: Phone article, English. Before and after the phone layout is one column; the pair documents the same article on the fixed build. | [before](before/manual-article-short-en-390x844.webp) | [after](after/manual-article-short-en-390x844.webp) |
| `/cs/admin/news`: Member without the news capability, Czech. Before: the denial panel rendered under the tab title "Správa novinek". After: the tab, history and screen-reader title read "Přístup odepřen" (the panel is unchanged; the title is visible in the capture metadata). | [before](before/admin-news-denied-cs-1440x900.webp) | [after](after/admin-news-denied-cs-1440x900.webp) |
| `/cs/admin/members/logi?profile=<id>`: Phone Logi association editor, administrator. Before: native 13 px checkboxes. After: the shared 24 px labelled checkboxes in 44 px rows. | [before](before/admin-logi-association-cs-390x844.webp) | [after](after/admin-logi-association-cs-390x844.webp) |
| `/cs/admin/news`: News list at 1024 px, editor. Before: the table was clipped at the right edge with no cue that the actions column continues. After: the trailing edge fades over the hidden column until scrolled. | [before](before/admin-news-list-cs-1024x768.webp) | [after](after/admin-news-list-cs-1024x768.webp) |
| `/cs/admin/matches/logi`: Connected matches page, match manager. Before: the generic "Administrace · Valkyria" title. After: "Propojené zápasy · Správa" (title only; the page is otherwise unchanged). | [before](before/admin-matches-logi-cs-1440x900.webp) | [after](after/admin-matches-logi-cs-1440x900.webp) |
| `/cs/admin/news/<id>`: Schedule cancel dialog, editor, Czech. Before: "Zrušit" next to "Zrušit plán", the safe and destructive choices sharing one verb. After: "Ponechat plán" / "Zrušit plán". | [before](before/admin-news-schedule-dialog-cs-1440x900.webp) | [after](after/admin-news-schedule-dialog-cs-1440x900.webp) |
| `/en/admin/news/<id>`: The same dialog on a phone, English. Before: "Cancel" / "Cancel schedule". After: "Keep schedule" / "Cancel schedule". | [before](before/admin-news-schedule-dialog-en-390x844.webp) | [after](after/admin-news-schedule-dialog-en-390x844.webp) |
| `/en/community`: Phone community page after saving a community link in the settings. Before: the link was a 25 px target inside a 44 px row. After: the link itself is the 44 px target (visually subtle; measured by the audit). | [before](before/community-links-en-390x844.webp) | [after](after/community-links-en-390x844.webp) |
| `/cs/login/recovery`: The disabled recovery route, anonymous. Before: the 404 was titled "Obnovení přístupu správce · Valkyria", announcing the disabled feature. After: the generic "Valkyria" title (title only). | [before](before/login-recovery-404-cs-1440x900.webp) | [after](after/login-recovery-404-cs-1440x900.webp) |

Not captured as images: the rounds editor focus fix (moving a round to the first or last
position used to drop keyboard focus to the body; the walkthrough log records the focus
target and `e2e/admin-community-matches.spec.ts` asserts it).

Tests on the merged head `fd66016` (code identical to `2e2640f`, the merge of main `5e7a7d9`) (local, Node 22.22.2): `pnpm lint`, `pnpm typecheck`,
`pnpm test:unit` (100 files, 1066 tests), `node scripts/check-foundation.mjs`, `pnpm build`;
`playwright test --project=chromium --project=chromium-admin`: 253 passed, 111 opt-in captures skipped;
`npx vitest run --project integration`: 50 files, 514 tests passed.
New or extended assertions: `e2e/auth.spec.ts` (denied titles for member and editor, the
recovery 404 title), `e2e/admin-shell-layout.spec.ts` (news list scroll edges at 1024 px
with the row actions reachable, Logi page titles, labelled Logi editor checkboxes),
`e2e/admin-manual.spec.ts` (short article without a table of contents keeps the reading
column), `e2e/admin-community-settings.spec.ts` (44 px community link at 390 px),
`e2e/admin-editorial-posts.spec.ts` (dialog cancel label), `e2e/admin-community-matches.spec.ts`
(focus after moving a round), `src/components/admin/dialogs.test.tsx` (cancel label).
