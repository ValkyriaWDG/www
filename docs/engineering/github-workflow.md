# GitHub engineering workflow

Use this guide for issues, task branches, PRs and CI in `ValkyriaWDG/www`.
[AGENTS.md](../../AGENTS.md) governs implementation;
[the plan](../implementation/plan.md) and [backlog](../implementation/github-backlog.md)
govern scope. The [verification matrix](../implementation/verification.md) defines
required evidence; [deployment](../operations/deployment.md) governs release work.

## Authority and preparation

Work autonomously inside the owner's current assignment and existing authorization.
Neither a GitHub token, a skill invocation nor a request to prepare a release grants
permission to execute every available operation.

| Action | Scope rule |
|---|---|
| Inspect files, issue/PR state and CI | Read-only discovery for the assigned task |
| Edit and verify local work | Complete the requested deliverable; preserve unrelated changes |
| Create local commits | Follow the requested delivery and configured identity |
| Push a task branch, create/update its PR | When scoped GitHub delivery is authorized; otherwise prepare a local draft |
| Create/edit/close issues or change labels/milestones | Only when issue management is in scope |
| Update assigned PR/issue/incident with acceptance proof | Owner-requested task-scoped evidence updates/comments; follow the evidence policy |
| Post unrelated comments, request reviews, notify people | Requires separate communication authorization |
| Merge implementation PR, enable auto-merge, publish tag/release/image, deploy | Separate explicit scope; ordinary implementation delivery stops at a reviewable PR |
| Change protection, repository settings or credentials | Requires that administration task; never a workaround for failed delivery |

Honor authorization already given; do not request it again at every step. If an
action is not covered, first complete the concrete local artifacts, verification and
draft so only that action remains undecided. An unavailable credential blocks the
dependent remote action, not independent local work.

Examples below use Bash in a cloud checkout from the repository root. Set variables
from observed task/repository values. They are not commands to run indiscriminately.
Do not paste secrets into command arguments or print credential values.

## Identify the checkout and acceptance unit

```sh
REPO=ValkyriaWDG/www
git status --short
git branch --show-current
git remote -v
git remote get-url --push origin
git var GIT_AUTHOR_IDENT
gh auth status
gh repo view "$REPO" --json nameWithOwner,defaultBranchRef,url
```

Confirm `origin` is the intended authorized push destination. A fork/cloud branch may
differ from the canonical repository: preserve the supplied branch and remote, and
adapt the head repository explicitly. Do not rewrite a remote or create a fork merely
to make a command succeed. Missing author identity is a configuration dependency;
never synthesize an identity or change global Git configuration.

```sh
gh issue view "$ISSUE_NUMBER" --repo "$REPO" --json number,title,body,state,labels,milestone,url
gh pr list --repo "$REPO" --state open --json number,title,headRefName,baseRefName,url
```

Read the issue, its prerequisites and relevant canonical docs. Record the outcome,
included/excluded scope, observable acceptance criteria, dependency issues/assets,
and evidence required for completion. Distinguish implementation blockers from live
verification inputs. Labels/milestones organize work but do not replace dependencies.
Preserve acceptance text during an authorized update; do not reduce scope silently.

For authorized issue editing, prepare and inspect an exact UTF-8 body file outside
tracked source, then use
`gh issue edit "$ISSUE_NUMBER" --repo "$REPO" --body-file "$ISSUE_BODY_FILE"`.
For a requested new issue, first search duplicates with
`gh issue list --repo "$REPO" --state all --search "$ISSUE_TITLE"`, then use
`gh issue create --repo "$REPO" --title "$ISSUE_TITLE" --body-file "$ISSUE_BODY_FILE"`.
Do not automatically assign people or post a redundant comment alongside the edit.
Use the owner's standing evidence instruction for scoped acceptance updates/comments.

## Branches, delegation and checkpoints

Use the supplied task branch. If none exists and the worktree is clean, fetch the
confirmed base and create a descriptive `feat/`, `fix/`, `docs/` or `chore/` branch:

```sh
git fetch origin main
git switch -c "$WORK_BRANCH" origin/main
```

This assumes the verified canonical origin and base `main`; adapt deliberately for
a supplied fork/base. Never reset an existing branch to follow the example. Isolate
another task's changes or agree a file boundary instead of stashing/cleaning them.

For parallel agents, the coordinator assigns disjoint file/module ownership, shared
interfaces, acceptance criteria, evidence, forbidden files and a return checkpoint.
Workers report changes/checks/blockers; they do not commit/push or mutate GitHub unless
one worker is explicitly delegated that already-authorized operation. Integrate at
shared-contract boundaries, after dependency changes and before final verification.
The coordinator remains responsible for the combined diff and acceptance outcome.

Keep checkpoints for scope/dependencies, integrated implementation, verification at
a recorded commit, and remote PR/CI outcome in [STATUS](../STATUS.md). A replacement
agent should be able to resume without repeating completed mutations.

## Local verification and authorship

Inspect `package.json`, package scripts and current CI before choosing commands.
The foundation currently provides:

```sh
node scripts/check-foundation.mjs
node scripts/check-commit-attribution.mjs
node --test scripts/tests/*.test.mjs
git diff --check
```

Once the app exists, run its real applicable checks from the verification matrix and
`ci.yml`. No invented `pnpm test` results, no-op scripts or claims that a skipped
Application job verifies the site. Mark not-run/blocked checks explicitly.

Stage only owned files and inspect `git diff --cached` before a focused conventional
commit. Avoid `git add .` in a shared checkout. Preserve human attribution and
`.claude/settings.json`; no AI co-authors, generated-by text or cloud session URLs.
Do not rewrite unrelated history. After committing, record `git rev-parse HEAD` and
check the changed range, e.g.
`node scripts/check-commit-attribution.mjs "origin/main..HEAD"`.

## Dependency and Dependabot PRs

Read the changed dependency's primary release notes/changelog and compatibility
requirements, plus the exact manifest/lockfile/workflow diff. Check runtime support,
breaking API or migration changes, lifecycle scripts and security fixes relevant to
this repository. Keep third-party Actions pinned to immutable commit SHAs with a
readable version comment; pin application libraries to exact versions with the
updated lockfile. Do not replace a SHA pin with a floating tag to resolve a conflict.

Run the same meaningful checks applicable to the changed behavior: dependency-free
foundation changes need foundation checks; application/auth/database/build changes
also need their implementation checks. A bot-authored PR or successful dependency
resolution does not prove compatibility. Verify CI on its current head, document
any required code/configuration changes, and never merge blindly or enable blanket
auto-merge for future updates. Apply the same separate merge authorization below.

## Authorized branch and PR delivery

Confirm the reviewed changes are committed. This canonical-origin example must
never target main. Run the block in a Bash subshell so any failed guard stops it:

```sh
(
set -euo pipefail
WORK_BRANCH=$(git branch --show-current)
test -n "$WORK_BRANCH"
test "$WORK_BRANCH" != main
git check-ref-format --branch "$WORK_BRANCH"
HEAD_SHA=$(git rev-parse HEAD)
git push --set-upstream origin "HEAD:refs/heads/$WORK_BRANCH"
gh pr list --repo "$REPO" --head "$WORK_BRANCH" --state all --json number,state,headRefName,baseRefName,url
)
```

The subshell's branch/SHA variables do not persist: set them again from the inspected
checkout before a later PR command. Do not remove the guards to bypass a failure.

Update an existing relevant PR instead of duplicating it. Prepare its body using
[the PR template](../../.github/pull_request_template.md) in an untracked temporary
UTF-8 file. Use real newlines and `--body-file`, never interpolate body text into
shell commands. Review for private data and unsupported claims.
`gh pr create --dry-run` is not a read-only preview: it may still push.

For a new authorized PR in this same repository:

```sh
gh pr create --repo "$REPO" --base main --head "$WORK_BRANCH" --draft --title "$PR_TITLE" --body-file "$PR_BODY_FILE"
```

Explicit `--head` prevents the CLI from interactively pushing or forking. For an
existing PR, use
`gh pr edit "$PR_NUMBER" --repo "$REPO" --title "$PR_TITLE" --body-file "$PR_BODY_FILE"`
only within authorized PR delivery. If the cloud integration already created the
PR, inspect that one. Do not request reviews or unrelated comments as a side effect.
Mark a draft ready only when its acceptance is met and that transition is in scope;
otherwise explain remaining items.

Use `Refs #N` for partial work. Use `Closes #N` only when the PR fulfills the complete
issue and its evidence: GitHub closes it after merge into the default branch.
Code written, PR opened or foundation CI passing does not complete an issue. Keep
live acceptance open when only mocks ran. A code-only subtask can close independently
only if that was its stated scope.

Follow [the evidence policy](evidence.md): attach feature/fix proof with captions and
real screenshots when applicable to the PR and the related issue/incident before
completion. Verify the uploaded artifacts are accessible, and record a justified N/A
with alternate proof for nonvisual work. Add the issue's acceptance/recovery summary
before a closing keyword can take effect. Missing or expired proof is incomplete
acceptance, even when CI is green. This is a delivery requirement; foundation CI does
not automatically validate the contents of remote screenshots or closure comments.

## CI evidence for the current revision

Main uses a PR flow, required **Quality gate**, resolved conversations and linear
history. Inspect current protection as necessary; never weaken it to deliver.
[CI](../../.github/workflows/ci.yml) runs Foundation, Application when present,
and the aggregate Quality gate.

```sh
gh pr view "$PR_NUMBER" --repo "$REPO" --json url,headRefOid,headRefName,baseRefName,statusCheckRollup,mergeStateStatus
PR_HEAD_SHA=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json headRefOid --jq .headRefOid)
gh pr checks "$PR_NUMBER" --repo "$REPO" --json name,state,bucket,link,workflow
gh pr checks "$PR_NUMBER" --repo "$REPO" --required
gh run list --repo "$REPO" --workflow ci.yml --commit "$PR_HEAD_SHA" --event pull_request --json databaseId,headSha,status,conclusion,url
```

Select `RUN_ID` from that result, not an older successful run:

```sh
gh run view "$RUN_ID" --repo "$REPO" --json headSha,event,status,conclusion,jobs,url
gh pr view "$PR_NUMBER" --repo "$REPO" --json headRefOid --jq .headRefOid
```

Require the final PR head to equal the recorded head, the matching CI run to complete
successfully and the required Quality gate to pass. Inspect underlying jobs:
Application may be skipped only while foundation-only. No matching run, no required
check returned, pending, cancelled, skipped required gate, stale head or inaccessible
results means verification is incomplete.

PR workflows may check out a synthetic merge revision. Record that context and
associate it with the PR head/base; do not label its artifact an exact-head build.
If the base or head changes, read the new checks and repeat applicable verification.
A passing historical main run proves neither this PR nor a published image.
Publication has its own gated workflow and release contract.

For failures, inspect
`gh run view "$RUN_ID" --repo "$REPO" --log-failed`, diagnose, fix, and verify the
new head. Retry only when evidence justifies it and rerun is authorized; never retry
publication as routine CI repair. Use bounded observations while continuing useful
independent work; pending CI does not justify repeated remote status comments.

## Merge only when the task explicitly includes it

Ordinary implementation delivery ends at the reviewable PR. If the owner has already
authorized merging this specific PR/scope, do not request the same authorization again.
Confirm its complete acceptance, current head/base, review requirements, resolved
conversations and successful required Quality gate immediately before the merge.
Retain the verified `PR_HEAD_SHA`; do not overwrite it with a newer unverified head.
Inspect the squash title/body for correct human attribution and no generated footers.

For an authorized merge using this repository's preferred squash strategy:

```sh
gh pr merge "$PR_NUMBER" --repo "$REPO" --squash --match-head-commit "$PR_HEAD_SHA"
gh pr view "$PR_NUMBER" --repo "$REPO" --json state,mergedAt,mergeCommit,headRefOid,url
```

Never use `--admin`, weaken branch protection or bypass the required checks. A head
mismatch requires fresh review and CI evidence before another attempt. Do not add
`--auto` or `--delete-branch` unless that behavior is also requested. If branch policy
now requires a merge queue, inspect that requirement before executing: the CLI may
enqueue instead of completing a merge. Report queued/pending as such and observe its
eventual result within the task scope. Do not claim merged from the command exit alone.
If the command times out, read PR state and merge commit before retrying. A merge does
not authorize tags, releases, image publication, deployment or external announcements.

## Read before retry and finish with evidence

A timed-out mutation may have completed. Before retrying a push, read
`git ls-remote origin "refs/heads/$WORK_BRANCH"` and compare the intended SHA.
Before repeating PR creation, list PRs for the intended head/base and inspect the
returned one. Before repeating an issue/PR edit, fetch its body and compare fields.
If the outcome remains ambiguous, preserve the draft, report uncertainty and stop
that mutation; never duplicate it or force it through.

Hand over resulting behavior, acceptance met/pending, commit, PR/current-revision CI
links, commands/results, visual artifacts and blockers/next work. Keep durable
evidence in `docs/STATUS.md` without secrets, private roster data or transcripts.
Opening a PR does not authorize merge, release, image publication or production work.

CLI semantics: [GitHub CLI manual](https://cli.github.com/manual/).
