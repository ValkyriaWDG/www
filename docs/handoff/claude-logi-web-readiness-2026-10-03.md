# Claude Code handoff: website, Logi readiness and administration

Prepared on 3 October 2026. The owner stopped the previous implementation session
to transfer work to Claude, then explicitly authorized committing/pushing the
handoff and autonomous website delivery. This document is the continuation prompt
and review brief. Treat the existing work as a candidate that needs your own review.

## Your assignment

Continue improving `ValkyriaWDG/www`, the shared Czech-first, Czech/English Valkyria
website for Hell Let Loose and Wardogs, served at `https://valkyria.cz`.
Inspect the actual website and code, independently review the supplied work, fix
confirmed problems, and deliver a focused, tested PR with visual evidence. Preserve
the two game-inspired designs and the shared CMS, identity, database and deployment.

### Original owner request, translated and consolidated

> We have made substantial progress on the website and Logi is almost ready, but
> I still cannot see “Sign in with Logi” on the frontend. Find out whether it is
> missing from the UI or the integration. On Wardogs, the menu/actions and icons
> have become too small; they used to look better when larger. Inspect what Logi
> can provide, including Ninjonik/logi PR #158, and prepare the website API
> connectors to consume the appropriate data. Audit visible bugs and unfinished
> details on both games, and missing or incorrectly configured administration
> features, including FAQ and Field Manual editing. Synchronize with Logi where
> appropriate. Use agents with clear ownership and open the live website in a
> browser so you can see the actual problems.

The subsequent owner instruction was to stop implementation and prepare this
handoff, including findings, pending work and an independent review assignment.

## Explicit owner authorization for autonomous delivery

The owner then instructed, on 3 October 2026:

> Add that Claude should commit, merge and publish automatically. The website is
> not officially launched yet, so Claude has full authority. Also commit and push
> the work already prepared.

For this Valkyria website assignment, you are explicitly authorized to commit,
push task branches, create/update PRs and issues, merge reviewed changes, publish
release/container artifacts and deploy/promote the website through its existing
pipeline **without asking the owner for confirmation at every step**. This includes
verification and rollback of your website release when needed. Follow the repository
release/deployment runbooks; their requirement for owner approval is satisfied by
this instruction for these in-scope actions.

Autonomy does not mean bypassing required checks: review the actual diff, resolve
findings, pass the latest-head Quality gate, preserve branch protection, and verify
the deployed source/image digest and live behavior after publication. Record proof
before closing an issue. Do not treat local synthetic tests as hosted acceptance.
Missing credentials, upstream grants or technical access remain real dependencies;
continue independent work and state the missing input precisely. Authority over
this website does not grant operator access to Ninjonik's separately hosted Logi
instance or authorize unrelated infrastructure changes or Discord announcements.

## Repository and handoff state — read first

- Canonical repository: <https://github.com/ValkyriaWDG/www>.
- Audited main/base: `0a94d59c32831cfa198a0371bf204523e6555a3a`.
- Task branch: `fix/logi-web-readiness` on the canonical GitHub repository.
- Runtime/test commit: `ce0db5ebb00b2d341d0cde45e49b4e6f296f83e1`.
- Local checkout relative to the repository root: `.local/worktrees/bot-admin`.
- The implementation is committed for cloud handoff; the branch also contains
  this prompt, readiness/editor documentation and selected visual evidence.
  No new deployed image was produced by this handoff task.
- Fetch the canonical repository and inspect the current PR for this branch.
  Continue that branch/PR instead of duplicating it. If already merged, start from
  current main and verify what remains. Do not rely on the owner's local worktree.
- The earlier ZIP/`wip.patch` was a pre-commit transfer snapshot. The GitHub branch
  and this revised handoff supersede its delivery instructions. Do not reapply that
  patch to this branch. If main has advanced, reconcile newer work without resetting
  another contributor's changes or force-pushing shared history.

Read `AGENTS.md`, `CLAUDE.md`, `docs/STATUS.md` and relevant committed
`.claude/skills/` procedures. Use `valkyria-delivery`, then frontend, auth, backend,
verification and GitHub guidance as applicable. Repository status notes can lag
this handoff; verify the live/source state before making claims.

## Confirmed findings

### 1. Production is missing Logi configuration, not the latest audited source

A read-only runtime inspection showed production already running website source
`0a94d59c32831cfa198a0371bf204523e6555a3a`. At that observation, the Logi SSO flag,
SSO client configuration, guild configuration, source mappings and separate
per-game data/membership keys were absent. Public source selection remained CRCON
without a Wardogs override. Do not assume another image pull enables Logi.

The old login renderer hid Logi when its flag was disabled. The candidate patch
always shows the Logi action and explains its unavailable state when it cannot
start a flow. A configured, policy-permitted Discord fallback remains possible.
This is honest UI readiness, **not successful hosted sign-in**. No real OAuth flow,
hosted protected endpoint or production admin session was exercised by this task.

### 2. The website already has substantial Logi consumer code

The audit compared Logi PR <https://github.com/Ninjonik/logi/pull/158> at
`c42ea770c307793494ae159a924f86e3c6ced50d` (open when inspected). Recheck its latest
head and documentation. Source availability is separate from Ninjonik's hosted
deployment and our explicit grants.

Already present in the website:

- OIDC code flow with PKCE S256, nonce, RS256/JWKS, bound userinfo, website session
  cookies and central revocation handling.
- Fresh exact-Discord-subject membership reads, game-scoped roles, epoch/revision
  fences and fail-closed authorization. Authentication alone grants no capability.
- Events, matches, results, server snapshots and integration-health projections;
  scoped changes feed, authoritative record refetch and durable generation swaps.
- Optional people, rosters and player facts, using separate people keys and
  `syncPeople`. Public profile enrichment requires immutable member association,
  consent, publication and separate stats/roster opt-ins.
- Actor-backed event create/update/cancel with expected revision, idempotency and
  request receipts. Raw service-key APIs are not a substitute for actor commands.
- HMAC-verified, deduplicated webhook hints that trigger authoritative pulls.
- Independent HLL CRCON and Wardogs Logi source selection; approved public server
  snapshots and external scoreboard destinations.

Missing or unfinished surfaces:

- Collected integration health is not yet a complete admin health screen (#22).
- Dedicated Wardogs League preview and advanced Warcon read adapters (#87).
- Hosted client/grant provisioning, scheduled sync qualification and real
  sign-in/role-removal/central-logout acceptance (#23, #8, #7).
- Provider discovery currently occurs once at auth initialization. An outage
  there can require a restart; bounded initialization/retry is a separate known
  follow-up. Do not redesign the OIDC protocol or hide failure with an open fallback.

Canonical guild IDs are Discord guild snowflakes, not dashboard workspace IDs.
HLL maps from route `hll` to database `hell-let-loose` to API `hell_let_loose`.

### 3. FAQ and article editing exist; taxonomy management is the real CMS gap

FAQ is a core page in the shared Pages editor. Field Manual articles already have
rich text, translations, revisions, sources and publication. Do not create a
second editor or claim these capabilities are absent.

Actual defects found and addressed by the candidate patch:

- Manual search submitted to `/admin/news` instead of its own list.
- Manual source/credits/order metadata could be lost during navigation.
- Game-scoped editors were offered modules outside their resource scope.
- “Pages” did not clearly advertise FAQ editing.
- Imported FAQ excerpts repeated the beginning of the question/answer body,
  creating a long, duplicated, partially truncated introduction.

Category display names, descriptions and order, plus news categories/tags, remain
seed-managed. Assignment to existing categories already works. Implement category
definition management through the existing CMS, with scope and reference safety,
as specified in #86. Shared manual metadata saves currently take effect outside
the article body publication cycle; the editor guide explicitly documents this.

### 4. WDG action and utility sizes had shrunk

Live desktop inspection confirmed small home actions and utility glyphs. The patch
increases only WDG home action widths/heights and utility controls/icons, preserving
existing responsive rules and HLL composition. At a 1440 px viewport, the action
column becomes approximately 346 px instead of 280 px; utility buttons have a
52 px minimum with 28 px minimum icons. Visually review the actual result, not
only CSS numbers. Keep mobile controls in the viewport and the game scene open.

## Candidate changes to review

| Area | Main files / behavior |
| --- | --- |
| Login | `apps/web/src/app/[locale]/(platform)/login/page.tsx`, auth CSS, CS/EN auth dictionaries: visible disabled Logi, neutral purpose text, permitted configured Discord fallback |
| Admin scope | `modules/auth/admin-{guard,modules}.ts*`, admin content/manual pages: HLL manual scope, platform-wide Pages/FAQ scope, consistent direct-route checks and audited denials |
| Admin content | `components/admin/editorial-list.tsx`, `manual-meta-form.tsx`: correct search destination, unsaved changes, failed-save retention, accepted save/discard behavior |
| FAQ presentation | `components/public/{core-page.tsx,faq-summary.ts}`: recognize empty or verbatim body-prefix excerpts; preserve independent editorial summaries and stored content |
| WDG size | `components/shell/home/home.module.css`, `footer.module.css`, `components/ui/utility-button.module.css`: larger home actions and footer icons |
| Logi bootstrap | `modules/integrations/logi/sync.ts`: handle collection-pagination `410 reset_required` by starting a complete new shadow generation and fresh change boundary |
| Logi freshness | `modules/integrations/logi-public.ts`: persisted collector error overrides recent success; no falsely fresh server/scores after failure |
| Tests and docs | New login/scope/public-provider tests, sync regression, PostgreSQL guards, CS/EN manual/FAQ browser tests; readiness document and editor guide |

The reset fix must never promote a partial generation or retain abandoned rows.
The freshness fix must retain historical map/population only with honest stale
state while removing current-score claims. Scope must be enforced on the server,
not only by hiding navigation. Manual failed saves must keep values and permit retry.

Detailed notes:

- `docs/integrations/logi/readiness-2026-10-03.md`
- `docs/integrations/logi/{contract,runbook,verification,people,wardogs-servers}.md`
- `docs/operations/editor-guide.md`

## Verification already performed — do not overstate it

These results apply to the source committed as
`ce0db5ebb00b2d341d0cde45e49b4e6f296f83e1`, based on the audited base. Checks ran
before committing; source hashes were compared before staging. They are not PR-head
CI or production acceptance. See the committed
[evidence record](../evidence/logi-web-readiness-2026-10-03/README.md).

Environment: Windows x64, Node 24.21.0, pnpm 10.34.5, disposable PostgreSQL 18.4
using UTF-8/ICU `en-US`; optimized Next.js build `_Xdm70C5k9uTgh4u_8UfD`.

| Check | Result |
| --- | --- |
| Frozen dependency install | Passed |
| Lint | Passed |
| Explicit typecheck | Passed |
| Optimized production build | Passed |
| Full unit suite | 85 files, **929 tests passed** |
| PostgreSQL integration suite | 46 files, **482 tests passed** |
| Clean full browser suite | **214 passed, 124 opt-in captures skipped**, zero retries |
| New manual browser cases | All four CS/EN search/metadata cases participated and passed |
| FAQ publication browser regression | Passed |
| Foundation | Passed again with the committed handoff/evidence files; rerun after further changes |
| Hosted Logi login/data grants, container runtime, production rollout | Not run by this task |

Relevant local logs, preserved outside version control, are
`.local/logi-audit-{unit,integration,build,lint,typecheck}.log` and
`.local/logi-audit-e2e-clean.log`. The evidence directory includes a sanitized result summary,
not raw logs containing machine-local details. New manual screenshot attachments
were not visually reviewed before the owner stopped work; inspect/regenerate them.

Two browser run failures were diagnosed before the clean pass:

1. The new manual search test clicked two asynchronous filter links and submitted
   before the first filter committed. The test now waits for `aria-current` and
   hidden form filter values. Assertions/timeouts/retries were not relaxed.
2. A rerun reused an already-running server with fixtures modified by prior admin
   tests. Restarting via the guarded E2E harness reset the disposable `_e2e`
   database. `CI=true` disables `reuseExistingServer`; that clean run passed.

The first portable database used C locale and failed Czech case-insensitive search;
the proper ICU test cluster passed. Do not weaken multilingual database assertions.
Existing RSC destination-stream cancellations still appear in browser server logs;
passing tests do not resolve the separate investigation in #46.

## Visual evidence and its limitations

`docs/evidence/logi-web-readiness-2026-10-03/` contains inspected actual browser captures:

- `before-live-*`: public live source `0a94d59`, real public content/media.
- `after-wardogs-cs-1440x900.jpg`: local larger desktop controls.
- `after-wardogs-en-390x844.jpg` and `after-wardogs-en-footer-390x844.jpg`:
  local mobile layout and larger footer controls without horizontal overflow.
- `after-login-cs-1440x900.jpg` and `after-login-en-390x844.jpg`:
  visible unavailable Logi action with synthetic configured Discord fallback.
- `after-faq-cs-1440x900.jpg`: localized concise intro and intact synthetic FAQ.

Local captures use synthetic data and intentional missing-MP4 fallback. Backgrounds
and content differ from production; these are not pixel-identical before/after
fixtures or proof of live recovery. Do not publish private admin/member data.
Screenshots are evidence only, not application artwork. Include captions, source
revision, route, locale, viewport and explicit local/live context in the PR.

## Prioritized continuation

1. **Establish current state and independently review.** Confirm main, open PRs and
   Logi #158. Check out the handoff branch. Inspect every changed file, actual auth/config
   helpers, permission boundary, sync store semantics and new tests. Use a separate
   review agent without overlapping writes. Report concrete findings, fix justified
   issues, and retest affected behavior. Do not rubber-stamp previous green results.
2. **Finish this readiness/UI correction PR.** Capture and inspect actual CS/EN
   admin states plus desktop/mobile public views. Record exact committed revision,
   source/build fingerprints, reproducible checks and remaining limitations. Update
   `docs/STATUS.md` and provide reviewable evidence under repository policy.
3. **Complete meaningful admin and data surfaces.** Use #22 for supported Logi
   collector/provider health; #86 for taxonomy administration; #87 for approved
   League/Warcon readers. Choose coherent implementation slices after review and
   keep PR count low. Do not claim an issue done from a partial adapter or mock.
4. **Audit remaining UI with the real browser.** Examine HLL/WDG home, menus, news,
   matches, servers, profiles, Field Manual, FAQ, login and authorized local admin
   fixtures. Prioritize broken navigation, unreadable/overflowed controls, missing
   icons, hidden editing affordances and unsafe state handling. Preserve the game
   styles. Reuse registered artwork/icons and existing components; no broad redesign.
5. **Complete the authorized website release and activation where inputs exist.**
   After review and current-head CI, merge, publish/promote through the existing
   pipeline and verify the running revision/digest, health and visible behavior.
   Do not ask again for these authorized website operations. Document any missing
   hosted operator inputs, callback registration, grants, role mapping, approved
   sources or sync schedule. Activate only with real, appropriately scoped
   configuration; leave #23/#8/#7 open until hosted checks prove their requirements.
   A visible client button is not successful authentication.

Review all current issues before starting duplicate work:

- <https://github.com/ValkyriaWDG/www/issues/22> — integration health/admin settings.
- <https://github.com/ValkyriaWDG/www/issues/23> — hosted auth/operational acceptance.
- <https://github.com/ValkyriaWDG/www/issues/8> — membership reconciliation.
- <https://github.com/ValkyriaWDG/www/issues/7> — Logi match/roster projections.
- <https://github.com/ValkyriaWDG/www/issues/86> — new taxonomy work from this audit.
- <https://github.com/ValkyriaWDG/www/issues/87> — new League/Warcon readers from this audit.
- <https://github.com/ValkyriaWDG/www/issues/46> — RSC cancellation investigation.

## Working rules and completion

- UI defaults to Czech with English translations; code, docs, commit/issue/PR text
  and technical prompts are English. Explain owner-facing results concisely in Czech.
- Logi owns connected operations and identity evidence. Website owns CMS, public
  presentation, consent, publication and local session authorization. Never derive
  permissions from Steam/player facts or synchronize FAQ/news from Logi.
- Never expose credentials, service keys, raw protected provider payloads or private
  rosters. Use exact-subject, game, freshness and publication boundaries.
- Work on task branches, preserve concurrent work, no AI co-author/generated-by
  attribution. Prefer one coherent PR for the current correction slice. Link related
  issues with `Refs`, not closing keywords unless all acceptance is demonstrated.
- Use actual repository scripts: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`,
  `pnpm test:integration`, `pnpm build`, `pnpm test:e2e`, `pnpm check:foundation`.
  Run applicable checks with a disposable database and fresh E2E fixtures. Do not
  add no-op gates or make broad tests weaker to get a green build.
- PR descriptions need problem/behavior, exact revision, meaningful proof and
  inspected screenshots where applicable. Add issue acceptance evidence before
  closure. Report skipped/unrun/blocked checks separately. Verify latest-head CI.
- Commit, push, merge and publish/deploy this website automatically within the
  explicit authorization above, using the release runbooks and successful required
  checks. Preserve existing data, credentials and unrelated services. Never bypass
  branch protection or fabricate upstream access to finish a release.
- Deliver the reviewed PR, actual merge/publication/deployment state with verified
  revision/digest, concise findings, resolved vs remaining issues, exact evidence,
  and any concrete hosted-activation dependency still missing.
