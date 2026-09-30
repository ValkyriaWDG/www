# Public UI audit fixes (2026-09-29)

Before: main `a7be042` (graphics pack, PR #70). After: branch `feat/hll-platform-handoff`
application source `9946e4b`. Both are standalone production builds served locally
with the synthetic e2e fixtures (`e2e/support/start-server.mjs`), captured in Chromium
with Playwright, Europe/Prague. Every file is registered in `assets/manifest.json`.
The duplicated format "before" comes from real imported data in the committed
[legacy production capture](../hll-legacy-production-2026-09-29/match-list-desktop.png)
(detail pane, "FORMÁT best of 1 · Best of 1 (Bo1)").

| Scenario | Before | After |
|---|---|---|
| HLL match detail `/cs/hll/matches/ukazka-hll-historicky`, 1440 px full page: maps/rounds and statistics were in the one-third pane (rounds "VÝSLEDEK" cut), leaving the left side empty; now they span the full width below list and pane. | [before](before/match-hll-cs-1440-full.webp) | [after](after/match-hll-cs-1440-full.webp) |
| Same match, "Hráči" tab at 1440×900: player columns were cut after "ZABITÍ/MIN"; all eleven columns now fit. | [before](before/match-players-cs-1440x900.webp) | [after](after/match-players-cs-1440x900.webp) |
| English `/en/hll/matches/ukazka-hll-historicky` at 1366×768, scrolled to "Maps and rounds": English labels, full-width map cards and rounds table. | – | [after](after/match-hll-en-1366x768.webp) |
| Phone `/cs/hll/matches/ukazka-hll-historicky` at 390 px (full page): overview, result and recap first, then maps/rounds and statistics; no page overflow. | – | [after](after/match-hll-cs-390-full.webp) |
| Wardogs match `/cs/wardogs/matches/ukazka-wardogs-overeny-vysledek` at 1440×900 with the imported-style format "best of 3" set in the local disposable database: "Formát" reads "Best of 3 (Bo3)" once. | production capture above | [after](after/format-cs-1440x900.webp) |
| Server list `/cs/hll/servers` at 390 px: the 72×40 thumbnail and three figure columns squeezed names into mid-word breaks ("[SYNTHETI C]"); rows are now summaries with thumbnail and full-width name, then players, mode and freshness. | [before](before/servers-cs-390x844.webp) | [after](after/servers-cs-390x844.webp) |
| Server list at 1024×768: the 58 % list column wrapped names over up to eight lines beside an empty "Vyberte server" pane; the list now uses the full width below 1280 px. | [before](before/servers-cs-1024x768.webp) | [after](after/servers-cs-1024x768.webp) |
| Tournament `/cs/hll/tournaments/ukazka-hll-liga-podzim-2026` at 390 px (full page): the description panel grew to its table and widened the page to 559 px; the panel now stays 350 px and the table scrolls inside its region. | [before](before/tournament-cs-390-full.webp) | [after](after/tournament-cs-390-full.webp) |
| HLL panel: `/cs/hll/clan` at 390 px said HLL matches and archive stay on the original website. Shared `/cs/clan` at 1440×900 now links "Sekce Hell Let Loose" with the old site as "Původní web HLL"; inside the HLL section (`/en/hll/clan`, 390×844) only the archive links remain. | [before](before/hll-clan-cs-390-panel.webp) | [after (cs)](after/clan-cs-1440x900.webp), [after (en)](after/hll-clan-en-390x844.webp) |

Full-page captures show the fixed background only in the first viewport; in a browser
it stays behind the page while scrolling. Regression coverage: `e2e/public-layout.spec.ts`,
the updated `e2e/public-matches.spec.ts` and `e2e/public-pages.spec.ts`, and unit tests
for `matchFormatLabel`. Not established here: behavior with the real production data
set, which this environment cannot reach.
