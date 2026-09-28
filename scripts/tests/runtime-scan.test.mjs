import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeScan } from '../release/runtime-scan.mjs';

test('requires complete Trivy metadata and results instead of accepting an empty file', () => {
  for (const input of [null, {}, { Results: [] }, { ArtifactName: 'image', Results: [] }])
    assert.throws(() => summarizeScan(input));
});
test('separates fixed versions and unresolved advisories without ignoring either', () => {
  const report = summarizeScan({
    ArtifactName: 'image',
    Metadata: { OS: { Family: 'debian', Name: '13.1' } },
    Results: [
      {
        Target: 'image',
        Class: 'os-pkgs',
        Packages: [{ Name: 'libc' }],
        Vulnerabilities: [
          {
            VulnerabilityID: 'CVE-TEST-1',
            PkgName: 'libc',
            Severity: 'HIGH',
            Status: 'affected',
            FixedVersion: '',
          },
          {
            VulnerabilityID: 'CVE-TEST-2',
            PkgName: 'libc',
            Severity: 'CRITICAL',
            Status: 'fixed',
            FixedVersion: '1.2',
          },
          { VulnerabilityID: 'CVE-TEST-3', PkgName: 'other', Severity: 'LOW' },
        ],
      },
    ],
  });
  assert.equal(report.highCritical, 2);
  assert.equal(report.fixableHighCritical, 1);
  assert.equal(report.unfixedHighCritical, 1);
  assert.equal(report.packages, 1);
});
