import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const repository = resolve(directory, '../../..');
const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 2 && args[0] === '--playwright-package'), 'Use: node verify.mjs [--playwright-package /path/to/@playwright/test/package.json]');
const require = args.length ? createRequire(resolve(args[1])) : createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const playwrightVersion = require('@playwright/test/package.json').version;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const catalog = JSON.parse(await readFile(resolve(directory, 'catalog.json'), 'utf8'));
assert.equal(catalog.preview.file, 'contact-sheet.html');
for (const capture of catalog.captures ?? []) {
  assert.match(capture.file, /^evidence\/contact-sheet-(desktop|mobile)\.png$/);
  const bytes = await readFile(resolve(directory, capture.file));
  assert.equal(digest(bytes), capture.sha256, capture.file + ' recorded digest');
  assert.equal(bytes.length, capture.bytes, capture.file + ' recorded size');
  assert.equal(bytes.readUInt32BE(16), capture.width, capture.file + ' recorded width');
  assert.equal(bytes.readUInt32BE(20), capture.height, capture.file + ' recorded height');
}
assert.equal(catalog.icons.length, 16);
assert.equal(new Set(catalog.icons.map((item) => item.id)).size, 16);
const sources = await Promise.all(catalog.icons.map(async (item) => {
  assert.match(item.file, /^[a-z]+\.svg$/);
  assert.equal(item.file, item.id + '.svg');
  const bytes = await readFile(resolve(directory, item.file));
  assert.equal(bytes.length, item.bytes, item.file + ' byte size');
  assert.equal(digest(bytes), item.sha256, item.file + ' digest');
  assert(bytes.length < 2048, item.file + ' source budget');
  return { id: item.id, svg: bytes.toString('utf8') };
}));
const html = await readFile(resolve(directory, catalog.preview.file));
assert.equal(digest(html), catalog.preview.sha256, 'Contact-sheet digest');
assert.equal(html.length, catalog.preview.bytes);
const browser = await chromium.launch({ headless: true });
const captures = [];
let geometry;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  const externalRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(/^https?:/, async (route) => {
    externalRequests.push(route.request().url());
    await route.abort();
  });
  await page.goto(pathToFileURL(resolve(directory, 'contact-sheet.html')).href);
  geometry = await page.evaluate((items) => {
    const fail = (message) => { throw new Error(message); };
    const expectedRoot = {
      xmlns: 'http://www.w3.org/2000/svg', width: '24', height: '24', viewBox: '0 0 24 24',
      fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'square',
      'stroke-linejoin': 'miter', 'aria-hidden': 'true', focusable: 'false',
    };
    const permitted = { svg: Object.keys(expectedRoot), path: ['d'], circle: ['cx', 'cy', 'r'], rect: ['x', 'y', 'width', 'height'] };
    const signature = (node) => [...node.children].map((child) => ({
      tag: child.localName,
      attributes: [...child.attributes].map((attr) => [attr.name, attr.value]).sort(([a], [b]) => a.localeCompare(b)),
    }));
    return items.map(({ id, svg }) => {
      if (/[<!]\?|<!DOCTYPE|<!ENTITY|<!--/i.test(svg)) fail(id + ': declarations/comments are outside the asset contract');
      const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
      if (parsed.querySelector('parsererror')) fail(id + ': malformed XML');
      const root = parsed.documentElement;
      if (root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg') fail(id + ': wrong root');
      for (const [key, value] of Object.entries(expectedRoot)) {
        if (root.getAttribute(key) !== value) fail(id + ': unexpected ' + key);
      }
      for (const node of [root, ...root.querySelectorAll('*')]) {
        const allowed = permitted[node.localName];
        if (!allowed || node.namespaceURI !== root.namespaceURI) fail(id + ': unexpected element');
        for (const attr of node.attributes) {
          if (!allowed.includes(attr.name)) fail(id + ': unexpected attribute ' + attr.name);
          if (/url\(|https?:|data:|javascript:/i.test(attr.value) && attr.name !== 'xmlns') fail(id + ': external/active value');
          if (node !== root && attr.name !== 'd' && !/^\d+(?:\.\d+)?$/.test(attr.value)) fail(id + ': invalid numeric geometry');
        }
        if (node !== root && node.children.length) fail(id + ': nested geometry');
        for (const child of node.childNodes) if (child.nodeType === 3 && child.textContent.trim()) fail(id + ': unexpected text');
      }
      if (!root.children.length) fail(id + ': missing geometry');
      const matches = document.querySelectorAll('[data-icon="' + id + '"] svg');
      if (matches.length !== 8) fail(id + ': expected four sizes on two surfaces');
      const expectedGeometry = JSON.stringify(signature(root));
      for (const glyph of matches) {
        if (JSON.stringify(signature(glyph)) !== expectedGeometry) fail(id + ': preview differs from source');
        for (const key of ['viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'aria-hidden', 'focusable']) {
          if (glyph.getAttribute(key) !== root.getAttribute(key)) fail(id + ': preview style differs');
        }
      }
      const box = matches[0].getBBox();
      if (!(box.width > 0 && box.height > 0 && box.x >= 1 && box.y >= 1 && box.x + box.width <= 23 && box.y + box.height <= 23)) {
        fail(id + ': empty or out-of-bounds geometry');
      }
      return { id, bounds: { x: box.x, y: box.y, width: box.width, height: box.height } };
    });
  }, sources);
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  await mkdir(resolve(directory, 'evidence'), { recursive: true });
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.bringToFront();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      if (document.documentElement.scrollWidth > innerWidth) throw new Error('Horizontal overflow');
      if (document.querySelectorAll('[data-icon]').length !== 16) throw new Error('Missing cards');
    });
    const file = 'evidence/contact-sheet-' + name + '.png';
    const screenshot = await page.screenshot({ path: resolve(directory, file), fullPage: true });
    assert(screenshot.length < 5 * 1024 * 1024, name + ' preview budget');
    assert.equal(screenshot.subarray(1, 4).toString('ascii'), 'PNG');
    captures.push({
      file, width: screenshot.readUInt32BE(16), height: screenshot.readUInt32BE(20),
      viewport: { width, height }, bytes: screenshot.length, sha256: digest(screenshot),
      caption: 'Actual local Chromium capture of the offline icon contact sheet at ' + width + 'px viewport; original SVGs at 16/20/24/32px on dark/light surfaces. English labels and Czech glossary. Not an integrated website screenshot.',
    });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  let baseRevision = null;
  try { baseRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim(); } catch { /* Source digests remain the capture identity outside Git. */ }
  const report = {
    schemaVersion: 1, generatedAt: new Date().toISOString(),
    scope: 'Offline original SVG asset safety, geometry and actual contact-sheet rendering only.',
    source: { state: 'working-tree-assets', baseRevision, catalogSha256: digest(await readFile(resolve(directory, 'catalog.json'))), contactSheetSha256: digest(html), verifierSha256: digest(await readFile(fileURLToPath(import.meta.url))) },
    browser: { name: 'Chromium', version: browser.version(), playwrightVersion, deviceScaleFactor: 1 },
    result: 'passed', iconsValidated: sources.length, renderedSamples: sources.length * 8,
    checks: ['SHA-256 and bytes', 'Strict XML and permitted passive geometry', 'Exact preview/source geometry', 'Positive in-viewBox bounds', 'No page errors', 'No external HTTP requests', 'No horizontal overflow at both viewports', 'PNG capture under 5 MiB each'],
    geometry, captures,
    limitations: ['Does not test website integration, locale routes, focus/authorization or live content.', 'Geometry bounds exclude stroke joins; visual review remains necessary.', 'The base revision excludes new working-tree assets; catalog/source digests identify the actual reviewed input.'],
  };
  await writeFile(resolve(directory, 'evidence/verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ result: report.result, iconsValidated: report.iconsValidated, captures }, null, 2));
} finally {
  await browser.close();
}
