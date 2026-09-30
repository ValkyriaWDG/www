# FAQ dividers and informal public Czech (2026-09-30)

Before: branch `feat/hll-platform-handoff` at `47f8509`. After: the same branch at `9407ad4`.
Both are standalone production builds served locally with the synthetic e2e fixtures and
captured in Chromium with Playwright at 1440 px (Europe/Prague). The FAQ was published
locally by `e2e/admin-faq.spec.ts`: a seeded outline with one synthetic answer. Every
file is registered in `assets/manifest.json`.

| Scenario | Before | After |
|---|---|---|
| FAQ `/cs/hll/faq`, answers panel. Before: the question dividers stopped at the 72-character text column, about two thirds of the panel. After: questions and dividers span the panel, and the answers keep the readable line length. | [before](before/faq-cs-1440.webp) | [after](after/faq-cs-1440.webp) |
| Hub `/cs`. Before: formal "Vyberte hru, nebo pokračujte…", while the rest of the community copy uses the informal "Přidej se". After: "Vyber hru, nebo pokračuj…". | [before](before/hub-intro-cs-1440.webp) | [after](after/hub-intro-cs-1440.webp) |

The same informal register now applies to the other public texts:
- servers ("Vyber server", "Zeptej se na Discordu");
- field manual search and empty states;
- the tournaments intro ("najdeš");
- the empty, unavailable and filtered-empty states;
- the rich-text table hint.

Sign-in, account, administration and error messages keep the formal register. The rule is
recorded in `docs/product/localization.md`. `e2e/admin-faq.spec.ts` asserts the divider width.
