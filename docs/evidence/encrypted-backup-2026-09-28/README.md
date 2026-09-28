# Encrypted backup verification evidence

Refs [#41](https://github.com/ValkyriaWDG/www/issues/41). Tested on Windows with
Node `v24.21.0` and official restic `0.19.1` (`go1.26.4`, `windows/amd64`).
Base commit: `e8f19d7b3f664e82d545a58a97a9e215469e62c5`; the new files were
uncommitted during verification. The [machine report](report.json) records exact
SHA-256 fingerprints of both tools and all three new test files, the executable
fingerprint, observation time and sanitized actual CLI outcomes. Source hashes
identify the tested content independently of the later integration commit.

## Results

| Check | Expected behavior | Observed |
| --- | --- | --- |
| Complete encrypted pair | Decrypt an exact full snapshot and match all three files byte for byte | Passed using a real local restic repository and the actual Node CLI |
| Existing output / repository overlap | Reject before creating or replacing plaintext | Passed; existing bytes unchanged |
| Wrong password / missing snapshot / wrong manifest pin | Fail closed with nonzero exit and sanitized JSON | Passed; no plaintext target created |
| Same-size changed payload | Reject digest mismatch and label retained partial plaintext | Passed with `file_mismatch` |
| Missing half / extra snapshot file | Reject before recovery | Passed with `unsafe_snapshot` |
| Stale and future timestamps | Reject stale source despite a fresh snapshot, future capture and future snapshot | Passed |
| Recovery crossing the freshness boundary | Recheck time after real decryption, rather than reuse startup time | Passed with deterministic advancing clock; partial plaintext explicitly retained |
| Repository integrity | Real `restic check --read-data` succeeds for the synthetic repository | Passed |
| Filesystem and manifest contracts | Reject linked roots/ancestors/entries, traversal, absolute names, malformed provenance and invalid size/freshness limits | Passed in focused contract tests |
| Child process bounds / redaction | Terminate oversized output and a timed-out child ignoring SIGTERM; never echo secret-bearing diagnostics | Passed using actual child processes |

Commands run from the repository root:

```powershell
node --test scripts/tests/*.test.mjs
$env:RESTIC_TEST_BIN = (Resolve-Path '.local/restic-tools/restic_0.19.1_windows_amd64.exe').Path
$env:BACKUP_PROOF_REPORT_PATH = '.local/encrypted-backup/final-report.json'
node --test scripts/tests/encrypted-backup.integration.mjs
node scripts/check-foundation.mjs
git diff --check
```

- Foundation/tooling suite: **53 passed, 0 failed, 0 skipped**, 1.09 seconds.
  This includes nine pair-contract and five subprocess tests.
- Encrypted integration: **13 passed, 0 failed, 0 skipped** (12 subtests plus
  the parent test), 39.62 seconds. The internal report duration is 39.23 seconds;
  Node's total also includes harness/cleanup work.
- Foundation and whitespace checks passed. The application code and schema were
  unchanged; a full application build, database restore and browser suite were
  not part of this local tool check. Integrated CI must qualify the final PR head.

The explicit integration command fails if `RESTIC_TEST_BIN` is missing, is not an
absolute path, or does not identify version `0.19.1`; there are no silent skips.
`BACKUP_PROOF_REPORT_PATH` is optional, writes exclusively to a new report path,
and contains synthetic observations only. In the report, `status: "failed"` with
exit code 1 is the expected CLI result for rejection cases, not a failing test.

## Tool provenance

Downloaded from the official
[restic v0.19.1 release](https://github.com/restic/restic/releases/tag/v0.19.1),
and checked against that release's `SHA256SUMS` before extraction. PGP signature
verification was not performed in this local run.

| Official archive | SHA-256 |
| --- | --- |
| `restic_0.19.1_windows_amd64.zip` (locally tested) | `da948ad707ed690426473aaba2046cd61f8f90f6f0e7dab6be0d5796531de67d` |
| `restic_0.19.1_linux_amd64.bz2` (CI pin) | `f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c` |

The Linux archive is reserved for the separate CI gate; this evidence does not
claim a local Linux run. The synthetic fixture, random password and disposable
repository were removed by the test after verification. Only the sanitized report
is committed. No production credentials, infrastructure, snapshots, databases or
Discord services were accessed.

## Limits and screenshot applicability

Screenshots are N/A: this is an operator CLI with no application UI change.
Actual encrypted recovery, CLI exit contracts and source fingerprints provide
the applicable proof. Synthetic payloads are deliberately opaque strings, not
valid PostgreSQL dumps or tar archives. This proves transport/integrity handling,
not SQL restoration or semantic consistency between database and media.

The operator must freeze a coherent source pair, protect parent directories and
Windows ACLs, preserve independent pins, and own retained plaintext cleanup.
See the [operator guide](../../operations/encrypted-backup-verification.md).
Off-host configuration, scheduling, retention, alert delivery and production
restore acceptance remain open under [#23](https://github.com/ValkyriaWDG/www/issues/23).
