---
name: valkyria-delivery
description: Execute or resume a Valkyria implementation task across milestones, coordinate bounded agents, and leave a verified handoff.
---

# Deliver an implementation slice

Read [the agent workflow](../../../docs/engineering/agent-workflow.md) for intake,
task boundaries, parallel ownership and checkpoint format. Read `AGENTS.md` at the
repository root and the assigned issue before deciding what to implement.

1. Inspect the actual checkout, manifests, branch and existing changes. State the
   accepted behavior and the smallest useful execution sequence. Continue authorized
   work; do not turn task intake into another design approval ceremony.
2. Select the relevant skills from [the catalog](../../../docs/engineering/skills.md).
   Preserve fixed product decisions. Record a new ADR only for a material unresolved
   architectural choice, with its consequences for the current task.
3. Implement a vertical slice with its persistence, permissions, UI and meaningful
   evidence. Coordinate shared contracts before parallel work; one integrator owns
   shared files, the lockfile, migration sequence and final delivery.
4. Use `valkyria-verification` on the integrated diff. Resolve material findings,
   then use `valkyria-github` for the authorized issue/PR actions. A skill does not
   grant permission to merge, publish or deploy.
5. Update the checkpoint and `docs/STATUS.md` with actual evidence and next work.
   Do not close an implementation issue because its documentation was prepared.

If a required external input is missing, isolate the blocked acceptance item and
continue independent work. End with behavior delivered, exact revision/checks,
PR or local artifact, unresolved dependencies and the next executable step.
