# HLL / Wardogs top strip parity (2026-09-29)

Owner report: the top strip is not in sync between Wardogs and HLL; position and size
change when switching games. Issue [#36](https://github.com/ValkyriaWDG/www/issues/36)
stays open. Nothing was deployed; production serves `e5d7276`, where this was not fixed.

## Context

- **Revision:** `bd59ddd` on main `bca20bb`.
- **Environment:** Claude Code cloud container, Node.js 24.21.0, PostgreSQL 16.13, Next.js
  16.3.6 standalone build, Playwright 1.63.0 / Chromium 141, synthetic fixtures, local
  Discord and CRCON mocks, reduced motion.

## Cause and change

PR #58 only aligned the control row within 12 px. The HLL masthead kept its own height,
48 px crest at the HLL inset, its own breakpoints, and inherited the HLL theme's
`--safe-inset` (80 px instead of 48 px at 1920) and `--tracking-nav` (narrower sign-in).
HLL now renders the Wardogs strip classes (`shell/header.module.css`): the same mark,
divider, tools, mobile menu and full-width game row, in HLL colours, with the
VALKYRIA / HELL LET LOOSE label after the crest (crest only on phones, as Wardogs). The
strip pins the inset and tracking to the root values (`--strip-safe-inset`,
`--strip-tracking-nav`). The HLL landing therefore also shows the strip background.

The stage crest now loads eagerly like the Wardogs emblem: it is the landing's largest
image and no longer shares the old masthead's preloaded file. Without this, `/cs/hll`
median LCP was 3,076 ms (limit 2,500 ms) in `measure-pages.mjs`.

## Measurements

Boxes `[x, y, width, height]` in CSS px (`/cs/wardogs` is unchanged by this change):

| Viewport | Element | `/cs/wardogs` | `/cs/hll` before | `/cs/hll` after |
|---|---|---|---|---|
| 1920×1080 | strip | 1920 × 65 | 1920 × 83 | 1920 × 65 |
| 1920×1080 | crest | 96, 10, 41 × 45 | 80, 17, 43 × 48 | 96, 10, 41 × 45 |
| 1920×1080 | game switch | 1262, 9 | 1243, 18 | 1262, 9 |
| 1920×1080 | sign-in | 1711, 10, 161 wide | 1692, 19, 148 wide | 1711, 10, 161 wide |
| 1024×768 | strip / game switch | 123; full-width row at y 64 | 69; in the top row | 123; full-width row at y 64 |
| 390×844 (`/news`) | strip / game row | 115; y 56 | 192; y 123 | 115; y 56 |

## Checks (`bd59ddd`)

`platform.spec.ts` "the top strip is identical in both games…" requires the strip, crest,
game switch, language, account, community link and menu button boxes on `/cs/hll`,
`/cs/wardogs/news`, `/cs/hll/news` and `/cs` to equal `/cs/wardogs` at 1920×1080,
1366×768, 1024×768 and 390×844. On main `bca20bb` it failed at `/cs/hll @1920` (crest
`[80,17,43,48]` vs `[96,10,41,45]`, controls 18–19 px left and 9 px lower, sign-in 148 vs
161 px); it passes after the change.

| Check | Result |
|---|---|
| Lint, types | Passed |
| Browser suite | 161 passed, 0 failed; 106 opt-in capture cases skipped |
| CI artwork step (`E2E_HLL_EMPTY_MEDIA=1`, `hll-artwork.spec.ts`) | 4 passed |
| Page budgets (`measure-pages.mjs`) | All 15 samples passed; `/cs/hll` median LCP 2,036 ms (`/cs/wardogs` 2,024 ms) |

The HLL section bar under the strip still wraps its last item at 1024 px, as it did
before this change (unrelated to the strip).

## Captures

Top 200 px of each page.

- [`strip/before-hll-cs-1920.webp`](strip/before-hll-cs-1920.webp) — Before: the HLL main menu masthead was 83 px tall without a strip; crest 43×48 at x 80, controls 18 px further left and 9 px lower than on Wardogs, sign-in 148 px wide. _(/cs/hll · 1920×1080 (top 200 px) · cs)_
- [`strip/after-hll-cs-1920.webp`](strip/after-hll-cs-1920.webp) — After: the Wardogs strip in HLL colours — 65 px, crest 41×45 at x 96, game switch, language and sign-in at exactly the Wardogs positions and sizes; the VALKYRIA / HELL LET LOOSE label follows the crest. _(/cs/hll · 1920×1080 (top 200 px) · cs)_
- [`strip/wardogs-cs-1920.webp`](strip/wardogs-cs-1920.webp) — Reference: the unchanged Wardogs main menu strip. _(/cs/wardogs · 1920×1080 (top 200 px) · cs)_
- [`strip/before-hll-news-cs-1024.webp`](strip/before-hll-news-cs-1024.webp) — Before, 1024 px: HLL kept the game switch in the top row and a labelled sign-in, while Wardogs moves the game switch to a full-width row and shows an icon sign-in. _(/cs/hll/news · 1024×768 (top 200 px) · cs)_
- [`strip/after-hll-news-cs-1024.webp`](strip/after-hll-news-cs-1024.webp) — After, 1024 px: the same breakpoints as Wardogs — full-width game row under the strip, icon sign-in, flags with codes. (The section bar below still wraps its last item, as before this change.) _(/cs/hll/news · 1024×768 (top 200 px) · cs)_
- [`strip/wardogs-news-cs-1024.webp`](strip/wardogs-news-cs-1024.webp) — Reference, 1024 px: the unchanged Wardogs strip. _(/cs/wardogs/news · 1024×768 (top 200 px) · cs)_
- [`strip/before-hll-news-cs-390.webp`](strip/before-hll-news-cs-390.webp) — Before, phone: the HLL header was 192 px on content pages — crest, name and MENU in the first row, the language switch on its own row, then the game row; everything below sat 77 px lower than on Wardogs. _(/cs/hll/news · 390×844 (top 200 px) · cs)_
- [`strip/after-hll-news-cs-390.webp`](strip/after-hll-news-cs-390.webp) — After, phone: 115 px like Wardogs — crest, language and MENU in one row, game row below; the HLL name stays the link's accessible text. _(/cs/hll/news · 390×844 (top 200 px) · cs)_
- [`strip/wardogs-news-cs-390.webp`](strip/wardogs-news-cs-390.webp) — Reference, phone: the unchanged Wardogs strip. _(/cs/wardogs/news · 390×844 (top 200 px) · cs)_
