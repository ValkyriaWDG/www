# Logi integration contract

Implementation contract, 2026-10-02. This replaces the earlier planning-only draft.
The website keeps its own backend and PostgreSQL database. Logi owns the connected
operational records. The [runbook](runbook.md) describes activation; the
[verification record](verification.md) distinguishes local proof from deployment.
All integration switches and public projections start disabled or unpublished.

The [read-only people extension](people.md) adds private membership, published
rosters, attendance responses and verified collected-session statistics. Website
publication still requires local profile consent and explicit association opt-ins.

## Authority and identity

| Area | Authority | Website behavior |
| --- | --- | --- |
| Login through Logi | Logi central session and maintained Better Auth consumer | Creates a separate durable website session; an existing Logi login can complete the redirect without another Discord login |
| Website permissions | Explicit website role mapping plus fresh Logi membership | Grants only configured game capabilities; login alone grants no administration |
| Connected matches/events | Logi | Creates, edits and cancels the same operation through an actor-backed command; no second writable copy |
| Changes made in Logi or Discord | Logi change feed and authoritative reads | Synchronizes supported projections into the website on the next successful pull |
| News, pages, translations, media and publishing | Website CMS | Existing local workflows remain available under website permissions |
| Historical local matches | Website archive | Remain separate records; they are not silently merged with Logi by title or date |
| Results and server observations | Qualified Logi collectors and review workflows | Displays safe supplied facts and their state; does not manufacture or write results |

Wire `guildId`, membership guild IDs and SSO `guild_id` are the **canonical Discord
guild snowflake**. Logi's internal workspace record ID is a different identifier used
when configuring its dashboard, SSO application and command policy. Do not substitute
one for the other. `sub` is the exact Discord subject; names and email-shaped aliases
are never identity joins.

Keep source instance, guild, game, resource and external ID together. Game mapping is
explicit: `hll` route -> `hell-let-loose` website/database -> `hell_let_loose` Logi;
`wardogs` remains `wardogs`. Configuration permits at most one source per game. A
shared source instance may cover both games, but a webhook binding must have the same
origin and guild in both rows. Credentials remain server-only.

## Login and authorization

With `LOGI_SSO_ENABLED=true`, Logi is the primary provider. The callback is
`/api/auth/callback/logi`, without a locale prefix. Better Auth 1.7.6 `genericOAuth`
uses discovery, authorization code, S256 PKCE, nonce and `client_secret_post`; it
requires an RS256 ID token verified through the provider's JWKS, including issuer,
audience and expiration checks. Required scope is `openid profile`. Userinfo is a
closed profile bound to the same subject, central session ID and guild as the token.
Roles come from the separate membership boundary, not from profile claims.

Website cookies stay host-only. The central login is reused through redirects, not
by copying a cookie between domains. Each website session retains its own encrypted
opaque access token and fixed issuer/client/subject/session/guild binding. Its Logi
authority expires within one hour; no refresh grant is implemented. A later sign-in
can reuse an active Logi session. Account linking is disabled, including implicit
linking with old Discord or local recovery accounts.

Each protected Logi request checks current central userinfo and current membership.
A revoked central token removes the corresponding local session; an outage denies
protected access without inventing a departure. Website sign-out ends the local
session. Central Logi logout takes effect on the website's next protected request;
this is request-time revalidation, not an advertised back-channel logout protocol.
Local recovery remains separately provisioned, off by default and MFA-protected.

`LOGI_MEMBERSHIP_SOURCE=logi` selects per-game restricted membership keys. Every
observed game is explicit; one game's role evidence cannot authorize the other game.
Platform-wide capabilities require matching evidence across both supported games.
Writes and scheduled publication require observations no older than **60 seconds**;
private reads allow **5 minutes**. These are role-observation limits, not session
lifetimes. Identity, row-version and freshness fences are rechecked after awaited
work and inside the publication transaction. Unknown, stale or unavailable authority
fails closed. See [authentication policy](../../security/auth-rbac.md).

With Logi SSO disabled, the configured legacy Discord provider remains available.
With it enabled, direct Discord login is disabled unless the operator explicitly
sets `LOGI_DISCORD_FALLBACK_ENABLED=true`; no silent fallback bypasses Logi policy.

## Reads and public surfaces

The consumer reads `event-summaries`, `match-summaries`, `result-summaries`,
`server-snapshots` and `integration-health`. Membership is an on-demand authorization
read, stored separately from public operational projections. Unknown scores and
observations remain null. Result states remain `unknown`, `provisional`, `confirmed`
or `corrected` as supplied; a concluded event is not automatic result confirmation.

Event and match summaries accept the producer's optional, nullable `matchTeams`
snapshot (at most three teams: catalogue ID, slot, side, name, short code, HTTPS logo,
positive revision and UTC capture time). Older responses without the field remain
valid. Each team object stays closed; private or unknown fields are rejected. The
public DTO exposes only the supplied team ID, slot, side, name and short code. Logos,
capture metadata and unrecognized fields are not passed to the component.

A supplied reviewed result takes precedence over `match-summaries.result`. When
there is no reviewed result, a supplied imported result is shown as **provisional**,
with its import provenance and timestamp; its presence never confirms a result.
Known zero scores remain zero and absent scores remain unknown. An end timestamp
can place a historical match in Results, but is labelled as an end time rather than
inventing a start. The two home pages select the next actual scheduled match across
the public Logi projection and the local archive. Connected lists have their own
bounded search/page state (`logiPage`), independent of the archive page.

Optional per-source `matchLinks: [{eventId, matchId}]` bind an exact Logi event to an
existing website match UUID. Both records must already be public and in the same
game and configured authority. While the fresh Logi row is visible, the archive row
is omitted from the list and next-match selection, but its original URL, result,
recap and rounds remain unchanged. That detail also shows the current Logi facts.
The connected row retains the archive opponent, short code and competition for
display and search. If the Logi projection becomes unavailable, the archive row
returns. Identity review is an operator task; there is no runtime fuzzy name/date
matching and no mutation of either source's historical record.

Optional `matchAliases: [{canonicalEventId, aliasEventIds}]` record explicitly
reviewed duplicate Logi identities. Groups are disjoint and scoped to one source,
guild and game. An alias is hidden only while its canonical event is present and
all public match facts agree (including scores, teams and result provenance).
Conflicting or missing canonical facts keep the independent row visible. A hidden
alias detail temporarily redirects to the canonical event; it can become an
independent page again when those facts diverge. Archive links target canonical
events, never aliases. These presentation settings do not change the sync scope.

Earlier strict source-config readers reject `matchLinks` and `matchAliases`. Deploy
a compatible consumer before adding them. To recover with an older image, restore a
reviewed compatible configuration as well as accounting for the stored checkpoint
and projection JSON boundaries below; prefer a compatible roll-forward release.

| Surface | Implemented behavior | Publication control |
| --- | --- | --- |
| `/{locale}/{game}/matches` | Connected match list alongside the historical local archive | Per-source `publishMatches=true` explicitly publishes safe summaries for that configured game |
| `/{locale}/{game}/matches/logi/{id}` | Connected detail, schedule and supplied participant/result rows | Uses the same published, current projection; unavailable/unpublished IDs are not public |
| `/{locale}/admin/matches/logi` | Load authoritative editable facts; create, update or cancel an eligible connected match | Current Logi session, game capability, write flag/key and provider command policy |
| Server pages, Wardogs home overview and `/api/servers/{game}` | Safe Logi server cards with `SERVER_STATUS_SOURCE=logi`, or Wardogs only with `SERVER_STATUS_SOURCE_WDG=logi` | Each configured `publicServers` entry needs `published=true` |

`publishMatches` is a **source/game-wide approval**, not a per-event moderation UI.
Leave it false until the operator approves exposing every safe match summary in that
source. Fetching an event does not itself make it public. Descriptions, notes, rosters,
platform identifiers, server passwords and tactical data are excluded from the public
DTO. The title is a shared supplied fact; the adapter does not fabricate translations.

The match DTO supports the supplied participant array, including three factions when
actually returned. It does not infer participants, placement, scores or faction names
from array order. Public Logi server summaries currently provide name, reachability,
map, player count, capacity and observation freshness. HLL side scores require explicit
configured source-side IDs. Wardogs preserves the supplied named `scores` array as
`teamScores`, including all three teams when reported; it does not infer factions,
clan affiliation or HLL sides from position. Unknown scores stay null and zero stays
zero. Both score formats are removed when stale, expired or the source is unavailable.
Mode, next map, round timer and per-team player counts stay
null in this adapter; live player names and advanced statistics are not exported.
A separately approved statistics URL can be linked.

The Wardogs home panel previews up to three approved servers and links to the complete
list/detail. Both views refresh the website's local projection every 30 seconds while
visible, offer a pause control, and age retained data even while paused/offline. This
is polling, not a real-time stream or a direct browser request to Warcon. See the
[Wardogs server operator notes](wardogs-servers.md).

Public match eligibility expires after 15 minutes without successful source
revalidation. Server observations are fresh for 2 minutes, stale for up to 30 minutes,
then unavailable; failed source revalidation also makes reachability unknown. Timeout
never becomes zero players or proof that a server is offline.

## Durable synchronization and webhooks

The bounded `logi:sync` runner captures a change-feed boundary, discovers identities
through full paginated lists, refetches authoritative revisioned records, replays
changes and promotes the completed generation. Empty pages with a cursor continue.
Opaque cursors are scoped to the configured authority; decimal revisions are compared
exactly without conversion to JavaScript numbers.

PostgreSQL owns leases and checkpoint compare-and-swap. Each projection page and its
checkpoint commit together. Explicit removals retain tombstones against older updates.
A cursor reset starts an invisible replacement generation while the last complete
one remains available within its freshness limits. Promotion removes retired
generations transactionally. Neither partial lists nor provider failures prove deletion.
Changed source/key configuration gets a distinct cache scope.

Incomplete generations have a fixed 30-minute lifetime from capture of their
pre-list boundary. Once that age is reached, the runner starts a fresh full
bootstrap: capture a new boundary, enumerate every collection, refetch authoritative
records and finish replay before promotion. It does not move the cursor of the old
generation or promote its partial rows. This bounds replay work accumulated during
an interrupted bootstrap; it cannot guarantee completion if a full rebuild itself
takes more than 30 minutes. Capture failure, run expiry or lease loss preserves the
last committed checkpoint and active generation.

The strict checkpoint JSON accepts optional `bootstrapStartedAt`. A legacy
`bootstrap` or `replay` checkpoint without it starts one complete replacement because
its capture age is unknown. A legacy or old `live` checkpoint keeps incremental
polling; this age rule never resets a complete active generation. New timestamps
remain unchanged across resumable passes. No SQL migration, key change or runtime
override is required. Earlier strict readers reject the additional JSON field, so
after new checkpoints are written, recover with a compatible roll-forward image;
an older image is not a proved synchronization rollback.

Run a pass every minute. A data pass is bounded to 100 synchronization steps and
25 seconds per game, with a 60-second lease. Change scans start at ten guild rows
and expand to 100 after a nonterminal page with fewer than ten distinct identities.
Hints are coalesced by scope/resource/ID, keeping the highest exact revision. An
expanded page with at most ten identities is fully refetched before its cursor is
committed, even when it contains 100 repeated hints. A page with over ten identities
is reread from the unchanged cursor at ten scanned rows; its larger continuation
is never committed. Atomic refetch remains bounded to ten identities per commit
with concurrency four. A pass can finish as `pending`, `busy`, `lease_lost`,
`caught_up` or `failed`; `pending` resumes on a later pass. Failures preserve the
checkpoint and use bounded backoff, including `Retry-After`. Periodic pulls remain
necessary even when webhooks are configured.

The whole-pass deadline is cooperative: expiry during an HTTP request returns
`pending` with the last committed checkpoint, just as expiry between steps does.
A request timeout while that budget remains available is still `failed`. Neither
case publishes an incomplete replacement generation. People synchronization uses
its separately bounded larger pass; it has the same continuation rules.

`POST /api/integrations/logi/{sourceInstanceId}/webhook` accepts only configured
sources. It verifies HMAC-SHA256 over `X-Logi-Timestamp + "." + rawBody`, a timestamp
age of at most 300 seconds, future skew of at most 30 seconds, the signed guild/game
and matching event type. Bodies are limited to 64 KiB and 10 seconds. Signing secrets
are separate from service keys.

Legacy/test envelopes have a signed UUID `id`; integration/membership change envelopes
currently omit it. Deduplication uses that signed ID when present, otherwise the raw
body hash, plus configured source and guild. `X-Logi-Delivery` is unsigned, differs
from the legacy event ID and is never deduplication authority. Reusing a signed ID with
a different body returns 409. First committed intake returns 202, identical repeats
204; storage failure returns retryable 503 without acknowledgment.

The durable inbox stores only identity, hash, type and timestamps. No webhook payload
becomes a public projection or role grant. The pull runner marks up to 500 hints
processed only after every associated game catches up; hints arriving after the pass
started remain pending. Membership authorization continues to use current dedicated
reads. There is no detached request-time background job to lose on process exit.

## Actor-backed event commands

The website sends create/update/cancel to the fixed Logi command endpoint using a
restricted service key plus the current user's opaque actor token. Logi independently
checks the client policy, game, current session and member roles in the final mutation.
An operator must enable the provider's per-game role policy; a service key alone is
insufficient. Updates and cancellations require the exact supplied revision and an
eligible lifecycle state. The editor reloads authoritative facts after confirmation.

A UUID request ID, canonical parsed command and hash are durably bound to the author
and source before POST. User/body/source collisions fail before another mutation.
Retries preserve the original ID/body, including after a lost reply or receipt-write
failure. The per-user pending journal survives reload. It does not store bearer tokens.
A late failed response cannot downgrade an already confirmed receipt.

The editor offers an explicit retry for an unknown outcome; it does not silently issue
a new create operation or automatically retry POST. Definitive domain rejection is
separate from an unknown outcome. HTTP 429 preserves the same pending request and
persists a bounded retry time; an early retry cannot send another POST. Response reads
have an 8-second deadline and 32-KiB limit. Schedule input uses Europe/Prague with an
explicit choice for repeated daylight-saving times and stores UTC instants.

`LOGI_EVENT_WRITE_ENABLED=true` routes new ordinary website match creation through
the connected editor and blocks legacy creation **globally**, even when only one game
has a key. Configure every required game first. Existing local historical records and
the website CMS remain separate. No roster, attendance, signup, result or game-server
control writes are exposed by this editor.

## Storage and activation boundary

The additive `0009_aspiring_klaw` migration creates `logi_membership`, `logi_sync_scope`,
`logi_projection`, `logi_inbox` and `logi_command`, and adds seven private Logi binding
columns to `auth_session`. It does not migrate the historical match archive or make
private source records public. Migration execution is explicit, never on app startup.

Local interoperability and isolated database proof do not establish hosted Logi,
new live Discord OAuth, production role mapping, deployment, scheduling or public
publication acceptance. Those operator checks remain part of the separate activation
record in the [runbook](runbook.md).
