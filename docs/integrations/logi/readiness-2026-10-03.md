# Logi / website readiness — 2026-10-03

This audit compares website main `0a94d59c32831cfa198a0371bf204523e6555a3a`
with [Logi PR #158](https://github.com/Ninjonik/logi/pull/158) at
`c42ea770c307793494ae159a924f86e3c6ced50d`. These are source checkpoints,
not a claim that the hosted producer runs that revision. Recheck before activation.

## Why the public login did not show Logi

A read-only runtime check found that `valkyria.cz` was already running website
main `0a94d59`. The Logi SSO flag, client configuration, per-game data/membership
keys and source mappings were absent. The login page selected its provider from
the flag and hid Logi entirely when disabled. Fetching the same image again would
not enable it.

The readiness patch keeps the Logi action visible, disabled with a localized
unavailable explanation until configured. It offers Discord only when configured
and permitted by the existing fallback policy. It does not bypass provider setup,
start a disabled OAuth flow or grant management roles. The website still requires
fresh server-side membership and game-scoped capabilities after sign-in.

## Current capability map

| Capability | Website coverage | Access and ownership |
| --- | --- | --- |
| Login and central revocation | OIDC code, PKCE S256, nonce, RS256/JWKS, bound userinfo and local website session | Registered SSO client; Logi owns authentication, the website owns its session cookies and capabilities |
| Game-scoped authorization | Exact-subject membership reads with observation time, epoch/revision and freshness fences | Separate membership read key per game; people and Steam facts confer no access |
| Events, results and servers | Five scoped summary collections, changes feed, sync-record refetch and durable generation swap | Data key; Logi operational authority; website explicitly approves public projections |
| People, rosters and player facts | Three people collections, dependency resets, native-member association and consent | Separate people key plus `syncPeople`; Logi roster/attendance authority; website profile/publication consent |
| Event create, update and cancel | Connected editor, expected revision, durable request journal and receipts | Command key plus current actor token, idempotency key and provider role policy |
| Webhook hints | Raw-body HMAC, scope validation, durable deduplication and authoritative pull | Separate signing secret; payloads never grant roles or directly publish data |
| Integration health | Summary collected and stored; admin health surface remains open | [Issue #22](https://github.com/ValkyriaWDG/www/issues/22): show local collector and supported provider health separately |
| Wardogs League preview | Server-only `league-matches` reader with in-process last-known cache, editorial `leagueMatchUrl` on Wardogs matches and an unverified "League preview" section on the public match page (local synthetic proof only) | Explicit `league-matches` read grant (`LOGI_LEAGUE_API_KEY_WDG`); producer URL policy; read-only preview; `results` stays `null` and the CMS result remains the only result |
| Warcon advanced reads | Server-only `warcon-data` reader for approved `warconConnections` reading the `live` and `matches` views only; minimal public DTOs on the Wardogs server detail and home overview (local synthetic proof only) | Explicit `warcon-data` grant (`LOGI_WARCON_API_KEY_WDG`) and per-connection approval under a published server; no player rows, Steam IDs, panel/join identifiers or health/capabilities views |
| Signup, roster, attendance, result and server writes | No website controls for these operations | Raw service APIs are not equivalent to actor-backed website commands; management stays in Logi/Discord |
| News, FAQ and Field Manual | Website editor, translations, revisions and publication | Website-owned CMS; do not synchronize from Logi or add a second editorial writer |

API `guildId` and SSO `guild_id` are canonical Discord guild snowflakes, not
dashboard workspace IDs. HLL maps from route `hll` to database `hell-let-loose`
to API `hell_let_loose`; Wardogs remains `wardogs` throughout.

The advanced Warcon views are `live`, `analytics`, `cash`, `matches`, `match`,
`leaderboard`, `players`, `career`, `kills`, `catalog`, `rotation`, `health`,
`capabilities`, `experiences` and `alternators`. An available endpoint does not
automatically authorize public display, profile association or management writes.
[Issue #87](https://github.com/ValkyriaWDG/www/issues/87) implements the two
approved readers; the module boundary is described in the
[readers README](../../../apps/web/src/modules/integrations/logi/readers/README.md).

## Reader capability states

`readerCapabilityStates(env)` (`apps/web/src/modules/integrations/logi/readers/health.ts`)
reports one state per resource for the administration health page of issue #22:

| State | `league-matches` | `warcon-data` |
| --- | --- | --- |
| `unconfigured` | `LOGI_LEAGUE_API_KEY_WDG` absent, no valid Wardogs source or invalid `LOGI_SOURCES_JSON` | Same, or the Wardogs source has no approved `warconConnections` |
| `configured` | Key and Wardogs source present | Key, Wardogs source and at least one approved connection |
| `unsupported` | The deployed producer answered 404 (`not_found`) on the last attempt: the route is not deployed | Same |

The last attempt outcome is the in-process cache category (`ok`, `unauthorized`,
`forbidden`, `not_found`, `rate_limited`, `upstream`, `timeout`, `invalid_response`,
...), never a body or key. `LOGI_READERS_SOURCE=synthetic-fixture` reports `configured`
with a synthetic detail and is for local tests and review captures only.

The reader implementation was verified against the producer source and fixtures of
PR #158 at `c42ea770` (recorded local League read, synthetic Warcon generator) and
against a labelled synthetic source in the browser. Hosted acceptance remains open
until the operator confirms: the deployed revision serving these routes (OpenAPI
1.9.0); two separate restricted keys bound to the canonical guild; the enabled
`wardogs_warcon` connections and their Logi connection IDs; whether a per-key
connection allowlist is planned; whether game display names may be public; the
acceptable shared budgets and recommended timeout for cold League reads; and when
completed/live League pages will be verified (results stay `null` until then).

## Connector corrections in this patch

1. A `410 reset_required` during collection pagination now starts a new complete
   shadow generation with a fresh change boundary. It cannot leave a persisted
   invalid cursor retrying forever, mix abandoned rows into the replacement or
   publish a partial snapshot. The regression spans several bounded sync passes.
   Rows of the abandoned generation are deleted as soon as the replacement begins.
2. A persisted collector failure supersedes a recent successful observation.
   Public HLL/WDG servers immediately become unknown/stale and omit live scores;
   last-known map and population remain explicitly historical.

These are local consumer regressions. The source review does not establish
successful hosted authentication or permission to call protected hosted endpoints.

## Activation sequence

Follow the [runbook](runbook.md); keep credentials in protected runtime storage.

1. Confirm the hosted producer revision and contract support with its operator.
2. Register the website SSO client and exact HTTPS callback. Supply issuer,
   client, guild and explicit per-game membership keys and reviewed role mappings.
3. Supply configured source identities and separate data/people/command grants
   only for the capabilities being enabled. Review every public server mapping and
   profile publication opt-in. HLL may retain CRCON independently of Wardogs Logi.
4. Verify the production schema and run the bounded sync CLI repeatedly until
   the selected scopes are caught up, then qualify its scheduled execution.
5. Test hosted sign-in, central logout, role removal and HLL/WDG isolation using
   an authorized test account. Test unavailable/stale/denied states as well as the
   successful flow. Record sanitized API and browser proof in
   [#23](https://github.com/ValkyriaWDG/www/issues/23),
   [#8](https://github.com/ValkyriaWDG/www/issues/8) and
   [#7](https://github.com/ValkyriaWDG/www/issues/7) before their closure.

Provider startup discovery currently occurs once during auth initialization.
A provider outage during that step can require a website restart after recovery;
bounded initialization/retry remains a separate follow-up in the existing runbook.
Do not treat a visible configured button or a green local mock as hosted acceptance.

## Administration findings

FAQ already uses the shared Pages editor; Field Manual already supports rich-text
articles, translations, sources, revisions and publication. The patch makes FAQ
discoverable in the Pages label, repairs manual search navigation, protects unsaved
manual metadata and restricts fixed-scope modules consistently with resource
permissions, on the lists, the creation page and the direct editor routes. See the
[editor guide](../../operations/editor-guide.md).

Editable taxonomy remains a real gap: category names/descriptions/order and news
taxonomy currently come from seeds. Category assignment in article editing already
exists. Add taxonomy management through the existing CMS with locale, scope and
referenced-category protections; do not build a second CMS or move it into Logi.
[Issue #86](https://github.com/ValkyriaWDG/www/issues/86) records that implementation
and its required database/browser evidence.

This work does not activate production authentication, issue hosted grants, import
private member data, change DNS, post Discord messages or deploy a new image.
