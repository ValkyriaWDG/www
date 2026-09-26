# Release hardening local evidence — 2026-09-26

These results use a local production standalone build with synthetic PostgreSQL data,
not the live website. The base commit is `507e704d288cd93d7baa0d1ab22ba8347fd67b0a` with
the uncommitted issue #26 patch. The raw reports explicitly record `sourceDirty: true`;
they do not prove a later commit or Linux CI. [Provenance](provenance.json) records
normalized source hashes and screenshot hashes for this local run.

| Check | Observed result |
|---|---|
| Frozen dependency install | Passed |
| Production build after the emblem loading fix | Passed |
| Lint and typecheck | Passed |
| Dependency-free foundation regression tests | 27 passed, including 8 new budget/scan tests |
| Real PostgreSQL fixtures + nine throttled browser navigations | Passed budget assessment |
| Image build, native image checks, scan comparison, image rollback and restore | Blocked locally by unavailable Docker engine; required Linux CI checks are implemented but not claimed passed |
| Registry publication / deployment | Not performed |

Runtime: Node 24.21.0, Windows PostgreSQL 18.4 and real headless Edge/Chromium
154.0.4258.37. CI uses the locked Playwright Chromium and PostgreSQL 17. See the
[procedure and fixed budgets](../../operations/release-hardening.md) for the exact
network/CPU profile, excluded optional background media and reproduction commands.

| Route | Before median LCP | After median LCP | After maximum CLS | After maximum total transfer |
|---|---:|---:|---:|---:|
| `/cs` | 2756 ms | 2004 ms | 0.032223 | 521971 bytes |
| `/cs/news` | 980 ms | 1072 ms | 0.023926 | 511163 bytes |
| Synthetic published article | 1072 ms | 1340 ms | 0.002694 | 604326 bytes |

The browser identified the emblem as the homepage LCP element. Eager/high-priority
loading brought its median below the unchanged 2500 ms limit. The first after-run home
sample was 3576 ms, so these results do not claim every individual LCP passed. News
and article transfer rose because the persistent emblem now loads eagerly there too;
those bytes are counted. All nine after-run responses were HTTP 200 with zero page
errors, failed/incomplete requests and video requests. This shared local machine's
lab measurements are not production field metrics.

- [Before samples](page-budgets-before.json)
- [After samples and assessment](page-budgets-after.json)
- [Local Docker precheck failure](container-local-attempt.json): stopped at the first
  availability check, with no fixture/image/scan work performed.

These captures show synthetic fixtures and the CSS background fallback. They do not
show the deployed site, game video, authentication or editorial management behavior.

![Synthetic mobile homepage after the loading fix](page-1.png)

![Synthetic mobile news listing](page-2.png)

![Synthetic mobile article with cover, inline image and table](page-3.png)

Before merging or releasing, require the exact candidate's Application/Quality gate,
inspect `page-budgets-*`, `release-rehearsal-*`, `runtime-scans-*` and `sbom-*` artifacts,
and reconcile any platform-dependent results. No runtime size reduction or advisory
count is asserted until the two real Linux image builds/scans complete.
