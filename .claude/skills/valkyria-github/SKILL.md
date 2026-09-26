---
name: valkyria-github
description: Prepare and deliver Valkyria GitHub issues, task branches, pull requests, and exact-revision CI evidence within the current task's authorized scope.
---

# GitHub delivery

Use this skill for the GitHub lifecycle of a Valkyria engineering task. It does not
authorize implementation, remote publication, issue comments, merging or deployment
by itself. Preserve authorization already established in the task; do not ask again
for an action the owner has already requested.

Read [AGENTS.md](../../../AGENTS.md), the assigned issue and current
[status](../../../docs/STATUS.md). Use the
[GitHub workflow](../../../docs/engineering/github-workflow.md) for commands and
[verification matrix](../../../docs/implementation/verification.md) for evidence.
The [backlog](../../../docs/implementation/github-backlog.md) defines milestone scope.
For dependency/Dependabot work, use the workflow's compatibility and pinning procedure.
An explicitly authorized merge uses its verified-head merge procedure without bypasses.

## Run the lifecycle

1. Establish the issue's observable acceptance criteria, dependencies and requested
   delivery: local preparation, commits, branch/PR delivery, or an explicitly broader
   operation. A working token is access, not permission. If remote writing is outside
   scope, finish the local patch and reviewable PR/issue draft.
2. Inspect the checkout, dirty files, branch, remotes and configured Git author before
   changing anything. Use the supplied task branch or create one scoped branch from
   the confirmed base. Do not reset another agent's work, invent an identity, switch
   remotes, force-push or push directly to protected main.
3. Delegate independent work only with explicit file/module ownership, shared contracts,
   acceptance criteria and a return checkpoint. One coordinating agent owns staging,
   GitHub mutations and final verification. Workers do not compete to push or open PRs.
4. Implement and verify the assigned scope using the actual scripts in the checkout.
   Foundation success does not establish app, OAuth, container or live readiness.
   Reconcile changes at dependency boundaries and review worker evidence before delivery.
5. Review the staged diff and attribution, then commit/push/open or update a scoped PR
   only as authorized. Use the repository PR template, concrete behavior, issue links,
   evidence and remaining limitations. No AI co-author, generated-by or session footer.
6. Check the PR's current head SHA, the CI run for that revision and required
   **Quality gate**. A later push invalidates previous evidence. Do not treat skipped,
   cancelled, absent or pending required checks as passing, or relax protection to finish.
7. Leave incomplete issues open. Use closing keywords only when the PR fulfills the
   entire issue and its required evidence; a mock or an unrun acceptance check is not
   completion. Implementation PR merge, releases and production actions need their
   own task authorization and applicable runbook.
   Before any completion or automatic closing keyword, add the issue/incident's
   [acceptance proof](../../../docs/engineering/evidence.md) with captioned screenshots
   when applicable and accessible artifact links. Mirror the relevant proof in the
   PR, verify saved links, and keep incomplete evidence open.
8. Hand over the exact commit/PR/run, acceptance coverage and pending work in
   `docs/STATUS.md` and the final response. Keep status truthful if a credential or
   environment blocks an integration while continuing independent authorized work.

## Uncertain outcomes and communication

After a timeout or lost response to push, issue edit or PR creation, read remote state
before retrying. Match branch/head/base or the intended issue fields; never create a
second PR because the first response was missing. Inspect failures before rerunning CI.

The owner's standing instruction authorizes evidence updates/comments for the assigned
PR and its related issues/incidents before closure. Use this scope for acceptance
proof, not unrelated comments, review requests or notifications. Those still require
their own authorization. Read existing comments before retrying an uncertain write.
