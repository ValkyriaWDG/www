// Regenerates the committed web derivatives of the Wardogs presskit selection
// (docs/assets/presskit-2026-01.md) into public/presskit/. Originals stay unchanged in
// assets/presskit/; photos become proportional WebP resizes (no crop), the SVG wordmark
// is copied byte-for-byte. Prints asset-manifest entries for the written files.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(appDir, '../..');
const sourceDir = path.join(repo, 'assets/presskit/wardogs-january-2026');
const outDir = path.join(appDir, 'public/presskit');
mkdirSync(outDir, { recursive: true });

const RESIZES = [
  { source: 'key-art-1080p.png', name: 'key-art', widths: [960, 1920], use: 'clan page Wardogs key art (object-fit: contain, full composition)' },
  { source: 'flying.jpg', name: 'flying', widths: [800, 1600], use: 'community recruitment illustration (complete 16:9 frame)' },
];
const COPIES = [{ source: 'fullmark-white.svg', name: 'wardogs-fullmark-white.svg', use: 'Wardogs game identifier on dark news placeholders' }];

const entries = [];
const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
for (const item of RESIZES) {
  for (const width of item.widths) {
    const target = path.join(outDir, `${item.name}-${width}.webp`);
    const info = await sharp(path.join(sourceDir, item.source)).resize({ width, withoutEnlargement: true }).webp({ quality: 80, effort: 6 }).toFile(target);
    entries.push({ file: target, source: item.source, use: item.use, width: info.width, height: info.height, transformation: `Proportional Lanczos resize to ${info.width} px wide, WebP quality 80 via sharp` });
  }
}
for (const item of COPIES) {
  const target = path.join(outDir, item.name);
  copyFileSync(path.join(sourceDir, item.source), target);
  entries.push({ file: target, source: item.source, use: item.use, transformation: 'Byte-identical copy of the original' });
}
for (const entry of entries) {
  const bytes = readFileSync(entry.file).length;
  console.log(JSON.stringify({ path: path.relative(repo, entry.file), source: entry.source, use: entry.use, width: entry.width, height: entry.height, bytes, sha256: digest(entry.file), transformation: entry.transformation }));
}
