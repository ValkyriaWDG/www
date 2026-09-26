# Bot administration — local acceptance, 2026-09-26

The implemented website section reads the private bot API and edits only locale and
existing server labels. It remains disabled by default. This record supports
[website #22](https://github.com/ValkyriaWDG/www/issues/22) and the implemented
[bot #11 contract](https://github.com/ValkyriaWDG/bot/issues/11), not production activation.

## Source and environment

- Website base: `507e704d288cd93d7baa0d1ab22ba8347fd67b0a`, branch `feat/bot-admin`,
  with the uncommitted implementation identified by [source-file hashes](source-files.json).
  This base SHA alone does not identify the new code; the integrating PR/CI must record
  the final commit and rerun applicable checks.
- Actual bot source: `4f3db011ec0aa96eaaa96bfb7b71cd4bffd804ac`, clean tracked checkout.
  The test loader rejects a different SHA or modified tracked source.
- Windows, Node 24.21, pnpm 10.34.5, isolated loopback PostgreSQL 18.4. Hosted CI uses
  PostgreSQL 17 and the locked dependency graph.
- Browser: Edge `154.0.4258.37` through Playwright, production Next.js build,
  synthetic Better Auth sessions and synthetic editorial fixtures. Browser bot DTOs
  are intercepted for deterministic states; the disabled backend/unauthorized case
  uses the actual website endpoint. None of these screenshots depicts live Discord.
- [Screenshot metadata](screenshots.json) records UTC capture times, routes, viewport,
  image hashes, source dirty state and fixture limitations. All eleven captures were
  visually inspected; text, focus indicators and fields are readable, with no document
  overflow at 390 px or desktop widths. Narrow admin navigation uses its existing
  horizontally scrollable navigation strip.

## Checks and observed results

| Criterion / steps | Expected | Observed |
| --- | --- | --- |
| Focused transport, handler, access, auth and locale units | Distinct capabilities; fail closed; correct signing and localized keys | 59 tests passed across six files |
| Actual web handler → client → actual bot HTTP handler → PostgreSQL | Strict DTOs, independent bot authorization, durable state and audit | Nine contract scenarios passed |
| Save two requests from the same revision | Exactly one desired change; loser sees conflict | One 200 and one 409; bot revision advanced once |
| Revoke the actor before the bot's second authorization after row lock | No accepted mutation | 403; desired revision unchanged |
| Fail actual website intent audit storage | No bot PATCH or membership lookup | No dispatch; 503 |
| Fail actual bot audit storage | Desired revision rolls back | Stored revision unchanged; website reports uncertainty until read |
| Persist desired config but fail runtime apply callback | Do not claim applied | 202, desired revision 1, effective revision 0, application error |
| Consume the real HTTP response after COMMIT, then simulate its loss | Unknown result; no second PATCH | Unknown result; fresh read found revision 1; one write |
| Close/reopen actual bot management server and initialize store | Stored settings survive restart | Revision 1 remained applied after restart |
| Actual browser journeys in CS/EN | Keyboard path, desktop/narrow layout, honest state transitions | Nine Playwright tests passed; eleven captioned captures |
| Conflict / unknown response | Preserve unsaved edits, block blind retry | Form retained values and reason; fresh read plus explicit review required |
| Hide page, advance browser clock, reveal page | No hidden polling; one refresh when visible | Request counts matched |
| Lint / typecheck / production build | Changed code fits the actual application | All passed on the implementation tree |
| Foundation integrity and regression checks | Safe public files, valid links and registered screenshot hashes | Integrity passed; 19 foundation tests passed |

Red-first regressions additionally demonstrated and repaired two boundary mistakes:
an HTTP hostname resembling a private numeric address was incorrectly permitted,
and a valid JSON prefix on a never-completed request could previously pass after the
body deadline. Both now fail before dispatch. Visual review also repaired a misleading
unavailable runtime badge on a settings conflict; the current captures preserve the
last observed health separately from the mutation outcome.

The joint suite uses real handlers, HMAC verification, bot migrations/store and website
audit writes. Discord membership and runtime observations are synthetic adapters;
the response-loss case injects transport failure after consuming a real committed
response. It does not prove real Discord networking, production infrastructure or
browser-to-live-bot delivery. The suite covers wrong-key rejection, wrong guild,
revoked/stale actor, concurrency, both audit failures, actual apply failure and restart
persistence. Focused transport units separately cover strict malformed/private-field
response rejection, safe errors, independent HMAC bytes and no retry.

An early mistakenly broad local test invocation also exposed unrelated Windows
baseline failures: presskit path separators, symlink privilege, fixture-file locking
and PostgreSQL search collation. Those checks are not claimed green here. The corrected
standalone bot contract project passes; the integrating PR still needs the complete
hosted application checks and the required **Bot management contract** job on its exact
head. No hosted result is claimed by this pre-commit evidence record.

## Reproduce

Use the clean pinned bot checkout and a dedicated disposable loopback database with
a bounded name containing `test`. The suite may create/drop its template and worker
databases; do not share its test base with another running suite. It does not connect
to the production bot database. See [operator contract](../../operations/bot-administration.md).

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm --filter @valkyria/web exec vitest run --project unit src/modules/bot-management src/modules/access/policy.test.ts src/modules/auth/auth-units.test.ts src/i18n
# Set DATABASE_URL to the disposable loopback test base and BOT_SOURCE_DIR to the clean pinned bot checkout.
pnpm --filter @valkyria/web exec vitest run --config vitest.bot-contract.config.ts
pnpm build
# Configure dedicated E2E_ADMIN_DATABASE_URL / E2E_DATABASE_URL and free E2E_PORT / E2E_DISCORD_MOCK_PORT.
# Optional PLAYWRIGHT_CHROMIUM_EXECUTABLE selects an installed compatible browser.
CAPTURE_BOT_EVIDENCE=1 pnpm --filter @valkyria/web exec playwright test e2e/admin-bot.spec.ts --project chromium-admin --no-deps --workers=1
```

The dedicated CI contract job runs against the same exact bot SHA with no service or
registry secrets; Quality gate requires success. General browser CI includes the new
admin spec. Capture mode is opt-in and does not overwrite committed evidence during CI.

## Captioned screenshots

| Capture | What it proves |
| --- | --- |
| [Czech desktop](cs-desktop-healthy.png) | Real layout, keyboard-focused save, separate healthy runtime and unknown role delivery |
| [Czech narrow](cs-narrow-healthy.png) | 390 px stacked panels and readable configuration fields |
| [English desktop](en-desktop-healthy.png) | English labels and localized timestamps |
| [English narrow](en-narrow-healthy.png) | English form and wrapped build SHA without page overflow |
| [Disabled integration](cs-disabled.png) | Actual disabled web backend renders no status or settings controls |
| [Revision conflict](cs-conflict.png) | Retained label/reason, blocked save and explicit revision review |
| [Saving](en-saving.png) | Pending request disables controls and duplicate submission |
| [Unknown outcome](en-unknown-outcome.png) | Lost response is not success or a proven failed write; retained edits and reconciliation notice |
| [Stale observation](en-stale.png) | Stale state disables saving independently of historical component values |
| [Unavailable read](en-unavailable.png) | Last values are explicitly historical when a fresh read fails |
| [Apply failure](en-apply-error.png) | Requested revision 13 differs from effective 12; application error is visible |

Except the disabled integration capture, management observations are explicitly
simulated browser responses. These are real website screenshots, not Discord images.
No secrets, real member profiles, private endpoints or raw upstream errors are shown.

## Deferred acceptance and rollback

No website migration is needed. Bot management migration/settings ownership and
rollback are documented by the pinned bot contract. Disable the website adapter to
stop management calls; retain both audit histories and bot settings/replay records.
This does not undo a previously stored bot revision.

Keep live acceptance open for deployed private transport, provisioned grants, real
Discord role revocation, dedicated-key rotation, audit retention and observed runtime
application. Channel/template/schedule selection is unavailable in this initial
management contract, so its permission checks are deferred until that surface exists.
No registration, Discord message, production configuration, publication or deployment
was performed for this evidence.
