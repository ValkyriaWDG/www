# Read-only team synchronization

Logi/Discord owns membership, published rosters, attendance responses and collected
player facts. The website displays them. News, biographies, approved public names,
media, consent and profile publication stay in the website CMS. There is no new
website member, role, roster or attendance write endpoint. Existing match commands
are unchanged.

## Data and authority

| Area | Source and website use | Boundary |
| --- | --- | --- |
| Directory | `member-summaries`: native type/status/paused flag and scoped groups | Private `team.read`; excludes notes, pause reasons and moderation |
| Application roles | Existing exact-subject `membership-summaries` with game-scoped mapping | Fresh authorization; directory rows never grant access |
| Published rosters | `roster-summaries`: squads, slots and reserves | No drafts, custom guest names, slot notes or absence reasons |
| Attendance | Native sign-up and acknowledgement/confirmation responses | Private team page; never inferred played/no-show |
| Player facts | `player-stat-summaries`: CRCON/Warcon collected sessions | Current verified Steam OpenID ownership and exact guild/game assignment; no nickname or manual platform-ID join |
| Public profiles | Association to native assignment **and immutable user record** | Published + consented website profile, independent stats/roster opt-ins default false |

Closed schemas live in `apps/web/src/modules/integrations/logi/people-contracts.ts`.
The producer handoff is [Logi v0.14](https://github.com/Ninjonik/logi/tree/feat/valkyria-integration/docs/integrations/website/v0.14).
Wire guild IDs are canonical Discord guild IDs, never internal workspace record IDs.

Statistics describe only collected and verified source sessions. Additive metrics
are summed; longest distance and streaks take the maximum. Missing values remain
null and render as a dash. Each metric reports how many sessions supplied it. The
UI shows collected/complete-session counts and date bounds. These are not career
totals or a claim that every played round has been collected.

Public match statistics additionally require an explicit reviewed-result session
association whose digest, result version and confirmed/corrected state match the
current published match. Dates, maps and nicknames never create joins. Public DTOs
omit Discord/platform IDs, native member/user IDs, member type/status, assignment
groups and individual attendance. Names always come from approved website profiles.

## Configuration and operation

1. Apply additive `0010_bizarre_gambit.sql` through the normal reviewed deployment
   process. It adds `logi_member_link`; no existing content is rewritten. This is
   preparation, not a record of a production migration.
2. Issue separate restricted keys for the three people resources and intended game.
   Legacy unrestricted keys and generic members/rosters grants do not authorize them.
3. Set `syncPeople: true` on the intended `LOGI_SOURCES_JSON` row and configure
   `LOGI_PEOPLE_API_KEY_HLL` / `LOGI_PEOPLE_API_KEY_WDG`. Defaults stay disabled.
4. Schedule `pnpm --filter @valkyria/web logi:sync` every minute. People and safe-data
   purposes use separate keys/checkpoints. Webhooks are hints; authenticated pulls
   supply the records.
5. Map the intended guild role to a game-scoped `member` application role. Members
   and match managers have `team.read`; editor alone does not. Account-page links
   lead to `/cs/hll/team`, `/cs/wardogs/team` and English equivalents.
6. For public output, use **Admin → Members → Logi profile associations**. Select an
   existing profile and exact verified native member, then opt into statistics and/or
   roster position. Record consent and publish through the existing CMS. Association
   changes need `members.publish` for every profile game and the source game.

The association includes the source/key fingerprint: rotating the key or changing
configuration requires an explicit refreshed association. Matching names never bind
players. Reassignment to another immutable user stops publication. A revoked or
disabled source's association can still be removed.

## Freshness and capacity

Native revisions/tombstones are monotonic decimal strings. Cross-row dependencies
invalidate the producer cursor generation; a 410 during the lists starts a fresh
snapshot, and a 410 on replay or while live waits for the next full reconciliation
(Logi keeps no replay log since 7 October 2026). Members and rosters form one atomic
core generation, reconciled every two minutes. Collected statistics form a separate
atomic generation, reconciled every five minutes. Idle polling does not reset either
age. Reset/bootstrap hides prior public output from the affected generation.

Public output and association candidates require a complete live generation, no
source error, successful synchronization and reconciliation within five minutes.
Statistics additionally require a complete fresh statistics generation and a current
core identity. Every statistics session must have attribution checked within five
minutes. Any expired attribution makes all statistics from that scope unavailable,
preventing silent partial totals; it does not hide healthy members or rosters. The
final public consent query also checks both source versions and error state. A
private directory/roster snapshot may be shown as
explicitly stale for at most fifteen minutes. It never authorizes a request. A
revoked/forbidden source immediately suppresses personal output.

There is a limit of 1,000 active projection rows and 16 MiB of JSON per scope,
independently for core and statistics; exceeding it makes that scope unavailable.
Producer roster/session pages scan one native item and may be empty with a
continuation. All configured game cores run before statistics. Each core pass allows
100 steps / 50 seconds; each statistics pass allows 30 steps / 10 seconds. Both use
a 60-second lease and commit resumable pages under the existing version fence.
An unbounded HLL statistics continuation cannot prevent the Wardogs core from being
attempted first, or prevent the later Wardogs statistics pass indefinitely. Large
histories or continuously changing sources may not finish within the freshness
window and statistics remain unavailable.
History is not silently truncated. Larger deployments need an explicit versioned
history/window or throughput contract before activation; do not weaken freshness.

## Upgrade and rollback

This split requires no SQL migration or new checkpoint JSON field. The core retains
the exact existing people scope key, preserving reviewed `logi_member_link` identity,
consent and opt-in associations. Statistics use a separate key derived from that core
key and `people-statistics-v1`, with the same restricted API key and source identity.
Key rotation invalidates both caches and still requires explicit association review.

On upgrade, a legacy three-resource live checkpoint starts a full core rebuild.
Legacy in-progress checkpoints without the `people-core-v1:` generation prefix also
restart: their resource index 1 meant statistics, whereas the new core index 1 means
rosters. Old cursors are never reused for a different resource set. New statistics
start from an empty independent scope; no legacy partial history is published.

An older image still interprets people as three resources and must not resume these
two-resource checkpoints. To roll back, pause the scheduler, stop all sync workers
and wait for their leases to expire. Back up the affected core/statistics scope rows
and projections. In one maintenance transaction, remove projections only for those
exact configured scopes and reset their operational state: `checkpoint`,
`active_generation`, lease fields, success/attempt/retry timestamps and `error_code`
to null, and `version` to 0. Preserve the existing scope rows, source keys,
`logi_member_link`, profile publication and consent records. Then start the older
image and scheduler; it must cold-bootstrap all three resources before publication.
Keep data/membership scopes untouched. This is an operator procedure, not automatic
rollback behavior. A rollback can restore the original large-history availability
limitation; it never authorizes partial statistics or relaxed freshness.

## Verification boundary

The [2026-10-03 acceptance bundle](../../evidence/logi-people-2026-10-03/README.md)
contains actual paired-runtime checks, inspected screenshots and tested source hashes.

Contract, scope, consent, expiry, cursor and real PostgreSQL tests cover success and
denial. Local paired-runtime evidence and screenshots are recorded separately with
source hashes. Synthetic fixtures do not prove a real Steam login, new live Discord
interaction, hosted deployment or production acceptance. Activation still requires
the qualified producer version, keys, scheduler and operator configuration. Discord
command redesign remains a subsequent task.
