# Portable media storage verification

Issue #38; local verification on Windows, Node 24.21.0 and pnpm 10.34.5.
The baseline four unit failures were three manifest path comparisons using Windows
separators and a final-file symlink fixture requiring privileges unavailable to the
test process. Neither failure was skipped or counted as passed.

Manifest comparisons now normalize repository-relative paths to `/`, preserving
the original hash, dimensions and provenance assertions. POSIX retains its real
final-file symlink assertion. Windows uses a real directory junction that points
at an external synthetic fixture, without requiring symlink privileges.

The additional directory-link regressions revealed a storage containment defect.
Reads and writes now reject asset-directory links, including aliases to a different
asset inside the root. Canonical root containment remains a second check; final-file
reads retain `lstat`, `O_NOFOLLOW`, regular-file validation and handle cleanup.
The configured root may itself be a volume alias. Existing deletion removes a link
without deleting its target, which is verified using an actual filesystem fixture.

## Actual results

| Check | Expected and observed result |
|---|---|
| Baseline filesystem reproduction | External-directory read/write assertions and the internal cross-asset alias assertion failed before the corresponding guards. Fixtures contain synthetic bytes only. |
| Focused media/presskit tests | 16/16 passed, zero skips, using real files and junctions. |
| Full Windows unit suite | 379/379 passed across 39 files, zero skips. |
| Lint and typecheck | Both passed after the final guards and regression cases. |
| Normal storage and configured-root alias | Both variants remain readable/writable through the configured root; asset identity isolation is retained. |
| Link deletion | The directory entry is removed and its external target bytes remain unchanged. |

Reproduce from the repository root:

```sh
pnpm --filter @valkyria/web exec vitest run --project unit src/components/public/presskit.test.ts src/modules/media/image.test.ts
pnpm test:unit
pnpm lint
pnpm typecheck
```

[Source fingerprints](source-fingerprints.json) identify the exact three tested
files, normalized to LF. These local checks do not qualify an entire combined Git
revision: the PR must also pass complete current-head Linux CI, including the POSIX
link fixture, database/application/browser and image/release checks.

**Screenshots: N/A.** No UI or layout changes. Actual file bytes, rejected operations,
unchanged external targets and passing image/hash assertions provide the proof.
No database, live-provider or production access was involved in these local checks.

The storage volume must remain application-controlled. Path-based checks do not
eliminate races with another process replacing directories between validation and
I/O. This patch does not claim a descriptor-relative filesystem sandbox or establish
any production exposure or exploitation.
