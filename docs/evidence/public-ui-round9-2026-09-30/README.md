# Blank lines in rich text, filter labels and the match banner (2026-09-30)

Before:
- main `f9f3439` for the article body and filters;
- branch `feat/hll-platform-handoff` at `9e97c9c` for the match banner and the tactical map
  link, whose code is unchanged from main there.

After: the same branch at `9e97c9c` (article body, filters) and `5e731e6` (banner, map link).

All captures come from standalone production builds, served locally with the synthetic e2e
fixtures and captured in Chromium with Playwright (Europe/Prague, 1× pixel ratio). Every
image is registered in `assets/manifest.json`.

The article body in the first two rows is [`sample-body.json`](sample-body.json). It holds the
patterns seen in imported and hand-typed articles:
- a paragraph of line breaks only;
- breaks at the end of a paragraph;
- an empty list item;
- a quote after a list;
- a heading as the first block;
- a long URL and a seven-column table.

To reproduce, the document was written into the published Czech revision of the fixture
article `ukazka-seznam-09` in the local `valkyria_e2e` database and opened at
`/cs/news/ukazka-seznam-09`. No committed fixture changed.

| Scenario | Before | After |
|---|---|---|
| Article body at 1440 px. Before: the paragraphs of breaks put about 170 px between two lines of text instead of about 46 px, an empty list item showed a lone bullet, the quote touched the list above it, and the opening heading sat about 80 px below the panel edge. After: the gap and the bullet are gone, the quote has normal block spacing, and the heading starts at the panel padding. | [before](before/article-blank-lines-cs-1440.webp) | [after](after/article-blank-lines-cs-1440.webp) |
| The same article at 390 px. | [before](before/article-blank-lines-cs-390.webp) | [after](after/article-blank-lines-cs-390.webp) |
| Member filters `/cs/members`, 1440 px. Before: two identical "VŠE" buttons side by side. After: "VŠECHNY HRY" and "VŠECHNY ROLE". | [before](before/members-filter-cs-1440.webp) | [after](after/members-filter-cs-1440.webp) |
| The same in English: "ALL GAMES" and "ALL ROLES". | [before](before/members-filter-en-1440.webp) | [after](after/members-filter-en-1440.webp) |
| News filters `/cs/news`, 1440 px. Before: the category "VŠE" and the game "VŠE". After: the game group reads "VŠECHNY HRY". | [before](before/news-filter-cs-1440.webp) | [after](after/news-filter-cs-1440.webp) |
| Match detail `/cs/hll/matches/ukazka-hll-historicky`, 768 px. Before: the map scene was 395 px tall in a 263 px banner. It covered the overview heading and the competition and tournament rows, and "VLK +" was unreadable over the bright roof. After: the scene fills only the banner, the overview is whole, and the names have a shadow. | [before](before/match-banner-cs-768.webp) | [after](after/match-banner-cs-768.webp) |
| The same match in English at 1440 px. Before: in the side pane the scene overflowed by 80 px over "Match overview". After: the heading and eyebrow are visible. | [before](before/match-banner-en-1440.webp) | [after](after/match-banner-en-1440.webp) |
| Server detail `/cs/hll/servers?server=synthetic-alpha`, 390 px. Before: "Taktická mapa Sainte-Mère-Église (WebP, 365 kB)". After: "(365 kB)". The size stays because the map loads only on request. | [before](before/server-tactical-cs-390.webp) | [after](after/server-tactical-cs-390.webp) |

Tests:
- `src/modules/content/rich-text/render.test.tsx` covers blank paragraphs, edge breaks,
  break runs, empty list items and empty quotes.
- `e2e/public-layout.spec.ts` asserts that the banner scene matches the banner box at 390,
  768 and 1440 px.
- `e2e/hll-map-artwork.spec.ts` covers the map link text.
