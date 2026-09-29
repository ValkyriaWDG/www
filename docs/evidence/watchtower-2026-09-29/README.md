# Scoped Watchtower acceptance — 2026-09-29

Issue [#62](https://github.com/ValkyriaWDG/www/issues/62). This operation enables
automatic consumption of a qualified `production` image channel for the shared
HLL/Wardogs web. It does not change application source, schema, DNS, authentication
or providers. The application remains accepted source
`e5d7276f7dd7215dc2f5e402a6bbf3c7a3228f3e`.

## Configuration and observed behavior

- [Channel bootstrap](channel-seed.json): authenticated metadata verified the
  approved public DockerHub repository. The existing accepted image's complete
  OCI index was copied byte-for-byte to the previously absent `production` tag,
  preserving attestations and leaving its immutable revision tag untouched.
- [Installation](install-result.json): accepted at 10:19:26 UTC. The same web image
  was recreated with the mutable reference and explicit enable/scope labels.
  Environment values, app security, networks, mounts and unrelated container
  identities/start times matched. Both scheduled timers resumed. No migration ran.
- [Independent runtime/public checks](verification.json): a natural scheduled
  poll selected one container, failed zero updates and correctly performed no
  replacement because the digest was unchanged. The app did not restart after
  acceptance. All four readiness checks, 13 public page/health/robots requests
  and one MP4 byte-range request passed. The updater negotiated Docker API 1.54
  with Engine 29.3.0 and has no published ports or application/database network.
- [Real-image gate checks](real-image-gate.json): the actual production image was
  accepted as unchanged. The actual previous `e03d3c5` image was held because its
  migration bundle differs, despite matching runtime defaults. This read-only
  probe explicitly replaced the registry-copy adapter with a refusal. No image
  code ran and no registry mutation was possible during the probe.
- [Tooling tests](tooling-tests.txt): 168 passed, zero skipped, including 42 new
  production-channel cases. Independent review reran those 42 cases. Foundation
  and whitespace checks passed. Exact PR CI is linked in the PR/issue acceptance
  comment; these local checks alone do not represent a fresh application release.

The [runbook](../../operations/watchtower.md) and
[Compose configuration](../../../infra/compose.watchtower.example.yaml) define
the 300-second interval, name/scope/enable filters and rollback procedure.
The publisher remains manual/main-only and runs complete CI. Its new opt-in
promotion step holds changed migration/runner/runtime bundles for operator review.
Repository variable activation and merge are recorded in the issue/PR readback.

## Initial verifier corrections

The first two installation attempts aborted on order-sensitive comparisons of
Docker environment and bind-mount arrays, respectively. Both rolled back to the
previous digest/configuration and restored healthy service and timers. Inspection
confirmed equal environment key/value maps and equal mount sets; no value change
was waived. The corrected third attempt compared those collections semantically,
while retaining ordered entrypoint/command comparisons and exact security limits.
Protected snapshots remain on the host; raw environment/inspect data is omitted.
An early poll verification before the scheduled time reported pending, not success.
The parser was then aligned with this fork's `Update session completed` log format
and lowercase counters before the successful independent verification.

## Reproduce and limits

```sh
node --test scripts/tests/production-channel.test.mjs
node --test scripts/tests/*.test.mjs
node scripts/check-foundation.mjs
docker inspect valkyria-web --format '{{.Config.Image}} {{.Image}}'
docker logs --since 10m valkyria-watchtower
curl --fail https://valkyria.cz/api/health/ready
```

Use authorized Docker access. Inspect the running image object's OCI revision,
verify all three selection filters, and compare the digest with `production`.
Readiness must report `config`, `database`, `schema` and `media` as `ok`.
The real-image report records the tested helper SHA-256, exact image references,
bundle hashes and runtime hashes; it can be reproduced with the promotion helper
using a copy-refusing adapter and those two images.

Screenshots: **N/A**; this changes infrastructure and release tooling, not UI.
An unchanged-image poll is not an actual update/replacement test. No automatic
rollback or alert delivery is claimed. The single web instance may briefly
interrupt requests during replacement. Semantic application compatibility still
requires review of the accepted SHA. Existing browser-network issue #46 remains
open; these HTTP checks do not supersede its failed browser acceptance.
