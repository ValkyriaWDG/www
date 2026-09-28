# Backup and restore

Back up the project database and the editorial media volume together: `asset` rows record
every stored derivative (`<EDITORIAL_MEDIA_ROOT>/<assetId>/{full,thumb}.webp` with byte
counts), and published content references assets by ID. A database restore without the
matching media, or media without its rows, breaks publication-aware delivery.

## Backup

Run from an operator host with PostgreSQL client tools matching the server major version.
Credentials come from the protected environment, never the command line history.

```sh
pg_dump --format=custom --no-owner --no-privileges --file valkyria-<timestamp>.dump "$DATABASE_URL"
tar -C <editorial-media-volume> -czf editorial-media-<timestamp>.tar.gz .
sha256sum valkyria-<timestamp>.dump editorial-media-<timestamp>.tar.gz > SHA256SUMS
```

Take both in the same maintenance window; uploads between the two steps can leave an asset
row without bytes. Store backups encrypted, off the application host, with retention and
access limited to operators. Background media derivatives are delivered separately (see
[background media](background-media.md)) and are not part of this backup.

## Restore

For encrypted recovery copies, first use the [paired snapshot verifier](encrypted-backup-verification.md)
to check the pinned database/media bytes and their age. That check does not restore
PostgreSQL or extract media; continue with the procedure below on disposable targets
before accepting a recovery copy.

1. Stop the web service and the scheduled publisher timer.
2. For legacy/manual backups, verify `sha256sum -c SHA256SUMS`. For paired encrypted
   recovery, require the verifier's successful result instead; its three-file output
   deliberately has no `SHA256SUMS`. Restore `database.dump` (or the verified manual
   dump) into an empty database owned by the application role:
   `pg_restore --no-owner --no-privileges --exit-on-error --dbname "$DATABASE_URL" <dump>`.
3. Extract the media archive into an empty volume; keep ownership for the non-root app user.
4. Run the image's `scripts/migrate.mjs`. A dump from the same revision applies nothing;
   an older dump applies only the newer forward migrations.
5. Start the service; check `/api/health/ready`, a published article with images, and
   the admin media library. Re-enable the publisher timer last.

## Rehearsal

`apps/web/scripts/restore-rehearsal.mjs` captures a **frozen source** into a **new**,
disposable database and directory after `pnpm build`. It never drops databases,
disconnects other sessions, or removes a work directory. The previous `--source-db`
and `--target-db` URL arguments are intentionally unsupported; load credentials into
the protected process environment instead:

```sh
# Set REHEARSAL_SOURCE_DATABASE_URL and REHEARSAL_TARGET_DATABASE_URL securely.
# The target database name must be unused and end in _restore.
node apps/web/scripts/restore-rehearsal.mjs --operator-frozen \
  --media-root /protected/source-editorial-media \
  --work-dir /protected/rehearsals/new-unique-run --port 3400 \
  --public-asset <known-published-asset-uuid> \
  --private-asset <known-unpublished-asset-uuid>
```

Freeze **all** source database and media writers (web, publisher, bots and jobs), and
protect the source, build files and target parent against concurrent changes. The
`--operator-frozen` flag attests that this has been done; it does not stop services.
Pre/post source fingerprints detect ordinary drift but are not an atomic snapshot or
a defense against a hostile process racing filesystem checks.

Both URLs must explicitly provide the same hostname, port, username, password and TLS
setting; only the simple database name may differ. Supported schemes are `postgres`
and `postgresql`; the only optional query parameter is one `sslmode` with value
`disable` or `verify-full`; omission is normalized to explicit `disable` for both Node
pg and libpq. Select `verify-full` when transport authentication/encryption is needed.
Ambiguous `require`/`verify-ca` policies are refused because the two clients interpret
them differently. DNS/IP hosts are supported; encoded/socket/multiple hosts are not.
Host aliases, database/query overrides,
encoded database paths and ambient `PG*` variables are rejected. Password-less trust,
service files and implicit password-file authentication are not supported by this
bounded interface. Child tools receive only explicit connection fields; URLs never
appear in their command arguments or reports. Use matching PostgreSQL client/server
major versions and a role allowed to read the source and create the new target.

The work directory must not already exist, even if empty. Its parent must already
exist outside the repository and outside the source media tree. Symlink/junction
ancestors, path aliases, linked media entries, hard-linked files and overlapping paths
are refused before writes. Media is bounded to 10,000 entries and 20 GiB in total.
The script checks the target name before creating the work directory, then uses
`CREATE DATABASE` without a preceding `DROP`. A competing creation fails without
dumping, restoring or deleting that database. A lost connection during `CREATE` is
reported as `creation-outcome-unknown`; an operator must resolve ownership manually.

The tool captures its own dump/archive, restores into the new target, requires zero
pending migrations, compares all table row counts/content checksums before and after,
and compares media SHA-256 values and recorded variant sizes. It starts only its own
standalone Node process, with external authentication disabled, checks readiness and
home HTML, and tests byte-identical anonymous media delivery. Supply at least one known
public asset whenever live assets exist. Repeat `--private-asset` for known private
assets whose anonymous response must be 404. Other assets may legitimately be private;
successful bytes are always checked. A genuinely empty asset table **and** media tree
can pass with `mediaDelivery: not-applicable-empty`; this does not prove image delivery.

The app process is stopped and awaited on success, error or operator interruption,
with a hard-kill fallback. Other app processes and database sessions are not stopped.
Children have command/output limits; HTTP requests have a five-second bound. A cold
local HTTP failure was observed during the first Windows acceptance run and remains
undetermined; the failed run is retained in the [safety evidence](../evidence/restore-boundaries-2026-09-28/README.md).
Later passing runs do not establish that cause or guarantee repeatable cold startup.

JSON stdout and an exclusively created `report.json` inside an owned work directory
contain only status codes, counts, hashes, timing and ownership. Refusals before work
creation write no report file. Failures retain partial plaintext dumps/media and any
created database for inspection. Restrict the parent directory's ACLs (on Windows,
POSIX mode bits alone do not establish confidentiality), keep reports separately,
then remove only resources whose ownership you confirmed. The tool performs no cleanup
of data, encryption, upload or backup retention. Raw application/subprocess output is
not emitted; use the report stage/code for diagnosis without exposing credentials.

This is a same-source capture rehearsal, **not** a recovered-restic restore mode or
proof of an off-host recovery copy. The standalone probe verifies server routes and
media, not copied static assets, visual layout, full browser behavior or an actual
container/image rollback. Those remain separate release gates. Record the exact
revision and result before accepting a schema change; never point the tool at a
non-disposable target.

Run refusal/process regressions with `node --test scripts/tests/restore-rehearsal.test.mjs`.
For an isolated real round trip, prepare a built app, matching `pg_dump`/`pg_restore`
and `tar` on PATH, and set `REHEARSAL_TEST_DATABASE_URL` to an explicitly disposable
loopback administration database ending in `_test`. Then run
`node --test scripts/tests/restore-rehearsal.integration.mjs` from the repository root.
The integration harness creates unique synthetic databases/roles and removes only its
successful CREATE names, without FORCE or session termination. Optional
`REHEARSAL_PROOF_REPORT_PATH` records its sanitized results; `REHEARSAL_TEST_PORT`
selects the local app port (default 3349).

Application CI runs this real suite after the production build against its existing
disposable PostgreSQL 17 service. It selects native major-17 clients, installing only
the client package when needed; an existing package source is reused before the official
PGDG setup helper is considered. Both executable versions are checked before running.
The loopback `_test` administration database is only a connection point: the suite
creates its own randomly named source/targets and role. Failure blocks the Application
and Quality gates. The exact sanitized report is uploaded with `always()` under
`restore-boundaries-<tested-sha>-<run-id>-<attempt>` for 90 days; every attempt uses a fresh
report filename. It does not upload dumps, media, subprocess output or database URLs.
