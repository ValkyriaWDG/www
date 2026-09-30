# No former-website references and display fixes (2026-09-30)

Before: main `609528d`. After: branch `feat/hll-platform-handoff` on the same main. Both
are standalone production builds served locally with the synthetic e2e fixtures, captured
in Chromium with Playwright, Europe/Prague. Every file is registered in
`assets/manifest.json`.

Owner decision: public pages neither link nor mention the former HLL website.

| Scenario | Before | After |
|---|---|---|
| Wardogs footer `/cs/wardogs`, 1440 px: the "HLL WEB" link to the former website is gone. The mobile menu link and the globe utility are gone too. | [before](before/footer-wardogs-cs-1440.webp) | [after](after/footer-wardogs-cs-1440.webp) |
| HLL matches `/cs/hll/matches`: no "Archiv zápasů HLL" button. The shared list and match details also have none. | [before](before/matches-header-cs-1440.webp) | [after](after/matches-header-cs-1440.webp) |
| Community `/cs/community`, lower half. Before: the CMS section "Hell Let Loose" said the history stays on the original website and linked it, and the panel offered "Původní web HLL" and "Archiv zápasů HLL". After: the seed copy has no such section, and the panel links only the on-site HLL section. Inside the HLL section the panel is omitted. | [before](before/community-bottom-cs-1440.webp) | [after](after/community-bottom-cs-1440.webp) |
| Field manual `/cs/hll/field-manual/ukazka-prvni-nastaveni`. Before: a "Z původního webu" block above the source panel. After: no such block. This fixture's third-party guide source (example.org) is still credited, under neutral labels ("Zdroj návodu"). Guides from the former website keep only their credits. | [before](before/manual-bottom-cs-1440.webp) | [after](after/manual-bottom-cs-1440.webp) |
| HLL match with imported facts `/cs/hll/matches/ukazka-hll-historicky`, 1440 px. Before: "Historické údaje o zápasu" in the one-third pane next to an empty column, with "Původní domácí tým", two "Historický zdroj…" notices, raw source times and "Další záznam…" duplicates. The banner read "SHF / SHF" and the recording type read "youtube". After: "Podrobnosti zápasu" at full width with neutral labels and no source notices. The banner names the opponent, and the recording type reads "YouTube". | [before](before/match-legacy-cs-1440.webp) | [after](after/match-legacy-cs-1440.webp) |
| Same match on a phone (390 px). | [before](before/match-legacy-cs-390.webp) | [after](after/match-legacy-cs-390.webp) |
| Related posts under an article. Before: a grey "VALKYRIA" text box. After: the same artwork as the news list. | [before](before/related-news-cs-1440.webp) | [after](after/related-news-cs-1440.webp) |

Also on this branch:
- **Hyphenation:** rich text no longer auto-hyphenates Czech words. In a real browser, the [owner's 1920 px capture](../legacy-editorial-renderers-2026-09-30/legacy-editorial-clan-cs-1920.png) shows "zá-leží" and "pod-poru". Headless Chromium does not hyphenate Czech, so `e2e/public-layout.spec.ts` asserts `hyphens: manual` instead of relying on a capture.
- **Tournaments:** imported tournaments show their restored short description and series as ordinary content, and use a restored logo as their emblem. The synthetic browser fixtures have no tournament logo, so `tournament-archive.test.tsx` and `tournament-emblem.test.tsx` cover these.
- **Not established here:** the real production content, which this environment cannot reach. The published production clan/community pages keep their stored sentences and links about the former website until an editor changes them.
