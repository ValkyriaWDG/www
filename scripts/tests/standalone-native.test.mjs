import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { linkStandaloneSharp } from '../../apps/web/scripts/link-standalone-sharp.mjs';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'valkyria-native-'));
  const app = path.join(root, 'apps/web');
  mkdirSync(app, { recursive: true });
  writeFileSync(path.join(app, 'package.json'), JSON.stringify({ dependencies: { sharp: '0.35.4' } }));
  const add = (name, version = '0.35.4') => {
    const target = path.join(root, 'node_modules/.pnpm', name, 'node_modules/sharp');
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, 'package.json'), JSON.stringify({ name: 'sharp', version, main: 'index.cjs' }));
    writeFileSync(path.join(target, 'index.cjs'), 'module.exports = "traced-package";');
    return target;
  };
  return { root, app, add, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('exposes the exact traced package to a standalone external CLI', () => {
  const f = fixture();
  try {
    f.add('sharp@0.35.4_peer-version');
    const requireApp = createRequire(path.join(f.app, 'package.json'));
    assert.throws(() => requireApp('sharp'), { code: 'MODULE_NOT_FOUND' });
    linkStandaloneSharp(f.root);
    assert.equal(requireApp('sharp'), 'traced-package');
    assert(requireApp.resolve('sharp').startsWith(f.root));
    assert.doesNotThrow(() => linkStandaloneSharp(f.root));
  } finally { f.cleanup(); }
});

test('resolves a real ESM external import from the final image scripts directory', () => {
  const f = fixture();
  try {
    f.add('sharp@0.35.4_peer-version');
    mkdirSync(path.join(f.root, 'scripts'));
    const entry = path.join(f.root, 'scripts/import-legacy-hll.mjs');
    writeFileSync(entry, 'import sharp from "sharp"; console.log(sharp);');
    linkStandaloneSharp(f.root);
    assert.equal(execFileSync(process.execPath, [entry], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(), 'traced-package');
  } finally { f.cleanup(); }
});

test('refuses absent, ambiguous or version-mismatched traced packages', () => {
  for (const kind of ['absent', 'ambiguous', 'wrong-version']) {
    const f = fixture();
    try {
      if (kind !== 'absent') f.add('sharp@0.35.4_peer-version', kind === 'wrong-version' ? '0.34.0' : '0.35.4');
      if (kind === 'ambiguous') f.add('sharp@0.35.4_other-peer');
      assert.throws(() => linkStandaloneSharp(f.root));
    } finally { f.cleanup(); }
  }
});
