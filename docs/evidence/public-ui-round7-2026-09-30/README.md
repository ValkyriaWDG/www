# Image sizing, tablet navigation and visitor copy (2026-09-30)

Before: main `8547f77`. After: branch `feat/hll-platform-handoff` at `4080aec` (application
source `6a53399`). Both are standalone production builds served locally with the synthetic
e2e fixtures and captured in Chromium with Playwright (Europe/Prague, 1× pixel ratio). The
long-form fixture article in both builds carries the new square logo (800 × 800), small
image (360 × 200) and portrait photo (900 × 1350). Every file is registered in
`assets/manifest.json`.

| Scenario | Before | After |
|---|---|---|
| Article body `/cs/news/ukazka-dlouhy-clanek`, 1440 × 900. Before: every image was stretched to the column width, so the square logo was 730 px tall, the 360 × 200 image was upscaled, and the portrait photo was about 1 100 px tall. After: the logo is 520 px, the small image keeps its own size, and the portrait stays within the viewport height with its proportions. Captions sit under their image. | [before](before/article-images-cs-1440.webp) | [after](after/article-images-cs-1440.webp) |
| HLL section bar `/cs/hll/field-manual`, 1024 px. Before: "Přidej se" wrapped to a second row. After: one compact row. | [before](before/hll-bar-cs-1024.webp) | [after](after/hll-bar-cs-1024.webp) |
| The same bar at 768 px. Before: four items on a second row. After: one row that scrolls sideways, with an edge fade. | [before](before/hll-bar-cs-768.webp) | [after](after/hll-bar-cs-768.webp) |
| HLL landing `/cs/hll`, 1024 × 900. Before: the Discord button wrapped into two cramped lines. After: one line. | [before](before/hll-landing-cs-1024.webp) | [after](after/hll-landing-cs-1024.webp) |
| HLL landing at 768 × 900. Before: the right column of the stacked menu sat on the bright part of the scene. After: a darker veil keeps both columns legible. | [before](before/hll-landing-cs-768.webp) | [after](after/hll-landing-cs-768.webp) |
| Match statistics `/cs/hll/matches/ukazka-hll-historicky`. Before: "Zdroj: nahraný export tabulky hry" and "Importováno …". After: "Tabulka hry · map · mode · time", with no import time. | [before](before/match-statistics-source-cs-1440.webp) | [after](after/match-statistics-source-cs-1440.webp) |
| The same in English: "Game scoreboard …" instead of "Source: uploaded game scoreboard export". | [before](before/match-statistics-source-en-1440.webp) | [after](after/match-statistics-source-en-1440.webp) |
| Server list `/cs/hll/servers`: "Aktualizováno …" instead of "Pozorováno …", and "Čas aktualizace není znám" instead of "Čas pozorování není znám". | [before](before/servers-cs-1440.webp) | [after](after/servers-cs-1440.webp) |
| The same in English: "Updated …" instead of "Observed …". | [before](before/servers-en-1440.webp) | [after](after/servers-en-1440.webp) |

Not captured:
- **Phones:** at 390 px the text column (324 px) is already narrower than every image's
  limit, so phone captures do not change. `e2e/public-layout.spec.ts` covers the 1440 px
  image sizes.
- **360 px match overflow:** it was a 2 px sideways scroll, which a capture cannot show.
  `e2e/public-layout.spec.ts` asserts there is no overflow at 360 px.
- **Team logo cropping:** the synthetic opponent logo is square, so cropping and containing
  look the same.
