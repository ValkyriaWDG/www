#!/usr/bin/env node
'use strict';

// Anonymous production reads only. Run after the operator supplies observed deployment identity.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const args = process.argv.slice(2);
const arg = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
if (args.includes('--help')) {
  console.log('node browser-smoke.cjs --revision <actual-40-hex> --digest sha256:<actual-64-hex> --identity-ref <public evidence filename> --browser-executable <isolated browser path> --browser-product <product name> [--report-id <safe-name>]');
  process.exit(0);
}
const origin = 'https://valkyriawdg.cz';
const revision = arg('--revision'), imageDigest = arg('--digest'), identityReference = arg('--identity-ref');
const executablePath = arg('--browser-executable'), browserProduct = arg('--browser-product');
const reportId = arg('--report-id') ?? 'browser-after';
assert(/^[a-f0-9]{40}$/.test(revision ?? ''), 'Supply operator-observed revision.');
assert(/^sha256:[a-f0-9]{64}$/.test(imageDigest ?? ''), 'Supply operator-observed digest.');
assert(/^[a-zA-Z0-9._/-]{1,150}$/.test(identityReference ?? ''), 'Supply sanitized public identity reference.');
assert(executablePath && existsSync(executablePath), 'Select an existing explicit browser executable.');
assert(browserProduct && /^[A-Za-z0-9 .-]{1,80}$/.test(browserProduct), 'Name the actual browser product.');
assert(/^[a-z0-9-]{1,80}$/.test(reportId), 'Invalid report ID.');
const reportPath = path.join(__dirname, `${reportId}.json`);
assert(!existsSync(reportPath), 'Preserve prior reports: select a new report ID.');
const appRequire = createRequire(path.join(root, 'apps/web/package.json'));
const { chromium } = appRequire('@playwright/test');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = readFileSync(path.join(root, 'assets/background-media.json'));
const manifest = JSON.parse(manifestBytes);
const approvedVideos = new Set(manifest.assets.filter(asset => ['primary', 'alternate'].includes(asset.role) && asset.width === 1920 && asset.height === 1080 && ['video/mp4', 'video/webm'].includes(asset.mimeType)).map(asset => `/media/background/${asset.filename}`));
const approvedPoster = manifest.assets.find(asset => asset.role === 'poster');
assert.equal(approvedVideos.size, 2, 'Manifest must identify the two 1080p renditions.');
assert(approvedPoster, 'Manifest must identify the poster.');
const posterPath = `/media/background/${approvedPoster.filename}`;
const report = {
  schemaVersion: 1, evidenceKind: 'anonymous-public-production-browser', origin,
  startedAt: new Date().toISOString(),
  deploymentIdentity: { revision, imageDigest, identityReference,
    provenance: 'Operator-supplied observed identity; browser checks do not establish container digest or source labels.' },
  localHarnessRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  harnessSha256: sha(readFileSync(__filename)),
  browserProduct, browserExecutableSha256: sha(readFileSync(executablePath)),
  playwrightVersion: appRequire('@playwright/test/package.json').version,
  mediaManifest: { id: manifest.id, sha256: sha(manifestBytes) },
  checks: [], captures: [], pageErrors: [], blockedRequests: [], failedRequests: [], cancelledRequests: [], httpFailures: [],
  unexpectedOriginRequests: [], unexpectedOriginResponses: [], observedWriteAttempts: [], webSocketAttempts: [],
  limits: [
    'Anonymous public pages only. Fresh contexts, no owner cookies, no authentication or production content mutation.',
    'Initial routed requests are filtered to same-origin GET/HEAD. Playwright can follow redirect hops without routing them again; this is not a complete pre-network isolation boundary.',
    'Every observed request/response origin is checked; unexpected-origin hops or write attempts fail the run. WebSocket attempts are blocked by routeWebSocket and fail the run.',
    'Short native playback interval, not full-loop, cross-codec, constrained-network or physical-device qualification.',
    'Mobile viewport/touch and reduced-motion settings are browser emulation, not physical Android or iOS.',
    'Actual screenshot visual inspection is required separately from this script.',
  ],
};
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
const safePath = raw => { try { const u = new URL(raw); return u.origin === origin ? u.pathname : '[external-origin]'; } catch { return '[invalid-url]'; } };
let browser;
const contexts = new Set();
const closingContexts = new WeakSet();
const requestContexts = new WeakMap();
async function check(name, fn) {
  const started = Date.now(); let deadline;
  report.activeCheck = name; save(); console.log(`START ${name}`);
  try {
    const observed = await Promise.race([fn(), new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('CHECK_TIMEOUT')), 60000); })]);
    report.checks.push({ name, status: 'passed', durationMs: Date.now() - started, observed });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, status: 'failed', durationMs: Date.now() - started, errorType: error?.name ?? 'Error', reason: error?.message === 'CHECK_TIMEOUT' ? 'Bounded check deadline exceeded.' : 'A browser operation or assertion failed; inspect this named scenario.' });
    console.log(`FAIL ${name}`); throw error;
  } finally { clearTimeout(deadline); report.activeCheck = null; save(); }
}
async function newContext(options) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', timezoneId: 'Europe/Prague', serviceWorkers: 'block', ...options });
  contexts.add(ctx);
  ctx.on('request', request => {
    requestContexts.set(request, ctx);
    if (new URL(request.url()).origin !== origin) report.unexpectedOriginRequests.push({ method: request.method(), path: safePath(request.url()), resourceType: request.resourceType() });
    if (!['GET', 'HEAD'].includes(request.method())) report.observedWriteAttempts.push({ method: request.method(), path: safePath(request.url()) });
  });
  ctx.on('response', response => {
    if (new URL(response.url()).origin !== origin) report.unexpectedOriginResponses.push({ path: safePath(response.url()), status: response.status() });
    else if (response.status() >= 400) report.httpFailures.push({ path: safePath(response.url()), status: response.status(), resourceType: response.request().resourceType() });
  });
  ctx.on('requestfailed', request => {
    const sameOrigin = new URL(request.url()).origin === origin;
    const browserCancelled = request.failure()?.errorText?.includes('ERR_ABORTED');
    // Chromium reports aborted navigation/media loads during route changes, pause or context disposal.
    const legitimateCancellation = browserCancelled && (request.isNavigationRequest() || request.resourceType() === 'media' || /\.(mp4|webm)(?:\?|$)/i.test(request.url()) || closingContexts.has(requestContexts.get(request)));
    const record = { method: request.method(), path: safePath(request.url()), resourceType: request.resourceType(), sameOrigin };
    (legitimateCancellation ? report.cancelledRequests : report.failedRequests).push(record);
  });
  await ctx.routeWebSocket('**/*', async socket => {
    report.webSocketAttempts.push({ path: safePath(socket.url()) });
    // Do not call connectToServer: no upstream WebSocket connection is made by this route.
    await socket.close({ code: 1008, reason: 'Public verification does not allow WebSockets.' });
  });
  await ctx.route('**/*', async route => {
    const request = route.request(), u = new URL(request.url());
    if (!['GET', 'HEAD'].includes(request.method()) || u.origin !== origin) {
      report.blockedRequests.push({ method: request.method(), path: safePath(request.url()) });
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  ctx.on('page', page => {
    page.on('pageerror', error => report.pageErrors.push({ type: error.name ?? 'Error', route: safePath(page.url()) }));
  });
  ctx.setDefaultTimeout(15000); ctx.setDefaultNavigationTimeout(30000);
  return ctx;
}
async function dispose(ctx) { closingContexts.add(ctx); await ctx.close(); contexts.delete(ctx); }
async function pageMetadata(page, locale) {
  await page.waitForFunction(() => document.querySelectorAll('link[rel="canonical"]').length === 1);
  const facts = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    canonicals: [...document.querySelectorAll('link[rel="canonical"]')].map(node => node.href),
    alternates: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map(node => ({ language: node.hreflang, href: node.href })),
    ogImage: [...document.querySelectorAll('meta[property="og:image"]')].map(node => node.content),
    twitterImage: [...document.querySelectorAll('meta[name="twitter:image"]')].map(node => node.content),
  }));
  assert.equal(facts.lang, locale); assert.deepEqual(facts.canonicals, [`${origin}/${locale}`]);
  for (const language of ['cs', 'en', 'x-default']) assert.deepEqual(facts.alternates.filter(item => item.language === language), [{ language, href: `${origin}/${language === 'x-default' ? 'cs' : language}` }]);
  assert.deepEqual(facts.ogImage, [`${origin}/api/social/${locale}/site?v=1`]);
  assert.deepEqual(facts.twitterImage, facts.ogImage);
  return facts;
}
async function sample(page) {
  return page.locator('[data-background-video]').evaluate(video => ({
    currentTime: video.currentTime, duration: video.duration, paused: video.paused,
    width: video.videoWidth, height: video.videoHeight, muted: video.muted, loop: video.loop,
    error: video.error?.code ?? null, rate: video.playbackRate,
    source: video.currentSrc ? new URL(video.currentSrc).pathname : null,
    sourceOrigin: video.currentSrc ? new URL(video.currentSrc).origin : null,
    sourceSearch: video.currentSrc ? new URL(video.currentSrc).search : null,
    frames: video.getVideoPlaybackQuality().totalVideoFrames, droppedFrames: video.getVideoPlaybackQuality().droppedVideoFrames,
  }));
}
function requireApprovedPlayback(facts) {
  assert.equal(facts.sourceOrigin, origin, 'Native playback must use the authorized origin.');
  assert.equal(facts.sourceSearch, '', 'Approved media URLs have no query string.');
  assert(approvedVideos.has(facts.source), 'Native playback must select an approved 1080p rendition.');
}
async function capture(page, filename, caption) {
  await page.evaluate(async () => {
    await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 5000))]);
    await Promise.all([...document.images].filter(image => {
      const bounds = image.getBoundingClientRect(); return bounds.width > 0 && bounds.height > 0 && bounds.top < innerHeight && bounds.bottom > 0;
    }).map(image => Promise.race([image.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error('Image readiness timeout')), 8000))])));
  });
  const layout = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
  assert(layout.documentWidth <= layout.width + 2, 'No horizontal overflow.');
  const file = `${reportId}-${filename}`;
  const bytes = await page.screenshot({ path: path.join(__dirname, file), type: 'png', fullPage: true, timeout: 15000 });
  report.captures.push({ file, caption, sha256: sha(bytes), bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), viewport: page.viewportSize(), route: safePath(page.url()), locale: await page.locator('html').getAttribute('lang'), layout });
  save();
}

(async () => {
  browser = await chromium.launch({ executablePath, headless: true, timeout: 20000 });
  report.browserVersion = browser.version(); save();
  const desktop = await newContext({ reducedMotion: 'no-preference' });
  const page = await desktop.newPage();
  for (const locale of ['cs', 'en']) await check(`desktop-${locale}-metadata-and-real-playback`, async () => {
    if (locale === 'cs') {
      const response = await page.goto(`${origin}/cs`, { waitUntil: 'domcontentloaded' }); assert.equal(response.status(), 200);
    } else { await page.locator('a[data-locale="en"]').click(); await page.waitForURL(`${origin}/en`); }
    const metadata = await pageMetadata(page, locale);
    await page.waitForFunction(() => { const v = document.querySelector('[data-background-video]'); return v && !v.paused && !v.error && v.currentTime > 0.1; }, null, { timeout: 25000 });
    const before = await sample(page); await page.waitForTimeout(2500); const after = await sample(page);
    requireApprovedPlayback(before); requireApprovedPlayback(after);
    assert(after.currentTime > before.currentTime + 0.5); assert(after.frames > before.frames);
    assert(after.duration > 192.3 && after.duration < 192.6); assert.equal(after.width, 1920); assert.equal(after.height, 1080);
    assert.equal(after.error, null); assert.equal(after.rate, 1); assert(after.muted && after.loop);
    await capture(page, `home-${locale}-desktop.png`, `Actual anonymous production /${locale} in ${browserProduct} ${report.browserVersion}, 1440x900 desktop. Canonical/language/social metadata checked and real background playback advanced. No sign-in or content writes.`);
    return { metadata, before, after };
  });
  await check('manual-pause-reload-resume', async () => {
    await page.locator('[data-background-toggle]').click();
    await page.waitForFunction(() => document.querySelector('[data-background-video]')?.paused);
    const before = await sample(page); await page.waitForTimeout(1200); const paused = await sample(page);
    assert(Math.abs(paused.currentTime - before.currentTime) < 0.08);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('[data-background-reason]')?.getAttribute('data-background-reason') === 'user-paused');
    const reloaded = await sample(page); assert(reloaded.paused); assert.equal(reloaded.currentTime, 0);
    await page.locator('[data-background-toggle]').click();
    await page.waitForFunction(() => { const v = document.querySelector('[data-background-video]'); return v && !v.paused && v.currentTime > 0.1; });
    const resumed = await sample(page); requireApprovedPlayback(resumed);
    return { before, paused, reloaded, resumed };
  });
  await dispose(desktop);
  for (const locale of ['cs', 'en']) await check(`mobile-${locale}-poster-and-metadata`, async () => {
    const mobile = await newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
    try {
      const requests = []; mobile.on('request', request => { if (request.resourceType() === 'media' || /\.(mp4|webm)(?:\?|$)/i.test(request.url())) requests.push({ path: safePath(request.url()), resourceType: request.resourceType() }); });
      const page = await mobile.newPage(); const response = await page.goto(`${origin}/${locale}`, { waitUntil: 'domcontentloaded' }); assert.equal(response.status(), 200);
      const metadata = await pageMetadata(page, locale);
      await page.waitForFunction(() => document.querySelector('[data-background-reason]')?.getAttribute('data-background-reason') === 'narrow-coarse');
      await page.waitForTimeout(1000);
      const poster = await page.locator('[data-background-state]').evaluate(layer => {
        const video = layer.querySelector('video'), image = layer.querySelector('img');
        return { state: layer.getAttribute('data-background-state'), reason: layer.getAttribute('data-background-reason'), loaded: Boolean(image?.complete && image.naturalWidth > 0), attachedSources: video?.querySelectorAll('source').length ?? null, paused: video?.paused, currentTime: video?.currentTime,
          currentSrc: video?.currentSrc === '' ? '' : '[unexpected-nonempty-source]', posterOrigin: image?.currentSrc ? new URL(image.currentSrc).origin : null, posterPath: image?.currentSrc ? new URL(image.currentSrc).pathname : null, posterSearch: image?.currentSrc ? new URL(image.currentSrc).search : null };
      });
      assert.equal(poster.state, 'paused'); assert(poster.loaded); assert.equal(poster.attachedSources, 0); assert.equal(requests.length, 0);
      assert.equal(poster.paused, true); assert.equal(poster.currentTime, 0); assert.equal(poster.currentSrc, '');
      assert.equal(poster.posterOrigin, origin); assert.equal(poster.posterPath, posterPath); assert.equal(poster.posterSearch, '');
      await capture(page, `home-${locale}-mobile.png`, `Actual anonymous production /${locale}, ${browserProduct} ${report.browserVersion} with 390x844 mobile/touch emulation. Poster policy requested zero video bytes before opt-in. This is not a physical phone.`);
      assert.equal(requests.length, 0, 'No media-type or video-extension requests through the completed capture.');
      return { metadata, poster, videoRequestsBeforeOptIn: requests.length };
    } finally { await dispose(mobile); }
  });
  await check('no-uncaught-errors-or-write-attempts', async () => {
    assert.equal(report.pageErrors.length, 0);
    assert.equal(report.blockedRequests.filter(request => !['GET', 'HEAD'].includes(request.method)).length, 0);
    assert.equal(report.observedWriteAttempts.length, 0, 'No write attempts across observed redirect hops.');
    assert.equal(report.unexpectedOriginRequests.length, 0, 'No unexpected-origin request hops.');
    assert.equal(report.unexpectedOriginResponses.length, 0, 'No unexpected-origin response hops.');
    assert.equal(report.webSocketAttempts.length, 0, 'No WebSocket attempts.');
    assert.equal(report.failedRequests.filter(request => request.sameOrigin).length, 0, 'No non-cancelled same-origin request failures.');
    assert.equal(report.httpFailures.length, 0, 'No same-origin HTTP errors.');
    return { pageErrors: report.pageErrors.length, writeAttempts: 0, blockedExternalRequests: report.blockedRequests.length, unexpectedOriginRequests: 0, unexpectedOriginResponses: 0, webSocketAttempts: 0, sameOriginRequestFailures: 0, httpFailures: 0, legitimateCancellations: report.cancelledRequests.length };
  });
})().catch(error => {
  report.fatal = { errorType: error?.name ?? 'Error', reason: 'Setup or named browser check failed; remaining checks are not run.' };
  process.exitCode = 1;
}).finally(async () => {
  let timer;
  try { await Promise.race([browser?.close(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Close deadline')), 10000); })]); }
  catch { report.cleanupIncomplete = true; } finally { clearTimeout(timer); }
  report.completedAt = new Date().toISOString();
  report.summary = { total: report.checks.length, passed: report.checks.filter(item => item.status === 'passed').length, failed: report.checks.filter(item => item.status === 'failed').length, expectedChecks: 6 };
  report.status = !report.fatal && !report.cleanupIncomplete && report.summary.total === 6 && report.summary.failed === 0 ? 'passed' : 'failed';
  report.visualInspection = 'Required separately; not asserted by this script.'; save();
  console.log(JSON.stringify({ status: report.status, ...report.summary }));
  if (report.status !== 'passed') process.exitCode = 1;
});
