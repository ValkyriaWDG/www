# CI action compatibility review

Consolidates dependency PRs #10–#14 into one reviewed change. Action references stay
immutable SHA pins; future weekly GitHub Actions updates are grouped for review.
Grouping does not enable automatic merging or bypass the Quality gate.

| Action | Reviewed version | Compatibility with this repository |
|---|---|---|
| [setup-node](https://github.com/actions/setup-node/releases/tag/v7.0.0) | 7.0.0 | Node 24 action runtime/ESM; explicit pnpm cache remains in Application. Disable automatic package caching in Foundation and the privileged publication job. No registry-url or dummy NODE_AUTH_TOKEN reliance. |
| [action-setup](https://github.com/pnpm/action-setup/releases/tag/v6.1.0) | 6.1.0 | Reads the existing packageManager pin (pnpm 10.34.5); newer pnpm support does not upgrade this project's package manager. Its separate cache is off by default. |
| [setup-buildx](https://github.com/docker/setup-buildx-action/releases/tag/v4.4.1) | 4.4.1 | Node 24/ESM; no removed inputs or outputs were used. Default managed builder is appropriate for the hosted Linux runner. |
| [build-push](https://github.com/docker/build-push-action/releases/tag/v7.4.0) | 7.4.0 | Existing context/file/platform/tag/build-args/provenance/SBOM inputs remain supported; removed legacy environment variables are not used. |
| [login](https://github.com/docker/login-action/releases/tag/v4.6.0) | 4.6.0 | Existing username/password DockerHub contract remains; no deprecated inputs or cloud authentication are used. |

The reviewed major-release notes require Actions Runner 2.327.1 or newer for Node
24. The workflows use GitHub-hosted `ubuntu-latest`; capture the actual runner
version in current CI. Self-hosted runners would need explicit version qualification.

Application now executes the same pinned Buildx/build action family with `push: false`
and `load: true`. The resulting real image feeds the existing runtime smoke, scan
and SBOM checks. Local-load attestations are disabled; the manual publication job
retains registry provenance and SBOM. This exercises action compatibility without
registry credentials or publication. Application's package cache remains explicit.

The publication workflow still requires workflow_dispatch, main, the enable flag,
the protected environment, accepted exact revision and a successful reusable CI.
Its registry login/push path is reviewed but not executed by ordinary PR CI. Report
this limit rather than claim a production publication test. No new secrets,
permissions, production tag, deployment or network route are introduced.

## Verification record

Run foundation/tooling, workflow syntax checks and the complete current-head CI.
Inspect runner version, frozen pnpm installation and action-built image smoke results.
Attach the exact run and any failure diagnosis to the consolidated PR before merging.
Screenshots are not applicable: this changes CI execution, with logs, runtime probes
and artifacts providing the relevant evidence. Existing UI regressions remain required.
