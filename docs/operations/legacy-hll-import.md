# Legacy HLL import and CRCON operation

The operator CLI migrates previously published community content into the existing
CMS, matches, tournaments and media library. It does not read the old bot's private
membership, VIP or moderation records. See [extraction](legacy-hll-extraction.md)
for the source inventory and known source defects. Raw bundles are private operator
artifacts, never Git fixtures or web downloads.

## Prepare and rehearse

1. Extract the reviewed private checkout and public-page capture. Review all bundle
   warnings, repaired identities, quarantined statistics and external media links.
2. Choose the clock policy once. Default `legacy-fixed-offset` preserves the old
   implementation's fixed GMT+1 instant. `europe-prague` interprets the recorded
   clock time as Czech local time instead. This changes summer instants and must be
   an explicit editorial correction. The original text and policy are retained.
3. Build the application and CLIs. Restore a paired database/media backup into an
   isolated environment using the production PostgreSQL major version. Apply the
   candidate migrations explicitly, then seed missing taxonomy/pages. Seeding does
   not replace existing content.
4. Run the inventory-only pass. `--publish` describes intended publication; it does
   not write unless `--apply` is also present. `--adopt-seed` permits only pristine
   seeded FAQ/about pages and untouched empty legacy manual shells.

```sh
node apps/web/dist/cli/import-legacy-hll.mjs \
  --bundle /private/legacy-hll/bundle.json \
  --report /private/legacy-hll/dry-run.json \
  --adopt-seed --publish --match-clock legacy-fixed-offset
```

`DATABASE_URL` and `EDITORIAL_MEDIA_ROOT` select the isolated target. The dry run
validates bundle identities, files, checksums, image decoding, rich text and source
statistics. It does **not** exercise every database create/publication rule. Only
an actual import into the disposable restored copy proves those paths.

5. Inspect the report, calculate the bundle SHA-256, and apply that exact file:

```sh
node apps/web/dist/cli/import-legacy-hll.mjs \
  --bundle /private/legacy-hll/bundle.json \
  --report /private/legacy-hll/applied.json \
  --adopt-seed --publish --match-clock legacy-fixed-offset \
  --apply --expected-sha256 <reviewed-bundle-sha256>
```

6. Repeat the same command with another report path. Require unchanged entity
   counts, unchanged database fingerprints and no new media directories. Inspect
   articles, tables, manual images, FAQ, tournament links, match results, multi-map
   statistics and both locales in the built application. Check public media and
   publication-gated old-URL resolution. English translations are not invented.

## Import guarantees and limits

Each entity and its source ledger commit in one database transaction. The run is
resumable, not one enormous transaction: a failed record leaves earlier successful
records intact, produces a non-zero exit, and requires review before continuation.
Concurrent import writers serialize. Matching source identities are reused; changed
source hashes and occupied non-seed slugs conflict instead of overwriting content.
After editorial changes, reruns preserve existing data. Deferred publication checks
both the owner's version and match/tournament prose snapshots before publishing.

`legacy_import` retains source URL/date/language, selected provenance, checksum and
target identity. Repairs, expired-announcement dates, source tags and association
warnings survive outside the private bundle. Historical publication dates remain
separate from the new publication audit. Expired announcements stay archived;
future 0:0 fixtures never become completed results. Clan history supplements the
shared platform introduction. Tags retain their source labels under stable keys;
their English label initially remains the source label for editorial translation.

Copied media pass the existing decoding/re-encoding pipeline; only WebP delivery
variants are stored. External/unsupported images remain source links. Multi-map
matches retain individual statistical rounds. Unknown clan sides remain unknown
and show faction labels. The public player allowlist excludes platform/account IDs,
profiles, IP addresses, chat and encounter records. Public player visibility applies
to every statistical round. New import/removal replaces all old statistical rounds
atomically. Quarantined or empty exports do not become fabricated zero statistics.

A numeric historical CRCON game ID does not prove an origin. Legacy snapshots get
a public game link only when the bundle declares a reviewed matching origin/game;
other snapshots remain attributable to the old match and private checksum ledger.
Live URL imports use the configured trusted origin and validate the returned game
and configured server number before saving.

## Production maintenance

Coordinate with any active publisher before touching production. Follow
[deployment](deployment.md), [database workflow](../engineering/database-workflow.md)
and [Watchtower](watchtower.md). The schema delta deliberately holds automatic
channel promotion for an operator. Do not bypass it.

- Qualify the exact image/commit and preserve the accepted rollback digest.
- Stop the dedicated updater and editorial scheduler; prevent application writes
  during the final paired database/media backup, import and acceptance window.
- Restore and test the fresh backup, including file checksums, on a disposable
  PostgreSQL instance. Test the actual candidate image against that restored data.
- Apply migrations once, import the reviewed bundle, rerun for idempotence, and
  verify the candidate's public routes/media/health and configured CRCON reads.
- Reconcile the production image channel only after acceptance, then resume the
  scheduler/updater. Capture running OCI revision/digest and independent HTTP proof.

**Rollback is paired, not image-only after importing unknown sides.** Migration
0007 allows NULL `match_statistics.valkyria_side`; the previous image assumes a
non-null side and can fail while rendering these imports. It also cannot display
additional rounds. Before reopening writes, rollback may restore the matching
pre-import database and media backup together with the previous image. After new
editorial writes are accepted, do not restore over them; reconcile or forward-fix.
The rehearsed rollback must include this populated-data case, not just empty tables.

Legacy-domain DNS/Cloudflare routing remains a separate cutover. With configured
`LEGACY_HLL_HOSTS`, old detail URLs resolve through the source ledger only to current
published destinations. Missing, archived or unpublished targets are not redirected
to Home or exposed. Retain the old website until migration acceptance is complete.

## CRCON configuration and administration

Set `SERVER_STATUS_SOURCE=crcon` and an approved `HLL_SERVER_SOURCES_JSON` in the
protected runtime environment. Each source has `publicId`, `baseUrl`, optional
display name/join address, public `statsUrl`, and `serverNumber`. Pin the latter when
several CRCON instances share one history database. Never accept arbitrary visitor
URLs, infer a server from a game ID, or put provider credentials in client values.

The audited endpoints support anonymous public information, round statistics and
history reads. The stored `LEGACY_CRCON_USERNAME`/`LEGACY_CRCON_PASSWORD` are operator
audit credentials; the application does not log in with them. If an installation
requires an API key, use its supported server-only `statsApiKey`. Do not treat the
username/password as a bearer token. No server control/write commands are added.

In match administration, select the configured server, choose the game-link input,
paste its exact HTTPS `.../games/<id>` link, assign Valkyria's side, and import.
Only completed games with valid results are accepted. Review the normalized preview
and publication/player-visibility settings; imported statistics do not silently
replace the separately managed match result. Untrusted hosts, wrong shared-database
server IDs, malformed results and current unfinished rounds are rejected.

The public server browser refreshes every 30 seconds while visible and online.
Shared caches coalesce upstream reads, source timestamps distinguish stale data,
and failures retain a valid earlier snapshot. Player statistics describe round
participants, which can include players who already left; they are not presented
as an exact connected-player roster. Wardogs remains on its existing unconfigured
adapter until the owner supplies its API/RCON contract.
