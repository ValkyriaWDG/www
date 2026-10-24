# Native match detail readability — 24 October 2026

Production acceptance of #116 found that the first captured team in a native HLL
banner occupied the narrow VS column. Its preceding accessible teams prefix meant
the old `:first-child` selector never matched. A long actual team name consequently
wrapped into single letters. All banner teams now explicitly occupy the content
column; VS keeps its own column. List rows and the accessible prefix are preserved.

The same acceptance review found that a linked historical detail still displayed
its archived placeholder kickoff while its list row used the current Logi timestamp.
The preview and canonical detail now use the identical supplied start/end semantics
as the list, including an explicit end-time label when no start exists. Underlying
archive dates, scores, publication and consent remain unchanged.

## Reproduction and proof

Tested application tree `ce771f2b653364a756c63db09b00b78a2cdec043`, based on
`eea874591543461f31b905e7b67c3cd67add8764`. Windows/Node24/pnpm10.34.5,
standalone production build, Playwright Chromium, disposable loopback PostgreSQL
and explicitly synthetic projections. Independent integrated review: no findings.

`pnpm build`, typecheck, scoped ESLint and nine focused rendering unit tests passed.
`CAPTURE_EVIDENCE=1 pnpm --filter @valkyria/web exec playwright test -c playwright.logi.config.ts`
passed **25/25** journeys. Four new CS/EN ×1280/390 cases measure both team-track
widths/alignment, long-name rendered line count, clipping and VS placement. Existing
linked-history journeys compare list/preview/canonical datetimes and retain the
consented lineup and denied-statistics assertions. These are layout/behavior checks,
not assertions that only mirror the CSS rule.

![Czech native detail with a long first captured team](desktop.png)

`/cs/hll/matches/logi/synthetic-next-hell_let_loose`, 1280×900 viewport, full document:
the first name wraps into readable lines beside its mark; the second name aligns
with it and VS remains separate. Supplied start/status and the consented synthetic
lineup remain visible.

![English native detail on mobile](mobile.png)

The same native detail at `/en/…`, 390×844 viewport, full document: readable team
names, no text clipping or horizontal overflow, and an honest awaiting-result state.

Hosted qualification and production acceptance of this correction remain pending.
The earlier source is already deployed, but its successful HTTP checks do not close
this visible defect. The seven reviewed recent HLL identity associations are an
independent operator configuration correction; no runtime matching heuristic is added.
