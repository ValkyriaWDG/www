# Authentication and authorization contract

This is required behavior for implementation, not a claim that security is already
implemented. Use a maintained authentication library; do not write session crypto,
OAuth state handling or password hashing primitives from scratch.

## Identity and login

Discord is the primary identity provider. Start with `identify`; request other scopes
only for a documented need. Prefer server-side bot member lookup for the configured
guild over broad user guild access. Never request administrator bot permissions for
role reads. Explicitly configure callback URLs for localhost and
`https://valkyriawdg.cz/api/auth/callback/discord`, verifying the selected library route.
Validate state, redirect URI and session/cookie protections; use PKCE where supported
by the provider/library. Untrusted return URLs must not permit open redirects.

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

For v1, a server-only Discord REST adapter can provide authoritative refreshes; the
optional worker adds event-driven invalidation later. Do not claim an event integration
is live when only its contract/mock exists. Never trust a posted role list from a user.

## Optional bot-to-web contract

Reserve `POST /api/integrations/discord/role-sync`. Versioned JSON fields:
`schemaVersion`, `eventId`, `guildId`, `userId`, `roleIds`, `membershipState`,
`observedAt`, `sequence`. IDs are strings. The production design must choose and test
a concrete authenticated transport; recommended HMAC-SHA256 over timestamp, nonce and
raw body, with constant-time comparison, a 5-minute receive window, durable replay
receipts and key rotation. Secret remains only in operator/worker/server configuration.
Reject wrong guild, malformed roles, oversized payload, stale timestamp and replay.
An older snapshot cannot resurrect a user after a newer departure event. HMAC proves
sender integrity, not permission to map arbitrary new application capabilities.

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

Input schemas, bounded pagination/payload sizes, sanitization, parameterized queries,
audit records for privileged actions and denied access, no credentials/raw session IDs
in logs. Use a tested CSP and explicit image/media origins; avoid arbitrary URL fetching
or SSRF through editable media. Use a vetted upload pipeline if uploads are introduced.
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
