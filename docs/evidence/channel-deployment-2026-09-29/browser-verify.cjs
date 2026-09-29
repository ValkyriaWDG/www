#!/usr/bin/env node
'use strict';

// Focused anonymous production observation. Prepare with --help; execute only after deployment-owner GO.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const args = process.argv.slice(2);
const arg = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
if (args.includes('--help')) {
  console.log('node browser-verify.cjs --run --revision <observed571475f-full-sha> --digest sha256:<observed64hex> --identity-ref <relative-public-runtime-record> --report-id <fresh-name> [--repo-root <pinned-source-checkout>] [--dependency-root <installed-checkout>] [--browser-executable <isolated-chrome154-path>]');
  console.log('Defaults target the original ignored operations directory and sibling www-seo-social checkout. For an archived evidence copy, supply all three explicit paths; reports/captures remain next to the script and never overwrite existing files.');
  process.exit(0);
}
assert(args.includes('--run'), 'Explicit --run is required after deployment-owner GO.');
const expectedRevision = '571475f3f60fb38c7cf14cd6afb4702982ba4681';
const revision = arg('--revision'), digest = arg('--digest'), identityReference = arg('--identity-ref');
assert.equal(revision, expectedRevision, 'Use the approved operator-observed deployed source.');
assert(/^sha256:[a-f0-9]{64}$/.test(digest ?? ''), 'Supply the observed deployed image digest.');
assert(/^[a-zA-Z0-9._/-]{1,150}$/.test(identityReference ?? ''), 'Supply a sanitized relative runtime evidence reference.');
const reportId = arg('--report-id') ?? 'browser-after-01';
assert(/^[a-z0-9-]{1,60}$/.test(reportId), 'Use a safe, fresh report ID.');
const origin = 'https://valkyria.cz';
const root = path.resolve(arg('--repo-root') ?? path.resolve(__dirname, '../..'));
const dependencyRoot = path.resolve(arg('--dependency-root') ?? path.resolve(root, '../www-seo-social'));
const executablePath = path.resolve(arg('--browser-executable') ?? path.join(dependencyRoot, '.local/browsers/chrome-for-testing/154.0.8037.57/chrome-win64/chrome.exe'));
assert(fs.existsSync(executablePath), 'The explicitly selected isolated browser must exist.');
const appRequire = createRequire(path.join(dependencyRoot, 'apps/web/package.json'));
const { chromium } = appRequire('@playwright/test');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
assert.equal(head, expectedRevision, 'The reviewed local source must remain pinned.');
const outputPath = path.join(__dirname, `${reportId}.json`);
const fd = fs.openSync(outputPath, 'wx');
const report = {
  schemaVersion: 1, evidenceKind: 'anonymous-public-production-strip-and-crest-comparison', origin,
  startedAt: new Date().toISOString(),
  deploymentIdentity: { revision, imageDigest: digest, identityReference, provenance: 'Operator-supplied runtime observation; browser cannot attest container labels.' },
  harnessSha256: sha(fs.readFileSync(__filename)), localSourceRevision: head,
  sourceFiles: ['apps/web/src/components/shell/shell.module.css', 'apps/web/src/components/shell/header.module.css', 'apps/web/src/components/hll/hll.module.css', 'apps/web/src/components/hll/hll-shell.tsx', 'apps/web/e2e/platform.spec.ts'].map(file => ({ file, sha256Lf: sha(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')) })),
  browserProduct: 'Chrome for Testing', browserExecutableSha256: sha(fs.readFileSync(executablePath)), playwrightVersion: appRequire('@playwright/test/package.json').version,
  checks: [], captures: [], pageErrors: [], httpErrors: [], failedRequests: [], prefetchCancellations: [], lifecycleCancellations: [], blockedRequests: [], unexpectedOrigins: [], writeAttempts: [], webSockets: [],
  limits: [
    'Fresh anonymous contexts; only approved-origin GET/HEAD initial requests, no owner profile or authentication/content changes.',
    'Redirect hops are observed and fail on unexpected origins; initial routing is not complete pre-network redirect isolation. WebSockets never connect upstream.',
    'Issue #46 is not waived: non-prefetch RSC fetch failures remain failures, including during context disposal. Only exact optional RSC prefetch aborts are classified separately.',
    'Document/media ERR_ABORTED during our explicit page navigation or context disposal is recorded separately; no ordinary fetch receives that lifecycle exception.',
    'Desktop viewports are 1920x1080,1366x768,1024x768; mobile is 390x844 touch/viewport emulation, not physical iOS/Android. This verifies strip/crest rendering, not media playback or broad application acceptance.',
    'Six actual Czech viewport captures require separate visual inspection: four 1920/390 game landings and HLL news at1024/390. English routes are measured without additional captures.',
  ],
};
const save = () => { const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n'); fs.writeSync(fd, bytes, 0, bytes.length, 0); fs.ftruncateSync(fd, bytes.length); };
const safePath = raw => { try { const u = new URL(raw); return u.origin === origin ? u.pathname : '[unexpected-origin]'; } catch { return '[invalid-url]'; } };
const contexts = new Set();
let browser;
function optionalPrefetch(record) {
  return record.sameOrigin === true && record.method === 'GET' && record.resourceType === 'fetch' && record.errorCode === 'net::ERR_ABORTED' && record.rsc === true && record.prefetch === true;
}
async function newContext(viewport, mobile) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, locale: 'en-US', timezoneId: 'Europe/Prague', serviceWorkers: 'block', reducedMotion: 'no-preference' });
  const state = { navigating: false, closing: false }; contexts.add(context);
  context.setDefaultTimeout(15000); context.setDefaultNavigationTimeout(30000);
  context.on('request', request => {
    if (new URL(request.url()).origin !== origin) report.unexpectedOrigins.push({ stage: 'request', path: safePath(request.url()) });
    if (!['GET', 'HEAD'].includes(request.method())) report.writeAttempts.push({ method: request.method(), path: safePath(request.url()) });
  });
  context.on('response', response => {
    if (new URL(response.url()).origin !== origin) report.unexpectedOrigins.push({ stage: 'response', path: safePath(response.url()), status: response.status() });
    if (response.status() >= 400) report.httpErrors.push({ path: safePath(response.url()), status: response.status(), resourceType: response.request().resourceType() });
  });
  context.on('requestfailed', request => {
    const headers = request.headers(), error = request.failure()?.errorText;
    const record = { path: safePath(request.url()), sameOrigin: new URL(request.url()).origin === origin, method: request.method(), resourceType: request.resourceType(), errorCode: /^(?:net::)?ERR_[A-Z0-9_]+$/.test(error ?? '') ? error : '[other-error]', rsc: headers.rsc === '1', prefetch: headers['next-router-prefetch'] === '1', duringNavigation: state.navigating, duringContextClose: state.closing };
    const lifecycle = record.sameOrigin && record.method === 'GET' && record.errorCode === 'net::ERR_ABORTED' && ['document', 'media'].includes(record.resourceType) && (state.navigating || state.closing);
    if (optionalPrefetch(record)) report.prefetchCancellations.push(record);
    else if (lifecycle) report.lifecycleCancellations.push(record);
    else report.failedRequests.push(record);
  });
  context.on('page', page => page.on('pageerror', error => report.pageErrors.push({ type: error.name ?? 'Error', path: safePath(page.url()) })));
  await context.routeWebSocket('**/*', async socket => { report.webSockets.push({ path: safePath(socket.url()) }); await socket.close({ code: 1008, reason: 'Anonymous observation does not use WebSockets.' }); });
  await context.route('**/*', route => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin || !['GET', 'HEAD'].includes(request.method())) { report.blockedRequests.push({ method: request.method(), path: safePath(request.url()) }); return route.abort('blockedbyclient'); }
    return route.continue();
  });
  return { context, state };
}
async function navigate(page, state, pathname, locale) {
  state.navigating = true;
  let response;
  try { response = await page.goto(origin + pathname, { waitUntil: 'domcontentloaded' }); } finally { state.navigating = false; }
  assert.equal(response?.status(), 200, `${pathname}: successful public response`);
  assert.equal(page.url(), origin + pathname, 'Exact canonical route');
  assert.equal(await page.locator('html').getAttribute('lang'), locale);
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('fonts_timeout')), 15000))]));
  await page.waitForFunction(() => document.querySelectorAll('[data-game-switch][aria-busy="true"], [role="group"][aria-busy="true"]').length === 0);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert(dimensions.scroll <= dimensions.client + 1, 'No horizontal overflow');
}
async function measure(page, selector) {
  const image = page.locator(selector); assert.equal(await image.count(), 1, 'One decorative crest');
  await image.waitFor({ state: 'visible' });
  await image.evaluate(element => Promise.race([element.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error('image_decode_timeout')), 15000))]));
  return image.evaluate(element => {
    const box = element.getBoundingClientRect(), style = getComputedStyle(element), url = new URL(element.currentSrc);
    return { x: box.x, y: box.y, width: box.width, height: box.height, centerX: box.x + box.width / 2, centerY: box.y + box.height / 2, opacity: Number(style.opacity), filter: style.filter, display: style.display, visibility: style.visibility, asset: url.searchParams.get('url') ?? url.pathname, naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight, complete: element.complete };
  });
}
async function measureStrip(page) {
  assert.equal(await page.locator('[data-shell-header], [data-hll-masthead]').count(), 1, 'One top strip');
  assert.equal(await page.locator('[data-platform-bar]').count(), 0, 'No duplicate platform bar');
  return page.evaluate(() => {
    const header = document.querySelector('[data-shell-header], [data-hll-masthead]');
    const round = rect => [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)];
    const box = selector => {
      const element = [...header.querySelectorAll(selector)].find(candidate => candidate.getBoundingClientRect().width > 0);
      return element ? round(element.getBoundingClientRect()) : null;
    };
    return {
      strip: round(header.getBoundingClientRect()),
      crest: box('[data-brand] img, [data-hll-identity] img'),
      game: box('[data-game-switch]'),
      language: box('[role="group"]:has([data-locale])'),
      account: box('[data-account]'),
      community: box('[data-platform-home], [data-hll-community-link]'),
      menu: box('button[aria-expanded]'),
    };
  });
}
function verifyStrips(strips, width) {
  assert.deepEqual(Object.keys(strips).sort(), ['hll', 'hll/news', 'wardogs', 'wardogs/news'].sort(), 'All four routes measured');
  const reference = strips.wardogs;
  assert.deepEqual(reference.strip.slice(0, 3), [0, 0, width], 'Top strip fills viewport width');
  assert(reference.strip[3] > 0, 'Positive strip height');
  for (const key of ['crest', 'game', 'language']) assert(reference[key] && reference[key][2] > 0 && reference[key][3] > 0, `Visible strip ${key}`);
  if (width >= 1152) {
    assert(reference.account && reference.account[2] > 0, 'Visible desktop account');
    const [crestX] = reference.crest, [gameX, gameY, gameWidth, gameHeight] = reference.game;
    const [languageX, languageY, languageWidth, languageHeight] = reference.language, [accountX, , accountWidth] = reference.account;
    assert(crestX < width * .1, 'Logo at left');
    assert(gameX + gameWidth <= languageX, 'Game before language');
    assert(languageX - (gameX + gameWidth) < 24, 'Compact control spacing');
    assert(languageX + languageWidth <= accountX, 'Language before account');
    assert(Math.abs(gameY + gameHeight / 2 - (languageY + languageHeight / 2)) < 4, 'Controls share row');
    assert(accountX + accountWidth > width * .9, 'Account at right');
  }
  if (width === 390) {
    assert(reference.game[2] > 340 && reference.game[1] < 200, 'Full-width mobile game row near top');
    assert(reference.menu && reference.menu[2] > 0, 'Visible mobile menu control');
  }
  for (const [route, observed] of Object.entries(strips)) assert.deepEqual(observed, reference, `Identical strip on ${route}`);
}
async function capture(page, suffix, label) {
  await page.evaluate(() => Promise.race([
    Promise.all([...document.images].filter(image => { const box = image.getBoundingClientRect(), style = getComputedStyle(image); return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight && style.display !== 'none' && style.visibility !== 'hidden'; }).map(image => image.decode())),
    new Promise((_, reject) => setTimeout(() => reject(new Error('visible_image_decode_timeout')), 15000)),
  ]));
  const file = `${reportId}-${suffix}.png`, bytes = await page.screenshot({ fullPage: false, animations: 'disabled', caret: 'hide' });
  fs.writeFileSync(path.join(__dirname, file), bytes, { flag: 'wx' });
  report.captures.push({ file, sha256: sha(bytes), bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), viewport: page.viewportSize(), sourceUrl: page.url(), sourceRevision: revision, caption: label, capturedAt: new Date().toISOString(), visualInspection: 'Required separately.' }); save();
}
async function check(name, fn) {
  report.activeCheck = name; save(); const started = Date.now();
  try { const observed = await fn(); report.checks.push({ name, status: 'passed', observed, durationMs: Date.now() - started }); }
  catch (error) { report.checks.push({ name, status: 'failed', ...(report.pendingMeasurements ? { observed: report.pendingMeasurements } : {}), errorType: error?.name ?? 'Error', reason: /^[\w .:<>/=()\-]{1,180}$/.test(error?.message ?? '') ? error.message : 'A focused browser assertion failed; see measured observations and retained captures.', durationMs: Date.now() - started }); }
  finally { delete report.pendingMeasurements; report.activeCheck = null; save(); }
}
(async () => {
  save(); browser = await chromium.launch({ executablePath, headless: true }); report.browserVersion = browser.version(); save();
  for (const { name, viewport, mobile } of [
    { name: 'desktop', viewport: { width: 1920, height: 1080 }, mobile: false },
    { name: 'desktop-1366', viewport: { width: 1366, height: 768 }, mobile: false },
    { name: 'compact-1024', viewport: { width: 1024, height: 768 }, mobile: false },
    { name: 'mobile', viewport: { width: 390, height: 844 }, mobile: true },
  ]) {
    for (const locale of ['cs', 'en']) {
      const { context, state } = await newContext(viewport, mobile); const page = await context.newPage(); const strips = {};
      try {
        await check(`${locale}-${name}-landing-crest-equivalence`, async () => {
          const observations = {}; report.pendingMeasurements = observations;
          for (const [game, selector] of [['wardogs', '[data-emblem]'], ['hll', '[data-hll-crest]']]) {
            await navigate(page, state, `/${locale}/${game}`, locale); observations[game] = await measure(page, selector); strips[game] = await measureStrip(page); save();
            if (locale === 'cs' && [1920, 390].includes(viewport.width)) await capture(page, `${game}-${locale}-${name}`, `Actual ${game === 'hll' ? 'Hell Let Loose' : 'Wardogs'} Czech landing at ${viewport.width}x${viewport.height}; shared top strip and decorative crest comparison.`);
          }
          const { hll, wardogs } = observations;
          for (const key of ['width', 'height', 'centerX', 'centerY']) assert(Math.abs(hll[key] - wardogs[key]) < 2, `Matching crest ${key}`);
          assert(Math.abs(hll.centerX - viewport.width / 2) < 2, 'Horizontally centered crest');
          assert(Math.abs(hll.width - (mobile ? Math.min(viewport.width * .62, 280) : Math.min(Math.max(240, viewport.width * .22), 560))) < 2, 'Reviewed responsive crest width');
          assert.equal(hll.opacity, mobile ? .11 : .12); assert.equal(hll.opacity, wardogs.opacity);
          assert.equal(hll.filter, 'none'); assert.equal(wardogs.filter, 'none'); assert.equal(hll.asset, wardogs.asset);
          delete report.pendingMeasurements; return observations;
        });
        for (const [game, selector] of [['hll', '[data-hll-crest]'], ['wardogs', '[data-emblem]']]) await check(`${locale}-${name}-${game}-news-crest-hidden`, async () => {
          await navigate(page, state, `/${locale}/${game}/news`, locale);
          strips[`${game}/news`] = await measureStrip(page);
          if (locale === 'cs' && game === 'hll' && [1024, 390].includes(viewport.width)) await capture(page, `hll-news-${locale}-${name}`, `Actual Hell Let Loose Czech news at ${viewport.width}x${viewport.height}; shared top strip and hidden decorative crest.`);
          const image = page.locator(selector); assert.equal(await image.count(), 1); assert.equal(await image.isVisible(), false);
          const observed = await image.evaluate(element => { const s = getComputedStyle(element); return { display: s.display, opacity: s.opacity, visibility: s.visibility }; });
          assert.equal(observed.display, 'none'); return observed;
        });
        await check(`${locale}-${name}-top-strip-identical-across-games-and-news`, async () => {
          report.pendingMeasurements = { strips }; verifyStrips(strips, viewport.width); return { strips, rounding: 'CSS boxes rounded to nearest pixel, as in accepted platform.spec.ts' };
        });
      } finally { state.closing = true; await context.close(); contexts.delete(context); }
    }
  }
  await check('strict-browser-network-gate', async () => {
    const counts = Object.fromEntries(['pageErrors', 'httpErrors', 'failedRequests', 'blockedRequests', 'unexpectedOrigins', 'writeAttempts', 'webSockets'].map(key => [key, report[key].length]));
    assert(Object.values(counts).every(count => count === 0), 'No unaccepted browser or network failures'); return counts;
  });
})().catch(error => { report.fatal = { type: error?.name ?? 'Error', reason: 'Browser setup or lifecycle failed; unfinished checks are not passes.' }; process.exitCode = 1; }).finally(async () => {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close().catch(() => {});
  report.completedAt = new Date().toISOString(); report.activeCheck = null;
  report.summary = { total: report.checks.length, passed: report.checks.filter(check => check.status === 'passed').length, failed: report.checks.filter(check => check.status === 'failed').length, expectedChecks: 33, captures: report.captures.length, expectedCaptures: 6 };
  report.status = !report.fatal && report.summary.total === 33 && report.summary.failed === 0 && report.summary.captures === 6 ? 'passed' : 'failed';
  save(); fs.closeSync(fd); if (report.status !== 'passed') process.exitCode = 1;
  console.log(JSON.stringify({ status: report.status, ...report.summary }));
});
