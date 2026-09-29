import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { configureMaps, renderSVG } from '../graphics/render-map.mjs';

const root = new URL('../../', import.meta.url);
const base = 'assets/design-packs/valkyria-2026-09-29';
const read = relative => readFileSync(new URL(relative, root));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const catalog = JSON.parse(read(`${base}/branded/catalog.json`));

test('every branded deliverable has exactly one current export and intact original source', () => {
  assert.equal(catalog.sampleOnly, false);
  const archive = JSON.parse(read(`${base}/inventory.json`));
  assert.equal(catalog.sourceArchiveSha256, archive.archive.archiveSha256);
  assert.match(catalog.sourceArchiveSha256, /^[a-f0-9]{64}$/);
  assert.equal(catalog.entries.length, 340);
  assert.equal(catalog.coverage.length, 458);
  const paths = new Set(), originals = new Set();
  for (const entry of catalog.entries) {
    assert(!paths.has(entry.path)); paths.add(entry.path);
    assert(!originals.has(entry.replaces)); originals.add(entry.replaces);
    const bytes = read(entry.path);
    assert.equal(bytes.length, entry.bytes);
    assert.equal(hash(bytes), entry.sha256);
    assert.equal(hash(read(entry.replaces)), entry.originalSha256);
    assert(entry.branding.includes('valkyria'));
    assert(entry.branding.includes(entry.family.endsWith('wdg') ? 'wdg' : 'hll'));
    if (entry.family.endsWith('community')) assert(entry.branding.includes('wdg'));
    assert(entry.width > 0 && entry.height > 0 && bytes.length <= 5 * 1024 * 1024);
  }
  assert.equal(catalog.coverage.filter(item => item.action === 'use-corrected-export').length, 340);
  for (const item of catalog.coverage) {
    if (item.action === 'use-corrected-export') assert(paths.has(item.replacement));
    else assert(item.reason && !item.replacement);
  }
});

test('editable exports embed exact approved logo bytes and decoder-compatible map backgrounds', () => {
  const approved = Object.fromEntries(Object.entries(catalog.logoSources).map(([name, entry]) => {
    assert.equal(hash(read(entry.path)), entry.sha256);
    if (entry.mime === 'image/png') {
      const png = read(entry.path);
      assert.equal(entry.width, png.readUInt32BE(16));
      assert.equal(entry.height, png.readUInt32BE(20));
    }
    return [name, entry.sha256];
  }));
  let inspected = 0;
  for (const entry of catalog.entries.filter(item => item.path.endsWith('.svg'))) {
    const svg = read(entry.path).toString();
    const brands = [...svg.matchAll(/<image data-brand="([a-z]+)"[^>]+href="data:[^;]+;base64,([^"]+)"/g)];
    assert(brands.length >= 2, entry.path);
    for (const match of brands) assert.equal(hash(Buffer.from(match[2], 'base64')), approved[match[1]]);
    const captions = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(match => match[1].trim());
    assert(!captions.some(caption => /^(?:VALKYRIA|V A L K Y R I A|HELL LET LOOSE|WARDOGS)$/.test(caption)), entry.path);
    assert(!svg.includes('valkyriahll.cz') && !svg.includes('VALKYRIAWDG.CZ'), entry.path);
    assert(!/<script\b|<foreignObject\b|\bon[a-z]+\s*=|(?:href|src)="https?:/i.test(svg), entry.path);
    if (entry.family === 'hll-map') {
      assert.match(svg, /<image id="scene"[^>]+href="data:image\/png;base64,/);
      assert.match(svg, /<image id="tac"[^>]+href="data:image\/jpeg;base64,/);
    }
    inspected++;
  }
  assert.equal(inspected, 54);
});

test('map template scores distinguish numeric zero from unknown and escape supplied text', () => {
  const formats = JSON.parse(read(`${base}/source/01-hll-map-pack/maps.json`)).formats;
  configureMaps([{id:'fixture',name:'Fixture',index:1,code:'FIX',scene:'data:image/png;base64,',tactical:'data:image/jpeg;base64,'}], formats,
    {measureText: text => ({width: text.length * 8})}, name => `<g data-brand="${name}"/>`);
  const zero = renderSVG('fixture', 'match-result', {scoreA:0,scoreB:5,teamB:'<script>not markup</script>'});
  assert.match(zero, />0 : 5<\/text>/);
  assert(!zero.includes('<script>'));
  assert(zero.includes('&lt;SCRIPT&gt;NOT MARKUP&lt;/SCRIPT&gt;'));
  const unknown = renderSVG('fixture', 'match-result', {scoreA:null,scoreB:null});
  assert.match(unknown, />— : —<\/text>/);
});
