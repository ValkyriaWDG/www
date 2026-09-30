# Match statistics chart, team marks and FAQ layout (2026-09-29)

After: branch `feat/hll-platform-handoff` application source `e4598c5`. Standalone
production build served locally with the synthetic e2e fixtures (synthetic historical
HLL match with 12 published player rows), Chromium via Playwright, Europe/Prague. The
FAQ was published in the local disposable database by `e2e/admin-faq.spec.ts` (seeded
question outline, one synthetic answer). Every file is registered in `assets/manifest.json`.

| Scenario | Before | After |
|---|---|---|
| "Statistiky zápasu", tab "Souhrn", `/cs/hll/matches/ukazka-hll-historicky` at 1440 px. Before: tables only. After: a split bar per metric (kills, deaths, combat, offense, defense, support), each on its own 100 % scale, direct values with the leader emphasised, a legend with the clan crest and the opponent mark, glyphs beside metric names; the table stays below as the exact view. | [before (9946e4b)](before/match-stats-cs-1440.webp) | [after](after/match-stats-summary-cs-1440x1000.webp) |
| Tab "Hráči": every published player row shows the team mark (crest or opponent short code/logo) beside the team name; metric headers carry the glyphs. | – | [after](after/match-stats-players-cs-1440x1000.webp) |
| English phone `/en/hll/matches/ukazka-hll-historicky`, 390×844: "Team comparison" legend wraps above the bars; no page overflow. | – | [after](after/match-stats-summary-en-390x844.webp) |
| FAQ `/cs/hll/faq`. Before: one frame of uppercase question headings and a single-column index. After: numbered sentence-case questions separated by dividers with indented answers; two-column question index on wide screens. | [before](before/faq-cs-1440-full.webp) | [after](after/faq-cs-1440-full.webp), [phone](after/faq-cs-390-full.webp) |

Chart palette (Valkyria `#a39234`, opponent `#4a84d6`) passed every check of the
dataviz `validate_palette.js` on the dark HLL surface `#14171b`. The glyphs are original
line icons, not the game's class or score icons; stored statistics contain no player
class. Coverage: `match-statistics.test.tsx` (chart rows, per-metric share, team marks,
decorative glyphs), `icons.test.tsx`, and the full browser suite (183 passed).
