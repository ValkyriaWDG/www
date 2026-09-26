# Application engineering workflows

Use this guide for a scoped frontend, backend or authentication task. It supports the
[working agreement](../../AGENTS.md); it does not replace the canonical product,
design, data or security contracts. The [current status](../STATUS.md) distinguishes
the repository foundation from implemented application behavior.

## Task intake and completion

1. Inspect the branch, working tree, assigned issue/request and relevant existing code.
   Preserve unrelated work. Identify the intended user-visible change and its milestone.
2. Read the applicable canonical contract, then map the route/use case, state transitions,
   actor/scope and acceptance evidence. Ask only about a genuinely blocking decision;
   use the accepted defaults for language, domain, architecture and visual direction.
3. Check package manifests and installed tooling before choosing commands. At foundation
   stage, `node scripts/check-foundation.mjs` exists; the application commands in the
   [plan](../implementation/plan.md) are requirements for implementation, not available
   commands by implication. Bootstrap actual scripts when that is the assigned task.
4. Complete one useful vertical slice through the affected UI/server/data boundary.
   Add failure states and meaningful tests alongside the behavior. Do not replace a
   missing integration with invented production data or passing placeholder scripts.
5. Run the applicable checks, inspect their output and fix failures within scope.
   Check documentation/status against reality. Finish with behavior, evidence, changes
   to contracts/configuration and precise unresolved dependencies.

Use [verification](../implementation/verification.md) to select checks and the
[cloud handoff](../handoff/claude-code-cloud.md) for M1–M3 sequencing. Application
development, publishing an image and deploying production are distinct operations;
this guide grants no additional external access. Follow the assigned scope and
[deployment runbook](../operations/deployment.md) for release work.

## Frontend

### Sources and boundaries

Read the target route in the [screen map](../design/screen-map.md), the applicable
[visual spec](../design/visual-spec.md), and its real reference image. Inspect current
layouts/components before introducing primitives. Public navigation is English-only
and includes primary `NEWS`; preserve `HLL WEBSITE` on desktop/mobile. Keep the
Wardogs composition, supplied faded emblem and accessible web semantics together.

Use App Router's persistent public layout for the backdrop. Keep content/navigation
usable before media arrives. Server components own data rendering; client components
own browser interaction. Only public DTOs cross into the public client. Do not import
database/auth internals or the rich editor bundle into public page components.

### Work sequence

1. Implement route metadata, heading and a meaningful initial/empty state with the
   shared shell. Preserve direct URLs, reload and browser back/forward.
2. Add the needed interaction and relevant pending/error states without hiding the
   only action behind hover. Make focus, names/labels and keyboard order deliberate.
3. Build the responsive composition at desktop and narrow widths. Avoid fixed-height
   clipping, nested scroll traps and content-wide overflow; test long names/articles.
4. For forms, connect validation, mutation and returned state. UI permissions are a
   convenience; the server must separately protect every private operation.
5. Inspect actual browser output before accepting or propagating a component pattern.

For news/page/match editing, use the [canonical rich-editor workflow](../product/editorial-and-matches.md):
Tiptap/ProseMirror visual controls, cover/inline media, safe supported formatting,
draft autosave, revision history, private preview and explicit publication. Test a
nontechnical author's complete task, not merely whether the editor mounts. Publishing
and media permissions follow their domain; a content editor is not a match manager.

### Required evidence for affected behavior

| Change | Meaningful verification |
|---|---|
| Menu/layout | Deterministic desktop/mobile captures compared to the relevant reference; no central marketing block or cropped controls |
| Navigation/list/detail | Direct URL, refresh, back/filter state, focused link, empty/error and long-name states |
| Media controller | Missing video, rejected autoplay, pause persistence, hidden tab; verify no video request under reduced-motion/save-data |
| Rich editor | Format + image/cover → save/reload → preview → publish; autosave/revision restore leaves live output unchanged |
| Schedule controls | Explicit timezone, cancellation, overdue/blocked state and real server outcome rather than a cosmetic datetime input |
| Forms | Validation, pending, success, failure, stale edit and permission/session loss; no false saved confirmation |
| Accessibility | Keyboard sequence/focus, names and headings, measured contrast, reduced motion, zoom and mobile overflow |

Use the [specified capture sizes](../design/visual-spec.md#12-visual-acceptance-evidence)
and deterministic approved/synthetic media. Record browser, viewport, revision and
media state. Browser automation or a screenshot path must refer to a real launched
application. Automated accessibility output complements manual interaction; it is
not a certification. Missing final video limits fidelity evidence, not completion of
the independent fallback and layout work.

## Backend

### Define the contract before the handler

For the assigned use case, identify input schema, principal/capability, object scope,
current/target state, transactional invariants and intended output. Use the
[architecture boundaries](../architecture/overview.md) and [domain model](../architecture/data-model.md).
Route handlers/server actions compose modules; database repositories and policy remain
server-only. Public output is an explicit published projection, never a serialized row
with private fields removed ad hoc in the browser.

### Work sequence

1. Trace every entry point to the use case. Validate input sizes/enums/identifiers and
   enforce capability/resource scope server-side, including private reads.
2. Implement state transitions and concurrency with appropriate PostgreSQL constraints,
   transactions and optimistic version checks. Review any generated migration SQL.
   Use a disposable development/test database; production migration is separate scope.
3. Apply publication and cache policy at query, metadata, media-delivery and mutation
   boundaries. Authenticated/admin responses are private/no-store.
4. Return useful domain errors with redacted logging/audit information. Preserve
   retryability without leaking secrets or mistaking failed writes for success.
5. Test at the repository/use-case boundary with PostgreSQL and at a direct API/action
   boundary where bypassing UI restrictions could change access or state.

### Product invariants

- News/blog is one collection. Draft autosave/restore creates draft state only; live
  body and metadata come from the published revision. Scheduled updates target one
  immutable saved revision and leave the existing public revision visible until applied.
- Validate supported rich-text nodes, marks, attributes and URLs server-side. A safe
  toolbar alone does not make a posted JSON document safe to render.
- Editorial image uploads require actual decoded-type/size/pixel checks, safe derivatives,
  scoped private storage and publication-aware delivery. Referenced assets cannot be
  deleted in a way that breaks published content. Unpublishing/revocation includes
  anonymous delivery and cache behavior, not just removing the asset from a UI list.
- The publisher is a durable idempotent CLI with an operator-installed timer. Atomically
  claim/process due intent, revalidate delegated authority, record audit and invalidate
  affected cache. Cancellation, retry and stale intent cannot publish twice or publish
  a later unsaved draft. A working CLI does not prove the live timer is installed.
- Match create/schedule/publish/result entry belongs to M2. Scores can be unknown, game
  rules differ, and event time is separate from publication time. M4 adds roster and
  availability invariants only when assigned.

For these details, use [editorial and match management](../product/editorial-and-matches.md)
and [auth/RBAC](../security/auth-rbac.md) as the maintained source rather than copying
new policy into endpoint comments.

### Meaningful test selection

Exercise fresh/upgrade migrations when schema changes; successful and denied use cases;
draft/future/private content through direct URLs/API/metadata/media; malicious supported
input boundaries; stale revisions; query pagination; and transaction rollback. For
scheduling, prove due/cancel/reschedule/retry, timezone/DST and revoked issuer behavior,
including the separate local-admin delegation case. Use synthetic data and mock external
services at their adapters. A unit test that mocks away the publication query cannot
prove publication filtering in PostgreSQL.

## Authentication

Read [the complete authentication contract](../security/auth-rbac.md) before altering
auth behavior. It owns freshness limits, capability mappings, session assurance,
recovery, integration transport and scheduled-publication delegation. Do not infer
those rules from screenshots, Discord role names or a library's default examples.

### Work sequence

1. List affected actor types: anonymous, signed-in outsider/member, editorial/match
   roles, administrator/owner and provisioned local recovery principal as applicable.
   Identify interactive versus delegated service execution.
2. Inspect the actual pinned library API and official documentation. Use library-managed
   OAuth/session/MFA primitives, then enforce project-specific policy at every server
   access boundary. Neither middleware nor hidden buttons cover direct requests.
3. Keep identity, guild membership, public profile publication and application grants
   separate. No automatic privilege from login, display name, matching email or a
   Discord administrator flag.
4. Implement explicit stale/revoked/unknown/outage states and invalidation. Public
   content remains available while protected Discord-derived operations fail according
   to policy. The scoped local recovery path remains independent of Discord freshness.
5. Test assurance and negative paths with durable session/policy state and synthetic
   identities. Inspect logs/responses/client bundles for leaked secrets/private data.

### Focused security journeys

| Boundary | Evidence |
|---|---|
| OAuth/session | Malicious return URL, invalid/expired flow, absent provider email, expiry/logout/revocation; unavailable-provider UI |
| Roles | Unmapped/wrong guild, stale/removed membership, changed mapping version, 429/outage; browser-posted roles are never authority |
| Object scope | Direct cross-user/cross-match requests and editor-to-match/global-settings escalation are denied |
| Local recovery | Provisioned credential + MFA assurance; incomplete setup, public signup and social linking/callback cannot obtain the grant |
| Discord outage | Discord-derived access follows failure policy; valid narrow local recovery works without a fabricated Discord snapshot |
| Scheduled authority | Exact immutable publication intent, issuer/grant revalidation and revocation; no stored/replayed user session or MFA credential |

When optional role-event integration is assigned, also test authentication, replay,
out-of-order snapshots and departure invalidation. A contract/mock alone is not live
gateway evidence. Do not add bot messaging or live-guild tests without task authorization.

## Evidence and checkpoint format

Keep results short and reproducible in the relevant PR and [status](../STATUS.md):

- Implemented behavior and affected routes/use cases, including important denial/failure behavior.
- Exact commands/scenarios, revision and `passed`, `failed`, `blocked` or `not run` result.
- Screenshot/report paths and environment context where they support the claim.
- Schema/configuration/operational implications and the concrete next step if blocked.

Do not expose credentials, private drafts/rosters or raw provider payloads in evidence.
Do not convert an environment limitation into a success claim. If a check cannot run,
complete the independent work, state the missing prerequisite and leave a runnable
command/checkpoint for the next environment. Preserve the repository's attribution
and external-action rules when handing off or opening a scoped PR.
