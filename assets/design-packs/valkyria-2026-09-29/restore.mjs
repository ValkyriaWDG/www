// Repository-owned archival utility. It never executes or opens supplied sources.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pack = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(pack, '../../..');
const mode = process.argv[2];
assert(process.argv.length === 3 && ['--verify', '--restore'].includes(mode),
  'Usage: node assets/design-packs/valkyria-2026-09-29/restore.mjs --verify | --restore');
const inventory = JSON.parse(readFileSync(path.join(pack, 'inventory.json'), 'utf8'));
assert.equal(inventory.schemaVersion, 1);
assert.equal(inventory.entries.length, 497);
const output = path.join(repository, '.local/graphics-pack-2026-09-29/restored');
if (mode === '--restore') assert(!existsSync(output), 'Refusing to overwrite an existing restored directory.');
const inside = (base, relative) => {
  assert(typeof relative === 'string' && relative.length > 0 && !relative.includes('\\') && !relative.includes(':'));
  assert(relative.split('/').every(segment => segment && segment !== '.' && segment !== '..'));
  const resolved = path.resolve(base, relative);
  assert(resolved.startsWith(path.resolve(base) + path.sep), 'Path must stay inside its archive root.');
  return resolved;
};
const verify = (data, entry) => {
  assert.equal(data.length, entry.bytes, `Size mismatch: ${entry.path}`);
  assert.equal(createHash('sha256').update(data).digest('hex'), entry.sha256, `Hash mismatch: ${entry.path}`);
  return data;
};
const read = (relative, entry) => {
  const filename = inside(pack, relative);
  assert(lstatSync(filename).isFile() && realpathSync(filename).startsWith(realpathSync(pack) + path.sep), 'Source must be a regular in-pack file.');
  return verify(readFileSync(filename), entry);
};
const original = entry => entry.parts
  ? verify(Buffer.concat(entry.parts.map(part => read(part.path, part))), entry)
  : read(entry.storedPath, entry);
const names = new Set();
let total = 0;
for (const entry of inventory.entries) {
  inside(output, entry.path);
  assert(!names.has(entry.path.toLowerCase()), 'Duplicate archive path');
  names.add(entry.path.toLowerCase());
  total += original(entry).length;
}
assert.equal(total, inventory.archive.uncompressedBytes);
if (mode === '--restore') {
  const realRepository = realpathSync(repository);
  let parent = repository;
  for (const component of ['.local', 'graphics-pack-2026-09-29']) {
    parent = path.join(parent, component);
    let info;
    try { info = lstatSync(parent); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (info) {
      assert(info.isDirectory() && !info.isSymbolicLink(), 'Refusing a linked or non-directory output ancestor.');
    } else {
      mkdirSync(parent);
    }
    assert(realpathSync(parent).startsWith(realRepository + path.sep), 'Output ancestor must remain in repository.');
  }
  mkdirSync(output);
  for (const entry of inventory.entries) {
    const destination = inside(output, entry.path);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, original(entry), { flag: 'wx' });
  }
}
console.log(JSON.stringify({ mode, verifiedOriginalFiles: names.size, verifiedBytes: total,
  restored: mode === '--restore', output: mode === '--restore' ? '.local/graphics-pack-2026-09-29/restored' : null,
  bundledCodeExecuted: false }));
