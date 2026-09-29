# Automatic updates from the production channel

Valkyria uses one dedicated updater for `valkyria-web`. Every 300 seconds it checks
`majorluk/valkyria-www:production`. HLL and Wardogs share that web container.
Unrelated workloads and the old HLL site are outside this update scope.

## Publication and promotion

The **Publish container** workflow remains a manual, main-only operation with an
accepted `expected_sha`, full CI and the `container-publish` environment gate.
An ordinary source push does not publish or deploy a container. Immutable
`sha-<commit>` tags remain the release evidence and rollback references.

When repository variable `WATCHTOWER_PROMOTION_ENABLED=true`, the publisher may
advance `production` after verifying the immutable candidate. It compares the
actual image migration directory, migration runner and default runtime contract
with the current production image. A difference holds the candidate for an
operator; unknown state or registry errors fail closed. The gate does not run
migrations, edit live configuration or bypass the existing release qualification.
Byte equality does not prove every semantic or external integration change is
compatible: the accepted SHA still requires release review.

Promotion copies the existing OCI index, including attestations, and verifies the
resulting alias digest. It does not retag a locally pulled platform image. CI
promotions share one concurrency group. Registry tags do not support an atomic
compare-and-swap; operators must not mutate the channel concurrently with a
publisher, including between its final source check and alias write.

Bootstrap the channel only from a verified, currently accepted image. Never
interpret a missing tag or registry failure as permission to choose a new source.
The initial 2026-09-29 seed reused the accepted `e5d7276` image without rebuilding
or altering its immutable tag.

## Runtime configuration

Use the [dedicated Compose file](../../infra/compose.watchtower.example.yaml).
The updater is pinned to the reviewed maintained
[Watchtower v1.22.3 release](https://github.com/nicholas-fedor/watchtower/releases/tag/v1.22.3)
by digest. It negotiates the Docker API version. The application Compose file must
retain the mutable channel and these explicit labels:

```yaml
image: majorluk/valkyria-www:production
container_name: valkyria-web
labels:
  com.centurylinklabs.watchtower.enable: 'true'
  com.centurylinklabs.watchtower.scope: valkyria-web
```

The updater requires **all three** selectors: this container name, the scope and
the opt-in label. Compose dependency expansion is disabled. The updater excludes
itself, has no published ports, no HTTP API and no stopped-container revival.
It uses the default Docker bridge for registry access, not the app/database
networks. No registry credential mount is needed for the approved public image.
Its Docker socket nevertheless grants host-level control; resource limits and
read-only root do not make that socket read-only authorization.

Do not restart an old shared Watchtower or enable updates on other containers.
Do not enable image cleanup until retained rollback artifacts have a separate
retention policy. Updating this pinned updater is a separate reviewed operation.

Watchtower does not edit Compose, `.env` or historical deployment records. Read
the current source from the running image object, rather than assuming a previous
operator's `deployed-revision` file is current:

```sh
docker inspect valkyria-web --format '{{.Image}}'
# Inspect that returned image ID:
docker image inspect <image-id> --format '{{index .Config.Labels "org.opencontainers.image.revision"}}'
docker logs --since 10m valkyria-watchtower
```

## Schema/configuration changes and rollback

For a held candidate, stop the updater before maintenance. Follow the existing
[deployment](deployment.md) and [database](../engineering/database-workflow.md)
runbooks: reviewed backup/restore, explicit one-shot migration and compatible
image verification. After acceptance, promote its exact OCI index, restore the
web's channel reference and verify readiness before resuming the updater. Do not
remove migration records or run migrations implicitly at application startup.

For an image rollback, stop `valkyria-watchtower`, pin a previously accepted
schema-compatible digest in the web Compose environment, recreate only `web`,
then verify `/api/health/ready`, canonical CS/EN HLL/WDG routes and media. Reconcile
the channel before resuming updates, otherwise the rejected image will return.
Do not restore an old database over newer writes as an image rollback shortcut.

Watchtower is not an automatic rollback controller. A restart can briefly interrupt
the single web instance. Its health handling does not guarantee application
readiness, and the image healthcheck tests liveness only. Monitor full readiness
and investigate failed update sessions. No notification delivery is implied by
starting the updater.

## Verification

Capture sanitized image/source identity, selectors, interval and one natural poll.
Verify unchanged-digest polls do not restart the app, all readiness checks pass,
app environment/mounts/security survive the initial recreation and no unrelated
container changes. Preserve config snapshots privately for recovery.

A successful unchanged-image poll proves selection and connectivity, not a future
replacement or rollback. Record those separately. Screenshots are N/A for this
infrastructure change; runtime observations and focused release-gate tests are
the relevant proof.
