// Next traces sharp's pnpm package graph but does not expose a bare import for
// external operational CLIs. Link only the exact already-traced app dependency.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function linkStandaloneSharp(directory) {
  const root = realpathSync(directory);
  const app = path.join(root, 'apps/web');
  const expected = JSON.parse(readFileSync(path.join(app, 'package.json'), 'utf8')).dependencies?.sharp;
  assert(typeof expected === 'string' && /^\d+\.\d+\.\d+$/.test(expected), 'Expected a pinned sharp dependency');
  const store = path.join(root, 'node_modules/.pnpm');
  const candidates = readdirSync(store).filter(name => name.startsWith('sharp@'));
  assert.equal(candidates.length, 1, 'Expected one traced sharp package');
  const target = realpathSync(path.join(store, candidates[0], 'node_modules/sharp'));
  assert(target.startsWith(root + path.sep), 'Traced dependency must stay inside the standalone tree');
  const pkg = JSON.parse(readFileSync(path.join(target, 'package.json'), 'utf8'));
  assert(pkg.name === 'sharp' && pkg.version === expected, 'Traced sharp must match the application pin');
  // Next's server resolves from apps/web; bundled ESM CLIs execute from scripts
  // and walk the standalone root instead. Both must use the same traced package.
  for (const modules of [path.join(app, 'node_modules'), path.join(root, 'node_modules')]) {
    mkdirSync(modules, { recursive: true });
    const link = path.join(modules, 'sharp');
    if (existsSync(link)) assert.equal(realpathSync(link), target, 'Existing sharp entry points to a different package');
    else symlinkSync(process.platform === 'win32' ? target : path.relative(modules, target), link, process.platform === 'win32' ? 'junction' : 'dir');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(process.argv[2], 'Usage: node link-standalone-sharp.mjs <standalone-root>');
  linkStandaloneSharp(process.argv[2]);
}
