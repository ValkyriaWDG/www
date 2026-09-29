#!/usr/bin/env node
// Derives the runtime artwork selected from the archived owner graphics pack
// (assets/design-packs/valkyria-2026-09-29) and the official HLL mark, and registers it
// in assets/manifest.json. Pack sources are checked against the pack inventory and must
// be clean layers in branded/catalog.json; the mark against its catalog. Idempotent;
// `--check` only verifies that every derivative and manifest record is current.
// Usage: node scripts/media/derive-graphics-pack.mjs [--check]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharp = createRequire(path.join(root, 'apps/web/package.json'))('sharp');
const check = process.argv[2] === '--check';
assert(process.argv.length === 2 || (process.argv.length === 3 && check), 'Usage: derive-graphics-pack.mjs [--check]');

const PACK = 'assets/design-packs/valkyria-2026-09-29';
const ARCHIVE = 'b4fe3e080cecf2cac9c3f10d26198d2b367d353a42187433344059d19465574b';
const inventory = JSON.parse(readFileSync(path.join(root, PACK, 'inventory.json'), 'utf8'));
const entries = new Map(inventory.entries.map((entry) => [entry.path, entry]));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

// The brand-correction catalog decides per original: only clean layers without a
// typographic brand block may be derived; branded compositions have corrected replacements.
const branded = JSON.parse(readFileSync(path.join(root, PACK, 'branded/catalog.json'), 'utf8'));
const coverage = new Map(branded.coverage.map((entry) => [entry.original, entry]));

function source(original) {
  const entry = entries.get(original);
  assert(entry?.storedPath, `Not an archived original: ${original}`);
  const decision = coverage.get(`${PACK}/${entry.storedPath}`);
  assert.equal(decision?.action, 'retain-unbranded-source', `Not a retained clean layer in branded/catalog.json: ${original}`);
  const bytes = readFileSync(path.join(root, PACK, entry.storedPath));
  assert.equal(bytes.length, entry.bytes, `Size mismatch: ${original}`);
  assert.equal(sha(bytes), entry.sha256, `Hash mismatch: ${original}`);
  return { bytes, entry };
}

/** Official game mark from assets/brand/game-logos, verified against its catalog. */
function brandSource(file) {
  const catalog = JSON.parse(readFileSync(path.join(root, 'assets/brand/game-logos/catalog.json'), 'utf8'));
  const asset = catalog.assets.find((candidate) => candidate.path === file && candidate.role === 'runtime-source');
  assert(asset, `Not a runtime-source game mark: ${file}`);
  const bytes = readFileSync(path.join(root, 'assets/brand/game-logos', file));
  assert.equal(bytes.length, asset.bytes, `Size mismatch: ${file}`);
  assert.equal(sha(bytes), asset.sha256, `Hash mismatch: ${file}`);
  return { bytes, entry: { storedPath: null, sha256: asset.sha256 }, catalog };
}

const MAP_RIGHTS =
  'Hell Let Loose map imagery belongs to its respective rights holders. Obtained by the owner from the community project l1tku/hll-arty-map-calculator (snapshot 28f520a), whose MIT license explicitly excludes game imagery and which states non-commercial, educational and informational use; selected by the Valkyria owner for this community website. Excluded from the Apache-2.0 code license; this record does not grant downstream reuse rights.';
const SCENE_RIGHTS =
  'AI-created game-inspired illustration supplied by the Valkyria owner (VALKYRIA-GRAFIKA-KOMPLET.zip, 2026-09-29) for this website; not a game screenshot, official key art or evidence of a clan event. Excluded from the Apache-2.0 code license; this record does not grant downstream reuse rights.';

const MAPS = [
  'carentan', 'driel', 'el-alamein', 'elsenborn-ridge', 'foy', 'hill-400', 'hurtgen-forest', 'juno-beach', 'kharkov', 'kursk',
  'mortain', 'omaha-beach', 'purple-heart-lane', 'remagen', 'sainte-marie-du-mont', 'sainte-mere-eglise', 'smolensk', 'stalingrad', 'tobruk', 'utah-beach',
];
const TEMPLATES = ['hll-infantry', 'hll-assault', 'hll-tactical', 'hll-veteran', 'wdg-blue', 'wdg-combat', 'wdg-operator', 'hub'];

/** [output path, original path, transform (null = byte-identical copy), transformation text, usage, rights, id] */
const jobs = [];
for (const slug of MAPS) {
  const dir = `apps/web/public/images/hll/maps/${slug}`;
  const from = (file) => `01-hll-map-pack/maps/${slug}/${file}`;
  jobs.push(
    {
      id: `hll-map-${slug}-thumb`, out: `${dir}/thumb-160x90.webp`, original: from('source-scene-718x404.webp'),
      transform: (image) => image.resize(160, 90, { fit: 'cover', position: 'centre' }).webp({ quality: 72, effort: 6 }),
      transformations: 'sharp resize 718x404 to 160x90 (same 16:9 frame), WebP quality 72, effort 6, metadata stripped; no text, crop or compositing',
      usage: 'HLL server list row thumbnail beside the textual map name (decorative, lazy-loaded)', rights: MAP_RIGHTS,
    },
    {
      id: `hll-map-${slug}-scene`, out: `${dir}/scene-718x404.webp`, original: from('source-scene-718x404.webp'), transform: null,
      transformations: 'byte-identical copy of the archived source scene; no transformation',
      usage: 'selected HLL server and match map briefing scene; map name, mode and state stay HTML', rights: MAP_RIGHTS,
    },
    {
      id: `hll-map-${slug}-tactical`, out: `${dir}/tactical-1024.webp`, original: from('source-tactical-4096x4096.webp'),
      transform: (image) => image.resize(1024, 1024).webp({ quality: 74, effort: 6 }),
      transformations: 'sharp resize 4096x4096 to 1024x1024, WebP quality 74, effort 6, metadata stripped; no crop, marks or compositing',
      usage: 'tactical map opened on demand from the HLL server/match map briefing; never preloaded', rights: MAP_RIGHTS,
    },
    {
      id: `hll-map-${slug}-sharing`, out: `${dir}/sharing-1200x630.webp`, original: from('tactical-background-1920x1080.webp'),
      transform: (image) => image.resize(1200, 630, { fit: 'cover', position: 'centre' }).webp({ quality: 72, effort: 6 }),
      transformations: 'sharp cover resize of the text-free pack tactical background 1920x1080 to 1200x630 (centre crop of 27 px rows at 1200 wide), WebP quality 72, effort 6, metadata stripped',
      usage: 'background of the server-rendered 1200x630 sharing card for HLL matches on this map (read by the renderer; not linked from pages)', rights: MAP_RIGHTS,
    },
  );
}
for (const name of TEMPLATES) {
  const dir = 'apps/web/public/images/editorial';
  const original = `02-predchozi-bannery/assets/${name}.webp`;
  jobs.push(
    {
      id: `editorial-template-${name}`, out: `${dir}/${name}-1920x1080.webp`, original, transform: null,
      transformations: 'byte-identical copy of the archived text-free scene; no transformation',
      usage: 'editorial template background: imported into the media library only by an authorized editor; default sharing-card background where noted in docs/assets/graphics-pack-2026-09-29.md', rights: SCENE_RIGHTS,
    },
    {
      id: `editorial-template-${name}-preview`, out: `${dir}/${name}-480x270.webp`, original,
      transform: (image) => image.resize(480, 270).webp({ quality: 70, effort: 6 }),
      transformations: 'sharp resize 1920x1080 to 480x270, WebP quality 70, effort 6, metadata stripped; no crop or compositing',
      usage: name === 'hub'
        ? 'preview in the authenticated admin editorial template library; decorative artwork of coverless shared community news cards'
        : 'preview in the authenticated admin editorial template library',
      rights: SCENE_RIGHTS,
    },
  );
}

const HLL_MARK_RIGHTS =
  'Official Hell Let Loose full mark (emblem and wordmark) from the navigation of https://www.hellletloose.com/game/hll, retrieved 2026-09-29; the page names Team17 Digital Limited. Third-party game artwork/trademark used to identify the game on the independent community website at the owner\'s request; excluded from the Apache-2.0 code license; no redistribution license, trademark permission or endorsement is asserted.';
jobs.push({
  id: 'hll-official-fullmark-runtime', out: 'apps/web/public/brand/hell-let-loose-fullmark-white.svg', brand: 'hell-let-loose-fullmark-white.svg', transform: null,
  transformations: 'byte-identical copy of assets/brand/game-logos/hell-let-loose-fullmark-white.svg (424x78, transparent, 34 paths, no active content)',
  usage: 'Hell Let Loose mark on the community hub game card and in the sharing-card header; the adjacent/accessible text keeps the game name', rights: HLL_MARK_RIGHTS,
});

const manifestPath = path.join(root, 'assets/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const byId = new Map(manifest.assets.map((asset, index) => [asset.id, index]));
const stale = [];
const summary = {};
for (const job of jobs) {
  const { bytes: input, entry } = job.brand ? brandSource(job.brand) : source(job.original);
  const output = job.transform ? await job.transform(sharp(input)).toBuffer() : input;
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, job.brand ? 'svg' : 'webp');
  const record = {
    id: job.id,
    path: job.out,
    source: job.brand
      ? `Copy of assets/brand/game-logos/${job.brand} (catalog runtime-source; see assets/brand/game-logos/catalog.json)`
      : `Derived from ${PACK}/${entry.storedPath} (owner-supplied VALKYRIA-GRAFIKA-KOMPLET.zip, archive SHA256 ${ARCHIVE})`,
    sourceSha256: entry.sha256,
    usage: job.usage,
    rights: job.rights,
    transformations: job.transformations,
    sha256: sha(output),
    bytes: output.length,
    width: metadata.width,
    height: metadata.height,
  };
  const file = path.join(root, job.out);
  const current = existsSync(file) ? readFileSync(file) : null;
  const index = byId.get(job.id);
  if (!current || !current.equals(output)) {
    stale.push(job.out);
    if (!check) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, output);
    }
  }
  if (index === undefined || JSON.stringify(manifest.assets[index]) !== JSON.stringify(record)) {
    stale.push(`manifest:${job.id}`);
    if (index === undefined) byId.set(job.id, manifest.assets.push(record) - 1);
    else manifest.assets[index] = record;
  }
  summary[job.out.replace('apps/web/public', '')] = output.length;
}
if (check) {
  assert.deepEqual(stale, [], `Stale graphics derivatives: ${stale.join(', ')}`);
  console.log(`All ${jobs.length} graphics-pack derivatives and manifest records are current.`);
} else {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const total = Object.values(summary).reduce((sum, value) => sum + value, 0);
  console.log(`Wrote ${stale.length} changes; ${jobs.length} derivatives, ${total} bytes.`);
}
// Tactical sizes feed the on-demand link text in the application.
const tactical = Object.fromEntries(MAPS.map((slug) => [slug, summary[`/images/hll/maps/${slug}/tactical-1024.webp`]]));
const bytesFile = path.join(root, 'apps/web/src/modules/games/hll-map-tactical-bytes.json');
const bytesJson = `${JSON.stringify(tactical, null, 2)}\n`;
if (check) assert.equal(readFileSync(bytesFile, 'utf8'), bytesJson, 'Stale hll-map-tactical-bytes.json');
else writeFileSync(bytesFile, bytesJson);
