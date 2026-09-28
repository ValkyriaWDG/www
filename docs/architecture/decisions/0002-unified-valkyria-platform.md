# ADR-WEB-002: one Valkyria platform with game-specific sections

**Date:** 2026-09-28
**Status:** Owner-selected direction; implementation and production cutover pending.
**Supersedes:** The earlier separate-HLL-application proposal in the planning handoff.
**Repository:** `ValkyriaWDG/www` (extend the existing application).

## Context and decision

The owner holds `valkyria.cz`, `valkyriahll.cz` and `valkyriawdg.cz` and wants a shared community website with a switch between HLL and Wardogs. Extend the current web application into one platform with a shared CMS, identity/session, administration, database and deployment. Use `https://valkyria.cz` as the future canonical origin. Keep each game's public content, operational data and visual treatment explicit.

Hosted Logi remains the operational integration for both games. Logi's Convex database remains separate from the website's PostgreSQL database. A shared platform does not imply that all editors, members or data have access to both games.

This decision specifies the target. HLL's game-menu visual direction is selected; detailed visual refinement and final footage delivery continue during implementation. This document does not itself deploy code, redirect traffic, change DNS or enable SSO.

## Routes and navigation

Recommended route contract, consistent with Czech-first `/cs` and secondary `/en`:

| Route | Purpose |
|---|---|
| `/` | Deterministic redirect to `/cs`; no forced last-game redirect |
| `/cs`, `/en` | Community entry point with HLL and Wardogs choices |
| `/{locale}/hll` | HLL landing/menu |
| `/{locale}/wardogs` | Wardogs landing/menu |
| `/{locale}/{game}/news`, `/news/{slug}` | Scoped news list/detail |
| `/{locale}/{game}/matches`, `/matches/{slug}` | Scoped fixtures/results/detail |
| `/{locale}/admin/...` | Shared administration with explicit game scope and capability checks |

Audit current route slugs before implementation and preserve old URLs through a tested route map. The table is the new routing target, not a claim these routes exist today. Locale and game are independent axes; use `cs`, not `cz`, for locale identifiers. Define one typed registry mapping route values `hll`/`wardogs` to existing database values and Logi IDs `hell_let_loose`/`wardogs`.

The persistent game switch displays full game names, works with keyboard/touch, preserves locale and indicates the active game. List pages can switch to the corresponding list. A game-specific detail page without a real counterpart switches to the other game's relevant list or landing page; never reuse its slug to invent a match. Switching languages preserves the same entity where a published translation exists. Missing translations have an honest, documented fallback. A remembered preference can highlight a choice but must not override an explicitly opened URL. Keep game and language controls distinct.

## Shared and scoped concerns

- Share identity, navigation primitives, CMS/editor, publication workflow, localization, media infrastructure, SEO helpers and operational tooling. Keep game theme/media/copy in explicit configuration, not hostname branches scattered through the UI.
- Give game-owned operational records exactly one game. News can target HLL, Wardogs or an explicit community audience; define whether multi-game publication shares one entity, translations and canonical URL before modeling it. Do not duplicate identical articles into conflicting canonicals. Members can have multiple game affiliations; public consent remains independent of membership.
- Enforce game scope in server-side reads, writes, previews, exports, search, caches, media selection and social images. A dropdown/filter in the UI is not authorization. Check capabilities plus allowed games for editors/organizers; platform-wide rights are explicit grants. Verify target scope on moves or cross-publication.
- One canonical host permits one website session across both sections. Keep host-only secure session cookies and environment-specific OAuth registrations. Do not attempt to share cookies across the three unrelated registrable domains. Old-host login sessions need a deliberate transition/re-login policy.
- Keep Logi source instance, guild, game and external IDs in adapter/storage keys. A single platform may map games to the same or different configured guilds; this is not supplied yet. Keep per-scope sync progress/freshness and permissions. SSO remains disabled until the separate readiness gate is met.

## Existing-data migration

Source main `507e704d288cd93d7baa0d1ab22ba8347fd67b0a` already models `wardogs` and `hell-let-loose` (`packages/db/src/schema/common.ts`), optional news game and required match game (`content.ts`, `community.ts`), plus multiple member games. Existing list queries filter by game. Preserve these IDs/models and extend missing scope rather than introducing a parallel game system.

Concrete extension points from the source review:

- `apps/web/src/app/[locale]/layout.tsx` mounts the Wardogs `MenuShell` globally. Make shell/background/settings context game-aware; shared account/privacy/admin views need a deliberate neutral context.
- `i18n/routing.ts`, `lib/locale-redirect.ts`, shell route detection and language counterpart resolution are locale-only; update centralized route builders rather than scattered URL concatenation.
- Global `pageKey` and settings such as `background.media` cannot represent two game-specific editions without scope. Retain global brand/privacy content separately.
- Public detail lookups and homepage teasers need game checks even where lists already filter. News game/category context is held in published taxonomy snapshots; do not leak mutable draft recategorization into public projections.
- `modules/access/policy.ts` and capability/Discord-role mappings currently lack resource game scope. Add server-side resource checks and denied cross-game read/write tests.
- `lib/site.ts`, metadata/sitemap helpers and auth origins need coordinated canonical-host changes. Reconcile PR #33's SEO implementation when extending routes; PR #34/#35 remain custom-bot contracts rather than Logi compatibility.

Inventory current content, slug constraints and publication references first. Prefer an additive rollout: extend missing scope, backfill verified values, support old readers during the transition, then enforce constraints after verification. Do not label every old HLL-related or community record Wardogs merely because it lives in the existing repository, or automatically reinterpret null game as a new publication grant.

Preserve IDs, translations, revisions, consent, media references and external mappings. Review slug uniqueness by scope/locale and existing URL compatibility. Migrate indexes and cache/revalidation keys with the data model. Prove upgrade, repeat safety and backup/restore on disposable data before production. Avoid a destructive rename or a second HLL database/application.

## Domains and migration

Keep existing production domains working while the unified platform is built and reviewed. After approved cutover, configure permanent server-side redirects (301 or 308) from each legacy URL to its actual new equivalent:

- `valkyriahll.cz/` -> `valkyria.cz/cs/hll`
- `valkyriawdg.cz/` -> `valkyria.cz/cs/wardogs`
- Legacy article/match/locale URLs -> the matching new detail and language where migrated.

Do not send every deep link to the home page, create redirect chains/loops, or publish duplicate indexable copies on all domains. Missing/retired content needs a reviewed relevant destination or a proper 404/410. Handle necessary asset/media URLs separately. Define one redirect authority across Cloudflare, proxy and application, with an allowlisted host/path map.

Update absolute links, canonical/hreflang, sitemap, robots, social cards, published media URLs and OAuth callback origins together. Browser callback endpoints and POST/webhook receivers need an endpoint-specific migration plan; do not blanket redirect them or leak codes/secrets into logs. Keep old-domain HTTPS/redirect service available after cutover and monitor old/new paths. Stage the domain move separately from the initial shared-schema rollout so regressions are attributable. See [Google's site-move guidance](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes).

## Alternatives and consequences

Separate `www-wdg` and `www-hll` repositories are technically possible, including behind paths on one domain. They would permit separate releases but require either duplicated CMS/authentication work or another shared backend and coordinated API releases. A hostname-dependent multisite system would preserve multiple public origins but conflict with the selected canonical domain. One application matches the current shared editorial and identity requirements and reuses the working code; the trade-off is a shared release/failure boundary and the need for rigorous scope checks. No new monorepo or general-purpose tenant platform is needed.

Keep game context, theme/media configuration, HLL presentation and provider adapters behind explicit module interfaces so extraction remains possible. Reconsider separate applications only when the games need independent operators, incompatible stacks or release schedules, or demonstrable isolation requirements. Different graphics alone are handled by separate game shells, not separate repositories. Logi remains a separate repository and hosted service regardless of this website decision.

## Delivery and acceptance

1. Refresh existing `www` main and open PRs; reuse relevant work without claiming unmerged code is present.
2. Deliver game registry, additive data/permission migration and backward-compatible routes.
3. Deliver shared hub/game switch/CMS scope with the selected HLL game-menu presentation and honest media fallback.
4. Deliver explicit-game Logi fixtures/adapter boundary; coordinate its version with the integration workstream.
5. Prepare a tested legacy route map and domain/OAuth/media cutover runbook with rollback. Production execution is a later explicit operation.

Use the minimum coherent PRs; link issues and document exact-revision evidence. Acceptance includes CS/EN x HLL/Wardogs routes, direct navigation/refresh/history, keyboard/mobile switching, preserved login with scoped permissions, no cross-game draft/media/cache leaks, content migrations, correct canonical/hreflang/social images, legacy deep-link mappings, and no regression of the Wardogs experience. Attach actual captioned screenshots and functional proof; mocked Logi fixtures do not prove hosted acceptance.
