# Unified Valkyria website workstream — Claude Code Cloud handoff

You are Claude Code Cloud, the engineering and product-design lead extending Valkyria's existing website into one platform for Hell Let Loose and Wardogs. Work autonomously on the concrete deliverables below. Communicate with the owner in concise Czech. Write code, documentation, prompts, commits, issues and PR descriptions in English.

## Confirmed context

Valkyria is a Czech/Slovak gaming community with HLL roots and a Wardogs division. The owner holds `valkyria.cz`, `valkyriahll.cz` and `valkyriawdg.cz`. Extend the existing https://github.com/ValkyriaWDG/www application into **one shared platform**, with `https://valkyria.cz` as the future canonical origin, HLL and Wardogs sections and a persistent game switch. Share CMS, identity/session, administration, PostgreSQL and deployment; give each game its own public presentation and explicit data/permission scope. This supersedes the earlier separate-HLL-repository/deployment proposal. The existing HLL site https://valkyriahll.cz/ is the historical content/URL source; https://valkyriawdg.cz/ serves the existing Wardogs experience. Keep production working during development. The final redirects/domain cutover are a separately planned operation, not an immediate side effect of this task.

The owner selected https://github.com/Ninjonik/logi for community operations and Discord features for **both HLL and Wardogs**. Valkyria uses **Ninjonik's hosted instance**. A separate Logi workstream owns capability research, upstream contributions and the integration contract; its prepared prompt can run in a separate ChatGPT session. You own the shared website structure, CMS, public UX and website-side adapter in `ValkyriaWDG/www`. Do not deploy another Logi, share its database, request its global Discord bot token, or duplicate its signup/roster engine.

**HLL visual direction is selected:** adapt the supplied in-game menu, server browser, scoreboard and Field Manual to the web rather than copy every pixel. Use left menu navigation, cool charcoal/gray translucent layers, off-white condensed headings and muted khaki selection. Replace the center character with owner-approved clan battle footage; optionally choose from a playlist once per fresh document opening, stable across in-app navigation. Final footage is not supplied yet. Use the committed visual spec and references to implement autonomously; do not block on another broad visual-direction approval. Exact details can be iterated through actual screenshots.

The owner supplied the hosted Logi origin `https://logi.igportals.eu`, API base `https://logi.igportals.eu/api/v1`, docs `https://logi.igportals.eu/api/v1/docs` and schema `https://logi.igportals.eu/api/v1/openapi.json`. Public docs/schema returned HTTP 200 on 2026-09-28 and the schema matches the inspected source document. Its version `1.0.0` is not a deployed Git revision or proof of SSO/data behavior. Tenant credentials, registrations and other HLL source setup remain deferred; do not repeatedly ask now or invent values. Keep the origin configurable and call authenticated endpoints only from the server.

## Reuse and current-source verification

First inspect the supplied checkout, its instructions, current upstream main, PRs and user changes. On 2026-09-28 the observed `ValkyriaWDG/www` main was `507e704d288cd93d7baa0d1ab22ba8347fd67b0a`; PR #33 (SEO/sharing), #34 (custom-bot admin), #35 (custom role receiver) and #32 (release hardening) were still open. Refresh these facts. Do not assume open PR code is merged, or trust an old local foundation README over current application source.

Read the repository's AGENTS.md, architecture, editorial/match requirements, localization, security, asset policy, delivery/evidence/database/release guides and relevant committed `.claude/skills/` files. Reuse the procedures even if your client is not Claude. Review existing Next.js/TypeScript, PostgreSQL/Drizzle, rich-text editor, publication revisions, media, member consent, matches, CS/EN localization, SEO and tests before creating alternatives.

Use the existing repository and application. Current main already has database game IDs `wardogs` and `hell-let-loose` and game filters for news, matches and members; inspect and extend those boundaries rather than adding duplicate enums or models. A game filter is not a permission boundary: inventory global auth/CMS rights and add explicit allowed-game checks where needed. Preserve legitimate source attribution and the working Wardogs experience. No independent HLL repository, database or general-purpose multisite framework is required.

PR #34 targets custom `/api/management/v1/*` HMAC contracts; #35 targets the old custom bot's signed, sequenced role events. Their tests prove that bot, not Logi. Reuse security/UI principles only after adapting to verified Logi contracts; do not enable or automatically merge those integrations as Logi support.

## Routing, shared content and domain migration

Use `/cs` and `/en` for the community hub; `/{locale}/hll/...` and `/{locale}/wardogs/...` for the two game sections. Let `/` deterministically lead to `/cs`. Keep locale and game separate. Build a typed game registry mapping URL `hll` to existing database `hell-let-loose` and Logi `hell_let_loose`; `wardogs` maps explicitly across all three. Reject unknown game values. Audit existing slugs before routing changes and preserve legacy entry points.

The game switch is persistent, keyboard/touch accessible and separate from the CS/EN language switch. Preserve locale and page category where meaningful. A detail with no real counterpart links to the other game's relevant list or landing page, never an invented same-slug entity. Do not force users away from an explicit deep link based on remembered game preference. Game-specific themes/media are configuration over reusable components; they need not look identical.

Use one rich-text CMS with explicit HLL, Wardogs and community publication choices. Operational events/results belong to one game; members can have multiple game affiliations. Define community or cross-game article identity/canonical policy before changing the schema. Keep one canonical URL for shared content and avoid duplicated competing articles. Reuse existing game columns/relations and add only missing scope. Preserve IDs, translations, revisions, consent and media; backfill verified values, never blanket-reclassify ambiguous community/HLL data as Wardogs. Review slug uniqueness, indexes and revalidation keys across game/locale. Use additive migrations with disposable-data upgrade/repeat/restore evidence.

After approved cutover, permanent 301/308 redirects should map `valkyriahll.cz/` to `valkyria.cz/cs/hll` and `valkyriawdg.cz/` to `valkyria.cz/cs/wardogs`. Map old detail/English URLs to their actual equivalents; do not redirect every URL to a home page. Review removed content, media and legacy APIs separately. Prepare one tested redirect authority with no loops/chains, updated canonical/hreflang/sitemap/social URLs, old-domain HTTPS continuity and rollback. Coordinate OAuth callbacks and webhook endpoints explicitly instead of blanket redirects. Do not change DNS, Cloudflare, proxy or production state during foundation work.

## Product scope

- Czech-first public and admin UI with English translation, `/cs` and `/en`, clearly labeled Czech/English flag switcher, keyboard access and correct language metadata. Technical work remains English.
- Shared community hub/history plus HLL and Wardogs landing pages, approved members/teams, news/articles, guides, events/calendar, fixtures/results, server overview, recruitment/Discord, and the cross-game switch.
- A proper editor workflow: rich text, media/alt text, preview, localized drafts, revision history, scheduling, publication/unpublication and server-side permissions. Never render unsanitized imported HTML.
- Match pages distinguish scheduled/completed/cancelled, unknown/provisional/confirmed/corrected results and game-specific maps/rounds. Missing data is not zero. Do not fabricate current member counts, wins or server availability.
- Accessible responsive desktop/mobile behavior, reduced motion, useful fallback states, bounded page weight and loading performance. Optional background media must have an approved source, poster, pause control and reduced-motion/data behavior.
- HLL-specific branded article/match sharing templates, published-only Open Graph/Twitter images, preview in editorial UI, canonical/hreflang, sitemap and structured data derived from actual published facts. Wardogs game artwork must not silently become HLL artwork.
- Crawl the public legacy HLL site carefully to inventory URLs, content types and assets. Mark dates/provenance, draft an old-to-new redirect map and preserve important routes/history. Public availability is not proof of asset reuse rights or current factual accuracy. No private-profile scraping.

## Data ownership and adapter contract

The website owns editorial publication, translations, SEO, presentation and public-member consent. Hosted Logi is the proposed authority for events, registration, rosters, attendance and confirmed operational results where supported. Start by displaying safe data and linking to the Logi workflow. Do not create independently writable copies of the same operational record.

Use server-only adapters and allowlisted public read models. Keys, private roster fields, tactics, moderation data and personal identifiers must not enter browser payloads, social images, logs or public fixtures. Identify resources by source instance + guild + game + resource type + opaque external ID; never join by nickname. Logi game IDs include `hell_let_loose` and `wardogs`; map them explicitly to website enums and include game in cache/storage keys.

Normalized models should cover EventSummary, MatchSummary, ServerSnapshot, approved PublicMember and IntegrationHealth. Preserve source/observation timestamps, freshness and result confirmation. Timeouts show stale/unknown data, not an invented empty server. Only render records with known public eligibility. Keep website publication/consent state distinct from Logi operational visibility.

Use durable idempotent projection updates, bounded cursor pagination, overlapping incremental windows and periodic reconciliation. Hold query filters and `updatedSince` fixed during a sweep; save page-resume progress separately and advance the completed-sweep watermark only after every page succeeds. Continue an empty page when a next cursor exists. Authenticate webhooks before enqueueing, deduplicate durably and refetch authoritative data; do not assume every dashboard/bot mutation emits a webhook. Keep deletion/unpublication and cache eviction explicit. Imported telemetry requires explicit mapping and confirmation before becoming a competitive result.

Candidate additional HLL sources include an owner-authorized CRCON API and existing public legacy content. Actual server version, access and fields are not established; create replaceable adapters and synthetic fixtures. Do not invent a universal official HLL statistics API, open RCON to the browser or query arbitrary servers.

## Login and permissions

Hosted Logi API documentation is available, but production SSO still needs an authorized provider readiness review and hosted acceptance. Use a disabled provider boundary and synthetic tests until verified. Do not weaken client validation or publish unresolved security findings in this public repository.

Prepare a provider boundary and disabled/fixture states. The canonical `valkyria.cz` application owns one website session across HLL and Wardogs, with explicit capabilities and allowed games; shared identity is not shared administrative authority. Use host-only secure cookies, an environment-specific callback/client registration and a deliberate re-login/old-callback transition policy. Do not try sharing cookies across unrelated registrable domains. Logi `member/guest` is not a website-admin claim or proof of fresh Discord roles. Require an agreed revocation/freshness policy, exact callback/issuer/audience/state/PKCE validation and standards-compatible token/nonce handling. Never request Ninjonik's bot token or internal Convex secret. Evaluate existing independent recovery MFA without making normal users local-password accounts.

## Execution and delivery

1. Inventory existing game/i18n/auth/CMS boundaries, open PRs and both domains' URL surfaces. Record the unified-platform ADR, route/content map, HLL visual implementation brief and prioritized backlog with measurable acceptance criteria.
2. Coordinate shared contract version 0.2 with the Logi session before writing its transport. If cross-session tools are unavailable, write a compact contract handoff for the owner to carry between windows; never assume shared memory or filesystem.
3. Implement the authorized local foundation, CMS/public slices and adapter mocks that do not depend on final footage or live credentials. Use supplied repo/task context; do not overwrite another session's changes. Implement the selected HLL direction and show actual desktop/mobile states for review; pending final footage uses an honest static fallback.
4. Test real behavior: private/draft exclusion, unpublication/cache eviction, scoped reads/writes/exports/previews, media and game/tenant isolation, pagination/retry/out-of-order events, unknown results and revoked identity. Cover CS/EN x HLL/Wardogs routes, direct links/refresh/history, keyboard/mobile switching, preserved session without cross-game privilege escalation, correct canonicals/social images, legacy deep-link mappings and Wardogs regression. Fixtures must be unmistakably synthetic.
5. Before delivery, run applicable lint/types/unit/database/integration/browser/build checks, review the diff and document exact commands, revision, environment and remaining blockers. For migrations include upgrade/repeat/rollback-or-restore proof on disposable data.
6. Follow the supplied GitHub delivery scope. Prepare focused commits/PRs with real captioned screenshots and feature proof; post acceptance evidence on assigned issues before closing them. No AI co-author trailers, generated-by footers, fake screenshots or claims that mocked tests prove hosted behavior. Do not merge, publish images, cut over domains or modify production as a side effect.

Keep the parallel Logi session's contribution volume low: coherent milestone PRs include implementation, tests and documentation together. Track independent acceptance outcomes as linked issues without creating one PR per issue/file. Use complete PR descriptions and exact-revision evidence; never close a live integration issue merely because a source patch merged. Logi has its own prepared feature branch. Keep code/API contribution work in that repository and website implementation in this one; link real issues when a tracker is available.

First checkpoint: report the verified baseline, unified-platform boundaries, additive migration plan, contract dependencies and any concrete visual refinements needing review. Then keep progressing on authorized work.

## Required cloud inputs and starting state

Use repository ValkyriaWDG/www, branch feat/hll-platform-handoff, based on main `507e704d288cd93d7baa0d1ab22ba8347fd67b0a`. Fetch and verify current branch/PR before editing; continue its coherent PR rather than creating a duplicate. The preparation adds documentation/folder boundaries and references only. It does not implement a new route, migration or UI. No new HLL repository is needed.

Read [HLL product entry](../product/hll/README.md), [visual spec](../design/hll/visual-spec.md), [all thirteen reference captures](../design/references/hll/README.md), [legacy data/manual inventory](../product/hll/legacy-migration.md), [unified platform ADR](../architecture/decisions/0002-unified-valkyria-platform.md), [Logi contract 0.2](../integrations/logi/contract.md), [implementation order](../implementation/hll/README.md), [footage delivery slot](../../assets/hll/backgrounds/README.md) and existing repository skills. View the actual JPG files; descriptions alone are insufficient for visual implementation.

Open directories prepared for scoped game context, HLL components, editable Field Manual, server-only Logi adapters and synthetic fixtures. Reuse existing modules and licensed Barlow/Barlow Condensed fonts where suitable. Build real browser states; do not substitute a generated mockup for feature evidence.

The legacy site includes articles, fixtures/history, competition data, server/leaderboard surfaces and a real Field Manual. Follow its inventory, migrate approved content into drafts and retain timestamps/provenance. Do not discard useful data solely because it is absent from the first new menu sketch.

Assigned implementation issue: [#36](https://github.com/ValkyriaWDG/www/issues/36). Keep it open until actual implementation acceptance; this preparation only supplies the starting materials. Follow its dependencies and evidence expectations.
