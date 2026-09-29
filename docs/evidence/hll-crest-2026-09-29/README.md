# HLL main menu crest and inline image caret (2026-09-29)

Owner request: the transparent clan crest in the middle of the HLL and Wardogs main menus
should be the same, as on Wardogs. Issue [#36](https://github.com/ValkyriaWDG/www/issues/36)
stays open. Nothing was deployed.

## Context

- **Revisions:** `07c49fb` (crest) and `b4272e5` (editor caret) on main `e5d7276`.
- **Environment:** Claude Code cloud container, Node.js 24.21.0, PostgreSQL 16.13, Next.js
  16.3.6 standalone build, Playwright 1.63.0 / Chromium 141, synthetic fixtures, local
  Discord and CRCON mocks, shipped HLL still (the E2E synthetic clip is configured but not
  played), reduced motion.

## Change

The HLL stage crest now uses the Wardogs landing emblem values from `shell.module.css`:
`clamp(240px, 22vw, 560px)` wide, 12 % opacity, full colour, centred 47 % below the
header; below 768 px `min(62vw, 280px)`, 11 %, 34 %. It sits above the scene veil and is
hidden on HLL content pages, as the Wardogs emblem is on subpages.

## Editor fix found by CI

The first CI run of this PR ([36544145417](https://github.com/ValkyriaWDG/www/actions/runs/36544145417))
failed in `admin-editorial-posts.spec.ts`: after save and reload the inline image was
missing while the table typed after it was stored. Inserting a media-library image left
the image node-selected, so the next keystroke or toolbar action replaced it. The test's
`Control+End` could be undone by a deferred focus restoration (TipTap's focus frame, the
picker dialog's focus return, ProseMirror's post-focus sync) that wrote the stale node
selection back. The caret now moves to the next text position after the image, or into a
new paragraph when the image ends the document. This is shared by the news and prose
editors.

- A temporary copy of the browser test that waits 500 ms after the picker closes and then
  inserts the table without `Control+End` failed 3/3 on `07c49fb` (`{"figures":0}`) and
  passed 3/3 after the fix (`{"figures":1,"tableAfterFigure":true}`).
- `admin-editorial-posts.spec.ts` now inserts the table straight after the image and
  checks that the image stays before it (8/8 repeated passes, four workers).
- `extensions.test.ts` covers the caret at the document end, before a following paragraph,
  and the replacement a node-selected image suffers.

## Measurements

Crest box and computed style (`[data-emblem]` on `/cs/wardogs`, the stage crest on `/cs/hll`):

| Viewport | Page | Before (`e5d7276`) | After (`07c49fb`) |
|---|---|---|---|
| 1920×1080 | `/cs/wardogs` | 422 px, centre 960/542, 0.12, no filter | unchanged |
| 1920×1080 | `/cs/hll` | 220 px, centre 960/540, 0.16, `grayscale(1)` | 422 px, centre 960/542, 0.12, no filter |
| 390×844 | `/cs/wardogs` | 242 px, centre 195/324, 0.11, no filter | unchanged |
| 390×844 | `/cs/hll` | 120 px, centre 195/422, 0.16, `grayscale(1)` | 242 px, centre 195/324, 0.11, no filter |

## Checks

`platform.spec.ts` "the ghosted clan crest is identical on both main menus and absent from
content pages" compares width, centre (< 2 px), opacity and filter at 1920×1080, 1366×768
and 390×844, and requires the crest hidden on `/cs/hll/news` and `/cs/wardogs/news`.

| Check | Result |
|---|---|
| Lint, types (`b4272e5`) | Passed |
| Unit (`b4272e5`) | 500 passed (52 files) |
| `platform.spec.ts` (`07c49fb`) | 13 passed |
| Browser suite (`07c49fb`) | 161 passed, 0 failed; 106 opt-in capture cases skipped |
| Browser suite (`b4272e5`) | 161 passed, 0 failed; 106 opt-in capture cases skipped |
| CI artwork step (`E2E_HLL_EMPTY_MEDIA=1`, `hll-artwork.spec.ts`, `07c49fb`) | 4 passed |
| Page budgets (`measure-pages.mjs`, `07c49fb`) | All 15 samples passed; `/cs/hll` LCP is now the crest (2008–2020 ms), as the emblem is on `/cs/wardogs` (1992–2092 ms) |

## Captures

- [`crest/before-hll-cs-1920x1080.webp`](crest/before-hll-cs-1920x1080.webp) — Before: the HLL main menu crest was a smaller (220 px), grayscale, 16 % opaque mark centred on the whole viewport, under the scene veil. _(/cs/hll · 1920×1080 · cs)_
- [`crest/after-hll-cs-1920x1080.webp`](crest/after-hll-cs-1920x1080.webp) — After: the HLL main menu shows the Wardogs ghosted crest — 422 px wide, full colour at 12 % opacity, centred at 960/542 like Wardogs. _(/cs/hll · 1920×1080 · cs)_
- [`crest/after-wardogs-cs-1920x1080.webp`](crest/after-wardogs-cs-1920x1080.webp) — Reference: the unchanged Wardogs main menu crest at the same size and position. _(/cs/wardogs · 1920×1080 · cs)_
- [`crest/before-hll-cs-390x844.webp`](crest/before-hll-cs-390x844.webp) — Before, phone: the HLL crest was 120 px wide and 98 px lower than on Wardogs. _(/cs/hll · 390×844 · cs)_
- [`crest/after-hll-cs-390x844.webp`](crest/after-hll-cs-390x844.webp) — After, phone: 242 px, 11 % opacity, centred at 195/324 like the Wardogs phone layout; the menu stays readable over it. _(/cs/hll · 390×844 · cs)_
- [`crest/after-wardogs-cs-390x844.webp`](crest/after-wardogs-cs-390x844.webp) — Reference, phone: the unchanged Wardogs main menu crest. _(/cs/wardogs · 390×844 · cs)_
