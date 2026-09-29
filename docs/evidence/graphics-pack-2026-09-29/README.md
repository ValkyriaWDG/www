# Graphics pack integration (2026-09-29)

Owner request: implement the supplied graphics (PR #70) with the brand correction
(`5aa60ff`), tests and actual CS/EN desktop/mobile screenshots, preserving the PR #69
hub cover; no merge or deployment. Issue [#36](https://github.com/ValkyriaWDG/www/issues/36)
stays open. Nothing was deployed; production still serves `1b38314`.

## Context

- **Application source:** `7f4dc44` (captures and browser/budget runs used a standalone build
  of it). Head `5a97025` only adds the docs-only main merge (#71); the evidence commit adds
  this record. **Before:** main `1b38314` (application code unchanged at `264bea6`) with this
  PR's two synthetic fixture edits applied, so both sides show the same synthetic data.
- **Environment:** Claude Code cloud container, Node.js 22.22.2, PostgreSQL 16.13, Next.js
  16.3.6 standalone build, Playwright 1.63.0 / Chromium 141, synthetic fixtures, local Discord
  and CRCON mocks, reduced motion. The sharing host reads `127.0.0.1:<port>` because the e2e
  `APP_URL` is local; production renders `valkyria.cz`.
- **Data:** synthetic only. Server Alpha reports the accented public map name
  "Sainte-Mère-Église"; the historical HLL match has rounds on Hürtgen Forest,
  Sainte-Mère-Église (5 : 0) and "Synthetic Map D" (no score).

## Acceptance

| Criterion | Steps / expected | Observed | Proof |
|---|---|---|---|
| Archive preserved, runtime bounded | Derive only clean layers; register every runtime file | 97 runtime files (96 pack derivatives + HLL mark); each pack source must be `retain-unbranded-source` in `branded/catalog.json`; `derive-graphics-pack.mjs --check` current; `restore.mjs --verify` 497/497; pack excluded from Docker | Foundation passed (2,461 files); 176/176 tooling tests |
| Map identity | Exact/alias/layer/unknown/near-match | 20/20 names mapped; 23 layer forms recognised; 34 unknown/near-match inputs (typos, extra words, paths, `__proto__`, >80 chars) give no artwork | `hll-maps.test.ts` (79 cases + real file dimensions) |
| Server/match map views | Thumbnail, scene, tactical link; unknown/stale/failed | Artwork only for recognised maps; stale Bravo and map-less Charlie neutral; failed decode hides the image, box/text stay; tactical map never requested on load | `hll-map-artwork.spec.ts` 7/7 (CS/EN, 390/1024/1366, overflow 0) |
| Real clan/game branding | Official marks, no text stand-ins, names kept | HLL hub card uses the official full mark (was styled text); both marks keep aspect ratio; card link names unchanged; sharing headers draw the marks | `brand-marks.spec.ts` 3/3; `social.test.ts` header test |
| Editorial templates | Authorized import, edit, draft → publish, denial | Editor imports a scene as a private asset (deduplicated by bytes), edits defaults, uses it as a cover; private until publish, public after; match manager and HLL-scoped editor get no library | `admin-editorial-templates.spec.ts` 2/2; `media-templates.test.ts` 9/9 (PostgreSQL) |
| Sharing output | 1200×630, locale/game/publication, 0 vs null | v3 template; full-bleed scenes, map briefing, framed covers; `0 : 0` rendered, unknown never; private/draft routes 404 as before | `social.test.ts` 11/11; `social-images.test.ts` 3/3 (PostgreSQL); `social-seo.spec.ts` |
| UI icons | Pack geometry, decorative, names unchanged | 16 exports equal the source SVG geometry; applied to server refresh/copy (+ neutral server glyph), editor save/preview, media upload/save/delete, post edit | `icons.test.tsx` 16/16; e2e name assertions |
| Existing UI unaffected | Full suite and budgets | Strip/crest/hub cover tests unchanged and passing | See checks |

## Checks

| Check | Result |
|---|---|
| Lint (`pnpm lint`), types (`tsc --noEmit`) | Passed |
| Unit (`vitest --project unit`) | 64 files / 703 tests passed |
| Integration (`vitest --project integration`, disposable PostgreSQL) | 35 files / 340 tests passed |
| Browser suite (`--project=chromium --project=chromium-admin`, `7f4dc44` build) | 179 passed, 0 failed; 97 opt-in capture cases skipped |
| CI artwork step (`E2E_HLL_EMPTY_MEDIA=1`, `hll-artwork.spec.ts`) | 4 passed |
| Page budgets (`measure-pages.mjs`) | All 15 samples passed. Median LCP `/cs` 1,024 ms, `/cs/hll` 1,976 ms, `/cs/wardogs` 1,984 ms; max transfer 652,243 B |
| Foundation / tooling tests | Passed (2,461 files) / 176 passed |

Byte impact: server list rows add one 2–4 kB thumbnail per recognised map (lazy); a selected
server or match adds 718×404 scenes (24–142 kB each); tactical maps (334–458 kB) load only on
request. The HLL mark adds 6.5 kB to the hub. The runtime crest remains the existing 733×811
WebP of the owner's PNG (flattened mean channel difference 1.2/255: lossy encoding only).

## Captures

Shared context above. Before/after pairs use identical synthetic data.

- [`before/hub-cs-1920x1080.webp`](before/hub-cs-1920x1080.webp) — Before: the HLL hub card showed "HELL LET LOOSE" as styled text beside the official Wardogs mark. _(/cs · 1920×1080 · cs)_
- [`after/hub-cs-1920x1080.webp`](after/hub-cs-1920x1080.webp) — After: the official Hell Let Loose full mark on the HLL card, same treatment as Wardogs, over the unchanged PR #69 cover; the card text keeps the game name. _(/cs · 1920×1080 · cs)_
- [`before/hub-en-390x844.webp`](before/hub-en-390x844.webp) / [`after/hub-en-390x844.webp`](after/hub-en-390x844.webp) — Phone hub before/after (full page): marks keep their ratio in stacked cards; no overflow. _(/en · 390×844 · en)_
- [`before/servers-alpha-cs-1920x1080.webp`](before/servers-alpha-cs-1920x1080.webp) — Before: striped placeholders for every row, text-only detail. _(/cs/hll/servers?server=synthetic-alpha · 1920×1080 · cs)_
- [`after/servers-alpha-cs-1920x1080.webp`](after/servers-alpha-cs-1920x1080.webp) — After: Alpha's row thumbnail and a 3:1 scene with an on-demand tactical-map link (size shown) above the unchanged detail; Bravo/Charlie keep the neutral box, now with the server glyph; refresh button with the pack glyph. _(same route · 1920×1080 · cs)_
- [`after/servers-alpha-en-1366x768.webp`](after/servers-alpha-en-1366x768.webp) — English labels and tactical link. _(/en/hll/servers?server=synthetic-alpha · 1366×768 · en)_
- [`after/servers-bravo-unknown-cs-1366x768.webp`](after/servers-bravo-unknown-cs-1366x768.webp) — Unknown synthetic map, stale observation: no artwork, stale badge and missing progress unchanged. _(/cs/hll/servers?server=synthetic-bravo · 1366×768 · cs)_
- [`after/servers-failed-decode-cs-1366x768.webp`](after/servers-failed-decode-cs-1366x768.webp) — Map images answered with invalid bytes by a test route: images hidden (no broken-image icon), 72×40 box and 3:1 detail box keep the layout, map name and link remain. _(/cs/hll/servers?server=synthetic-alpha · 1366×768 · cs)_
- [`before/servers-list-cs-390x844.webp`](before/servers-list-cs-390x844.webp) / [`after/servers-list-cs-390x844.webp`](after/servers-list-cs-390x844.webp) — Phone list before/after. _(/cs/hll/servers · 390×844 · cs)_
- [`after/servers-alpha-en-390x844.webp`](after/servers-alpha-en-390x844.webp) — Phone detail (full page): back link, scene, metadata, copy button with the pack glyph. _(/en/hll/servers?server=synthetic-alpha · 390×844 · en)_
- [`before/match-top-cs-1920x1080.webp`](before/match-top-cs-1920x1080.webp) / [`after/match-top-cs-1920x1080.webp`](after/match-top-cs-1920x1080.webp) — Coverless HLL match banner before/after: the first recognised round map (Hürtgen Forest) behind VALKYRIA vs SHF. _(/cs/hll/matches/ukazka-hll-historicky · 1920×1080 · cs)_
- [`before/match-maps-cs-1920x1080.webp`](before/match-maps-cs-1920x1080.webp) / [`after/match-maps-cs-1920x1080.webp`](after/match-maps-cs-1920x1080.webp) — "Mapy a kola" before/after: two map cards (scene, name, tactical link) above the table; the table keeps text maps, the real 5 : 0 and the synthetic map without artwork. _(same route, scrolled · 1920×1080 · cs)_
- [`after/match-maps-en-1366x768.webp`](after/match-maps-en-1366x768.webp) — English "Maps and rounds". _(/en/hll/matches/ukazka-hll-historicky · 1366×768 · en)_
- [`after/match-cs-390x844.webp`](after/match-cs-390x844.webp) — Phone match detail (full page): banner scene, stacked map cards, scrollable table; no page overflow. _(/cs/… · 390×844 · cs)_
- [`after/match-maps-en-390x844.webp`](after/match-maps-en-390x844.webp) — Phone "Maps and rounds" in English. _(/en/… · 390×844 · en)_
- [`before/social-hll-site-cs.webp`](before/social-hll-site-cs.webp) / [`social/social-hll-site-cs.webp`](social/social-hll-site-cs.webp) — HLL landing card, v2 before (framed Steam screenshot, text game label) and v3 after (full-bleed pack scene, official HLL mark, "ILUSTRACE VALKYRIA • NENÍ TO HERNÍ SNÍMEK"). _(/api/social/cs/site?game=hll · 1200×630)_
- [`before/social-wardogs-site-en.webp`](before/social-wardogs-site-en.webp) / [`social/social-wardogs-site-en.webp`](social/social-wardogs-site-en.webp) — Wardogs landing card before/after: pack scene `wdg-blue` and the official Wardogs mark. _(/api/social/en/site?game=wardogs)_
- [`social/social-community-site-cs.webp`](social/social-community-site-cs.webp) — Shared card: the PR #69 hub cover, both official marks. _(/api/social/cs/site)_
- [`before/social-hll-match-cs.webp`](before/social-hll-match-cs.webp) / [`social/social-hll-match-cs.webp`](social/social-hll-match-cs.webp) — Published HLL match before/after: tactical background, framed Hürtgen Forest scene, "MAPA HURTGEN FOREST • HERNÍ SCÉNA", 3 : 2. _(/api/social/cs/matches/ukazka-hll-historicky)_
- [`social/social-hll-match-en.webp`](social/social-hll-match-en.webp) — The same match in English. _(/api/social/en/matches/ukazka-hll-historicky)_
- [`social/social-wardogs-news-cover-cs.webp`](social/social-wardogs-news-cover-cs.webp) — Article with a published cover: framed and uncropped, no scene added. _(/api/social/cs/news/ukazka-obrazky-tabulka-a-odkazy)_
- [`social/renderer-zero-score-cs.webp`](social/renderer-zero-score-cs.webp) — Renderer output (`social.test.ts`, `SOCIAL_CAPTURE_DIR`) for a synthetic HLL result 0 : 0 on Hürtgen Forest: zero rendered as a score. _(renderer, 1200×630)_
- [`social/renderer-long-title-cs.webp`](social/renderer-long-title-cs.webp) — Long Czech title with diacritics wraps within the text column. _(renderer, 1200×630)_
- [`admin/templates-cs-1440x1000.webp`](admin/templates-cs-1440x1000.webp) — Editor's media library: "Šablony pozadí Valkyria (8)" with game labels, default alt text and add actions. _(/cs/admin/media · 1440×1000 · cs)_
- [`admin/template-asset-detail-cs-1440x1000.webp`](admin/template-asset-detail-cs-1440x1000.webp) — After adding: an ordinary unused (private) editorial asset with editable CS/EN defaults; save/delete buttons with pack glyphs. _(/cs/admin/media?asset=… · cs)_
- [`admin/template-picker-cs-1440x1000.webp`](admin/template-picker-cs-1440x1000.webp) — Cover picker: the template is picked like any library image; its Czech alt pre-fills. _(news editor · cs)_
- [`admin/template-editor-actions-cs-1440x1000.webp`](admin/template-editor-actions-cs-1440x1000.webp) — Editor action bar: save and preview carry the pack glyphs; publish unchanged. _(news editor · cs)_
- [`admin/template-article-cs-1440x1000.webp`](admin/template-article-cs-1440x1000.webp) — The published synthetic article with the template cover; headline and text remain HTML. _(/cs/news/… · cs)_
- [`admin/templates-en-390x844.webp`](admin/templates-en-390x844.webp) — Template library in English on a phone; no overflow. _(/en/admin/media · 390×844 · en)_

Reproduce: `CAPTURE_EVIDENCE=1 pnpm exec playwright test e2e/visual-graphics-pack.spec.ts --project=chromium`
and `… e2e/visual-admin-graphics.spec.ts --project=chromium-admin-capture --no-deps`
(outputs under `.local/evidence/`), converted to WebP q72 (social q80) with sharp.

## Limits

Not implemented (kept in the archive): corrected ready-made compositions with baked Czech
copy (editorial themes, Discord banners, map article/result/poster/square/wide exports), a
map-guide page, admin downloads of square/Discord exports, icons on further mapped targets
(hub links, tournaments, manual, filter bar, schedule, settings, revision history). No live
social-network unfurl, production data or deployment was verified.
