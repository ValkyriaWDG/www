# Sanitized deployment report contract

This is a **prospective report schema in prose**, not an executable verifier or a
populated evidence report. No success value or example digest here represents a
production observation. The [acceptance README](README.md) links the subsequently
inspected actual reports and distinguishes their failed, intermediate and accepted
checkpoints.

## Common envelope and identity

Every later machine report must contain:

| Field | Required meaning |
|---|---|
| `schemaVersion` | Positive integer identifying the actual report format. |
| `status` | Explicit `pending`, `not-run`, `blocked`, `failed`, `passed` or final `accepted`; a missing observation must not become zero failures or a pass. |
| `observedAt` / `finishedAt` | Actual timezone-aware UTC observation window. Unknown values remain null with a reason. |
| `environment` | Distinguish `ci`, `local-rehearsal`, `production-backup-rehearsal` and `production`. |
| `candidateRevision` | Full accepted application source SHA; distinct from the documentation branch's merge SHA. |
| `candidateDigest` | Independently verified immutable OCI index digest, not an unqualified mutable tag. |
| `runtimeManifestDigest` / `runtimeConfigDigest` | Separately identified Linux runtime descriptors when applicable. Do not substitute Docker's local image ID without explaining its storage semantics. |
| `maintenanceRunId` | Sanitized correlation ID shared by maintenance and acceptance evidence, without filesystem or host information. |
| `artifactHashes` | SHA-256 of exact evidence bytes. Hash linkage establishes integrity and lineage, not an independent signature or proof that a claimed check executed. |
| `limitations` | Concrete unrun checks, differences of environment/source, unavailable proof and remaining boundaries. |

Keep planned and observed values in separate properties. Use a null observed value
and explicit status for a pending field. Never publish a fabricated `passed` JSON
object as a template. Preserve failed runs with their own identity; later successful
retries must not overwrite them.

## Release and runtime report

Record the exact workflow URL, accepted source SHA, workflow conclusion, protected
approval observation, and published immutable digest independently. Approval is not
proof of successful publication. Read back the full index, runtime descriptors and
OCI source revision; retain aggregate SBOM/provenance availability and scan status
without equating a passed scan to zero vulnerabilities.

For runtime proof, compare the running container's image to the qualified immutable
artifact. Record healthy/running state, both health results and sanitized evidence
that intended mounts/security/configuration and unrelated service boundaries were
preserved. Exclude full container inspection, environment values and host addresses.

The previous-source record is historical `571475f3f60fb38c7cf14cd6afb4702982ba4681`.
Its digest and observation time come from the linked baseline, not from an assumption
that it is still running when the new maintenance begins.

## Restore, maintenance and imported-data report

Keep these observations distinct:

1. **Accepted rehearsal:** PostgreSQL major version, restricted role flags, isolated
   network/ports, exact backup-pair hashes, restored source fingerprints, candidate
   and previous image identities, journals, actual import/rerun results and candidate
   plus rollback HTTP/media checks. Report which owned rehearsal resources stopped.
2. **Fresh maintenance capture:** actual writer exclusion, previously observed
   updater/scheduler states, paired hashes, archive validation and source fingerprints.
   Use separate booleans for `freshDatabaseDumpRestored`,
   `sourceFingerprintMatchesAcceptedRestoration`, `dumpTocVerified` and
   `mediaArchiveRestoredAndVerified`; none implies another.
3. **Applied migration:** journal before/after, bundle hash, selected clock policy,
   apply result and repeat-import/fingerprint result. A successful dry run does not
   imply successful apply or publication.
4. **Data acceptance:** expected/observed counts for documents by kind/publication,
   matches by status, snapshots/rounds, unknown sides, provider-link verification and
   ready media. Confirm repair/quarantine notes and source-date metadata survived.
   No titles, player names, raw rich text or private source URLs are needed here.

Protected raw reports remain the audit source. A public summary identifies their
hashes and aggregate conclusions without embedding the exports or private paths.
Publish a sanitized result for each acceptance claim; a private artifact hash alone
does not provide an external reviewer with readable proof.

## HTTP, media and provider report

The planned bounded verifier contains 929 observations: 267 imported-detail/core
checks, 615 numeric/legacy aliases, 40 locale/game surfaces, 3 redirect boundaries
and 4 provider/API boundaries. A separate health pass observes liveness and readiness
again, producing 931 observation rows in the private acceptance envelope. These are
not 931 unique URLs. Report actual totals/passes/failures after execution.

Each public HTTP row identifies a safe canonical route or case ID, method, expected
status, observed status, result and actual window. Redirect cases must verify the
expected same-origin destination without following arbitrary external URLs. Record
publication/archival gating and both locale/game boundaries, including intentional
404s; “all 200” is not the expected contract.

Readiness requires all four checks — configuration, database, schema and media —
to be healthy. HTTP 200 alone is insufficient. Liveness is a separate process check.
HTML acceptance checks rendered content, not serialized script props or a generic
200 error shell.

Media results report discovered unique published references, requested variants,
successful status/MIME/signature/decoding, byte counts and delivery-policy failures.
Only variants actually referenced by published content are expected public. The 438
stored derivatives are not an anonymous-publication target; private/archive-only
media denial belongs to a separately recorded access check.

Provider results report configured-source counts, freshness/state, truthful live
versus archived distinction, privacy-allowlist outcome, response caching and invalid
input rejection. Zero players may be a valid observed result. Do not publish player
names, platform identifiers, profiles, chat, moderation fields, provider tokens or
private API addresses. Record unavailable providers honestly; do not replace them
with synthetic success.

## Browser and screenshot catalog

Use fresh anonymous contexts and record browser/version, platform, locale, viewport,
route, source/digest reference, capture time, document overflow, image decoding and
page errors. Restrict candidate public captures to safe editorial routes; real-data
statistics pages and authenticated dashboards remain private.

Each selected screenshot needs a repository-relative public file path, original
byte count, dimensions, SHA-256, scenario, expected/observed result and a separate
actual visual-inspection acknowledgement. State any cropping/redaction explicitly.
Registration in the asset manifest and checked image links are required before
publication. A capture step or hash comparison does not mean visual inspection.

Desktop and 390×844 coverage must identify what was actually visited. Czech-only
captures do not prove English layout; source-language content does not imply an
English translation. A rejected local preview start remains an unrun local check,
even if later production evidence is successful.

## Acceptance, promotion and resumed automation

The private acceptance proof binds `candidateRevision`, `candidateDigest`,
`maintenanceRunId`, `verifiedAt`, and actual HTTP, health and inspected screenshot
artifacts. Its required artifact hashes are `httpReportSha256`,
`browserReviewSha256` and `healthReportSha256`, with maintenance/rehearsal lineage
also retained. Public summaries omit the private `evidenceFiles` paths.

Only evidence observed after the same candidate-ready event can establish its
acceptance. Validate chronology and reject future or stale observations. An explicit
visual acknowledgement confirms that the exact captured files were inspected;
neither a prepared helper nor a synthetic offline fixture establishes this.

Keep held-candidate acceptance, OCI channel promotion and final automation recovery
as separate results. Promotion must preserve the approved full OCI index, including
runtime-bound attestations, and independently verify the resulting digest. Final
runtime/health proof and the restored updater/scheduler state follow it. No report
should infer a DNS cutover, live authentication activation, successful rollback or
unrelated workload change from these steps.
