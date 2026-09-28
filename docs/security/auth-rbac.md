# Authentication and authorization contract

This is required behavior for implementation, not a claim that security is already
implemented. Use a maintained authentication library; do not write session crypto,
OAuth state handling or password hashing primitives from scratch.

## Identity and login

Discord is the primary identity provider. Start with `identify`; request other scopes
only for a documented need. Prefer server-side bot member lookup for the configured
guild over broad user guild access. Never request administrator bot permissions for
role reads. Explicitly configure callback URLs for localhost and
`https://valkyria.cz/api/auth/callback/discord`, verifying the selected library route.
Register and verify that canonical callback when live authentication is configured;
the 2026-09-28 domain cutover did not register callbacks or enable either login method.
Validate state, redirect URI and session/cookie protections; use PKCE where supported
by the provider/library. Untrusted return URLs must not permit open redirects.

UI routes are localized under `/cs` and `/en`; the callback and `/api/*` remain
unprefixed. Follow [localization](../product/localization.md): validate locale and
same-origin return paths, retain the intended safe locale through login/MFA, and
apply identical policy to both route variants. Language never grants capabilities or
changes session identity. Test direct protected requests in both locales; translate
safe UI errors without exposing raw provider messages or weakening cache boundaries.

Better Auth may require an email-shaped identifier even when Discord supplies none.
Implement and test the documented provider profile mapping with a stable provider-ID
alias such as `discord-<subject>@accounts.invalid`, mark it unverified, and never use
it as a contact/recovery address or an account-linking key. Do not demand an email
scope merely to manufacture a public member profile. See
[providers without email](https://better-auth.com/docs/concepts/oauth#handling-providers-without-email).

Use HttpOnly, Secure production cookies, explicit SameSite policy, expiry/rotation,
server-side revocation and CSRF/origin defenses appropriate to the library. Never
store tokens in localStorage. Encrypt retained provider tokens and secrets at rest;
avoid retaining OAuth tokens when the identity lookup is complete and no feature needs them.
Sessions are durable in PostgreSQL; do not rely on an in-memory session store.

## Roles and capability matrix

Multiple application roles can be assigned through explicit configured guild role IDs.
Names, hierarchy positions, colors and a Discord `Administrator` bit are not implicit
application grants. All permissions are denied unless a rule grants them.

| Capability | Visitor / signed-in outsider | Member | Editor | Match manager | Administrator | Owner |
|---|---|---|---|---|---|---|
| Read published pages | Yes | Yes | Yes | Yes | Yes | Yes |
| Edit own profile draft | No / own unpublished request only | Own | Own | Own | Own | Own |
| Publish pages/news/member profiles | No | No | Yes | No | Yes | Yes |
| Upload/manage editorial media | No | No | Editorial scope | Match scope only | Yes | Yes |
| Create/edit/publish matches/results | No | No | No | Yes | Yes | Yes |
| Submit availability (phase 2) | No | Own | If member | If member | Yes | Yes |
| Manage roster (phase 2) | No | No | No | Assigned scope | Yes | Yes |
| Read restricted audit | No | No | No | No | Yes | Yes |
| Manage public site settings | No | No | No | No | Yes | Yes |
| Change role mappings/local grants | No | No | No | No | No | Yes + reauthentication |

The owner capability is provisioned separately by an operator; never grant owner
automatically from a guild role or by being the first login. Local admin grants are
explicit, audited and independent of Discord roles. Do not use a hidden username/email
allowlist, default admin credentials or a public registration path for local admins.

Use a central `authorize(actor, capability, resource)` service from every server action,
route handler and private query. Middleware/client visibility are convenience only.
Check object scope to prevent IDOR and cross-match edits. Private roster information
is not automatically visible to public profile editors.

## Game-scoped authority

One website session covers the community hub, Hell Let Loose and Wardogs; authority is
scoped per game. A Discord role mapping entry is either a role list (platform-wide) or
`{"roles": [...], "games": ["hell-let-loose"]}`; local admin grants may carry `games`
(owner grants stay platform-wide). Capabilities keep a per-game scope: content, field
manual, match and member reads and mutations check the resource's game (community
content needs platform-wide authority; a member profile needs every affiliated game;
moving a resource needs both games). Media library, settings, audit and access
management stay platform-only and are never granted by a scoped entry. Denials are
audited with reason `game_scope`, lists and filters are narrowed to the scope, and an
out-of-scope document renders the localized access-denied panel without its content.
Scheduled publication re-checks the issuer for the document's game and its fence fails
when the locked document moved to another game after authorization.

## Role freshness and failure behavior

Store guild/member/role snapshot, observation time, source and sequence/version.
The browser can never submit authoritative roles. On login, fetch membership from
Discord server-side; an unknown guild or unconfigured mapping grants no private access.

- Privileged writes require a snapshot observed within 60 seconds. Refresh server-side
  if older; if refresh fails, deny the write with a retriable, non-sensitive explanation.
- Private reads may use a snapshot for at most 5 minutes. Older/unknown/failed membership
  is denied until verified. Public content stays available throughout outages.
- A departure/removal event invalidates roles and affected sessions immediately when
  received. Document the bounded stale interval when gateway events are unavailable.
- Role mapping changes increment an authorization version and invalidate cached policy
  decisions. No long-lived JWT roles without server-side revocation/version checking.
- Periodic reconciliation corrects missed gateway events; 429 honors Retry-After with
  bounded retries and backoff. Do not interpret timeout/403 as successful zero-role sync.

The existing server-only Discord REST adapter provides authoritative refreshes.
Hosted Logi is the selected future integration; its identity, membership freshness
and revocation contract require separate acceptance. The retired custom bot's
receiver and signed sequence protocol are not implemented by this change. Never
trust a posted role list, treat a Logi service key as user authority or claim live
provider acceptance from offline fixtures.

## Authority across awaited work

Interactive Discord authorization rereads the durable session and membership after
awaited role-mapping work. A deleted/expired session or changed observation denies
the earlier decision. The observation includes an ephemeral PostgreSQL row-version
token (`xmin` plus `ctid`), read atomically with its fields. Same-timestamp or
same-value updates therefore cannot reuse a cached authorization result. This token
stays server-side within the current request/freshness window: never persist it,
expose it in a DTO or use it as a provider sequence or durable identity. PostgreSQL
transaction IDs can wrap and row locations can move; a changed token fails closed.
See [PostgreSQL system columns](https://www.postgresql.org/docs/current/ddl-system-columns.html).

Scheduled publication carries the exact verified membership observation or local
grant identity/version into its transaction. After acquiring content locks, it takes
a shared lock on that authority row and revalidates it before publication and again
after the awaited audit write. Changed/revoked/expired authority rolls back the live
pointer, success audit and completion together, then blocks the saved intent.
The authority lock remains until commit. There is no provider I/O while holding it,
and a valid independent local recovery grant still works during a Discord outage.
No schema migration, new transport, provider activation or live revocation claim is
included. These checks cannot invalidate an upstream change that has not yet been
observed; the existing read/write freshness limits still apply.

## Local admin recovery

Off by default. Provision via an operator CLI using interactive stdin or a secret
manager, never password arguments, logs, public seeds or a web signup endpoint.
Disable password signup at the server API, not only in the UI. Require a strong
password using the library's reviewed hashing facility and MFA before any admin
session is authorized. TOTP/recovery-code enrollment needs a restricted setup session
that cannot reach protected APIs. Hash recovery codes and consume them once.
Rate-limit login, MFA, recovery and OAuth initiation with durable state; use generic
errors. Recovery must revoke existing sessions and create an audit event.

Local recovery accounts are separate, **cannot link a social provider**, and may use
LocalAdminGrant only from a session with verified credential-login + MFA assurance.
Enforce this at server policy boundaries: the library's MFA plugin does not automatically
challenge every social login. Test that linking endpoints and a social callback cannot
give access to a local grant, including when an older inconsistent account record exists.

Local grants must support operation during a Discord outage without pretending a
Discord membership was verified. The grant is a separate source with narrow scope.
Do not accidentally require Discord freshness to use the explicit recovery account.
Never silently link a Discord account to a local admin via matching email.

## Other required controls

Rich-text JSON is untrusted input: validate allowed nodes/marks/attributes and safe URL
schemes on the server, and render/sanitize public output independently of editor UI.
Image uploads need decoded-type/pixel/byte validation, safe re-encoding, generated names,
private draft storage, publication-aware delivery and per-domain access checks.
Reject raw HTML/script/SVG and arbitrary remote URL ingestion. Media upload is not a
grant to edit global background settings or another domain's assets. Autosave and
revision restore write drafts only; previews require authorization and no-store.

Scheduling creates a durable publication intent under the current authenticated actor
and capability. The publisher runner uses a narrowly scoped service identity and verifies
the saved intent plus the issuer's current active publishing authority before execution.
Never store/replay the user's session or MFA token. Revoked/unknown authority leaves the
schedule blocked for reapproval; retries cannot double-publish or skip audit records.

For a local recovery administrator, create a narrowly scoped durable delegation only
during a credential-login + MFA-assured session. Record issuer/grant ID and version,
immutable revision, resource/capability, due time and assurance-at-creation as audit
metadata, never the credential or MFA secret. At execution, the runner verifies that
the recorded grant is still active/unchanged and sufficient for this exact publication,
without requiring or replaying the old interactive session. This delegation authorizes
only that saved publication intent; it cannot authorize arbitrary admin actions or
relax the MFA requirement for interactive use of LocalAdminGrant. Test both a valid
delayed local-admin schedule and revocation between scheduling and execution.

Input schemas, bounded pagination/payload sizes, sanitization, parameterized queries,
audit records for privileged actions and denied access, no credentials/raw session IDs
in logs. Use a tested CSP and explicit image/media origins; avoid arbitrary URL fetching
or SSRF through editable media. The first-release editorial upload pipeline is required.
Do not expose preview/draft content through metadata, search, caching or error messages.

Tests must cover revoked/stale roles, changed role mapping, wrong guild, identity
linking, CSRF, IDOR, disabled local signup, incomplete MFA and Discord outage recovery.
See [verification](../implementation/verification.md).

Primary references reviewed for this handoff:
[Discord OAuth](https://docs.discord.com/developers/topics/oauth2),
[Discord guild member resource](https://docs.discord.com/developers/resources/guild#get-guild-member),
[Better Auth Discord](https://better-auth.com/docs/authentication/discord),
[Better Auth MFA](https://better-auth.com/docs/plugins/2fa).
Check the pinned versions at implementation; product capability requirements above
are not promises that the library enables every control automatically.
