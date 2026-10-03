# Website / Logi readiness: review handoff evidence

Runtime/test source: `ce0db5ebb00b2d341d0cde45e49b4e6f296f83e1`, based on
`0a94d59c32831cfa198a0371bf204523e6555a3a`. Optimized Next.js build:
`_Xdm70C5k9uTgh4u_8UfD`. Windows x64, Node 24.21.0, pnpm 10.34.5,
PostgreSQL 18.4 (UTF-8, ICU en-US), Chromium. Captured 3 October 2026,
Europe/Prague. [Source fingerprints](source-manifest.json) connect the tested
working files to the committed blobs; line-ending normalization is explicit.

## Observed verification

| Criterion | Reproduction and observed result |
| --- | --- |
| Login readiness | CS/EN login shows Logi even when disabled, with a localized notice; only configured/permitted Discord fallback appears. Unit/server-action and browser checks passed. No hosted OAuth attempt. |
| Admin scope | HLL editors get the manual, WDG-only editors do not; platform-wide Pages/FAQ requires platform authority, including direct URLs. Unit, PostgreSQL and CS/EN browser denial checks passed. |
| Manual editor | Search preserves its route and selected filters. Dirty metadata supports stay/save/discard; validation/network failure preserves values and permits retry. All four new CS/EN browser cases passed. |
| FAQ | Imported body-prefix excerpt becomes a concise localized introduction; independent editorial summaries and answer content remain. Renderer and real CMS publication/browser regression passed. |
| Logi collection reset | A pagination `410 reset_required` starts a fresh complete shadow generation; abandoned rows never enter the promoted snapshot. Multi-pass transport regression passed. |
| Logi server failure | A collector error after recent success immediately marks HLL/WDG data stale/unknown and removes scores. Six network/401/403 regression cases passed. |
| WDG controls | Larger desktop actions and utility icons; inspected CS desktop and EN phone captures without horizontal overflow. Existing responsive/header browser regressions passed. |
| Local regression | Lint, typecheck, optimized build passed; **929 unit, 482 PostgreSQL, 214 browser tests passed**. **124 opt-in captures skipped**, zero retries. See [checks](checks.json). |

Commands: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`,
`pnpm test:integration`, `pnpm build`, `pnpm test:e2e` with disposable fixtures.
The clean E2E run used `CI=true` to prevent reusing a server whose fixtures had
already been modified by admin tests. A prior new-test filter-navigation race was
corrected by waiting for committed selection/form state, without weaker assertions.

These checks ran before commit; the unchanged app bytes were verified before
staging. There is no new local container/hosted-provider acceptance. Latest-head
CI belongs to the PR and must be checked before merge/publication. The owner
authorized Claude to complete that review and website release autonomously.

## Inspected public UI captures

All images are actual browser screenshots, unedited and unredacted. The viewport
excludes browser chrome; image width may exclude the vertical scrollbar. Before
captures are public production at the base above. After captures are the local
optimized build with synthetic data and intentional missing-MP4 fallback. They
do not claim identical backgrounds/content or successful production recovery.
Image dimensions, routes, context and hashes are in [captures](captures.json).

Live `/cs/wardogs`, 1440×900: the original small actions and utility icons.

![Original live Wardogs controls](before-live-wardogs-cs-1440x900.jpg)

Local `/cs/wardogs`, 1440×900: larger action column and footer controls; the
synthetic server/next-match panels remain visible. Fallback background is expected.

![Larger Wardogs controls on desktop](after-wardogs-cs-1440x900.jpg)

Local `/en/wardogs`, 390×844: actions stay within the phone viewport. The second
capture is scrolled to show the footer; it is not a stitched/full-page screenshot.

![Wardogs phone actions](after-wardogs-en-390x844.jpg)
![Wardogs phone footer controls](after-wardogs-en-footer-390x844.jpg)

Live `/cs/login`, 1440×900: Logi is absent. Local CS desktop and EN phone: Logi is
visible but unavailable, while the harness supplies a synthetic Discord fallback.
These captures prove rendering, not real hosted login or production configuration.

![Original live login](before-live-login-cs-1440x900.jpg)
![Czech Logi unavailable state](after-login-cs-1440x900.jpg)
![English Logi unavailable state on phone](after-login-en-390x844.jpg)

Live `/cs/hll/faq`, 1440×900: the introduction duplicates the beginning of answers.
Local same route/viewport: short localized introduction and intact synthetic FAQ.

![Original duplicate FAQ introduction](before-live-faq-cs-1440x900.jpg)
![Corrected FAQ introduction](after-faq-cs-1440x900.jpg)

## Independent review and corrections

Reviewed in the cloud container (Linux, Node 22, pnpm 10.34.5, PostgreSQL 16, Chromium
through Playwright, Europe/Prague) against main `0a94d59`. Corrected source:
`0f4bd4a211391edb3743daa80cee84ce997ebd90`; the opt-in capture spec
`e2e/visual-admin-manual.spec.ts` was added in `e3bf23f`.

Confirmed and corrected:

- The enlarged Wardogs home values were declared on the menu element and the home footer,
  so the phone and short-window reductions of `tokens.css` never applied there: at 390 px
  the Discord action was 118 px tall instead of 88 px and the utility buttons 52 px instead
  of 44 px. Both files now re-declare reduced values (96/52/48 px on phones, 96/48 px below
  720 px of height); `e2e/shell.spec.ts` asserts the sizes at 1440×900, 1280×700 and
  390×844. The HLL landing has its own shell and is unaffected.
- `/admin/manual/<id>` and `/admin/content/<id>` checked only the capability; a wrongly
  scoped editor was denied later by the domain without the audited `game_scope` reason.
  Both pages now pass the module's fixed scope like their lists, and `e2e/auth.spec.ts`
  opens the editor routes directly for both editor kinds.
- The sign-in note chose its wording by the Logi flag. It now follows the available action:
  the Discord wording appears only when Discord is the one enabled action.
- The unused `auth.login.purpose` and `auth.login.providerUnavailable` messages are removed.
- A `410 reset_required` starts a new shadow generation, but rows of the abandoned
  generation stayed until a later promotion. The store now deletes them as soon as the
  replacement begins (`tests/integration/logi-store.test.ts`).

Reviewed and kept: `faqSummary` replaces any summary that is a verbatim prefix of the
answers, authored or imported, as the editor guide states. A successful bootstrap page
commit clears the collector error before the rebuild promotes, which matches the existing
`lastSuccessAt` semantics. The candidate's login readiness, module scoping, manual form,
sync reset and freshness behavior were verified in code and by the suites below.

Checks on `0f4bd4a` with synthetic fixtures and disposable databases
([machine-readable summary](review-checks.json)):

| Check | Result |
| --- | --- |
| `pnpm lint`, `pnpm typecheck` | Passed |
| `pnpm test:unit` | 85 files, 930 tests passed |
| `pnpm test:integration` | 46 files, 483 tests passed |
| `pnpm build` | Passed |
| `pnpm test:e2e` (`chromium` + `chromium-admin`, `CI=true`) | 215 passed, 99 opt-in captures skipped, 0 flaky |
| `node scripts/check-foundation.mjs` | Passed |

Captures of `0f4bd4a` in [`review/`](review/), WebP q80 from the same local standalone
build, inspected and registered in `assets/manifest.json`:

| Capture | What it shows |
| --- | --- |
| [admin-home-hll-editor-cs-1440x900](review/admin-home-hll-editor-cs-1440x900.webp) | HLL-only editor at `/cs/admin`: Novinky, Příručka and Členové are offered; "Stránky a FAQ" is not, because the editor has no platform-wide authority. |
| [manual-search-cs-1440x900](review/manual-search-cs-1440x900.webp) | `/cs/admin/manual?q=První nastavení&state=published&locale=cs`: the search stays in the manual workspace with "Publikováno" and "Čeština" still selected and one matching sample article. |
| [manual-meta-unsaved-cs-1440x900](review/manual-meta-unsaved-cs-1440x900.webp) | New manual article, credits typed into "Zdroj a řazení", then the Příručka navigation link: the dialog offers stay, save or discard; nothing was written. |
| [manual-meta-unsaved-en-390x844](review/manual-meta-unsaved-en-390x844.webp) | The same dialog in English on a 390×844 phone. |
| [content-denied-hll-editor-cs-1440x900](review/content-denied-hll-editor-cs-1440x900.webp) | HLL-only editor opening `/cs/admin/content` directly: "Přístup odepřen"; the sidebar has no link to the module. |
| [manual-denied-wdg-editor-en-1440x900](review/manual-denied-wdg-editor-en-1440x900.webp) | Wardogs-only editor opening `/en/admin/manual` directly: "Access denied"; News stays available. |
| [wardogs-cs-1440x900](review/wardogs-cs-1440x900.webp) | `/cs/wardogs` desktop after the corrections: unchanged from the candidate (346 px column, 126 px Discord action, 52 px utility buttons). |
| [wardogs-cs-1280x700](review/wardogs-cs-1280x700.webp) | `/cs/wardogs` in a short window: 96 px Discord action and 48 px secondary actions. The servers overview from PR #84 pushes the utility rail below the fold here; this predates the branch and is noted for the UI audit. |
| [wardogs-en-390x844](review/wardogs-en-390x844.webp) | `/en/wardogs` phone: 96 px Discord action, 52 px secondary actions, 48 px utility buttons, no horizontal overflow. |
| [hll-cs-1440x900](review/hll-cs-1440x900.webp) | `/cs/hll`: the HLL landing keeps its own menu and stage; the Wardogs values do not reach it. |

## Remaining review and acceptance

- The candidate's manual screenshot attachments were not inspected by its author; the
  inspected CS/EN admin captures above replace them.
- Hosted Logi deployment/grants, real sign-in/role removal/central logout and sync
  scheduling remain distinct acceptance. Production lacks the necessary configured
  client/source inputs at the read-only observation; do not claim activation.
- FAQ/manual articles already have editors. Taxonomy definitions (#86), approved
  League/Warcon readers (#87), and integration health administration (#22) remain.
- Existing RSC destination-stream cancellation logs do not close issue #46.
- Images are verification-only, registered in `assets/manifest.json`, and must not
  be imported into runtime artwork. The full [handoff](../../handoff/claude-logi-web-readiness-2026-10-03.md)
  specifies the owner's authorization, review order and release checks.
