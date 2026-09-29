// Repository-owned exporter for editable native SVG layouts. No archived scripts run.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureMaps, renderSVG } from './render-map.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = 'assets/design-packs/valkyria-2026-09-29';
const source = `${base}/source`;
const destination = `${base}/branded`;
const sample = process.argv.includes('--sample');
assert(process.argv.slice(2).every(arg => arg === '--sample'), 'Only --sample is accepted.');
const require = createRequire(process.env.GRAPHICS_MODULE_ROOT
  ? path.resolve(process.env.GRAPHICS_MODULE_ROOT, 'package.json')
  : path.join(repo, '.local/graphics-tools/package.json'));
const sharp = require('sharp');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
assert(GlobalFonts.has('Arial') && GlobalFonts.has('Impact'), 'Export environment needs Arial and Impact; never silently substitute fonts.');
const measure = createCanvas(1, 1).getContext('2d');
const sha = data => createHash('sha256').update(data).digest('hex');
const read = relative => readFileSync(path.join(repo, relative));
const json = relative => JSON.parse(read(relative));
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' })[c]);
const uri = (relative, mime) => `data:${mime};base64,${read(relative).toString('base64')}`;
const logoSources = {
  valkyria: { path: 'assets/brand/valkyria-logo.png', mime: 'image/png', width: 733, height: 811 },
  hll: { path: 'assets/brand/game-logos/hell-let-loose-fullmark-white.svg', mime: 'image/svg+xml', width: 424, height: 78 },
  wdg: { path: 'assets/presskit/wardogs-january-2026/fullmark-white.svg', mime: 'image/svg+xml', width: 2467, height: 489 },
};
for (const value of Object.values(logoSources)) {
  value.sha256 = sha(read(value.path));
  value.data = uri(value.path, value.mime);
}
function logo(name, x, y, w, h) {
  assert(logoSources[name], 'Known original logo required.');
  return `<image data-brand="${name}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMinYMid meet" href="${logoSources[name].data}"/>`;
}
const entries = [];
function write(relative, buffer) {
  assert(!relative.includes('..') && !path.isAbsolute(relative));
  const filename = path.join(repo, relative);
  // Check ancestors before directory creation to avoid redirected writes.
  let ancestor = repo;
  for (const part of relative.split('/').slice(0, -1)) {
    ancestor = path.join(ancestor, part);
    if (existsSync(ancestor)) {
      assert(lstatSync(ancestor).isDirectory() && !lstatSync(ancestor).isSymbolicLink());
      assert(realpathSync(ancestor).startsWith(realpathSync(repo) + path.sep));
    } else mkdirSync(ancestor);
  }
  if (existsSync(filename)) assert(lstatSync(filename).isFile() && !lstatSync(filename).isSymbolicLink());
  writeFileSync(filename, buffer);
}
async function output(relative, svg, original, width, height, family) {
  const extension = path.extname(relative).slice(1);
  const originalSha256 = original ? sha(read(`${source}/${original}`)) : null;
  let buffer = Buffer.from(svg);
  if (extension !== 'svg') {
    const renderer = sharp(buffer).resize(width, height, { fit: 'fill' });
    buffer = extension === 'webp' ? await renderer.webp({ quality: 92 }).toBuffer()
      : extension === 'jpg' ? await renderer.jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toBuffer()
      : await renderer.png().toBuffer();
    const metadata = await sharp(buffer).metadata();
    assert.equal(metadata.width, width); assert.equal(metadata.height, height);
    await sharp(buffer).raw().toBuffer();
  }
  assert(buffer.length <= 5 * 1024 * 1024, `Oversized output: ${relative}`);
  write(`${destination}/${relative}`, buffer);
  entries.push({ path: `${destination}/${relative}`, replaces: original ? `${source}/${original}` : null,
    family, width, height, bytes: buffer.length, sha256: sha(buffer),
    originalSha256,
    branding: [...new Set([...svg.matchAll(/data-brand="([a-z]+)"/g)].map(match => match[1]))],
    status: 'brand-corrected-source-template-not-published-content' });
}

// HLL layouts: same map scenes, tactical sources and template geometry; exact marks.
const catalog = json(`${source}/01-hll-map-pack/maps.json`);
// WebP-in-SVG is not supported by every decoder. Preserve scene pixels as PNG;
// encode the already-lossy tactical preview as JPEG98/4:4:4 to keep SVG below 5 MiB.
// Original WebPs remain untouched in source/; this affects template derivatives only.
const rasterUri = async (relative, tactical = false) => {
  const renderer = sharp(read(relative));
  const buffer = tactical ? await renderer.jpeg({quality:98,chromaSubsampling:'4:4:4'}).toBuffer() : await renderer.png().toBuffer();
  return `data:image/${tactical?'jpeg':'png'};base64,${buffer.toString('base64')}`;
};
const maps = [];
for (const map of catalog.maps) maps.push({ ...map,
  scene: await rasterUri(`${source}/01-hll-map-pack/maps/${map.id}/${map.assets.scene}`),
  tactical: await rasterUri(`${source}/01-hll-map-pack/maps/${map.id}/${map.assets.tacticalPreview}`, true),
});
configureMaps(maps, catalog.formats, measure, logo);
for (const map of sample ? maps.filter(item => item.id === 'foy') : maps) {
  for (const [kind, dimensions] of Object.entries(catalog.formats)) {
    if (kind === 'tactical-background') continue; // Intentionally unbranded; retain original bytes.
    const svg = renderSVG(map.id, kind);
    const formats = ['webp'];
    if (['article', 'match-preview'].includes(kind)) formats.push('jpg');
    if (['article', 'match-result'].includes(kind)) formats.push('svg');
    for (const extension of formats) {
      const relative = `01-hll-map-pack/maps/${map.id}/${kind}-${dimensions.width}x${dimensions.height}.${extension}`;
      await output(relative, svg, relative, dimensions.width, dimensions.height, 'hll-map');
    }
  }
  console.log(`Map exports: ${map.id}`);
}

// Editorial layouts use the original clean image layer from each editable SVG.
const presets = json(`${source}/02-predchozi-bannery/manifest.json`);
const rectangle = (x, y, w, h, fill, more = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${more}/>`;
function text(content, x, y, size, maxWidth, { color = '#f2f0e9', family = 'Arial', weight = 700, anchor = 'start' } = {}) {
  measure.font = `${weight} ${size}px ${family}`;
  const measured = measure.measureText(content).width;
  if (measured > maxWidth) size *= maxWidth / measured;
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}" dominant-baseline="hanging">${escape(content)}</text>`;
}
function frame(width, height, body, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${escape(title)}</title><desc>Brand-corrected source template. Captions remain reference content, not proof of an event or live result.</desc>${body}</svg>`;
}
function background(preset) {
  const native = read(`${source}/02-predchozi-bannery/07-sablony/${preset.slug}.svg`).toString();
  const embedded = native.match(/<image\b[^>]*(?:xlink:)?href="(data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+)"/);
  assert(embedded, `Clean image layer missing: ${preset.slug}`);
  return embedded[1];
}
function editorial(preset, w, h, { discord = false } = {}) {
  const scale = w / 1920; const margin = w * .05625;
  const square = h >= w; const compact = h / w < .35;
  const accent = '#f58b21', muted = '#b8bab6';
  let s = `<image width="${w}" height="${h}" href="${background(preset)}" preserveAspectRatio="xMidYMid slice"/>`;
  s += `<defs><linearGradient id="dim"><stop stop-color="#03070a" stop-opacity=".25"/><stop offset="1" stop-color="#03070a" stop-opacity="0"/></linearGradient></defs>`;
  s += rectangle(0, 0, w, h, 'url(#dim)') + rectangle(0, 0, w*.57, Math.max(3, h*.0046), accent)
    + rectangle(w*.57, 0, w*.43, Math.max(3, h*.0046), '#eb482d');
  const crestHeight = compact ? h*.30 : Math.min(h*.145, w*.105);
  const crestTop = compact ? h*.13 : h*.04;
  s += logo('valkyria', margin, crestTop, crestHeight*733/811, crestHeight);
  const markWidth = compact ? w*.21 : w*.22;
  const markHeight = markWidth*.199;
  const markY = compact ? h*.18 : h*.062;
  if (preset.theme !== 'community') s += logo(preset.theme, w-margin-markWidth, markY, markWidth, markHeight);
  else {
    const width = markWidth*.76;
    s += logo('hll', w-margin-width, crestTop, width, width*78/424);
    s += logo('wdg', w-margin-width, crestTop+width*78/424+h*.018, width, width*489/2467);
  }
  const kicker = preset.kicker.replace(/^(?:WARDOGS|HELL LET LOOSE|VALKYRIA)\s*\/\s*/, '')
    .replace('KOMUNITA VALKYRIA', 'KOMUNITA');
  const lines = discord ? [] : preset.lines;
  if (compact) {
    // Both marks stay separate, legible and full aspect ratio; community label is HTML-safe copy.
    const label = preset.theme === 'community' ? 'CZ & SK KOMUNITA' : 'CZ & SK';
    s += text(label, margin, h*.60, h*.105, w*.60, { weight: 700 });
    s += text('valkyria.cz', margin, h*.83, h*.045, w*.5, { color: muted });
  } else if (square) {
    s += text(kicker, margin, h*.52, w*.02, w*.87, { color: accent });
    let size = w*.105; let y = h*.585;
    for (const line of lines) { measure.font = `900 ${size}px Impact`; size = Math.min(size, size*w*.87/measure.measureText(line).width); }
    for (const [index, line] of lines.entries()) {
      if (line === 'WARDOGS') s += logo('wdg', margin, y, w*.68, w*.68*489/2467);
      else s += text(line, margin, y, size, w*.87, { family: 'Impact', weight: 900, color: index === preset.highlight ? accent : '#f2f0e9' });
      y += size*1.23;
    }
  } else if (preset.layout === 'match') {
    s += text(kicker, w/2, h*.25, 22*scale, w*.82, { anchor: 'middle', color: accent });
    s += logo('valkyria', w*.195, h*.37, w*.16, h*.30);
    s += text(lines[1], w*.735, h*.39, 190*scale, w*.32, { family: 'Impact', anchor: 'middle' });
    s += text('VS', w/2, h*.47, 74*scale, w*.10, { family: 'Impact', color: accent, anchor: 'middle' });
    s += text(preset.sub, w/2, h*.72, 48*scale, w*.82, { anchor: 'middle' });
  } else {
    const centered = preset.layout === 'center';
    const x = centered ? w/2 : margin;
    const options = { anchor: centered ? 'middle' : 'start' };
    s += text(kicker, x, h*.27, 22*scale, centered ? w*.86 : w*.71, { ...options, color: accent });
    let size = (centered ? 119 : 148)*scale;
    for (const line of lines) { measure.font = `900 ${size}px Impact`; size = Math.min(size, size*w*(centered?.82:.65)/measure.measureText(line).width); }
    let y = h*.365;
    for (const [index, line] of lines.entries()) {
      if (line === 'WARDOGS') s += logo('wdg', margin, y, w*.37, size*.95);
      else s += text(line, x, y, size, centered ? w*.82 : w*.65, { ...options, family: 'Impact', weight: 900, color: index === preset.highlight ? accent : '#f2f0e9' });
      y += Math.max(size*1.23, h*.115);
    }
    s += text(preset.sub, x, Math.max(h*.71, y+h*.02), 29*scale, centered ? w*.88 : w*.71, { ...options, color: muted, weight: 400 });
  }
  if (!compact) {
    s += rectangle(margin, h*.883, w-2*margin, 1.1*scale, '#3f4547');
    if (!square) s += text(preset.bottom.replace(/HELL LET LOOSE\s*\/\s*/, ''), margin, h*.911, 19*scale, w*.63, { color: muted, weight: 400 });
    s += text('valkyria.cz', square ? margin : w-margin, h*.911, square ? 20 : 22*scale, w*.30, { anchor: square ? 'start' : 'end' });
  }
  return frame(w, h, s, preset.name);
}
for (const preset of sample ? presets.filter(item => ['01-wardogs-server', '12-komunita-discord', '13-vlk-vs-ejig'].includes(item.slug)) : presets) {
  for (const [folder, w, h, extensions] of [
    ['02-clanky-fhd',1920,1080,['webp','png']], ['03-clanky-og',1200,630,['webp','jpg']],
    ['04-karty',800,450,['webp']], ['05-social',1080,1080,['webp','png']],
  ]) {
    const check = `02-predchozi-bannery/${folder}/${preset.slug}-${w}x${h}.${extensions[0]}`;
    if (!existsSync(path.join(repo, source, check))) continue;
    const svg = editorial(preset, w, h);
    for (const extension of extensions) {
      const relative = `02-predchozi-bannery/${folder}/${preset.slug}-${w}x${h}.${extension}`;
      await output(relative, svg, relative, w, h, `editorial-${preset.theme}`);
    }
  }
  const relative = `02-predchozi-bannery/07-sablony/${preset.slug}.svg`;
  await output(relative, editorial(preset,1920,1080), relative,1920,1080,`editorial-${preset.theme}`);
  console.log(`Editorial exports: ${preset.slug}`);
}
for (const [slug, presetSlug] of [['hll','09-hll-novinky'],['wardogs','01-wardogs-server'],['komunita','12-komunita-discord']]) {
  const preset = presets.find(item => item.slug === presetSlug);
  const svg = editorial(preset,1920,480,{discord:true});
  for (const extension of ['webp','png']) {
    const relative = `02-predchozi-bannery/06-discord/valkyria-${slug}-1920x480.${extension}`;
    await output(relative,svg,relative,1920,480,`discord-${preset.theme}`);
  }
}
const replaced = new Map(entries.map(item => [item.replaces, item.path]));
const archive = json(`${base}/inventory.json`);
const coverage = archive.entries.filter(item => /\.(?:png|jpe?g|webp|svg)$/.test(item.path)).map(item => {
  const original = `${source}/${item.path}`;
  if (replaced.has(original)) return {original, action:'use-corrected-export', replacement:replaced.get(original)};
  const retained = /(?:source-scene|source-tactical|tactical-preview|tactical-background|01-pozadi\/|02-predchozi-bannery\/assets\/|03-pozadi-a-revize\/)/.test(item.path);
  return {original, action:retained?'retain-unbranded-source':'archive-reference-only',
    reason:retained?'No typographic brand block; preserve the supplied source/background.':'Original contact sheet, editor screenshot or retired concept; not a runtime candidate.'};
});
write(`${destination}/catalog.json`, JSON.stringify({schemaVersion:1, sampleOnly:sample,
  sourceArchiveSha256:archive.archive.archiveSha256, generatedBy:'scripts/graphics/export-branded-pack.mjs',
  logoSources:Object.fromEntries(Object.entries(logoSources).map(([name,{data,...details}])=>[name,details])),
  entries, coverage},null,2)+'\n');
console.log(JSON.stringify({exports:entries.length, coveredOriginalImages:coverage.length, sampleOnly:sample}));
