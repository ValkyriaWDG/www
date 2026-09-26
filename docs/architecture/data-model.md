# Domain model and contracts

Design contract, not an implemented schema. Use UUIDs for internal entities and text
for Discord snowflakes (never JavaScript numbers). All timestamps use `timestamptz`.

| Entity | Key fields / invariants |
|---|---|
| Auth user/account/session/verification | Use library-managed schema; immutable provider subject, expiry and revocation |
| MemberProfile | Optional auth user link, unique slug, approved display name, biography, avatar asset, approved game interests and curated public role labels, publication/consent state |
| GuildMembership | Guild ID + Discord user ID unique; present/left/unknown, authoritative role IDs, observedAt, receivedAt, source/version |
| RoleMapping | Guild role ID -> explicit app role; versioned and audited, no automatic name matching |
| LocalAdminGrant | Provisioned auth user + allowed capabilities; separate from Discord mapping, expires/revokes independently |
| ContentPage / NewsPost | Slug, title, constrained body, draft/published/archived, author, publishedAt, revision |
| Game | Stable slug `wardogs` / `hell-let-loose`, display label |
| Match | Game, opponent name, format, startsAt, display time zone, scheduled/live/completed/postponed/cancelled, draft/published, version |
| MatchResult | Match ID unique; structured score/outcome and verification/source; distinguish unknown score from zero |
| MatchRound | Optional ordered rounds/maps, scores and outcome; no hardcoded Wardogs score model without evidence |
| Asset | Approved URL/path, MIME, dimensions/duration, digest, provenance, usage rights state |
| SiteSetting | Allowlisted keys and schema-validated values; no arbitrary settings interpreter |
| AuditEvent | Actor, capability, entity, action, result, redacted change summary, request ID, timestamp |
| RoleSyncReceipt | Unique event ID/nonce, signature key ID, receive time and replay expiry |

Secondary match management adds `Availability`, `Squad`, `RosterSlot` and `RosterAssignment`.
Unique `(matchId, userId)` prevents double assignment. Define capacities by match
configuration, not by assumed HLL or Wardogs team sizes. Use transactions, optimistic
version checks and explicit lock/unlock states. Private roster notes never appear in
public match DTOs. Captain scope is the assigned match/team, not every match.

## Authorization boundaries in data

Public member DTO: slug, approved display name, approved avatar, published biography,
approved game interests and curated public role labels. Public labels describe the
clan profile only; they do not expose raw Discord roles or grant application capabilities.
Never include email, Discord account tokens, raw guild roles, login identifiers,
availability, moderation notes or audit events. Public match DTO includes only
published match fields and results explicitly approved for publication.

Do not link identities by email equality. Local recovery/admin accounts cannot link
OAuth providers. For any future non-admin linking, require explicit authenticated
linking with reauthentication and collision protection. Protect
against profile slug collisions, stale updates and switching an entity ID in a request.

## Migrations and seeds

Generate SQL migrations and review the SQL. Use expand/migrate/contract for schema
changes so the previous image can still run during rollback. Never use schema push
against production or auto-run destructive migrations on app startup. Seed scripts
must be idempotent. Production seed creates only approved public content/configuration;
test/demo fixtures live separately and cannot become production by default.

Development fixtures cover no members, long display names, cancelled matches,
unknown results, empty news, revoked roles and stale sync. Do not use screenshot
player names as sample identities.
