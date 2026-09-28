import assert from 'node:assert/strict';
import test from 'node:test';
import { dirtyPathsFromStatus } from '../release/source-provenance.mjs';

test('records tracked changes and exact untracked generated files, not just a dirty flag', () => {
  assert.deepEqual(dirtyPathsFromStatus(' M apps/web/source.ts\0?? sbom/valkyria-web.cdx.json\0'), [
    'apps/web/source.ts', 'sbom/valkyria-web.cdx.json',
  ]);
  assert.deepEqual(dirtyPathsFromStatus(''), []);
});

test('preserves unusual filenames and both rename paths without porcelain quoting', () => {
  assert.deepEqual(dirtyPathsFromStatus('R  docs/new name.md\0docs/old name.md\0?? docs/čeština "proof".md\0?? docs/trailing \0'), [
    'docs/new name.md', 'docs/old name.md', 'docs/trailing ', 'docs/čeština "proof".md',
  ]);
});

test('refuses incomplete rename evidence rather than reporting partial dirty paths', () => {
  assert.throws(() => dirtyPathsFromStatus('R  docs/new.md\0'), /Missing original path/);
  assert.throws(() => dirtyPathsFromStatus('invalid\0'), /Invalid Git porcelain/);
});
