# Unified Logi website implementation plan

**Goal:** Present one HLL/Wardogs community website whose operational data comes from Logi, without separate provider and archive browsers.

**Architecture:** Keep the existing shared Next.js application, canonical game routes, PostgreSQL projections, scoped read keys and consent boundaries. Combine public operational and historical matches before ordering, filtering, counting and paging. Preserve the existing game-menu presentation. No second Logi instance or writable operational master.

**Authorization:** The owner's current request authorizes autonomous implementation and scoped PR delivery. Production publication/deployment and private data publication remain separate operations under the repository agreement.

## Deliverables

- [x] One match browser across community/HLL/Wardogs, one set of tabs/search/page parameters, chronological ordering and consistent totals.
- [x] Prefer the current published Logi counterpart of an explicitly linked archive match; keep historical detail URLs, recaps and source result confidence.
- [x] Preserve unknown times/scores and all Wardogs participants; no invented Valkyria/faction attribution or nickname-based deduplication.
- [x] Read live servers through bounded cached Logi requests for both games; retain explicit server publication and failure/freshness states.
- [x] Bring approved public Logi roster participation into the ordinary member journey without exposing private directory/attendance or bypassing consent.
- [x] Keep editorial/media/settings/integration administration; demote duplicate operational editors to archive maintenance and link normal operations to validated Logi origins.
- [x] Verify CS/EN desktop/mobile, game isolation, filtered counts, pagination, archive fallback, private-field exclusion and unavailable sources.
- [x] Run foundation, lint, types, unit, disposable PostgreSQL integration, production build and relevant Playwright journeys; inspect actual screenshots.
- [x] Update contracts, screen map, status and evidence; deliver the scoped PR without claiming production activation.

## Ownership

The integrator owns match read models/browser, shared URL state, browser acceptance, documentation and final Git operations. Independent bounded workers own server/reader compatibility, approved roster composition, and administration. Shared files and contracts are coordinated; workers do not commit, push or deploy.

## Match paging contract

Use a discriminated row (`archive` / `logi`) so N-participant results keep their meaning. Both kinds share one chronological list and public href. Exclude an archive row only for a currently visible, explicitly bound same-game event. Count all rows before paging. Fetch only the bounded archive window needed around the requested page; merge with the filtered operational set and retain deterministic tie order. Old `logiPage` links are accepted as a fallback when `page` is absent and generate the single `page` parameter thereafter.

## Review focus

1. Provider and archive records interleaving across page boundaries: no repeated, skipped or incorrectly counted rows.
2. Same date/title/score across games: no inferred identity joins or cross-game suppression.
3. Revoked/expired public people grants: no stale directory, private attendance or identifier disclosure.
4. Provider outage: preserve published history and honest unknown/stale server state.
5. Linked historical detail and locale/game switching: retain canonical URLs and useful navigation.
