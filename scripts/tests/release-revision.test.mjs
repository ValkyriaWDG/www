import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { validateReleaseRevision } from '../check-release-revision.mjs';

const accepted = 'a'.repeat(40);
const changed = 'b'.repeat(40);

test('only the complete accepted workflow revision passes', () => {
  assert.equal(validateReleaseRevision(accepted, accepted), null);
  for (const [expected, actual] of [[accepted, changed], [undefined, accepted], [accepted, undefined], ['', accepted], ['abc123', accepted], ['main', accepted], [accepted.toUpperCase(), accepted]]) {
    assert.notEqual(validateReleaseRevision(expected, actual), null);
  }
});

test('publication CLI fails closed before a mismatched or missing revision', () => {
  for (const [expected, actual, status] of [[accepted, accepted, 0], [accepted, changed, 1], ['', accepted, 1]]) {
    const result = spawnSync(process.execPath, ['scripts/check-release-revision.mjs'], {
      env: { ...process.env, EXPECTED_SHA: expected, GITHUB_SHA: actual }, encoding: 'utf8',
    });
    assert.equal(result.status, status, result.stderr);
  }
});
