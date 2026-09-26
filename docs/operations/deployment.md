# Build, publication and deployment

Status: the image build is implemented and smoke-tested in CI and in a cloud container;
publication remains gated and disabled. No registry has been configured, no server changed
and no domain deployed.

## Pipeline

1. Pull request: foundation checks, then real app quality checks when
   `apps/web/package.json` exists. Required status: **Quality gate**.
2. Merge to protected main: rerun CI against the merged revision.
3. Explicit publication: `Publish container` workflow on main, gated by
   `CONTAINER_PUBLISH_ENABLED=true`, registry configuration and the `container-publish`
   environment. Supply `expected_sha` as the full accepted main revision. It reruns CI,
   rejects a different workflow SHA before registry login, then builds an immutable
   `sha-<full commit>` image.
4. Operator verifies digest, migrations and rollback, then deploys the exact image.
5. Prove public routes, requested login/admin behavior, logs and monitoring after deployment.

Publication is deliberately manual until the application exists and operator configuration
is complete. The cloud implementation agent must finish the build pipeline; it must not
pretend the scaffold's green foundation check is a container build or live deployment.

## GitHub configuration contract

| Item | Value / source |
|---|---|
| Repository variable `CONTAINER_PUBLISH_ENABLED` | `false` until first release readiness review |
| Workflow input `expected_sha` | Full accepted main revision; must equal the immutable workflow SHA |
| Repository/environment variable `DOCKERHUB_IMAGE` | Operator-selected existing private `namespace/repository` |
| Environment secret `DOCKERHUB_USERNAME` | Registry username; no live value in source |
| Environment secret `DOCKERHUB_TOKEN` | Least-privilege registry token |
| Environment `container-publish` | Main-only policy; owner review before publishing |
| Production image | Immutable tag or digest, recorded in deployment log |

Do not automatically create a public DockerHub repository: visibility must be verified
before first push. No production SSH credentials are needed in CI. Public pull requests
never receive registry or production secrets; use `pull_request`, not privileged
`pull_request_target` execution of untrusted code. Third-party actions are pinned to
commit SHAs and maintained by Dependabot.

## Docker image (implemented)

`apps/web/Dockerfile` is a multi-stage build from the repository root using the committed
lockfile (`pnpm install --frozen-lockfile`), Node 24 (`node:24-bookworm-slim` pinned by
digest; a registry mirror serving the same digest may be selected with
`--build-arg NODE_IMAGE=…`) and Next.js standalone output. The runtime stage runs as
`valkyria` (uid/gid 10001) in `/app`; application files are root-owned and read-only; only
`/app/storage/editorial` (media volume) and `/app/apps/web/.next/cache` are writable.
It contains the standalone server (`apps/web/server.js`), static assets, bundled CLIs in
`/app/scripts/*.mjs` (`migrate.mjs`, `seed.mjs`, `publish-due.mjs`,
`provision-local-admin.mjs`) and reviewed SQL in `/app/migrations`. The synthetic fixture
loader is bundled separately (`apps/web/dist/dev-cli`) and is not copied into the image. Dependencies are never
installed at container start and migrations never run on web start. No build argument or
layer contains a secret; behind a TLS-intercepting egress proxy the build may receive the
proxy CA only as a BuildKit secret (`--secret id=build_ca,src=…`), which is not persisted.
`SOURCE_REVISION` sets the OCI revision label. CI builds the image (without publishing),
runs the migration CLI twice (idempotency) and starts it read-only with `--cap-drop ALL`,
then checks liveness, readiness, non-root uid and the `/` → `/cs` redirect.

Runtime contract: `HOSTNAME=0.0.0.0`, `PORT=3000`; `GET /api/health/live` checks process
liveness only; `GET /api/health/ready` checks configuration, database reachability (2 s
timeout) and that the latest bundled migration is applied, returning sanitized check codes
and 503 when not ready (verified: stopping PostgreSQL gives live 200 / ready 503, recovery
returns 200 without restart). The Compose cache path `/app/apps/web/.next/cache` matches
the image. SBOM/provenance and an image vulnerability scan are part of the publication
workflow and release readiness; record reviewed exceptions there.

The editorial module also requires persistent private media storage and a bundled
`scripts/publish-due.mjs` runner for due posts. Configure an operator-owned minute timer
with overlap protection; the CLI must still be transactionally idempotent. Monitor last
successful run/overdue schedules, preserve publication intent authorization and audit
execution. This timer is separate from the optional Discord gateway worker.

Contract: `HOSTNAME=0.0.0.0`, `PORT=3000`; `GET /api/health/live` checks process liveness,
`GET /api/health/ready` checks required dependencies with bounded timeouts and sanitized
output. Database unavailable must fail readiness without leaking connection strings.
The live endpoint must still respond so transient DB failure does not cause a restart storm.
Image metadata records source/revision/license. Generate SBOM and provenance, scan
the built image for actionable vulnerabilities and record reviewed exceptions.

The [Compose example](../../infra/compose.production.example.yaml) assumes the standalone
server's cache path is `/app/apps/web/.next/cache`. Verify that against the actual final
image and update the mount if different. It is not a deployable production config yet.

The `editorial-media` volume is writable only for the non-root app identity and is not
a raw public static directory. The image must create `/app/storage/editorial` with the
correct ownership; verify write permissions and publication-aware delivery in the actual
container. Back up media together with DB Asset/AssetUsage metadata and test restoration.
Local development uses an ignored `.local/editorial-media` directory; no uploaded bytes
belong in a Git commit, CI artifact or Docker build context.

## Host integration

Target pattern: outbound HTTPS tunnel → existing reverse proxy → isolated web container.
Connect only to the existing proxy and database networks. Do not open a public application
or database host port. Supply runtime configuration through a host-protected env file;
the source contains only [variable names](../../.env.example). Use a dedicated PostgreSQL
database/user and constrained schema privileges. No Docker socket or host filesystem access.

Serve `https://valkyriawdg.cz`; decide `www` redirect/canonical behavior before DNS setup.
Register the precise Discord callback origin. Apply production cookie/origin checks,
CSP, trusted-proxy handling and no-store policies for login/admin traffic. The old
`valkyriahll.cz` domain must not be changed as a side effect.

## First deployment procedure

- Confirm the image digest corresponds to the accepted main revision and CI results.
- Provision empty project DB/user; snapshot/backup if data already exists. Prove restore
  on a disposable database before any production schema change.
- Review migration SQL, acquire a migration lock, run the image's explicit migration
  CLI as a one-shot job. No automatic schema mutation on every web start.
- Keep previous image digest and config available. Use backward-compatible schema
  expansion so image rollback is possible; roll forward or restore deliberately if not.
- Start only this site's service using the reviewed Compose/config. Check liveness,
  readiness, migrations, logs, public rendering and authentication/authorization.
- Verify default Czech and explicit English routes, the language switcher, per-locale
  published content/metadata and safe localized login returns. Auth callbacks and health
  endpoints remain unprefixed; do not add a locale to the configured application origin.
- Publish approved media separately and verify MIME, byte ranges, cache policy and
  fallback. Verify Discord invite and production callback with an authorized test user.
- Record revision, digest, migration IDs, evidence and rollback decision.

Watchtower is **off in the example**. Auto-pull may be enabled later only for an explicitly
promoted compatible production tag after migration orchestration is solved. Never track
every main build automatically while schema/content contracts are evolving. A digest-pinned
service is updated by the operator; a mutable promoted tag needs a separate release step.

## Operations

Back up the project DB and approved persistent media with a restore drill. Monitor HTTPS,
readiness, error rates and role-sync freshness. Logs must omit tokens, cookies and private
profile content. Define audit retention and privacy handling before launch. Document any
environment-limited check as not run; a responding homepage alone is not auth verification.

Primary references: [GitHub secure Actions](https://docs.github.com/en/actions/reference/security/secure-use),
[Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting),
[Docker build action](https://github.com/docker/build-push-action).
