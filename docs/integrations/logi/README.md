# Hosted Logi integration

Both HLL and Wardogs use Ninjonik's hosted instance at https://logi.igportals.eu, API base /api/v1. [Documentation](https://logi.igportals.eu/api/v1/docs) and [OpenAPI](https://logi.igportals.eu/api/v1/openapi.json) were publicly reachable on 2026-09-28; docs availability is not tenant/SSO acceptance.

Use [contract 0.2](contract.md). The companion upstream work is prepared on [Ninjonik/logi feat/valkyria-integration](https://github.com/Ninjonik/logi/tree/feat/valkyria-integration), refreshed at `6fbfe4e7d9c41e9a5bdc004c65f1e2d935c86e0b`. Branch creation alone contains no integration implementation. The earlier source audit was at `70b141477e0726e73ee1ec5b16366d1c085672be`; refresh before changes.

Existing signup/roster/announcement workflows should be reused. Website public projections and local game-scoped permissions remain separate from broad clan-key access. Keep source/guild/game identity explicit, use fixtures until authorized live inputs arrive, and keep unresolved authentication findings in authorized private coordination. Upstream Issues were disabled; use real tracker references when available and do not invent issue numbers.
