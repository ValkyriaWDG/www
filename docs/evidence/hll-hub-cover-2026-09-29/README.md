# Community hub cover (2026-09-29)

Owner request: apply and style the supplied cover as the background of the community hub
(`valkyria.cz` → `/cs`, `/en`). Issue [#36](https://github.com/ValkyriaWDG/www/issues/36)
stays open. Nothing was deployed by this change.

## Context

- **Revision:** `6a0b0d1` on main `338ee2f`.
- **Environment:** Claude Code cloud container, Node.js 24.21.0, PostgreSQL 16.13, Next.js
  16.3.6 standalone build, Playwright 1.63.0 / Chromium 141, synthetic fixtures, local
  Discord and CRCON mocks, reduced motion.

## Change

- **Asset:** the owner's 1672×941 WebP (245,032 B) is kept unchanged as
  `assets/community/hub-cover-original.webp`; the site serves `hub-cover-1672.webp`
  (95,720 B) and `hub-cover-960.webp` (37,996 B) through `srcset`, `sizes="100vw"`,
  `fetchPriority="high"`. All three are in `assets/manifest.json`; the asset policy lists them.
- **Scene:** a client component renders the cover in the shell scene on the hub route only
  (above the drawn landscape, below the scrim), so shared pages never fetch it. The hub scrim
  drops from 0.58 to 0.12; the cover's own shade darkens the top, the centre column and the
  bottom. The scene's ghosted crest is not shown on the hub (the heading carries the crest).
- **Page:** from 768 px the heading block is centred in the dark gap between the soldiers;
  the game cards' top panels are transparent windows onto their own game's half (HLL left,
  Wardogs right) with shadowed marks; card text keeps its panel.

## Checks (`6a0b0d1`)

`platform.spec.ts` "the community hub shows the owner cover…" requires, in fresh contexts,
no cover element or request on `/cs/news`, the 1672 px copy covering 1920×1080 on `/cs` with
the scene crest hidden, and the 960 px copy on `/en` at 390×844 without horizontal overflow.

| Check | Result |
|---|---|
| Lint, types | Passed |
| Foundation (asset integrity) | Passed (1405 files) |
| Browser suite | 167 passed, 0 failed; 107 opt-in capture cases skipped |
| CI artwork step (`E2E_HLL_EMPTY_MEDIA=1`, `hll-artwork.spec.ts`) | 4 passed |
| Page budgets (`measure-pages.mjs`) | All 15 samples passed; `/cs` median LCP 1,128 ms (about 1,976 ms before, when the scene crest was the LCP element), max transfer 555,426 B on the throttled phone profile |

## Captures

- [`hub/before-hub-cs-1920x1080.webp`](hub/before-hub-cs-1920x1080.webp) — Before: the hub over the drawn dusk landscape under a 58 % scrim, the ghosted crest behind opaque game cards. _(/cs · 1920×1080 · cs)_
- [`hub/after-hub-cs-1920x1080.webp`](hub/after-hub-cs-1920x1080.webp) — After: the owner's cover — the WW2 soldier beside and through the Hell Let Loose card, the modern operator beside and through the Wardogs card; the heading centred in the dark smoke between them. _(/cs · 1920×1080 · cs)_
- [`hub/after-hub-en-1920x1080.webp`](hub/after-hub-en-1920x1080.webp) — After, English: the same composition with the English heading and cards. _(/en · 1920×1080 · en)_
- [`hub/before-hub-cs-1366x768.webp`](hub/before-hub-cs-1366x768.webp) — Before, 1366 px: drawn landscape and opaque cards. _(/cs · 1366×768 · cs)_
- [`hub/after-hub-cs-1366x768.webp`](hub/after-hub-cs-1366x768.webp) — After, 1366 px: both soldiers stay visible at the sides; the centred heading does not cover either of them. _(/cs · 1366×768 · cs)_
- [`hub/before-hub-cs-390x844.webp`](hub/before-hub-cs-390x844.webp) — Before, phone. _(/cs · 390×844 · cs)_
- [`hub/after-hub-cs-390x844.webp`](hub/after-hub-cs-390x844.webp) — After, phone: the 960 px copy, centred on the cover's dark middle; heading left-aligned as before; no horizontal overflow. _(/cs · 390×844 · cs)_
- [`hub/after-news-cs-1366x768.webp`](hub/after-news-cs-1366x768.webp) — Shared pages are unchanged: /cs/news keeps the drawn landscape and never requests the cover. _(/cs/news · 1366×768 · cs)_
