# Application 1.0.0 evidence

Tested application source: `64809d03a4444e26dff64ca193d302583fb3f924`; the release head only adds tests,
CI, operations scripts and documentation on top of it. Actual-media captures and measurements: clean
`f4b004f23ed4cfbc2b631be004ea8a133abee4aa`. Environment: Claude Code cloud container (Ubuntu 24.04), Node
24.21.0, pnpm 10.34.5, PostgreSQL 16.13, Chromium 141.0.7390.37 (Playwright build 1194, no proprietary
codecs), Docker 29.3.1. All data is synthetic; Discord is mocked at the REST boundary. Nothing is deployed.

## Checks

| Check | Command | Result |
|---|---|---|
| Foundation | `node scripts/check-foundation.mjs && node --test scripts/tests/*.test.mjs` | Passed (6 foundation tests) |
| Lint / types | `pnpm lint && pnpm typecheck` | Passed (ESLint, 0 warnings; strict TS incl. `packages/db`) |
| Unit | `pnpm test:unit` | Passed: 365 tests in 37 files |
| PostgreSQL integration | `DATABASE_URL=… pnpm test:integration` | Passed: 227 tests in 21 files |
| Browser journeys | `pnpm build && DATABASE_URL=… pnpm test:e2e` | Passed: 108 tests (63 opt-in capture tests skipped; captures run separately with `CAPTURE_EVIDENCE=1`) |
| Admin journeys under load | `playwright test --project chromium-admin --workers 3 --repeat-each 3` | Passed: 87/87 |
| Actual background media | `pnpm test:e2e:media` | Passed: 11/11 ([measurements](measurements.json)) |
| Container | build, migrate twice, read-only run, health, uid | Passed: migrate 1 → 0, ready 200, uid 10001, `/` 307, `/cs` 200, no npm |
| Image scan | Trivy 0.67.2, `--ignore-unfixed --severity HIGH,CRITICAL --exit-code 1` | Passed after removing npm (its 4 fixable HIGH findings); unfixable Debian findings recorded |
| SBOM | Trivy CycloneDX | 123 components; CI uploads one per build |
| Backup/restore | `node apps/web/scripts/restore-rehearsal.mjs …` | Passed: 25 tables / 435 rows content-identical, 82 media files identical, 0 migrations applied, restored copy ready and serving all 7 live assets byte-identical |
| Media volume | write as uid 10001, recreate container | File survived; app files read-only |

## Background media measurements

- Delivery (manifest `assets/background-media.json`): all four files served byte-identical with `video/mp4`, `video/webm`,
  `image/webp`, `206` byte ranges and `public, max-age=31536000, immutable`. Both MP4 containers: one video track, no
  audio, 192.47 s, moov before mdat.
- This Chromium has no H.264 decoder: both MP4 renditions report `MEDIA_ERR_SRC_NOT_SUPPORTED` and the application
  selects the WebM (listed first). WebM middle (96.233 s) and near-end (192.216 s) seeks landed exactly with decoded frames.
- One uninterrupted natural wrap of the persistent player at rate 1: first frame at 0.06 s, wrap from 192.43 s to 0.01 s
  after 192.43 s wall-clock; no pause, error or ended events; 2 brief `waiting` stalls with the video layer kept visible
  (0 hides); 1,003 of 5,778 frames dropped by headless software decoding in this container; median frame interval 33.4 ms.
- Overlay order: media (z 0) < scrim/vignette (z 1) < clan crest (z 2, opacity 0.12), the crest outside the media element.
- One player across `/cs/news`, `/cs/matches`, `/cs/members`, `/cs`: same element, time kept advancing, one `bytes=0-` load;
  administration pauses it (reason `route`) and a direct admin load attaches no source.
- Manual pause holds across navigation and a fresh visit (0 video requests), then Play downloads and plays; hidden tab
  (simulated `visibilitychange`) pauses and resumes; aborted media keeps the poster with no error surface.
- Zero video requests before an explicit Play under reduced motion, Save-Data (simulated Network Information API) and
  the 390×844 phone default, in Czech and English; each then plays after Play.

## Menu shell, language switch and focus (#2)

Default e2e server: the video URL deliberately does not exist, so these show the original CSS/SVG fallback scene.

![home-cs-1920x1080](shell/home-cs-1920x1080.webp)

Home /cs at 1920×1080 (desktop baseline); missing e2e video → original fallback scene.

![home-en-1920x1080](shell/home-en-1920x1080.webp)

Home /en at 1920×1080 (desktop baseline); missing e2e video → original fallback scene.

![home-cs-2560x1440](shell/home-cs-2560x1440.webp)

Home /cs at 2560×1440 (reference-09 canvas); missing e2e video → original fallback scene.

![home-cs-390x844](shell/home-cs-390x844.webp)

Home /cs at 390×844 (phone, poster-first); missing e2e video → original fallback scene.

![home-en-390x844](shell/home-en-390x844.webp)

Home /en at 390×844 (phone, poster-first); missing e2e video → original fallback scene.

![home-cs-320x568](shell/home-cs-320x568.webp)

Home /cs at 320×568 (smallest phone); missing e2e video → original fallback scene.

![mobile-menu-cs-390x844](shell/mobile-menu-cs-390x844.webp)

Mobile disclosure menu open (cs, 390×844): all sections incl. NOVINKY, sign-in and HLL WEB; flag switcher in the compact header.

![focus-nav-cs-1920x1080](shell/focus-nav-cs-1920x1080.webp)

Keyboard focus on NOVINKY (pale inset ring) next to the amber current HLAVNÍ MENU item.

![focus-cta-cs-1920x1080](shell/focus-cta-cs-1920x1080.webp)

Keyboard focus on the Discord CTA (outer pale ring outside the amber outline).

![subpage-not-found-en-1440x900](shell/subpage-not-found-en-1440x900.webp)

Localized not-found page inside the shell (en): darker public scrim, no crest, footer strip with HLL WEBSITE/Privacy.

## Delivered background media in the application (#2, #6)

Actual full-length delivery served by the standalone build (`pnpm test:e2e:media`); nothing about playback is mocked.

![cs-desktop-home-playing](background-media/cs-desktop-home-playing.webp)

Home /cs at 1440×900 during actual playback of the delivered full-length 1080p WebM (t≈4.9 s): the video layer sits under the scrim, vignette and separate faded clan crest; menus, Discord CTA and next-match strip stay legible; the pause control is live.

![en-desktop-home-playing](background-media/en-desktop-home-playing.webp)

Home /en at 1440×900 during actual playback of the delivered WebM (t≈3.3 s): the same persistent player and overlays in English.

![cs-desktop-home-darkest-frame](background-media/cs-desktop-home-darkest-frame.webp)

Readability over the darkest sampled frame of the full 192.47 s sequence (sampled at 14.1 s, captured at 14.8 s while playing): headings, CTA and utility rail remain readable.

![cs-desktop-home-brightest-frame](background-media/cs-desktop-home-brightest-frame.webp)

Readability over the brightest sampled frame (sampled at 117.5 s, captured at 118.2 s while playing).

![cs-desktop-home-poster](background-media/cs-desktop-home-poster.webp)

Reduced motion, /cs at 1440×900: the delivered WebP poster (frame at 2 s) with zero video requests; the Play control is the explicit opt-in.

![cs-mobile-home-poster](background-media/cs-mobile-home-poster.webp)

390×844 phone default (narrow + coarse pointer), /cs: poster only, zero video requests before the visitor presses Play.

![en-mobile-home-playing](background-media/en-mobile-home-playing.webp)

390×844 phone, /en after the explicit Play: the delivered WebM plays under the mobile layout (t≈1.2 s).

![cs-desktop-news-poster](background-media/cs-desktop-news-poster.webp)

Reduced motion, /cs/news at 1440×900: the public-route scrim over the delivered poster; news panels stay readable.

![en-desktop-matches-poster](background-media/en-desktop-matches-poster.webp)

Reduced motion, /en/matches at 1440×900: match browser over the delivered poster with the public-route scrim.

## Public pages (#3)

![news-list-cs-1920x1080](public/news-list-cs-1920x1080.webp)

News list /cs/news at 1920×1080: image panels with covers or neutral placeholders, category/game eyebrow, localized dates, filters and result count.

![news-list-en-390x844](public/news-list-en-390x844.webp)

News list /en/news at 390×844: image panels with covers or neutral placeholders, category/game eyebrow, localized dates, filters and result count (single column).

![news-article-feature-cs-1920x1080](public/news-article-feature-cs-1920x1080.webp)

Feature article (cs, full page): inline wide image with caption, table in a labelled scroll region, external link indicator, related posts.

![news-article-long-en-390x844](public/news-article-long-en-390x844.webp)

Long-form article /en/news/sample-long-form-article at 390×844 (full page): back link, publication date/author, cover with caption, readable body in the dark editorial frame, related posts.

![news-missing-translation-en-1440x900](public/news-missing-translation-en-1440x900.webp)

Missing translation: switching /cs/news/ukazka-pouze-cesky to English lands on /en/news with a localized notice and an explicit hreflang=cs link to the published Czech article.

![matches-results-cs-1920x1080](public/matches-results-cs-1920x1080.webp)

Match browser /cs/matches?view=results (reference 13): tabs + search/game toolbar, ~2/3 list with date/zone, competition tags, status badges, tabular scores and a dash for the unpublished result; detail preview pane with MATCH DETAILS action.

![matches-detail-en-1920x1080](public/matches-detail-en-1920x1080.webp)

Canonical match detail /en/matches/ukazka-wardogs-overeny-vysledek on desktop: same results list with the row selected (amber outline) and the full detail pane (verified 2 : 1 result, recap, rounds, links).

![matches-list-cs-390x844](public/matches-list-cs-390x844.webp)

Match list on a phone (cs, 390×844, full page): compact row summaries (date + status, teams, competition + result); no preview pane.

![matches-row-focus-cs-1920x1080](public/matches-row-focus-cs-1920x1080.webp)

Keyboard focus on a match row link: pale focus ring around the whole row, distinct from the amber selection.

![members-list-cs-1920x1080](public/members-list-cs-1920x1080.webp)

Member roster /cs/members (reference 12): emblem title block with the real profile count, zebra rows, avatars or initials, localized public roles and game tags; long name clamped to two lines, emoji name as stored.

![members-profile-en-390x844](public/members-profile-en-390x844.webp)

Member profile on a phone (en) /en/members/synteticka-hracka-bravo: the English biography is not published, so an explicit absence notice links to the Czech biography.

![clan-cs-1440x900](public/clan-cs-1440x900.webp)

Clan page /cs/clan at 1440×900 (full page): published story in a readable frame, Discord CTA, contextual Hell Let Loose website link (external), next-step links.

![clan-en-1440x900](public/clan-en-1440x900.webp)

Clan page /en/clan at 1440×900 (full page): published story in a readable frame, Discord CTA, contextual Hell Let Loose website link (external), next-step links.

![community-cs-1440x900](public/community-cs-1440x900.webp)

Community page /cs/community (reference 11, full page): two large square choices DISCORD / JAK SE PŘIDAT, Discord-vs-sign-in explanation, community guide and HLL website block.

![privacy-en-1440x900](public/privacy-en-1440x900.webp)

Privacy page /en/privacy (full page): published English copy in the reading frame.

## Sign-in, account and denial (#4)

Synthetic sessions against the local Discord mock.

![login-cs-1440x900](auth/login-cs-1440x900.webp)

Anonymous visitor, /cs/login: “Pokračovat přes Discord” as the only member sign-in (no password form), with the note that joining the Discord server and signing in are separate steps and that membership and permissions are verified by the server after sign-in.

![login-en-390x844](auth/login-en-390x844.webp)

Anonymous visitor, /en/login on a 390×844 phone: the same Discord sign-in in English, language switcher and menu trigger in the header, no horizontal overflow.

![login-recovery-cs-1440x900](auth/login-recovery-cs-1440x900.webp)

/cs/login/recovery with LOCAL_ADMIN_LOGIN_ENABLED unset (the e2e default): the local administrator recovery route answers with the localized 404 page, so no password form is exposed.

![account-member-cs-1440x900](auth/account-member-cs-1440x900.webp)

Synthetic Discord member, /cs/account: signed-in name and method (Discord), access status “Nemáte přístup do administrace” derived from guild roles, “Obnovit členství” and sign-out.

![admin-denied-member-en-1440x900](auth/admin-denied-member-en-1440x900.webp)

Synthetic Discord member without editorial roles, /en/admin: the administration renders the localized denial panel (HTTP 403 semantics) instead of any module.

## Editorial administration (#5)

![01-posts-list-cs-1920x1080](admin-editorial/01-posts-list-cs-1920x1080.webp)

Posts workspace (Czech UI, 1920×1080): "NOVÝ PŘÍSPĚVEK", search and state/language filters in the URL, author, category, modification time and SEPARATE Czech/English state columns (published, draft, scheduled update, missing, archived) with schedule times.

![09-posts-list-en-1440x900](admin-editorial/09-posts-list-en-1440x900.webp)

English interface posts list at 1440×900: "NEW POST", localized filters and state labels ("Published · update scheduled"), separate Czech/English columns.

![02-editor-cs-ui-en-content-1920x1080](admin-editorial/02-editor-cs-ui-en-content-1920x1080.webp)

Post editor at 1920×1080: Czech interface editing the ENGLISH translation (both locales shown explicitly), content-language tabs with per-translation state (Czech published, English draft), formatting toolbar, wide canvas, cover picker and document/publication side panel; "Koncept uložen" save state.

![03b-autosave-saved](admin-editorial/03b-autosave-saved.webp)

Debounced autosave completed ("Koncept uložen" with time) — the English draft only; nothing was published.

![03d-conflict](admin-editorial/03d-conflict.webp)

Revision conflict on the same translation: explicit notice naming who saved the newer version, local text kept, autosave paused; options to load the latest (discard mine), preview the newer version or overwrite after confirmation.

![04-revision-history](admin-editorial/04-revision-history.webp)

Revision history panel of the English translation (1920×1080 layout, element capture): kind (autosave/saved/restored), author and time, current-draft marker, per-revision preview and "Obnovit do konceptu" (restore to draft).

![05a-schedule-dst](admin-editorial/05a-schedule-dst.webp)

Schedule panel for an UPDATE of the live Czech article: explicit date, time and IANA time zone (Europe/Prague), DST fall-back ambiguity choice (second occurrence, GMT+1) and the resolved instant in words with UTC.

![06-preview-banner](admin-editorial/06-preview-banner.webp)

Private preview (content.read_private, no-store, noindex) of the English draft with the prominent "NEZVEŘEJNĚNÝ NÁHLED" banner, rendered with the shared server-side RichText renderer, cover and caption.

![07-media-library-upload-error](admin-editorial/07-media-library-upload-error.webp)

Media library (editorial scope): "NAHRÁT OBRÁZEK", rejected SVG with the localized unsupported-file error, thumbnail grid with dimensions and in-use badges, detail panel with usage references and library default alt/caption per language.

![08-editor-mobile-390x844](admin-editorial/08-editor-mobile-390x844.webp)

Editor at 390×844: stacked layout, wrapping toolbar, sticky save/preview/update bar with ≥44 px targets; no horizontal page scroll.

## Community administration (#5)

![matches-list-cs-1920x1080](admin-community/matches-list-cs-1920x1080.webp)

Match manager, /cs/admin/matches at 1920×1080: prominent NOVÝ ZÁPAS, search + game/status/publication filters in the URL, date range, start times in Europe/Prague with zone, separate status and publication badges, results or “—”.

![match-new-validation-cs-1920x1080](admin-community/match-new-validation-cs-1920x1080.webp)

New match form (cs) after “Uložit koncept” with a missing opponent name and an invalid best-of: inline, associated field errors; schedule entered as 19:30 in Europe/London with the resolved instant shown in London, Prague and UTC.

![match-result-rounds-en-1920x1080](admin-community/match-result-rounds-en-1920x1080.webp)

Result group of the completed synthetic fixture (en, 1920×1080 page, element capture): verified 2 : 1 result with derived outcome, provisional/verified choice, source, three rounds in compact rows with Up/Down/Remove buttons (no drag-only interaction) and a fourth round being added before “Update result”.

![member-consent-cs-1920x1080](admin-community/member-consent-cs-1920x1080.webp)

Editor on the draft synthetic member profile (cs): consent missing, explicit confirmation checkbox ticked before “Zaznamenat souhlas”, publish refused until consent, and the “Co bude veřejné” preview limited to public fields.

![settings-preview-cs-1920x1080](admin-community/settings-preview-cs-1920x1080.webp)

Administrator, /cs/admin/settings: unsaved custom background (same-site poster, focal point 30 %/40 %, provenance) in the labelled NÁHLED frame with the fallback scene behind it; live values shown separately; “Uložit nastavení” states it goes live immediately.

![audit-en-1920x1080](admin-community/audit-en-1920x1080.webp)

Administrator, /en/admin/audit: redacted, paginated audit table (time in Europe/Prague, actor label and kind, action, capability, entity, language, outcome) with bounded filters and the selected event’s key/value summary.

![denied-editor-cs-1920x1080](admin-community/denied-editor-cs-1920x1080.webp)

Editor opening /cs/admin/matches: server-enforced localized access denial (editors cannot manage matches); no match data rendered.

![match-form-cs-390x844](admin-community/match-form-cs-390x844.webp)

Existing upcoming synthetic match at 390×844 (cs): status panel first, stacked single-column groups, no horizontal scrolling; full-page capture.

## Limitations

- MP4/H.264 playback inside the application is unverified here (no codec, and the Chrome download host is blocked);
  the owner's native Chromium file QA covers the MP4 renditions. Firefox and Safari were not run.
- Save-Data and tab visibility are simulated; playback, decoding and looping are real.
- Discord OAuth and guild roles are verified only against the local REST mock; no live application or guild.
- No rollback rehearsal: 1.0.0 is the first release. No production host, DNS, media origin or registry publication.
- Debian 12 base packages carry advisories without fixed packages; reviewed exceptions, not fixable in this image.
