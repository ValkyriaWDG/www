# Former-website links and page fixes (2026-09-30)

Before: main `f1ae338`. After: branch `feat/hll-platform-handoff` at `106d88c`. Both
are standalone production builds served locally with the synthetic e2e fixtures and
captured in Chromium with Playwright (Europe/Prague). Phone captures use a 2× pixel ratio.
The fixture article in the "before" build already carries the two new former-website
links. Every file is registered in `assets/manifest.json`.

| Scenario | Before | After |
|---|---|---|
| Article body `/cs/wardogs/news/ukazka-obrazky-tabulka-a-odkazy`, 1440 px. Before: "servery" and "žebříčky" linked `valkyriahll.cz/servery` and `www.valkyriahll.cz/zebricky`, both marked external. After: "servery" opens `/cs/hll/servers` on this site (no external mark), and "žebříčky" is plain text because no public page corresponds. | [before](before/article-links-cs-1440.webp) | [after](after/article-links-cs-1440.webp) |
| The same article in English: "servers" opens `/en/hll/servers`. | [before](before/article-links-en-1440.webp) | [after](after/article-links-en-1440.webp) |
| Match banner `/cs/hll/matches/ukazka-hll-historicky`, 390 px. Before: "VLK + SYNTHETIC ALLY" was cut off and "FOXTROT" was missing. After: the banner grows to fit both names. | [before](before/match-banner-cs-390.webp) | [after](after/match-banner-cs-390.webp) |
| Recording facts on the same match, 1440 px. Before: "Datum 12/05/2024". After: "12. května 2024". | [before](before/match-recording-cs-1440.webp) | [after](after/match-recording-cs-1440.webp) |
| The same facts in English: "12 May 2024". | [before](before/match-recording-en-1440.webp) | [after](after/match-recording-en-1440.webp) |
| Standings table in `/cs/hll/tournaments/ukazka-hll-liga-podzim-2026`, 390 px. Before: the "Body" column was outside the scroll region. After: all three columns fit. | [before](before/tournament-table-cs-390.webp) | [after](after/tournament-table-cs-390.webp) |

These are not captured:
- **Tournament links:** the synthetic tournaments have neither a former-website link nor a
  generic label, so tests cover them instead. `tests/integration/tournaments.test.ts` hides
  a stored `valkyriahll.cz` link, and `link-labels.test.ts` shows "Website"/"Rules" as
  "Web soutěže"/"Pravidla" on Czech pages.
- **Production content:** this environment cannot reach it. Its imported bodies are covered
  by the renderer path above (`public-links.test.ts`, `render.test.tsx`,
  `e2e/public-news.spec.ts`).
