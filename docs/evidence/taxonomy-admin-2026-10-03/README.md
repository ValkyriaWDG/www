# Taxonomy administration: Field Manual categories, news categories and tags (2026-10-03)

Branch `feat/taxonomy-admin` on main `c232cdb`; captures from the local standalone
production build of `c37f5af` with the synthetic e2e fixtures and the missing-video
fallback, taken in Chromium with Playwright (Europe/Prague, 1× pixel ratio) by
`e2e/visual-admin-taxonomy.spec.ts` (`CAPTURE_EVIDENCE=1`). Signed-in captures use
synthetic sessions against the local Discord mock; the seeded categories and sample
articles are fixtures, not member data. Every image is registered in `assets/manifest.json`.

Acceptance of #86 on this slice: a platform-wide editor manages the HLL Field Manual
categories and the shared news categories/tags; an HLL-only editor manages only the
manual categories; a Wardogs-only editor is denied the HLL category routes on the
server; keys stay immutable; a referenced category cannot be deleted, only archived,
and the archive confirmation states the consequence for assigned articles.

| Capture | What it shows |
|---|---|
| [taxonomy-list-editor-cs-1440x900](taxonomy-list-editor-cs-1440x900.webp) | Platform-wide editor, /cs/admin/taxonomy at 1440×900: the Hell Let Loose Field Manual categories (order, key, Czech/English names, assigned-article counts, state, Upravit links) followed by the shared news categories and tags sections, each with its publication note and a create button. |
| [taxonomy-edit-manual-vehicles-cs-1440x900](taxonomy-edit-manual-vehicles-cs-1440x900.webp) | Platform-wide editor, /cs/admin/taxonomy/manual/hll/<id> (seeded category "Vozidla a tanky") at 1440×900: read-only key, Czech/English names and descriptions, order, the "Kdy se změna projeví" note stating that manual category changes apply to the public manual immediately, and the archive/delete section with the assigned-article count. |
| [taxonomy-edit-manual-roles-en-390x844](taxonomy-edit-manual-roles-en-390x844.webp) | HLL-only editor, /en/admin/taxonomy/manual/hll/<id> (seeded category "Roles") on a 390×844 phone: single-column form with the key locked, bilingual names/descriptions, order, publication note and the archive/delete section stacked below without horizontal scrolling. |
| [taxonomy-list-hll-editor-en-390x844](taxonomy-list-hll-editor-en-390x844.webp) | HLL-only editor, /en/admin/taxonomy on a 390×844 phone: manual category rows stacked with their column names; the news categories/tags sections are replaced by the explanation that shared news taxonomy needs platform-wide authority. |
| [taxonomy-delete-referenced-cs-1440x900](taxonomy-delete-referenced-cs-1440x900.webp) | Platform-wide editor, /cs/admin/taxonomy/manual/hll/<id> (seeded "Začínáme", referenced by sample articles) at 1440×900: the "Archivace a odstranění" section states how many articles use the category, the ODSTRANIT button is disabled with that reason and only archiving is offered. |
| [taxonomy-archive-consequence-cs-1440x900](taxonomy-archive-consequence-cs-1440x900.webp) | Same page: the archive confirmation names the category and states the consequence — the assigned articles keep it and stay public, only new assignments stop. Cancelled after the capture; nothing is written. |
| [taxonomy-denied-wdg-editor-en-1440x900](taxonomy-denied-wdg-editor-en-1440x900.webp) | Wardogs-only editor opening /en/admin/taxonomy/manual/hll/<id> directly at 1440×900: the server denies the HLL Field Manual category ("forbidden", audited with reason game_scope); no form or category data is rendered. |

Verification on `c37f5af` (local, synthetic data):
- `pnpm lint`, `pnpm typecheck`: no findings.
- `pnpm test:unit`: 86 files, 935 tests passed.
- `pnpm test:integration` (PostgreSQL): 47 files, 499 tests passed, including the 16 scope, validation,
  concurrency, reference and audit cases of `tests/integration/taxonomy-admin.test.ts`.
- `playwright test --project=chromium --project=chromium-admin`: 223 passed and 1 failed on `6f9411d`, then 178 passed on `c37f5af` (the chromium project plus the layout and taxonomy specs). The first full run
  on `6f9411d` failed one case: with the new module the English module list no longer
  fit next to the brand and account links at 1920 px and pushed the account links onto a
  second row. `c37f5af` keeps the module list on its own row at every width and checks
  1440 and 1920 px the same way; the rerun passed.
- `playwright test --project=chromium-admin-capture e2e/visual-admin-taxonomy.spec.ts`:
  4 passed, 7 captures above.
- `node scripts/check-foundation.mjs`: passed.

With `CAPTURE_EVIDENCE=1` the opt-in capture tests of the `chromium` project run too; two
of them fail in that mode on this branch and identically on the main build of `c232cdb`:
`visual.spec.ts` "keyboard focus on the primary CTA" (the hub needs more than 40 Tab
presses to reach the Discord action) and the `visual-hll.spec.ts` players statistics
capture at 390×844 (times out waiting for the page). Neither runs in CI and neither page
changes here; both go to the next UI round.

Limitations: the news category and tag forms share the manual form and are covered by
the browser journey (`e2e/admin-taxonomy.spec.ts`) and the PostgreSQL cases rather than
by captures. Published article snapshots keep their news labels until the next
publication by design; manual categories apply immediately.
