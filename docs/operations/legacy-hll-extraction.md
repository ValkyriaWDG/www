# Prepare a legacy HLL content bundle

The extractor prepares local migration inputs from the published
[legacy website](https://valkyriahll.cz/). It does not connect to a database,
publish content, change redirects, run the old web application, or start a bot.
The source checkout and populated bundle stay in ignored `.local/` directories.
Never attach raw bundles, upstream configuration, credentials or scoreboard
exports to a public pull request.

## Observed content

Read-only inventory on 29 September 2026:

| Source | Available migration content |
| --- | --- |
| `/clanky/*` | 9 published articles, including one Wardogs announcement and one shared community appeal |
| `/guide/*` | 8 manual articles; preserve the Slovak tank guide and credited contributors |
| `/turnaje/*` | 8 tournament pages, descriptions, tables, dates and external links |
| `/faq` | 11 question/answer pairs, combined into one page |
| `/about` | One community page; displayed counters remain historical claims |
| Homepage announcements | 3 expired announcements, explicitly archived with their original expiry dates |
| `/api/matches` | 205 public rows: 202 completed and 3 upcoming; one reviewed identity repair preserves 205 distinct matches |
| Archived scoreboards | 134 eligible snapshots for 131 public matches, including three two-round matches |
| Media package | 219 local raster candidates, with 27 external/unsupported references retained for review |

All 25 article/manual/tournament detail pages and seven index/information pages
returned HTTP 200 during the inventory. Each of the 205 public API rows exactly
matches one non-hidden source JSON record, but files `198.json` and `199.json`
both embed ID `198`. This is a source identity error, not deployed content drift.
The explicit repair below preserves both matches. Two hidden source match records
are excluded. Empty scoreboards for matches 172, 206, 208 and 209 are excluded;
conflicting map associations for 101 and 199 are quarantined. Their match records
remain eligible for migration.

These counts describe the inspected snapshot, not a perpetual completeness claim.
The three archived announcements are recovered historical source content; they
are not currently visible promotions on the homepage.

## Extraction command

From the repository root, after dependencies and Playwright Chromium are available:

```sh
pnpm --filter @valkyria/web exec tsx src/cli/extract-legacy-hll.ts \
  --source ../../.local/legacy-audit/valkyria \
  --output ../../.local/legacy-audit/bundle \
  --public-cache ../../.local/legacy-audit/public
```

Paths in this command are relative to `apps/web`, where `pnpm --filter ... exec`
runs. `--source` points to the authorized legacy checkout; `--output` must be
inside `.local`. The optional cache contains saved public HTML and `matches.json`.
Omit it for a new capture under the output directory. Existing cached responses
are reused deliberately; preserve capture timestamps externally and use a fresh
cache directory when checking the deployed content again.

The command reads only the legacy content folders, literal FAQ data, the
map-image mapping, public media, and scoreboard files associated with the public
match allowlist. It does not open environment files, service credentials,
member CSVs or bot databases. The private source is never imported or executed.

Review `bundle.json`, `summary.json`, and every warning before using the separate
import workflow. Re-running extraction replaces the manifest deterministically
for identical inputs; unrelated old files in the output directory are not
deleted. Only files referenced by the current manifest are eligible for import.

## Transport contract

`apps/web/src/modules/legacy/extract-types.ts` defines schema version 1:

- `documents`: Czech editorial records with source URL/dates/language, credited
  authors, scope, normalized rich text, category/tournament/page metadata and warnings.
- `media`: source URL, deterministic placeholder UUID and provenance classification.
  Staged files have a bundle-relative path, byte count and SHA-256. The importer
  maps placeholders to actual media-library IDs after image intake validation.
- `matches`: untrusted rows from the public API, with reviewed identity corrections
  explicitly recorded in `_legacyIdentity` and bundle warnings. Validate dates,
  scores, formats, opponents and maps at import; upcoming `0:0` is not a known result.
- `matchMedia`: optional logo/map placeholder assignments keyed by the legacy match ID.
- `scoreboardSources`: bundle-relative snapshot path, SHA-256, byte count, provider
  game ID, legacy match ID, round ordinal, explicit side or `null`, optional verified
  `sourceGameUrl`, and notes. A numeric game ID does not establish a provider host.

The extractor parses already-published `.mdx` HTML in an inert browser DOM with
JavaScript disabled and all page network requests blocked. It preserves headings,
paragraphs, emphasis, safe links, nested lists, tables, image positions and captions.
Executable markup is discarded. The result must pass the application's rich-text
validator. Heading levels normalize to h2/h3; video embeds become source links.
Closed FAQ answers are recovered with a literal-only TypeScript AST reader, never
`eval`. The small archived announcements use a constrained non-executing parser.

Local PNG, JPEG and WebP references are staged only from within the declared
legacy public directory. External media and unsupported SVG/GIF files become
readable source links; their unresolved IDs never become body/cover placeholders.
This package is an owner-requested migration of previously published community
content, not a new open license for third-party artwork. Preserve its provenance
and apply the normal [asset policy](../assets/policy.md) and media intake checks.

## Source quirks that must survive review

- **Duplicate ID:** public [match 198](https://valkyriahll.cz/matches/198) is VLK
  versus LORD on 19 April 2026; [match 199](https://valkyriahll.cz/matches/199) is
  VLK versus 57TH on 17 May. Both routes returned HTTP 200 with distinct titles.
  The latter source file incorrectly embeds ID 198. Only an exact source/API row
  match plus the reviewed date/opponent/map tuple permits repair to ID 199.
  Unknown conflicts, ambiguous source records and incomplete captures fail closed;
  identical API duplicate rows can be removed only with an explicit warning.
- **Quarantined statistics:** match 101 declares Foy at night but its snapshot
  declares Purple Heart Lane at night; match 199 declares Sainte-Marie-du-Mont
  but its snapshot declares Carentan. Neither snapshot is in the import manifest.
  Preserve them privately for editorial reconciliation. Match 89 agrees on Foy
  but the snapshot names the night variant; retain a note without changing the
  match's original map. Map agreement is a consistency check, not proof of a
  particular opponent, result or permission to disclose additional player fields.
- **Dates:** the old implementation appended fixed `GMT+1` to match dates.
  `27/09/2026 19:30` therefore represents the legacy instant `18:30Z`; silently
  interpreting it as summer time in `Europe/Prague` would change the instant.
  Preserve the original text and offset interpretation unless an editor confirms
  a correction to the historical intent.
- **Match 211:** the rendered statistics originate from an archived
  `get_map_scoreboard` result with provider game ID `16551`, rather than a live
  request to the event server when opening the match. Retain source/time provenance.
- **Provider links:** only match 211 has a verified external game URL. On
  29 September 2026, the [event server's public API](https://event.valkyriahll.app/api/get_map_scoreboard?map_id=16551)
  returned HTTP 200 and matched the archive's game ID, server number, start timestamp
  and map. The extractor requires that complete reviewed tuple before linking
  [game 16551](https://event.valkyriahll.app/games/16551). The remaining 133 snapshots
  have null URLs and explicit origin-unverified notes. Server numbers 1–6 in old
  exports are not a hostname mapping; their records remain useful local archives.
- **Sides:** multi-round and ambiguous match-side values remain unknown. The old
  fallback based on weapons is defective and must not be copied. Never infer a
  clan side from player names or assume the first round applies to all rounds.
- **Tournament dates:** the source end date for `ecl-2025-spring` precedes its
  start date. The bundle retains the discrepancy in notes and leaves `endsOn` null.
- **Historical content:** expired giveaways, dated recruitment claims, static
  member counts, and unfinished manual content remain identifiable as such.
  Do not manufacture new announcements or missing sections.
- **Statistics privacy:** raw snapshots may include expanded profiles, historical
  names or moderation fields. The importer must use the existing allowlisted
  CRCON parser. Raw files remain local and never become a public download.

The legacy Discord bot stores VIP claims, membership links, training enrollment
and role/thread bookkeeping. It is not the canonical editorial or match archive.
Its private operational records are outside this public content extraction.

## Verification

```sh
pnpm --filter @valkyria/web exec vitest run --project unit \
  src/modules/legacy/extract-rich-text.test.ts \
  src/modules/legacy/extract-source.test.ts \
  src/modules/legacy/extract-matches.test.ts
```

The tests cover executable input rejection, links, nested lists, tables/spans,
image/caption mapping, external-image fallbacks, inline image ordering, literal
FAQ extraction, archived announcement conversion, duplicate identity reconciliation
and incompatible map associations. The actual local extraction also validates all
generated rich-text documents. A complete local preflight additionally confirmed:

- All 30 documents pass the importer schema; no empty body or unresolved
  body/cover/logo placeholder remains. Identity and media assignments are unique.
- All 219 staged rasters decode: 61 WebP, 115 PNG and 43 JPEG. Their recorded file
  byte counts and SHA-256 values match; normal library intake still runs on import.
- All 134 eligible scoreboard files match their hash, byte count and provider
  game ID. No duplicate provider game ID or match/start discrepancy greater than
  12 hours was found; this broad date check does not resolve historical timezone intent.
- Twenty-one snapshots retain an unknown clan side; no weapon/name inference is used.
- One provider link is individually verified; the other 133 are deliberately unset.

This proves bundle preparation. Database import, publication, redirects and deployed rendering need their own
verification and screenshot evidence.
