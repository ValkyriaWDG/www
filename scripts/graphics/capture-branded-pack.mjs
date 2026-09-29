// Capture the actual exported assets in an offline browser gallery, not app UI.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = 'docs/evidence/graphics-brand-correction-2026-09-29';
const destination = path.join(root, folder);
const base = 'assets/design-packs/valkyria-2026-09-29/branded';
const catalogBytes = readFileSync(path.join(root, base, 'catalog.json'));
const catalog = JSON.parse(catalogBytes);
assert.equal(catalog.sampleOnly, false);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const require = createRequire(process.env.GRAPHICS_MODULE_ROOT
  ? path.resolve(process.env.GRAPHICS_MODULE_ROOT, 'package.json')
  : path.join(root, '.local/graphics-tools/package.json'));
const { chromium } = require('@playwright/test');
const groups = [
  ['maps', 'All 20 HLL maps', 'Corrected server cards. Clean scene and tactical originals remain unchanged.', catalog.entries.filter(item => /\/server-card-.*\.webp$/.test(item.path))],
  ['editorial', 'All 14 editorial themes', 'Reference captions are not published news, events, entitlements or results.', catalog.entries.filter(item => /\/03-clanky-og\/.*\.webp$/.test(item.path))],
  ['discord', 'Discord header sources', 'Three native 4:1 exports; no Discord message or embed was posted.', catalog.entries.filter(item => /\/06-discord\/.*\.webp$/.test(item.path))],
  ['formats', 'Foy: remaining template formats', 'Original logos and map layers; scores and event captions are examples.', catalog.entries.filter(item => /\/foy\/(?:article|match-preview|match-result|server-strip|wide|social|tactical-poster)-.*\.webp$/.test(item.path))],
];
assert.deepEqual(groups.map(group => group[3].length), [20, 14, 3, 7]);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const sections = groups.map(([id, title, description, assets]) => `<section id="${id}"><h1>${title}</h1><p>${description}</p><p class="scope">Source-asset review · 2026-09-29 · Not a screenshot of the website</p><div class="grid">${assets.map(item => {
  const relative = path.posix.relative(folder, item.path);
  const name = item.path.substring(item.path.indexOf('/branded/') + 9);
  return `<figure><img src="${relative}" width="${item.width}" height="${item.height}" alt="${escape(name)}"><figcaption>${escape(name)}<br>${item.width} × ${item.height} · ${item.branding.join(' + ')}</figcaption></figure>`;
}).join('')}</div></section>`).join('');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Valkyria corrected asset review</title><style>*{box-sizing:border-box}body{margin:0;background:#101419;color:#ecece9;font:16px Arial,sans-serif}section{padding:28px;max-width:1280px;margin:0 auto;border-bottom:2px solid #d9912d}h1{font-size:30px;margin:0 0 8px}p{margin:6px 0 16px}.scope{color:#a5adb8;font-size:13px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}figure{margin:0;background:#1a2027;padding:8px;min-width:0}img{display:block;width:100%;height:auto}figcaption{margin-top:8px;font:12px/1.5 Arial,sans-serif;overflow-wrap:anywhere;color:#ced5df}#editorial .grid{grid-template-columns:repeat(3,minmax(0,1fr))}#discord .grid{grid-template-columns:1fr}#formats .grid{grid-template-columns:repeat(2,minmax(0,1fr))}@media(max-width:700px){.grid,#editorial .grid,#formats .grid{grid-template-columns:1fr}}</style><body>${sections}</body></html>`;
mkdirSync(destination, {recursive:true});
writeFileSync(path.join(destination, 'gallery.html'), html);
const browser = await chromium.launch({headless:true});
const errors = [], externalRequests = [], captures = [];
try {
  const page = await browser.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:1});
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:/, async route => { externalRequests.push(route.request().url()); await route.abort(); });
  await page.goto(pathToFileURL(path.join(destination, 'gallery.html')).href);
  const decoded = await page.evaluate(async () => {
    await Promise.all([...document.images].map(image => image.decode()));
    return [...document.images].map(image => ({width:image.naturalWidth,height:image.naturalHeight}));
  });
  assert.equal(decoded.length, 44);
  assert(decoded.every(image => image.width > 0 && image.height > 0));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  for (const [id] of groups) {
    const filename = `${id}.png`;
    const bytes = await page.locator(`#${id}`).screenshot({path:path.join(destination, filename)});
    assert(bytes.length <= 5 * 1024 * 1024, 'Capture budget');
    captures.push({path:`${folder}/${filename}`,sha256:hash(bytes),bytes:bytes.length,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});
  }
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  const report = {schemaVersion:1,recordedAt:new Date().toISOString(),scope:'Offline exported-asset review; no application or production acceptance',
    baseRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    catalogSha256:hash(catalogBytes),gallerySha256:hash(Buffer.from(html)),node:process.version,browser:browser.version(),
    viewport:{width:1280,height:1000},decodedImages:decoded.length,pageErrors:errors,externalRequests,
    reviewedAssets:groups.flatMap(group => group[3].map(item => ({path:item.path,sha256:item.sha256}))),captures};
  writeFileSync(path.join(destination,'verification.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({decodedImages:decoded.length,captures,errors,externalRequests}));
} finally {await browser.close();}
