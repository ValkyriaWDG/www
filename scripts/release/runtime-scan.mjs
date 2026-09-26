import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function summarizeScan(report) {
  assert(
    report &&
      typeof report.ArtifactName === 'string' &&
      report.Metadata?.OS?.Family &&
      Array.isArray(report.Results),
    'Incomplete Trivy report',
  );
  assert(
    report.Results.some(
      (row) => row.Class === 'os-pkgs' && Array.isArray(row.Packages) && row.Packages.length,
    ),
    'No OS package inventory in scan',
  );
  const findings = report.Results.flatMap((row) => row.Vulnerabilities || []).filter((row) =>
    ['HIGH', 'CRITICAL'].includes(row.Severity),
  );
  const fixable = findings.filter(
    (row) => typeof row.FixedVersion === 'string' && row.FixedVersion.trim(),
  );
  return {
    os: report.Metadata.OS,
    packages: report.Results.reduce((sum, row) => sum + (row.Packages?.length || 0), 0),
    highCritical: findings.length,
    fixableHighCritical: fixable.length,
    unfixedHighCritical: findings.length - fixable.length,
    findings: findings.map((row) => ({
      id: row.VulnerabilityID,
      package: row.PkgName,
      severity: row.Severity,
      status: row.Status || 'unknown',
      fixedVersion: row.FixedVersion || null,
    })),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [baseline, candidate, output] = process.argv.slice(2);
  assert(
    baseline && candidate && output,
    'Usage: runtime-scan.mjs baseline.json candidate.json comparison.json',
  );
  const result = {
    baseline: summarizeScan(JSON.parse(readFileSync(baseline))),
    candidate: summarizeScan(JSON.parse(readFileSync(candidate))),
  };
  result.delta = {
    highCritical: result.candidate.highCritical - result.baseline.highCritical,
    packages: result.candidate.packages - result.baseline.packages,
  };
  result.status = result.candidate.fixableHighCritical === 0 ? 'passed' : 'failed';
  result.limit =
    'Unfixed advisories remain visible for review; fewer packages or advisories is not a guarantee of absence of vulnerabilities.';
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify({
      status: result.status,
      baseline: result.baseline.highCritical,
      candidate: result.candidate.highCritical,
      fixable: result.candidate.fixableHighCritical,
      delta: result.delta,
    }),
  );
  if (result.status !== 'passed') process.exitCode = 1;
}
