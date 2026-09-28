# Website / hosted Logi contract draft

Version 0.2, proposed 2026-09-28. This is a **website-owned normalized boundary**, not a claim that Logi exposes these exact DTOs, scopes or routes. Version 0.2 replaces separate HLL/WDG deployments and sessions with the owner-selected unified `ValkyriaWDG/www` application, canonical `valkyria.cz` and game-scoped sections; normalized resource models remain unchanged. The integration session owns upstream mapping and capability evidence. The website session consumes fixtures through this boundary. Changes require a dated version and an explicit handoff between sessions.

Hosted discovery update, 2026-09-28: the owner supplied `https://logi.igportals.eu`; configure the server-side API base as `https://logi.igportals.eu/api/v1`. [Documentation](https://logi.igportals.eu/api/v1/docs) and [OpenAPI](https://logi.igportals.eu/api/v1/openapi.json) were retrieved successfully. Their availability and schema version do not establish tenant access, runtime semantics or SSO readiness. No normalized DTO changes are introduced by this discovery update.

## Authority and identifiers

| Domain | Proposed authority | Website responsibility |
|---|---|---|
| News, pages, translations, SEO and publishing | Website CMS | Draft/review/publish, sanitization, media permission, canonical/social metadata |
| Events, signups, rosters, attendance, Discord coordination | Hosted Logi | Display approved projections and link to operational workflows; no second writable master |
| Match result | Confirmed result in agreed Logi workflow | Map rounds, provenance and confirmation; preserve unknown/provisional states |
| Live server state and telemetry | Authorized CRCON/provider adapter | Freshness-aware snapshots, no invented zeroes or public administrative data |
| Website admin authorization | Website permission policy | Explicit grants with current trusted identity/membership checks; never grant authority from a service API key |
| Public member profile | Explicit publication/consent policy | Do not publish every Discord/Logi member automatically |

Keep `source`, `sourceInstanceId`, `guildId`, `gameId`, resource kind and external ID as a composite identity. Use opaque strings for Discord/Steam/Convex IDs. Game mapping is explicit: route `hll` -> existing website/database `hell-let-loose` -> Logi `hell_let_loose`; route/database/Logi `wardogs` maps explicitly. HLL and Wardogs pages must not accidentally accept `game=all` or rely on Logi's default game. One website database stores scoped projections; Logi retains its own separate database. Do not assume both games use the same guild or credential: use validated configuration. Keep reconciliation cursors/watermarks/cache keys isolated by configured source/guild/game/resource.

The central community hub may aggregate explicitly eligible projections across games while retaining provenance. Website editorial content has its own explicit community/game publication policy; shared content is not fabricated as a Logi `game=all` entity. Shared identity/CMS must not grant cross-game permissions by default.

No fuzzy identity joins by nickname. Raw server sessions become competitive-match candidates only after an explicit external-session-to-event mapping and confirmation.

## Proposed website read models

- `EventSummary`: opaque external reference, game, localized display title where actually supplied, kind/status, UTC schedule, last source update, safe public detail/signup URL. Private meeting credentials and tactical information are excluded.
- `MatchSummary`: reference, opponents, competition/map/rounds when supplied, nullable scores, `unknown | provisional | confirmed | corrected` result state, provenance and confirmation time. Do not manufacture an English translation or interpret missing score as zero.
- `ServerSnapshot`: safe server name/reference, reachable state `online | offline | unknown`, nullable map/player count/capacity, source and observation time. Timeout is unknown/stale, not proof of an empty/offline server.
- `PublicMember`: allowlisted display identity, approved biography/avatar and explicitly allowed game affiliations. Exclude internal notes, private contact data, platform IDs and operational permissions unless there is a deliberate publication policy.
- `IntegrationHealth`: configured capabilities, last successful reconciliation, last attempt, age, error category and backlog count. It is collector health, not proof of the hosted bot process or Discord health.

Every projection carries `observedAt`, `sourceUpdatedAt` when available, `freshness` (`fresh | stale | unavailable`), and public publication eligibility. Public rendering fails closed for unknown publication state. Stale permission or consent state must not preserve privileged access or indefinitely retain withdrawn public data.

## Synchronization semantics

1. Fixed configured HTTPS origins; bounded server-only requests; no browser service key and no arbitrary URL proxy.
2. Explicit tenant/game filter and opaque pagination cursor. Keep `updatedSince`, sort and all filters fixed throughout a sweep. Persist its resumable page cursor separately; advance the completed-sweep watermark only after **all** pages succeed. Most collections paginate by creation order, not update time, so never use a successful page's maximum update timestamp as the next sweep boundary. The inspected implementation filters game after pagination: continue an empty page when `nextCursor` exists. Use overlap, idempotent upserts and full-sweep recovery for timestamp ties, concurrent changes and clock uncertainty; bound pages and total run time.
3. Treat Logi webhooks as authenticated invalidation hints. Verify exact raw-body signature, timestamp and configured guild before durable deduplication/enqueue; acknowledge only after durable acceptance. Refetch the resource instead of publishing the webhook body directly.
4. Keep periodic reconciliation: inspected webhook calls do not establish universal coverage of dashboard and Discord mutations. Use complete-sweep/delete semantics or explicit tombstones; a partial page or outage does not establish deletion.
5. Duplicate delivery, retry, out-of-order data and concurrent polling must not regress state. There is no assumed monotonic sequence compatible with the old Valkyria bot.
6. Apply bounded exponential backoff with jitter and `Retry-After`; surface 401/403 as configuration/authority errors rather than endless retry.
7. Keep writes and game-server control disabled in the first slice. Later writes need a per-action authorization/actor contract, audit and Logi idempotency semantics. A guild-wide service key is not proof that an end user may register someone or change a roster.

## Authentication boundary

Logi declares OIDC code flow with S256 PKCE, per-application HTTPS callbacks, `client_secret_post` and HS256 ID tokens. The provider readiness review and hosted-version acceptance are pending. Keep production Logi SSO disabled until the authorized integration workstream provides acceptance evidence.

The unified canonical website owns one host-only session cookie and production callback/client registration across both game sections, with separate credentials/registrations for development and staging. Capabilities must carry explicit global or game scope; sharing a session does not grant both games' administrative rights. Legacy-domain sessions do not automatically migrate; plan re-login/callback transition without sharing cookies across unrelated domains or blindly redirecting OAuth exchanges. Require state, PKCE, issuer/audience/expiry/signature and nonce behavior appropriate to a verified provider contract; do not weaken validation to accommodate an upstream defect. Stored `member/guest` membership is neither a current Discord role set nor a website-admin claim. Local recovery access, if retained, is independently controlled and audited.

## Shared synthetic acceptance pack

Both sessions should use the same versioned fixtures for HLL/Wardogs separation inside one platform, shared-session/game-scoped permission denial, explicit hub aggregation, separate or shared configured guilds, CS/EN game-switch navigation, old-domain migration behavior; public and private events; draft/withdrawn articles; confirmed/provisional/unknown/corrected results; absent media; multiple pages and timestamp ties; duplicate/out-of-order hooks; deleted records; timeout/429/invalid key; missing/revoked membership; and provider-disabled state.

The integration session supplies redacted wire examples, schemas and capability evidence. The website session proves its actual UI and publication behavior against those fixtures. Neither session labels this as live hosted acceptance. No fixture may use private real rosters or working credentials.
