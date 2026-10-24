# Shared match presentation — 24 October 2026

The reported reproduction showed separate Logi and website-history sections. The
previous production release already combined those rows, but native/League details,
scores and organizer fixtures still had inconsistent presentation. This follow-up
uses one chronological browser, search, counters and pagination for approved native,
editorial and eligible League matches, including the primary all-games browser.

## Local qualification

Tested application subtree: `aaaf40e4ef681f7d4a8ba3240220bc2772cc642e`
on `fix/match-presentation`, based on main `83aa6ebb935dd84dfa67e8ca0c3629befe4b66f6`.
The PR commit links this exact application tree to the complete source revision.
Windows, Node 24, pnpm 10.34.5, standalone production build and Playwright Chromium;
loopback PostgreSQL and labelled synthetic fixtures/mock providers only.

| Command / scenario | Observed result |
| --- | --- |
| `pnpm test:unit` | 1,383 tests / 123 files passed |
| `pnpm test:integration` with disposable PostgreSQL | 549 tests / 52 files passed |
| `pnpm lint`, `pnpm typecheck`, `pnpm build` | Passed |
| `playwright test -c playwright.logi.config.ts` | 21 connected projection journeys passed, CS/EN, desktop/mobile |
| `playwright test e2e/public-matches.spec.ts e2e/wardogs-league-fixtures.spec.ts e2e/visual-wardogs-readers.spec.ts e2e/public-layout.spec.ts --project=chromium --workers=2` | 62 passed with evidence capture enabled |
| Independent integrated source review | No remaining actionable findings |

The connected suite asserts canonical archive redirects retain the sole consented
historical lineup, while denied identities/statistics and attendance remain absent.
Mixed-source unit/browser scenarios cover exact-once rows, every page, all-games/game
filters, query, zero/null/multiple participants, missing dates, stale organizers and
paused/unpublished bindings. Faction scores retain faction labels; missing provider
scores remain awaiting result. Existing public bounds and privacy gates are unchanged.

## Inspected captures

These are real local captures, not production proof. Full-page screenshots preserve
the actual rendered document. Synthetic names are intentionally visible.

![HLL results on desktop](hll-results-desktop.png)

`/cs/hll/matches?view=results`, 1440px viewport: one list and search, prominent labelled
scores, one reviewed canonical match link and the shared rich preview.

![HLL results on mobile](hll-results-mobile.png)

The same route at 390px: each result keeps its date, participants, status and labelled
score within the viewport; a single pagination control follows the list.

![Wardogs shared match browser](wardogs-matches-desktop.png)

`/cs/wardogs/matches`, 1440×1050 viewport: editorial and eligible three-team League
fixtures share one dated list and count; no second organizer/archive section.

![Wardogs three-team detail on mobile](wardogs-detail-mobile.png)

`/en/wardogs/matches/league/synthetic-fixture-bravo`, 390×844 viewport: the common
detail pane retains all three supplied participants, actual map/date/status, freshness
and a secondary organizer link; no invented result.

## Release boundary

[PR #116](https://github.com/ValkyriaWDG/www/pull/116) merged at 18:29:46 UTC as
`eea874591543461f31b905e7b67c3cd67add8764`. Its application subtree is identical to
the locally tested tree above. [PR-head CI 40119342787](https://github.com/ValkyriaWDG/www/actions/runs/40119342787)
passed Foundation, Application and Quality gate for head `2172c4bcefb19ec4c56dbedf4f618b61558a282f`
against base `83aa6ebb935dd84dfa67e8ca0c3629befe4b66f6` (PR merge context).
This includes 274 ordinary browser tests (166 opt-in cases skipped), 21 connected
journeys, four artwork tests, cold mobile budgets, real restore, non-root image,
native sharp, rollback rehearsal, vulnerability comparison and SBOM. Detailed CI
artifacts retain reports for 90 days; the selected captures above are durable.

Production preparation independently verified authenticated registry identity
`majorluk/valkyria-www` and its approved public visibility. Fresh paired recovery of
the preceding `6647f9a` deployment restored all 37 tables and 442 media files. The
capture paused only the website for 8.08 seconds; the encrypted off-host copy passed
authenticated AES-GCM decryption and both plaintext/ciphertext hash checks. The
rollback image is pinned to its accepted immutable digest; no database restore over
new live writes is part of an image rollback. The dedicated updater is paused for
explicit candidate acceptance. Unrelated services remain outside the release scope.

[Accepted-main CI 40120956793](https://github.com/ValkyriaWDG/www/actions/runs/40120956793)
and the full reusable verification of
[publisher 40120979940](https://github.com/ValkyriaWDG/www/actions/runs/40120979940)
passed for the exact merged `eea874591543461f31b905e7b67c3cd67add8764` source.
The protected publication was approved only after those successful Quality gates.
The image was published and activated at 18:54:25 UTC with immutable digest
`sha256:515d6ac43760de5f441bd3ae550df8da10f9bc7d28ab2e4dd5c05db9187f1729`.
The first read-back passed 121 public checks, readiness/configuration, 442 preserved
media files and 17 untouched unrelated containers. Visual acceptance then found
long-name banner wrapping, an inconsistent detail timestamp and a misleading partial
Wardogs identity. HTTP success did not close those defects; the follow-up is recorded
in [detail readability acceptance](../match-detail-readability-2026-10-24/README.md).

Seven independently reviewed recent HLL native/archive links were activated at
19:11:39 UTC, removing seven duplicate matches across upcoming/results. An unresolved
legacy opponent identifier was corrected to K&B from the captured identity and public
legacy match209, with an audit record and without changing scores/dates/publication.
The resulting public acceptance passed 117/117 checks. Two further explicit Wardogs
League/native associations for 24/25 October were saved in Logi's existing admin UI;
the source retained its publication/freshness guards. At 19:43:38 UTC the expanded
public acceptance passed 139/139 checks, including both locales' canonical redirects.
These configuration observations still used the earlier image above; they are not
proof that the later presentation fixes had been deployed.
This record does not claim that local fixtures activate Logi's
deferred Convex producer. No SQL migration, environment, dependency or provider-permission
change is required.
