# Domain model and contracts

Design contract, not an implemented schema. Use UUIDs for internal entities and text
for Discord snowflakes (never JavaScript numbers). All timestamps use `timestamptz`.
The [localization contract](../product/localization.md) defines `cs` as the default and
`en` as the other supported locale. This remains a schema design for initial bootstrap,
not an implemented migration or an instruction to duplicate existing production data.

| Entity | Key fields / invariants |
|---|---|
| Auth user/account/session/verification | Use library-managed schema; immutable provider subject, expiry and revocation |
| MemberProfile | Optional auth user link, stable unique slug, approved display name, avatar asset, approved game interests and curated public role keys, global publication/consent state; names are shared |
| MemberProfileTranslation | Unique `(profileId, locale)`; optional biography with independent draft/published immutable revision pointers; always subject to profile-wide consent/publication |
| GuildMembership | Guild ID + Discord user ID unique; present/left/unknown, authoritative role IDs, observedAt, receivedAt, source/version |
| RoleMapping | Guild role ID -> explicit app role; versioned and audited, no automatic name matching |
| LocalAdminGrant | Provisioned auth user + allowed capabilities; separate from Discord mapping, expires/revokes independently |
| ContentPage / NewsPost | One stable entity ID and content type with shared game context and ownership; translated presentation belongs to ContentTranslation |
| ContentTranslation | Unique `(documentId, locale)` with locale constrained to `cs` or `en`; locale-scoped slug, draft/published/archived, draftRevisionId, publishedRevisionId, publishedAt and edit version; scheduling is separate |
| ContentRevision | Exact translation ID + locale, immutable schema-versioned rich-text JSON and title/excerpt/slug/cover/alt/caption/taxonomy-label/author/SEO metadata snapshot, actor, createdAt; restoring creates a draft in the same translation |
| PublicationSchedule | Exact translation ID + locale + immutable revision, dueAt, issuer/grant ID+version, exact resource/capability and delegation assurance metadata, pending/claimed/blocked/completed/cancelled/failed, claim lease/attempt metadata, idempotency key and audit reference |
| SlugRedirect | Locale + route namespace + previous published slug -> stable entity/translation identity, bounded redirect to its current published slug without loops |
| TaxonomyTerm | Stable category/tag key and localized draft/approved labels; a post revision snapshots the selected keys and effective localized labels |
| Game | Stable slug `wardogs` / `hell-let-loose`, display label |
| Match | Shared game, opponent name/code/asset, competition/type/season, format/bestOf/teamSize, startsAt, display time zone, scheduled/live/completed/postponed/cancelled, global draft/published gate and version |
| MatchTranslation | Unique `(matchId, locale)`; optional preview/recap with independent immutable draft/published revisions and localized media presentation; does not duplicate match facts |
| MatchResult | Match ID unique; structured score/outcome and verification/source; distinguish unknown score from zero |
| MatchRound | Optional ordered rounds/maps, scores and outcome; no hardcoded Wardogs score model without evidence |
| Asset | Shared private storage key + approved delivery reference, media scope/owner, MIME, dimensions/duration, digest, provenance, rights and visibility state; published alt/caption is revision-local |
| AssetUsage | Asset -> exact owning translation/revision or shared entity reference with locale where applicable and effective publication gate; prevents unsafe deletion or anonymous draft delivery |
| SiteSetting | Allowlisted keys and schema-validated values; no arbitrary settings interpreter |
| AuditEvent | Actor, capability, entity/translation ID, affected locale when applicable, action, result, redacted change summary, request ID, timestamp |
| RoleSyncReceipt | Unique event ID/nonce, signature key ID, receive time and replay expiry |

Secondary match management adds `Availability`, `Squad`, `RosterSlot` and `RosterAssignment`.
Unique `(matchId, userId)` prevents double assignment. Define capacities by match
configuration, not by assumed HLL or Wardogs team sizes. Use transactions, optimistic
version checks and explicit lock/unlock states. Private roster notes never appear in
public match DTOs. Captain scope is the assigned match/team, not every match.

## Locale and revision integrity

Keep a database uniqueness constraint for `(documentId, locale)` and for the slug
within `(routeNamespace, locale)`. The same spelling in Czech and English is allowed;
two entities cannot reserve the same route in the same locale. Published routes and
redirect-source reservations must not collide. A locale prefix is routing context,
not a separate account, entity or permission grant.

Use foreign-key/transaction invariants that prevent a translation's draft/live pointer
or a schedule from referencing a revision belonging to another translation or locale.
Apply the same ownership invariant to optional member/match localized revisions.
Optimistic version checks apply per translation; shared entity facts use their own
version. Czech/English translators can work independently while two edits to the same
translation must detect conflicts. Do not auto-translate or publish counterpart records.

The effective public view requires the owning entity's applicable global publication/
consent gate and the requested translation's published revision. Match facts, results,
dates and member names remain shared. If optional recap/biography text is missing,
return its absence explicitly for a localized label/source-language link. Do not fall
back to private drafts. Core static pages need both published translations at launch.

Taxonomy keys remain stable across locales. A published post reads its category/tag
labels, image alt text and captions from its own immutable revision, never mutable
global rows or another locale's draft. Reusing asset bytes does not reuse unpublished
localized metadata. Media remains public only while at least one permitted published
reference exists; unpublishing one locale cannot remove another locale's valid media.

## Authorization boundaries in data

Public member DTO: slug, approved display name, approved avatar, the requested locale's
published biography or explicit absence, approved game interests and localized curated
public role labels. Public labels describe the
clan profile only; they do not expose raw Discord roles or grant application capabilities.
Never include email, Discord account tokens, raw guild roles, login identifiers,
availability, moderation notes or audit events. Public match DTO includes only
published shared match fields/results and the requested locale's published recap or
explicit absence. Do not duplicate facts or use a translation to bypass global gates.
Locale selection never grants permission: authorize the exact entity/translation and
capability on preview, autosave, restore, publication and schedule execution. Unpublishing
or publishing one translation updates its own audit/public projection and cache scope,
plus dependent counterpart metadata/switch availability in the other locale and shared
sitemap/availability caches. Refresh those dependencies without changing the other
translation's published content or revision.

Do not link identities by email equality. Local recovery/admin accounts cannot link
OAuth providers. For any future non-admin linking, require explicit authenticated
linking with reauthentication and collision protection. Protect
against profile slug collisions, stale updates and switching an entity ID in a request.

## Migrations and seeds

Implemented Logi people extension (2026-10-03): `logi_member_link` is a local
publication association, not an auth identity. It binds a consent-managed profile to
the source instance, canonical guild, game, native assignment and immutable user ID.
Source-member and profile-game pairs are unique. Independent stats/roster opt-ins
default false; a positive version supports optimistic conflict handling. Removing a
profile cascades its associations. Existing sync-scope/projection tables retain
isolated people generations under a distinct restricted-key scope. The additive
`0010_bizarre_gambit` migration leaves previous tables and data usable by the prior
image. See [the read-only contract](../integrations/logi/people.md).

Generate SQL migrations and review the SQL. Use expand/migrate/contract for schema
changes so the previous image can still run during rollback. Never use schema push
against production or auto-run destructive migrations on app startup. Seed scripts
must be idempotent. Production seed creates only approved public content/configuration;
test/demo fixtures live separately and cannot become production by default.

Development fixtures cover no members, long display names, cancelled matches,
unknown results, empty news, revoked roles, stale sync, Czech/English translators,
missing English articles and private counterpart drafts. Do not use screenshot
player names as sample identities.

Editorial content uses the [visual editing contract](../product/editorial-and-matches.md).
Validate editor JSON schema/version, supported nodes/marks/attributes and resource limits
on the server. Draft and published revision pointers are separate per translation; preview/autosave/revision
restore cannot modify the live projection. Publication schedules target an immutable
approved translation/locale/revision, not whatever draft happens to exist later. Scope asset lookup/delivery
to the owning domain and publication state. Keep user uploads out of source control.
Public title/slug/cover/excerpt/SEO, taxonomy labels, alt/caption and body use that locale's
published revision snapshot; mutable
draft columns are never the public source. A pending/cancelled future update must not
hide or modify an already published revision or its canonical URL in either locale.

Schedule `blocked` means issuer authority is revoked, stale or unknown and requires
fresh approval by a currently authorized actor. Background retries cannot silently
reactivate it. Reapproval creates a fresh scoped intent and audit link to the previous
intent. Distinguish that state from a retryable operational `failed` outcome. Claims
need bounded leases and safe recovery after a worker crash; state transitions, publishing
the revision and recording success must be atomic, with retryable cache invalidation.
Neither a blocked schedule nor an abandoned claim changes the current public revision.
