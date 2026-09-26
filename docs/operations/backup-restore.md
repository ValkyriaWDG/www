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

1. Stop the web service and the scheduled publisher timer.
2. Verify `sha256sum -c SHA256SUMS`. Restore into an empty database owned by the
   application role: `pg_restore --no-owner --no-privileges --exit-on-error --dbname "$DATABASE_URL" <dump>`.
3. Extract the media archive into an empty volume; keep ownership for the non-root app user.
4. Run the image's `scripts/migrate.mjs`. A dump from the same revision applies nothing;
   an older dump applies only the newer forward migrations.
5. Start the service; check `/api/health/ready`, a published article with images, and
   the admin media library. Re-enable the publisher timer last.

## Rehearsal

`apps/web/scripts/restore-rehearsal.mjs` automates a disposable rehearsal after `pnpm build`:

```sh
node apps/web/scripts/restore-rehearsal.mjs --source-db <url> --target-db <url ending _restore> \
  --media-root <editorial media dir> --work-dir .local/restore-rehearsal
```

It dumps the source and archives its media, drops and recreates the `_restore` target,
restores both, requires the migration runner to apply nothing, compares every table's row
count and every media file's SHA-256, checks each `asset` variant exists with its recorded
size, then serves the restored copy with the standalone build and checks readiness, the
home page and byte-identical published media delivery. It writes `report.json` to the work
directory. Rehearse before each production schema change and record the result in
`docs/STATUS.md`; never point it at a non-disposable target.
