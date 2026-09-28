import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// NUL-delimited porcelain preserves whitespace, Unicode and rename source paths.
// Record filenames only, never file contents or machine-absolute paths.
export function dirtyPathsFromStatus(status) {
  const entries = status.split('\0');
  const paths = new Set();
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (!entry) continue;
    assert(entry.length > 3 && entry[2] === ' ', 'Invalid Git porcelain status entry');
    paths.add(entry.slice(3));
    if (/[RC]/.test(entry.slice(0, 2))) {
      const original = entries[++index];
      assert(original, 'Missing original path in Git rename/copy status');
      paths.add(original);
    }
  }
  return [...paths].sort();
}

export function readSourceProvenance(root) {
  const options = { cwd: root, encoding: 'utf8' };
  const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], options).trim();
  const dirtyPaths = dirtyPathsFromStatus(execFileSync('git', [
    'status', '--porcelain=v1', '-z', '--untracked-files=all',
  ], options));
  return { sourceRevision, sourceDirty: dirtyPaths.length > 0, dirtyPaths };
}
