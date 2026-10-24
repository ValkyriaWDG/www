# Public gaming directory and both-game history

This implements the owner's 25 October 2026 request. Source implementation and
synthetic tests do not establish production acceptance; record real deployed facts.

## Publication

Each intended source explicitly enables `syncPeople` and `publishPlayers` in
`LOGI_SOURCES_JSON`. Basic gaming publication defaults to false and does not change
key authority. `/members` composes supplied gaming names with approved personal
profiles before search, game/role filters, counts and pagination. An empty CMS does
not hide current synchronized players. `/players/<opaque-key>` and the game-scoped
equivalent show exact game affiliations and published lineup links.

Keys derive from source instance, guild and immutable identity; unresolved assignments
use a separate scoped key. Names never join people. Cross-game deduplication requires
exact identity. No internal/account/platform IDs, private roles, groups, member state
or attendance are in public DTOs or URLs. Current core and final SQL version fences
remain required.

Owner-authorized basic gaming publication does not create personal consent. Biography,
avatar and editorial roles keep their existing published/consented profile gate.
Exact hidden/withdrawn associations and roster/statistics opt-outs still suppress the
corresponding facts, including across service-key rotation.
Negative decisions also survive assignment recreation for the same resolved native
person, or an unresolved/conflicting identity on the exact same assignment. Positive
personal-profile authority always requires the current complete resolved binding.

## Player statistics

Player details read the existing public Logi player API by exact current account
subject only on the server with `identity=discord`. The producer resolves its exact
Discord index, never a legacy account-ID fallback, and returns an opaque
`identityBinding` matching SHA-256 of the JSON tuple
`["public-player-native-v1", nativeIdentityId, discordSubject]`. The consumer requires
this proof against its current native identity. Old deployments without the proof
and legacy-ID collisions cannot attach another account's statistics.
The explicit response allowlist discards account/clan IDs
and avatars. Publication and native identity/version are checked again after I/O and
cache hits. Requests have a five-second timeout and 512 KiB limit; the bounded cache
has 256 entries and a 30-second lifetime. The directory makes no per-player requests.

Totals cover publicly recorded eligible matches across all teams in the selected
game. The separate recent list contains at most 30 matches and is never summed as a
lifetime total or relabelled as Valkyria-only/server-game coverage. Wardogs retains
signed money and HLL available offense/defense/support. Failed/absent profiles are
unavailable, not zero-game players. Per-match facts retain exact reviewed-result joins.
Existing collected-session summaries retain their independent capacity, completeness
and freshness guards; the 1,000-record/16 MiB bound is not raised or truncated.

## Retained server history

Both game history pages use `GET /api/v1/clan/server-game-history?game=<exact-game>`
with the explicit resource/game grant. Configure `LOGI_HISTORY_API_KEY_HLL` /
`LOGI_HISTORY_API_KEY_WDG` and reviewed `historySources` under published servers.
Each history-source `publishPlayers` independently releases observed player rankings.
An existing approved key may be reused only if it already has the required grant.

The strict version-1 union matches HLL/CRCON or Wardogs/Warcon. HLL preserves observed
Allies/Axis scores and available combat/offense/defense/support; missing time,
player factions and outcomes stay unknown. Unknown-time HLL players are eligible
only at a zero time floor. K/D uses `kills / max(1, deaths)` only with complete metric
coverage. Optional bounded Warcon `scoreTimeline` is validated, not publicly proxied.
Signed cursors, revisions, filters, details and caches are game-bound. Complete atomic
scans replace corrected contributions. Provider players never imply verified members.

HLL activation requires the matching Logi Convex deployment and bounded dry-run/apply
backfill of current-generation completed sessions. Backfill preserves the original
provider observation time and is idempotent; it is not another provider collector.
Verify actual counts, sampled totals, games, rankings, filters, opaque profiles and
lineups on production in both locales before declaring the complete product accepted.
