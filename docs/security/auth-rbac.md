# Authentication and authorization contract

This document defines the authentication and authorization policy implemented by the
website, including the optional Logi integration. Implementation and isolated proof
do not establish hosted-provider or production acceptance; see the
[Logi verification record](../integrations/logi/verification.md). Better Auth owns
session primitives, OAuth state/PKCE handling and password hashing.

## Identity and login

When `LOGI_SSO_ENABLED=true`, Logi is the primary identity provider. Its callback is
`/api/auth/callback/logi`; maintained Better Auth 1.7.6 `genericOAuth` requires
discovery/JWKS, an RS256 ID token, authorization code with S256 PKCE and nonce, and
`client_secret_post`. Request `openid profile`. Verify exact issuer, client audience,
subject, central session ID and canonical Discord guild; userinfo must agree with the
verified token. Profile claims do not grant roles. The separate restricted membership
adapter supplies current role evidence. See the [integration contract](../integrations/logi/contract.md).

An existing Logi session is reused through the login redirect. Cookies are not shared
across domains. The website keeps its own durable session and encrypted per-session
Logi access token, bound to issuer/client/subject/central session/guild. Authority lasts
at most one hour, with no refresh grant. Every protected request revalidates central
userinfo; revocation invalidates the corresponding website session and unavailability
denies protected access. Website sign-out ends the local session. Central logout is
observed on the next protected request, not through a claimed back-channel protocol.

With Logi disabled, the configured Discord provider remains the legacy login path.
When Logi is enabled, direct Discord login additionally requires explicit
`LOGI_DISCORD_FALLBACK_ENABLED=true`; it cannot silently bypass the selected policy.
Discord requests `identify`. Its legacy callback is `/api/auth/callback/discord`.
Register the exact canonical HTTPS callback for whichever provider is selected;
domain cutover alone does not register callbacks or activate login. Local recovery
is a separate, explicitly provisioned MFA path.

For the direct Discord membership adapter, use a server-side bot member lookup for
the configured guild, without broad user guild access or administrator bot permissions.
Validate state, redirect URI and session/cookie protections at the library boundary.
Untrusted return URLs must not permit open redirects.

UI routes are localized under `/cs` and `/en`; the callback and `/api/*` remain
unprefixed. Follow [localization](../product/localization.md): validate locale and
same-origin return paths, retain the intended safe locale through login/MFA, and
apply identical policy to both route variants. Language never grants capabilities or
changes session identity. Test direct protected requests in both locales; translate
safe UI errors without exposing raw provider messages or weakening cache boundaries.

Better Auth may require an email-shaped identifier even when Discord supplies none.
Implement and test the documented provider profile mapping with a stable provider-ID
alias such as `discord-<subject>@accounts.invalid` or `logi-<subject>@accounts.invalid`,
mark it unverified, and never use it as a contact/recovery address or an account-linking
key. Do not demand an email
scope merely to manufacture a public member profile. See
[providers without email](https://better-auth.com/docs/concepts/oauth#handling-providers-without-email).

Use HttpOnly, Secure production cookies, explicit SameSite policy, expiry/rotation,
server-side revocation and CSRF/origin defenses appropriate to the library. Never
store tokens in localStorage. Encrypt retained provider tokens and secrets at rest;
avoid retaining OAuth tokens when the identity lookup is complete and no feature needs them.
Sessions are durable in PostgreSQL; do not rely on an in-memory session store. Social
account linking/unlinking is disabled, including automatic merging of existing Discord,
Logi and local recovery identities. No cross-provider alias is an identity migration.

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

Logi membership is restricted by each configured game's service key. These observations
can only narrow the website's mapping: HLL evidence never grants Wardogs access, and
platform-wide roles require matching evidence for both supported games. A login or a
Logi service key alone is not permission. The connected event editor additionally
requires the current user's Logi session and Logi's own application/key/game/role policy.
The capability matrix does not imply that its result/roster operations are implemented
by that editor; currently it supports event create, edit and cancel only.

## Role freshness and failure behavior

Store guild/member/role snapshot, observation time, source and sequence/version.
The browser can never submit authoritative roles. Resolve membership through the
selected server-only adapter (`LOGI_MEMBERSHIP_SOURCE=logi` or legacy Discord REST);
an unknown guild or unconfigured mapping grants no private access.

- Privileged writes require a snapshot observed within 60 seconds. Refresh server-side
  if older; if refresh fails, deny the write with a retriable, non-sensitive explanation.
- Private reads may use a snapshot for at most 5 minutes. Older/unknown/failed membership
  is denied until verified. Public content stays available throughout outages.
- A newly observed departure/removal denies affected access. Logi webhook intake stores
  authenticated invalidation hints, not authoritative role lists or session revocations.
  Unobserved changes remain bounded by the read/write observation limits above.
- Role mapping changes increment an authorization version and invalidate cached policy
  decisions. No long-lived JWT roles without server-side revocation/version checking.
- Periodic reconciliation corrects missed gateway events; 429 honors Retry-After with
  bounded retries and backoff. Do not interpret timeout/403 as successful zero-role sync.

The selected adapter supplies authoritative refreshes. Logi membership is implemented
with isolated provider/database proof; hosted identity, collector freshness and role
mapping still need activation acceptance. The retired custom bot's receiver and signed
sequence protocol are not implemented. Never trust a posted role list, treat a Logi
service key as user authority or claim live provider acceptance from offline fixtures.

## Authority across awaited work

Interactive authorization rereads the durable session and membership after awaited
work. Logi authorization also binds the exact current website social account and
Discord subject. A deleted/expired session, changed account or changed observation
denies the earlier decision. The observation includes an ephemeral PostgreSQL row-version
token (`xmin` plus `ctid`), read atomically with its fields. Same-timestamp or
same-value updates therefore cannot reuse a cached authorization result. This token
stays server-side within the current request/freshness window: never persist it,
expose it in a DTO or use it as a provider sequence or durable identity. PostgreSQL
transaction IDs can wrap and row locations can move; a changed token fails closed.
See [PostgreSQL system columns](https://www.postgresql.org/docs/current/ddl-system-columns.html).

Scheduled publication carries the exact verified membership observation or local
grant identity/version into its transaction. Logi evidence additionally carries the
website user, provider and immutable subject. After acquiring content locks, it takes
shared authority-row locks; the Logi fence locks the current user/account binding as
well as membership. It revalidates before publication and again after the awaited
audit write. Changed/revoked/expired authority rolls back the live
pointer, success audit and completion together, then blocks the saved intent.
The authority lock remains until commit. There is no provider I/O while holding it,
and a valid independent local recovery grant still works during a provider outage.
Scheduled publication verifies a saved delegation against current identity and
membership; it does not replay the interactive user's session/token or require that
old session to remain signed in. These checks cannot invalidate an upstream role
change that has not yet been observed; the read/write freshness limits still apply.

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
Check the pinned versions when upgrading; product capability requirements above are
not promises that the library enables every control automatically. The current Logi
consumer uses Better Auth 1.7.6; its bounded activation procedure is documented in the
[operator runbook](../integrations/logi/runbook.md).
