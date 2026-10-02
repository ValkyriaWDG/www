# Logi adapter boundary

Implemented server-only adapters for the unified website. Read the
[contract](../../../../../../docs/integrations/logi/contract.md),
[operator runbook](../../../../../../docs/integrations/logi/runbook.md) and
[verification record](../../../../../../docs/integrations/logi/verification.md).

| Module | Responsibility |
| --- | --- |
| `contracts.ts`, `client.ts` | Closed producer DTOs, fixed HTTPS endpoints, explicit guild/game scope and bounded reads |
| `sync.ts`, `../logi-store.ts`, `../logi-runner.ts` | Resumable bootstrap/change feed, PostgreSQL leases, transactional projection/checkpoint commits and reset promotion |
| `mapping.ts`, `../logi-public.ts` | Explicit publication and safe match/server fields, distinct from operational payloads |
| `../logi-webhook.ts` | Verified raw-body HMAC, durable deduplicated hints; polling refetches authoritative data |
| `../logi-command-*.ts` | Actor-authorized create/update/cancel, exact revision checks and durable per-user request journal |
| `../../auth/logi-provider.ts`, `../../access/logi-membership.ts` | Maintained Better Auth consumer, central-session checks and fresh game-scoped role evidence |

Wire `guildId` and SSO `guild_id` are canonical Discord guild IDs. Internal Logi
workspace IDs are provider setup identifiers, not substitutes for those claims.
No nickname joins, browser service credentials or direct access to Logi's database.

Public summaries do not expose rosters, player identities, advanced live statistics,
server passwords or raw provider records. The event editor does not write rosters or
results. Logi owns new connected operations; the website retains its CMS and historical
local match archive. Activation defaults and actual local versus hosted evidence are
documented separately; source implementation is not a production rollout.
