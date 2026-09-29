# Legacy HLL public field parity

Follow-up to [issue #73](https://github.com/ValkyriaWDG/www/issues/73). The earlier
import proved record counts and technical integrity, but omitted some public source
fields. This additive repair preserves the original import identities and every
current match, result, statistics, content/prose revision and publication decision.
Historical metadata is visibly attributed rather than replacing current editor text.

## Source reconciliation

The frozen source revision is `1f0396517f90527f5aa44d7c66ac8f1c1117c425`.
The original bundle byte SHA-256 is
`7d3151b895607f4c3ec8e8d7c91acf9b101cf0a067d2df3277e0f451d4ee48fe`.
It has not been rewritten. [Read-only match reconciliation](source-match-parity.json)
verifies all 205 original normalized identities and both country labels, 26 complete
recording links, 17 primary capture fields, one alternate capture field, three point
fields and 70 standalone times. Three standalone times differ from their source date.
They are preserved and marked; this does not assert which historical time is correct.

The separately hashed editorial supplement restores two local author images used by
nine articles, source cover/thumbnail references and manual ordering. The typed
editorial projection also preserves descriptions, labels and imported logos for
eight tournaments. Public media requires an active published owner. Archived
announcements remain archived; editor versions and revisions are not rewritten.

Known source limits remain: two hidden matches are excluded; conflicting exports
for matches 101/199 are quarantined; empty exports do not become zero statistics;
21 unassigned statistical sides remain unknown; only match 211 has an individually
verified external CRCON origin/game link. Private player/account data are excluded.
Original Czech/Slovak source text is not presented as an invented English translation.
The [field disposition inventory](source-field-coverage.json) covers every observed
match/frontmatter key and all 30 document cases. Its lexical check found no missing
word occurrences across 25 extracted HTML bodies (11,592 tokens); this does not
prove sentence order, formatting or semantic identity. Home/league source images
remain staged and mapped in the source/media ledger; match presentation deliberately
uses the Valkyria crest and competition text. Opponent/map images and tournament
logos have their own public presentation.

## Local verification

Environment: Windows, Node 24.21.0, pnpm 10.34.5, isolated PostgreSQL test databases,
production Next.js build and Playwright Chromium. Browser data are **synthetic**;
no private legacy export, credential or player record is included in these captures.

- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `node scripts/check-foundation.mjs` passed.
- `pnpm test:unit`: **749 tests passed across 68 files** in the final integrated run.
- Focused metadata repair tests exercise dry-run, real apply, unchanged repeat,
  conflicting source rejection and preservation of subsequent editor changes.
- `CAPTURE_EVIDENCE=1 pnpm exec playwright test e2e/legacy-parity.spec.ts --project chromium`:
  five scenarios passed; CS/EN at 1920 x 1080 and 390 x 844, recording attribution,
  unchanged published start, axe checks, reflow and ordinary-match absence.
- The initial full Windows database run had 354 passing tests and one fixture reset
  failure caused by a retained native image file handle. The test now decodes a read
  buffer, preserving the same image assertions without keeping the file open.
  The subsequent full PostgreSQL run passed **356/356 tests across 38 files**.
- Foundation tooling: **176/176 passed**. Independent public-projection and media
  review found no remaining actionable issue after the digest validation correction.

Final exact-revision CI, isolated production-major repair, repeated no-op and live
acceptance are separate evidence boundaries. Their status must be recorded before
closing issue #73; these screenshots alone do not prove production migration.

## Inspected application captures

Captured 29 September 2026 at 22:05 UTC from the implementation changes in this PR.
[Machine-readable captions](captures.json) identify each route, locale and viewport.
The fictional fixture deliberately includes conflicting capture/time values and
recording metadata; it is not a claim that every real source has those conflicts.

| View | Desktop | Mobile |
|---|---|---|
| Czech match details: provenance, flags, source conflicts and complete recording credits | [Capture](legacy-detail-cs-1920.png) | [Capture](legacy-detail-cs-390.png) |
| English match details: equivalent localized UI with preserved source text | [Capture](legacy-detail-en-1920.png) | [Capture](legacy-detail-en-390.png) |
| Czech results: original coalition name and country labels | [Capture](legacy-list-cs-1920.png) | [Capture](legacy-list-cs-390.png) |
| English results: equivalent list behavior | [Capture](legacy-list-en-1920.png) | [Capture](legacy-list-en-390.png) |

![Czech historical match with attributed source fields and recording credits](legacy-detail-cs-1920.png)

![Mobile Czech result list with country labels and original coalition name](legacy-list-cs-390.png)
