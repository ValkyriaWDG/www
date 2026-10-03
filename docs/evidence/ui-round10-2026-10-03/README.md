# Admin bar rows, phone media grid, server refresh controls, short-window home and team placeholders (2026-10-03)

Before: main `4946cea` (the PR #88 merge), captured from the local standalone build of
the same source (`b39a9fd`). After: branch `feat/hll-platform-handoff` at `5486473`.

All captures come from standalone production builds served locally with the synthetic e2e
fixtures and the missing-video fallback, captured in Chromium with Playwright
(Europe/Prague, 1× pixel ratio). Signed-in captures use synthetic sessions against the
local Discord mock. Every image is registered in `assets/manifest.json`.

The round audited the surfaces added since round 9: the hub, both landings, the Wardogs
servers page, the member team pages, the account page and eleven administration routes,
in Czech and English at 1440×900 and 390×844 (60 public and 56 signed-in cases). The
automated pass flagged only touch targets (listed below) and the 404s of
`/wardogs/community` and `/wardogs/faq`, which have no section for Wardogs and are not
linked. The remaining findings came from inspecting the captures.

| Scenario | Before | After |
|---|---|---|
| `/cs/admin/matches/logi`, 1440×900, administrator. Before: ten modules filled the first row and pushed "Můj účet" and "Zpět na web" onto a ragged second row. After: the brand and the account links share the first row and the module list has its own row (below 1600 px). | [before](before/admin-matches-logi-cs-1440x900.webp) | [after](after/admin-matches-logi-cs-1440x900.webp) |
| `/cs/admin/media`, 390×844, administrator, full page. Before: the cards kept a 190 px minimum, so the second column ended 2 px outside the viewport and the page scrolled sideways. After: two cards per row inside the width. | [before](before/admin-media-cs-390x844.webp) | [after](after/admin-media-cs-390x844.webp) |
| `/cs/wardogs`, 390×844, full page. Before: a 13 px browser-default checkbox next to "Obnovovat automaticky každých 30 sekund" and a 22 px tall "Přehled serverů" link. After: a 24 px checkbox and a 44 px link row. | [before](before/wardogs-cs-390x844.webp) | [after](after/wardogs-cs-390x844.webp) |
| `/cs/wardogs/servers`, 390×844. Before: 20 px checkbox. After: 24 px. | [before](before/wardogs-servers-cs-390x844.webp) | [after](after/wardogs-servers-cs-390x844.webp) |
| `/cs/hll/team`, 1440×900, member (before: full page). Before: under the "Synchronizace týmu není nakonfigurovaná." warning, three dashed uppercase "ZATÍM NEJSOU SYNCHRONIZOVANÉ ZÁZNAMY." boxes. After: one quiet sentence per section; the configured-but-empty state keeps the regular empty state. | [before](before/hll-team-cs-1440x900.webp) | [after](after/hll-team-cs-1440x900.webp) |
| `/en/wardogs/team`, 390×844, member, full page. The same in English on a phone. | [before](before/wardogs-team-en-390x844.webp) | [after](after/wardogs-team-en-390x844.webp) |
| `/cs/wardogs`, 1280×700. Before: the servers overview pushed the utility rail below the fold ([capture](../logi-web-readiness-2026-10-03/review/wardogs-cs-1280x700.webp)). After: less sky above the stage in windows under 720 px; the rail ends inside the viewport. | see link | [after](after/wardogs-cs-1280x700.webp) |

Tests:
- `e2e/admin-shell-layout.spec.ts`: module navigation row at 1440 and 1920 px; the media
  library fits a 390 px phone with two cards per row and no horizontal overflow.
- `e2e/team-pages.spec.ts`: the unconfigured team pages show the notice and three quiet
  placeholders without empty-state headings, in cs at 1440 and en at 390 px.
- `e2e/shell.spec.ts` ("home control sizes"): the utility rail fits a 1280×700 window;
  the overview checkbox is 24 px and the browse link 44 px tall at 390 px.
