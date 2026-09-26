import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// The checked-in manifest is the trust anchor, not a manifest from an arbitrary ZIP.
const expected = JSON.parse(await readFile(new URL('../../assets/background-media.json', import.meta.url), 'utf8'));
const directory = process.argv[2];
assert.ok(directory, 'Usage: node scripts/media/verify-bundle.mjs <unpacked-bundle-directory>');
const bundle = resolve(directory);
const delivered = JSON.parse(await readFile(join(bundle, 'manifest.json'), 'utf8'));
assert.deepEqual(delivered, expected, 'Bundle manifest differs from the checked-in delivery');
const names = new Set();
for (const asset of expected.assets) {
  assert.match(asset.filename, /^[a-z0-9-]+\.(mp4|webm|webp)$/);
  assert.ok(!names.has(asset.filename), 'Duplicate filename');
  names.add(asset.filename);
  assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  assert.ok(Number.isSafeInteger(asset.bytes) && asset.bytes > 0);
  const bytes = await readFile(join(bundle, asset.filename));
  assert.equal(bytes.length, asset.bytes, `Size mismatch: ${asset.filename}`);
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest, asset.sha256, `SHA-256 mismatch: ${asset.filename}`);
  console.log(`OK ${asset.filename} (${bytes.length} bytes)`);
}
assert.equal(names.size, 4, 'Expected all four delivery files');
console.log('Verified all derivative bytes against the repository manifest.');
