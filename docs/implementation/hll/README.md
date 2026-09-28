# Unified platform / HLL implementation order

The handoff prepared source folders and specifications; steps 1–4 and the synthetic part of step 5 are now implemented on `feat/hll-platform-handoff` (see [status](../../STATUS.md#unified-platform--hll-implementation)). Hosted Logi, real footage and the domain cutover remain open. Continue the task branch and update its single coherent PR rather than making separate PRs for each file or document.

1. **Baseline and scope:** read AGENTS/CLAUDE, current main/PRs and the HLL handoff. Preserve existing Wardogs behavior. Inspect PR33 SEO work; PR34/35 target the previous bot and are not Logi contracts.
2. **Shared boundaries:** reuse existing game enum/content schema. Add typed locale/game routes, hub, scope-aware settings and resource permissions using additive migrations. Prove IDs/revisions/consent and old URLs remain intact. Do not create another application or DB.
3. **HLL visible slice:** implement menu/video-poster fallback, game/language switching and news/server/result list-detail layouts. Prove real desktop/mobile CS/EN states before broadening. Continue with supplied visual direction; final clip delivery is independent.
4. **Legacy/manual parity:** inventory/migrate articles/matches/manual categories and useful public fields into reviewed drafts, implement admin-editable manual/search, and keep private or unknown data out of public projections.
5. **Hosted integration:** consume contract 0.2 through server-only adapters and synthetic fixtures first. Distinguish observed telemetry from confirmed competitive results. Logi code/provider readiness and tenant inputs remain separate from local UI proof.
6. **Evidence and handoff:** run repository checks plus relevant lint/types/unit/PostgreSQL/build/Playwright and migration/restore tests for actual implementation. Attach real captioned screenshots and publish proof to linked issues before closure. Pin exact revision; synthetic evidence is not hosted acceptance.
7. **Later cutover:** prepare but do not execute canonical-domain/SEO/media/OAuth/Cloudflare redirect and rollback steps. Deploy/cutover only as an explicit operational task.

Acceptance matrix: CS/EN x HLL/Wardogs routes; selection/back/refresh/deep links; keyboard/mobile/long text; video zero/one/multiple/failure/reduced motion; public draft/withdrawal and game permission isolation; per-game metadata/social images; unknown/stale data; manual search/translations; legacy URL mappings; Wardogs regression. Missing clip/keys may block live media/SSO acceptance, never substitute fabricated data.
