# Encrypted backup verification

Refs [#41](https://github.com/ValkyriaWDG/www/issues/41). These operator tools verify
that one immutable restic snapshot contains the exact database/media pair recorded
in an independently pinned manifest. They do not schedule backups, configure an
off-host backend, validate SQL/tar semantics, or replace the
[database/media restore rehearsal](backup-restore.md#rehearsal).

## Prepare a coherent pair

1. Quiesce **all** database/media writers, including the web service and scheduled
   publisher. Produce the PostgreSQL custom-format dump and editorial media archive
   under the existing [backup procedure](backup-restore.md#backup). Keep the inputs
   frozen until manifest creation and snapshot capture finish.
2. Use a dedicated directory containing exactly `database.dump` and
   `editorial-media.tar.gz`. No links, hard links, nested paths or extra files are
   accepted. Protect this plaintext directory and its ancestors from other writers.
3. Record the UTC capture time, deployed source commit and immutable image digest.
   `capturedAt` is an **operator attestation**, not a measurement of the age or
   semantic consistency of the data. The checks cannot establish transactional
   consistency between two independently captured inputs.

Run from the repository root; replace every placeholder with the actual value:

```sh
node scripts/operations/backup-set.mjs create \
  --directory /protected/backup-set \
  --captured-at '<UTC timestamp, e.g. YYYY-MM-DDTHH:mm:ss.sssZ>' \
  --source-revision '<40-character source commit>' \
  --image-digest 'sha256:<64-character digest>' \
  --operator-frozen
```

The JSON response contains `setId` and `manifestSha256`. Retain that SHA-256
**outside the backup repository** in a protected operator record. The generated
`backup-set.json` describes the two exact filenames, byte counts and SHA-256 hashes.
Re-running creation refuses to replace an existing manifest. A failed creation can
leave a manifest if failure happens during the final reread; treat that set as
unaccepted and investigate before use.

## Capture with restic

Use official **restic 0.19.1**, verified against its release checksums. Configure
`RESTIC_REPOSITORY` and exactly one of `RESTIC_PASSWORD_FILE` (preferred) or
`RESTIC_PASSWORD` through a protected operator environment. Backend credentials
also stay in that environment. Do not place secrets in CLI arguments, Git, evidence
or CI logs. The verifier rejects `RESTIC_REPOSITORY_FILE` and
`RESTIC_PASSWORD_COMMAND` to keep its source and process boundaries explicit.

Initialize and configure the intended encrypted backend separately. From inside
the dedicated pair directory, capture **`.`**, not the parent or an absolute
directory path:

```sh
cd /protected/backup-set
restic --no-cache backup --json .
```

Retain the full 64-character `snapshot_id` from the successful summary alongside
the independent manifest SHA-256. Confirm restic's process exit code is zero.
The expected snapshot tree is exactly `/backup-set.json`, `/database.dump` and
`/editorial-media.tar.gz`. Original source paths in snapshot metadata can remain
absolute; the verifier checks actual tree entries. See the official
[backup guide](https://restic.readthedocs.io/en/stable/040_backup.html) and
[scripting guide](https://restic.readthedocs.io/en/stable/075_scripting.html).

## Recover and verify

Return to the repository root before running the verifier below.

Use a new target below an existing, protected directory. Existing targets are
refused, even if empty. Local repository/target overlap is rejected using both
lexical and canonical paths. Every ancestor must be an ordinary directory.

```sh
node scripts/operations/verify-restic-backup.mjs \
  --snapshot '<full 64-character snapshot ID>' \
  --manifest-sha256 '<independently retained SHA-256>' \
  --target /protected/recovery/new-set \
  --max-age-hours 48
```

`RESTIC_BIN` optionally selects the verified executable. The tool checks snapshot
identity and tree shape before dumping exactly the three fixed filenames. It
checks both capture and snapshot freshness again at completion and hashes the
recovered bytes. It uses restic's authenticated decryption; it does not implement
encryption or extract the media archive. See the official
[restore/dump guide](https://restic.readthedocs.io/en/stable/050_restore.html).

Exit zero with `status: "passed"` means `encrypted-snapshot-bytes-only`. Every
failure exits nonzero and emits a short JSON code without child diagnostics,
repository URLs, local paths or credentials. Common codes are `stale_backup`,
`future_backup`, `manifest_mismatch`, `file_mismatch`, `unsafe_snapshot`,
`unsafe_target`, `target_exists`, `restic_failed` and `restic_timeout`. Unknown
failures report `operation_failed`. A credential/backend failure deliberately
uses a generic code; inspect it only in a protected operator session.

Defaults: 48-hour maximum age, 20 GiB per payload, 4 KiB manifest, 128 KiB metadata
output, and 900 seconds per restic process. Override payload bounds with
`--max-file-bytes` (positive integer, at most 1 TiB), age with `--max-age-hours`
(positive, at most 720), or the child deadline with `--timeout-seconds`
(1–3600). Oversized output and timed-out children are terminated. This is a
per-process bound, not a whole-recovery SLA. Hashes are streamed, not buffered.

## Plaintext and operational boundaries

Recovered plaintext is **always retained** at the requested target, including
partial output after a failure. `plaintextOutput` distinguishes `not-created`,
`partial-at-requested-target` and `retained-at-requested-target`. Quarantine failed
targets; do not reuse them. The operator owns secure storage, inspection and
eventual cleanup. The verifier never overwrites or recursively removes a target,
creates/deletes snapshots, or prunes a repository. Backend operations may need
transient restic locks.

Created output requests POSIX `0700` directories and `0600` files. Those modes do
**not** establish Windows ACL privacy: use an appropriately protected volume/ACL.
Protect parents against concurrent mutation on every OS. Userspace path and hash
checks do not defeat an adversary who can replace parent directories during the
operation. Run in a trusted operator workspace.

Only local encrypted synthetic repositories have been qualified here. Remote
backend operation, scheduling, retention, credential escrow, off-host placement,
alert delivery and production recovery remain operator acceptance work under
[#23](https://github.com/ValkyriaWDG/www/issues/23). Restore the recovered pair into
disposable targets using the [manual restore procedure](backup-restore.md#restore),
then verify migrations and application/media behavior. The existing automated
restore rehearsal creates its own dump/archive; it does **not** consume this
verifier's recovered pair and remains a separate application/database gate. Do
not publish production manifests or recovery files as PR artifacts. See the
[synthetic verification evidence](../evidence/encrypted-backup-2026-09-28/README.md).
