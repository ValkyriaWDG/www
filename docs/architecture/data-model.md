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
| ContentPage / NewsPost | Unique slug, title, excerpt, coverAssetId, category/tags, game context, approved author label, SEO fields, draft/published/archived, draftRevisionId, publishedRevisionId, publishedAt; scheduling is a separate record |
| ContentRevision | Immutable schema-versioned rich-text JSON + metadata snapshot, document ID, actor, createdAt; restoring creates a new draft revision |
| PublicationSchedule | Document + immutable revision, dueAt, issuer/grant ID+version, exact resource/capability and delegation assurance metadata, pending/claimed/blocked/completed/cancelled/failed, claim lease/attempt metadata, idempotency key and audit reference |
| SlugRedirect | Previous published slug -> canonical document, bounded redirect without loops |
| Game | Stable slug `wardogs` / `hell-let-loose`, display label |
| Match | Game, opponent name/code/asset, competition/type/season, format/bestOf/teamSize, startsAt, display time zone, scheduled/live/completed/postponed/cancelled, draft/published, public rich-text recap revision, version |
| MatchResult | Match ID unique; structured score/outcome and verification/source; distinguish unknown score from zero |
| MatchRound | Optional ordered rounds/maps, scores and outcome; no hardcoded Wardogs score model without evidence |
| Asset | Private storage key + approved delivery reference, media scope/owner, MIME, dimensions/duration, digest, provenance, alt/caption, rights and visibility state |
| AssetUsage | Asset -> document/revision/match reference with publication state; prevents unsafe deletion or anonymous draft delivery |
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

Editorial content uses the [visual editing contract](../product/editorial-and-matches.md).
Validate editor JSON schema/version, supported nodes/marks/attributes and resource limits
on the server. Draft and published revision pointers are separate; preview/autosave/revision
restore cannot modify the live projection. Publication schedules target an immutable
approved revision, not whatever draft happens to exist later. Scope asset lookup/delivery
to the owning domain and publication state. Keep user uploads out of source control.
Public title/slug/cover/excerpt/SEO and body use the published revision snapshot; mutable
draft columns are never the public source. A pending/cancelled future update must not
hide or modify an already published revision or its canonical URL.

Schedule `blocked` means issuer authority is revoked, stale or unknown and requires
fresh approval by a currently authorized actor. Background retries cannot silently
reactivate it. Reapproval creates a fresh scoped intent and audit link to the previous
intent. Distinguish that state from a retryable operational `failed` outcome. Claims
need bounded leases and safe recovery after a worker crash; state transitions, publishing
the revision and recording success must be atomic, with retryable cache invalidation.
Neither a blocked schedule nor an abandoned claim changes the current public revision.
