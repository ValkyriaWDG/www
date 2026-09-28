# HLL section within the unified Valkyria platform

Owner direction, 2026-09-28: extend the existing application, CMS, PostgreSQL, session and deployment for both HLL and Wardogs. Future canonical origin is valkyria.cz; legacy game domains migrate through reviewed deep-link redirects.

The HLL visual direction is now selected: interpret the supplied in-game menu, server browser and Field Manual for the web. Exact pixel copying is unnecessary; clan battle footage replaces the center character. Keep Czech-first UI and English translations. Technical work remains English.

Read the [Claude handoff](../../handoff/hll-claude-code-cloud.md), [visual specification](../../design/hll/visual-spec.md), [legacy content inventory](legacy-migration.md), [platform decision](../../architecture/decisions/0002-unified-valkyria-platform.md), [Logi contract](../../integrations/logi/contract.md) and [implementation order](../../implementation/hll/README.md).

Primary public sections: HLL menu, clan/community, news, members, fixtures/results, servers, events/tournaments, recruitment and searchable Field Manual. Preserve useful legacy content/data, dates and sources; migrate to drafts for review instead of publishing scraped HTML or stale counters. Statistics and live states require real sources and freshness. No final gameplay footage is supplied yet.
