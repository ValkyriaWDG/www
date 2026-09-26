#!/usr/bin/env node
'use strict';

// Read-only live smoke. Run only after the operator confirms this deployment is live.
// No login submissions, credentials, synthetic content, media mocks or production writes.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '../../..');
const origin = 'https://valkyriawdg.cz';
const output = path.join(root, 'docs/evidence/first-deployment-2026-09-26');
const args = process.argv.slice(2);
const revision = args[args.indexOf('--revision') + 1];
if (args.includes('--help') || !args.includes('--revision') || !/^[a-f0-9]{40}$/.test(revision || '')) {
  console.log('Usage: node docs/evidence/first-deployment-2026-09-26/browser-smoke.cjs --revision <deployed-full-commit-sha>');
  console.log('Requires confirmed live https://valkyriawdg.cz, disabled login, full media, Node and Playwright.');
  console.log('Writes public screenshots and browser-smoke.json under docs/evidence/first-deployment-2026-09-26.');
  process.exit(args.includes('--help') ? 0 : 2);
}
const appRequire = createRequire(path.join(root, 'apps/web/package.json'));
let playwright;
let playwrightVersion;
if (process.env.PLAYWRIGHT_MODULE) {
  // An operator-supplied tool dependency only; never serialize its local path.
  const modulePath = path.resolve(process.env.PLAYWRIGHT_MODULE);
  assert(existsSync(path.join(modulePath, 'package.json')), 'PLAYWRIGHT_MODULE must be a package directory.');
  playwright = require(modulePath);
  playwrightVersion = JSON.parse(readFileSync(path.join(modulePath, 'package.json'), 'utf8')).version;
} else {
  playwright = appRequire('@playwright/test');
  playwrightVersion = appRequire('@playwright/test/package.json').version;
}
const { chromium } = playwright;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const mediaManifest = JSON.parse(readFileSync(path.join(root, 'assets/background-media.json'), 'utf8'));
const mediaNames = new Set(mediaManifest.assets.map(a => a.filename));
const report = {
  schemaVersion: 1,
  evidenceKind: 'live-production-public-browser-smoke',
  origin,
  startedAt: new Date().toISOString(),
  deployedRevision: revision,
  deployedRevisionEvidence: 'Operator-supplied; server build identity must be independently verified by deployment evidence.',
  localHarnessRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  localTrackedChanges: Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim()),
  harnessSha256: sha(readFileSync(__filename)),
  playwrightVersion,
  checks: [], captures: [], browserErrors: [], failedRequests: [], blockedRequests: [],
  limits: [
    'Public anonymous routes only; no authenticated SSO, private RBAC or admin mutations tested.',
    'Short real playback interval only; no full 192-second natural loop, all-codec or all-device claim.',
    'Reduced motion uses browser preference emulation; playback APIs and network media responses are not mocked.',
    'Fresh isolated browser contexts have no owner cookies; safety routing permits same-origin GET/HEAD only.',
    'Screenshot visual inspection is required separately; capture and layout checks alone do not establish design acceptance.',
  ],
};
let browser;
const contexts = new Set();
const safePath = raw => { try { return new URL(raw).origin === origin ? new URL(raw).pathname : '[external-origin]'; } catch { return '[invalid-url]'; } };
const checkTimeoutMs = 90000;
function writeProgress() {
  report.updatedAt = new Date().toISOString();
  writeFileSync(path.join(output, 'browser-smoke.json'), JSON.stringify(report, null, 2) + '\n');
}
const check = async (id, fn) => {
  const started = Date.now();
  let timer;
  let exceededDeadline = false;
  report.status = 'running';
  report.activeCheck = id;
  writeProgress();
  console.log(`START ${id}`);
  try {
    const observed = await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          exceededDeadline = true;
          const error = new Error('CHECK_DEADLINE');
          error.name = 'CheckDeadlineError';
          reject(error);
        }, checkTimeoutMs);
      }),
    ]);
    report.checks.push({ id, status: 'passed', elapsedMs: Date.now() - started, observed });
    console.log(`PASS ${id}`);
  } catch (error) {
    // Do not save arbitrary browser/server error messages, bodies, query strings or local stack paths.
    const reason = exceededDeadline ? 'Per-check deadline exceeded; remaining checks are not run.'
      : String(error?.message).includes('VISIBLE_IMAGE_READINESS') ? 'A rendered image failed to decode or become ready within 8 seconds.'
      : 'Expected smoke assertion or browser operation failed; reproduce this named check.';
    report.checks.push({ id, status: 'failed', elapsedMs: Date.now() - started, errorType: error?.name || 'Error', reason });
    console.log(`FAIL ${id} (${error?.name || 'Error'})`);
    // Stop the chain; final browser closure cancels the timed-out task. It must not race later checks.
    if (exceededDeadline) throw error;
  } finally {
    clearTimeout(timer);
    report.activeCheck = null;
    writeProgress();
  }
};
async function context(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'en-US', serviceWorkers: 'block', ...options });
  contexts.add(ctx);
  await ctx.route('**/*', async route => {
    const request = route.request();
    const allowed = ['GET', 'HEAD'].includes(request.method()) && new URL(request.url()).origin === origin;
    if (!allowed) {
      report.blockedRequests.push({ method: request.method(), path: safePath(request.url()) });
      return route.abort('blockedbyclient');
    }
    await route.continue();
  });
  ctx.on('page', page => {
    page.on('pageerror', error => report.browserErrors.push({ type: error.name || 'Error', route: safePath(page.url()) }));
    page.on('requestfailed', request => {
      const failure = request.failure()?.errorText || 'unknown';
      // Navigation and video pause legitimately cancel in-flight range/prefetch requests.
      report.failedRequests.push({ method: request.method(), path: safePath(request.url()), kind: failure.includes('ERR_ABORTED') ? 'cancelled' : 'failed' });
    });
  });
  ctx.setDefaultTimeout(15000);
  ctx.setDefaultNavigationTimeout(35000);
  return ctx;
}
async function dispose(ctx) { await ctx.close(); contexts.delete(ctx); }
async function goto(page, route, locale) {
  const response = await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 200, 'Public route status');
  assert.equal(new URL(page.url()).origin, origin);
  assert.equal(await page.locator('html').getAttribute('lang'), locale);
  await page.locator('main').first().waitFor({ state: 'visible' });
  return response;
}
async function settle(page) {
  return page.evaluate(async () => {
    await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 4000))]);
    const rendered = image => {
      const rect = image.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      for (let element = image; element; element = element.parentElement) {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return false;
      }
      return true;
    };
    // Hidden lazy images are not capture content. Rendered off-screen images ARE content
    // in a full-page screenshot, so reveal those before requesting decode.
    const images = [...document.images].filter(rendered);
    const original = { x: scrollX, y: scrollY };
    let timer;
    try {
      await Promise.race([
        Promise.all(images.map(async image => {
          if (image.loading === 'lazy' && !image.complete) image.scrollIntoView({ block: 'center', behavior: 'instant' });
          await image.decode();
          if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) throw new Error('VISIBLE_IMAGE_READINESS');
        })),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('VISIBLE_IMAGE_READINESS')), 8000); }),
      ]);
    } catch {
      throw new Error('VISIBLE_IMAGE_READINESS');
    } finally {
      clearTimeout(timer);
      window.scrollTo(original.x, original.y);
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { renderedImages: images.length, decodedImages: images.length, readinessTimeoutMs: 8000 };
  });
}
async function capture(page, file, caption) {
  const readiness = await settle(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const layout = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
  assert(layout.documentWidth <= layout.width + 2, 'Horizontal overflow');
  const bytes = await page.screenshot({ path: path.join(output, file), fullPage: true, type: 'png', timeout: 20000 });
  report.captures.push({ file, sha256: sha(bytes), bytes: bytes.length, viewport: page.viewportSize(), route: safePath(page.url()), locale: await page.locator('html').getAttribute('lang'), caption, layout, readiness });
  writeProgress();
}
async function sampleVideo(page) {
  return page.locator('[data-background-video]').evaluate(video => ({
    currentTime: video.currentTime, duration: video.duration, paused: video.paused,
    width: video.videoWidth, height: video.videoHeight, muted: video.muted, loop: video.loop,
    readyState: video.readyState, errorCode: video.error?.code || null,
    decodedFrames: video.getVideoPlaybackQuality().totalVideoFrames,
    droppedFrames: video.getVideoPlaybackQuality().droppedVideoFrames,
    sourcePath: video.currentSrc ? new URL(video.currentSrc).pathname : null,
  }));
}
async function requirePlaying(page) {
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-background-video]');
    return v && !v.paused && !v.error && v.readyState >= 2 && v.currentTime > 0.1;
  }, null, { timeout: 35000 });
}
async function posterProof(page, expectedReason, mediaRequests) {
  await page.waitForFunction(reason => document.querySelector('[data-background-reason]')?.getAttribute('data-background-reason') === reason, expectedReason);
  await page.waitForTimeout(1500);
  const details = await page.evaluate(() => {
    const layer = document.querySelector('[data-background-state]');
    const video = document.querySelector('[data-background-video]');
    const poster = layer?.querySelector('img');
    return { state: layer?.getAttribute('data-background-state'), reason: layer?.getAttribute('data-background-reason'), attachedSources: video?.querySelectorAll('source').length, paused: video?.paused, currentTime: video?.currentTime, videoOpacity: video ? getComputedStyle(video).opacity : null, posterLoaded: Boolean(poster?.complete && poster.naturalWidth > 0), posterPath: poster ? new URL(poster.src).pathname : null };
  });
  assert.equal(details.state, 'paused');
  assert.equal(details.attachedSources, 0);
  assert.equal(details.paused, true);
  assert.equal(details.currentTime, 0);
  assert.equal(details.videoOpacity, '0');
  assert.equal(details.posterLoaded, true);
  assert.equal(mediaRequests.length, 0, 'No video bytes before opt-in');
  return { ...details, videoRequestsBeforeOptIn: mediaRequests.length };
}

(async () => {
  mkdirSync(output, { recursive: true });
  report.status = 'running';
  report.checkTimeoutMs = checkTimeoutMs;
  writeProgress();
  // Installed H.264-capable Edge/Chrome first; bundled Chromium remains a fallback.
  const failures = [];
  for (const channel of ['msedge', 'chrome', undefined]) {
    try {
      browser = await chromium.launch({ ...(channel ? { channel } : {}), headless: true, timeout: 15000 });
      report.browserChannel = channel || 'bundled-chromium';
      break;
    } catch { failures.push(channel || 'bundled-chromium'); }
  }
  assert(browser, 'No browser launch candidate available');
  report.browser = browser.version();
  report.unavailableBrowserChannels = failures;

  const desktop = await context({ reducedMotion: 'no-preference' });
  const page = await desktop.newPage();
  await check('desktop-cs-real-playback', async () => {
    await goto(page, '/cs', 'cs');
    await page.locator('[data-background-toggle]').waitFor({ state: 'visible' });
    await page.waitForTimeout(1200);
    const initialState = await page.locator('[data-background-toggle]').getAttribute('data-state');
    let explicitOptIn = false;
    if (initialState === 'paused' || initialState === 'blocked') { await page.locator('[data-background-toggle]').click(); explicitOptIn = true; }
    await requirePlaying(page);
    const before = await sampleVideo(page);
    await page.waitForTimeout(3500);
    const after = await sampleVideo(page);
    assert(after.duration > 192.3 && after.duration < 192.6);
    assert.equal(after.width, 1920); assert.equal(after.height, 1080);
    assert(after.currentTime > before.currentTime + 0.5);
    assert(after.decodedFrames > before.decodedFrames);
    assert.equal(after.errorCode, null); assert(after.muted && after.loop);
    assert(mediaNames.has(path.posix.basename(after.sourcePath)));
    await capture(page, '01-home-cs-desktop.png', 'Live production Czech main menu during measured full-length background playback; no login or content mutation.');
    return { initialState, explicitOptIn, before, after };
  });
  await check('locale-switch-cs-to-en-and-back', async () => {
    await page.locator('a[data-locale="en"]').click();
    await page.waitForURL(origin + '/en');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await requirePlaying(page);
    await capture(page, '02-home-en-desktop.png', 'Live production English main menu reached through the actual language switcher.');
    await page.locator('a[data-locale="cs"]').click();
    await page.waitForURL(origin + '/cs');
    assert.equal(await page.locator('html').getAttribute('lang'), 'cs');
    return { routes: ['/cs', '/en', '/cs'], englishAndCzechLanguageAttributes: true };
  });
  await check('pause-persistence-and-resume', async () => {
    await requirePlaying(page);
    await page.locator('[data-background-toggle]').click();
    await page.waitForFunction(() => document.querySelector('[data-background-video]')?.paused === true);
    const before = await sampleVideo(page);
    await page.waitForTimeout(1800);
    const after = await sampleVideo(page);
    assert(Math.abs(after.currentTime - before.currentTime) < 0.08);
    assert.equal(await page.evaluate(() => localStorage.getItem('valkyria.background')), 'paused');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('[data-background-reason]')?.getAttribute('data-background-reason') === 'user-paused');
    const persisted = await sampleVideo(page);
    assert(persisted.paused); assert.equal(persisted.currentTime, 0);
    await capture(page, '03-paused-cs-desktop.png', 'Live production manual pause persisted across reload; poster replaces the video.');
    await page.locator('[data-background-toggle]').click();
    await requirePlaying(page);
    return { pauseBefore: before, pauseAfter: after, afterReload: persisted, resumed: await sampleVideo(page) };
  });
  await dispose(desktop);

  const reduced = await context({ reducedMotion: 'reduce' });
  const staticPage = await reduced.newPage();
  const reducedVideoRequests = [];
  reduced.on('request', r => { if (/\.(mp4|webm)(?:\?|$)/i.test(r.url())) reducedVideoRequests.push(safePath(r.url())); });
  await check('reduced-motion-poster-no-video-download', async () => {
    await goto(staticPage, '/cs', 'cs');
    const observed = await posterProof(staticPage, 'reduced-motion', reducedVideoRequests);
    await capture(staticPage, '04-reduced-motion-cs-desktop.png', 'Live production Czech menu with reduced-motion preference; real poster loaded and zero video requests before opt-in.');
    return observed;
  });
  await check('public-route-status-and-locales', async () => {
    const results = [];
    for (const locale of ['cs', 'en']) for (const suffix of ['', '/news', '/clan', '/members', '/matches', '/privacy']) {
      const route = '/' + locale + suffix;
      const response = await goto(staticPage, route, locale);
      results.push({ route, status: response.status(), lang: locale, mainVisible: true });
    }
    return results;
  });
  await check('discord-login-disabled-and-local-recovery-unavailable', async () => {
    const results = [];
    for (const locale of ['cs', 'en']) {
      await goto(staticPage, '/' + locale + '/login', locale);
      await staticPage.getByTestId('login-provider-unavailable').waitFor({ state: 'visible' });
      assert(await staticPage.getByTestId('login-discord').isDisabled());
      const recovery = await reduced.request.get(origin + '/' + locale + '/login/recovery', { maxRedirects: 0, timeout: 15000 });
      assert.equal(recovery.status(), 404);
      await capture(staticPage, '05-login-' + locale + '-disabled.png', 'Live production ' + locale.toUpperCase() + ' login displays provider-unavailable notice and disabled Discord action; no sign-in submitted.');
      results.push({ locale, discordActionDisabled: true, recoveryStatus: recovery.status() });
    }
    return results;
  });
  await check('anonymous-admin-redirect', async () => {
    const results = [];
    for (const locale of ['cs', 'en']) {
      const adminRoute = '/' + locale + '/admin';
      const response = await reduced.request.get(origin + adminRoute, { maxRedirects: 0, timeout: 15000 });
      assert.equal(response.status(), 307);
      const target = new URL(response.headers().location, origin);
      assert.equal(target.origin, origin); assert.equal(target.pathname, '/' + locale + '/login');
      assert.equal(target.searchParams.get('returnTo'), adminRoute);
      assert((response.headers()['cache-control'] || '').includes('no-store'));
      await staticPage.goto(origin + adminRoute, { waitUntil: 'domcontentloaded' });
      assert.equal(new URL(staticPage.url()).pathname, target.pathname);
      assert.equal(await staticPage.locator('input[name="returnTo"]').inputValue(), adminRoute);
      results.push({ route: adminRoute, status: response.status(), loginRoute: target.pathname, returnTo: adminRoute, noStore: true });
    }
    return results;
  });
  await dispose(reduced);

  for (const locale of ['cs', 'en']) await check('mobile-' + locale + '-poster-and-layout', async () => {
    const mobile = await context({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
    try {
      const requests = [];
      mobile.on('request', r => { if (/\.(mp4|webm)(?:\?|$)/i.test(r.url())) requests.push(safePath(r.url())); });
      const mobilePage = await mobile.newPage();
      await goto(mobilePage, '/' + locale, locale);
      const observed = await posterProof(mobilePage, 'narrow-coarse', requests);
      await capture(mobilePage, '06-home-' + locale + '-mobile.png', 'Live production ' + locale.toUpperCase() + ' mobile menu at 390×844; real poster and zero video downloads before opt-in.');
      return observed;
    } finally { await dispose(mobile); }
  });
  await check('browser-no-uncaught-errors-or-write-attempts', async () => {
    assert.equal(report.browserErrors.length, 0);
    const writes = report.blockedRequests.filter(r => !['GET', 'HEAD'].includes(r.method));
    assert.equal(writes.length, 0);
    return { uncaughtPageErrors: 0, writeAttempts: 0, blockedExternalRequests: report.blockedRequests.length };
  });
})().catch(error => {
  report.fatal = { type: error?.name || 'Error', reason: 'Harness setup or browser lifecycle failed; no successful completion claimed.' };
  process.exitCode = 1;
}).finally(async () => {
  // Browser closure aborts unfinished evaluations; do not wait serially on an unbounded context close.
  let closeTimer;
  try {
    await Promise.race([
      browser ? browser.close() : Promise.resolve(),
      new Promise((_, reject) => { closeTimer = setTimeout(() => reject(new Error('BROWSER_CLOSE_DEADLINE')), 10000); }),
    ]);
  } catch {
    report.cleanupIncomplete = true;
  } finally { clearTimeout(closeTimer); }
  report.finishedAt = new Date().toISOString();
  const passed = report.checks.filter(c => c.status === 'passed').length;
  const failed = report.checks.filter(c => c.status === 'failed').length;
  report.summary = { total: report.checks.length, passed, failed, fatal: Boolean(report.fatal) };
  report.status = !report.fatal && !report.cleanupIncomplete && failed === 0 && report.checks.length === 10 ? 'passed' : 'failed';
  report.visualReview = 'not-run-by-script';
  writeFileSync(path.join(output, 'browser-smoke.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, ...report.summary, report: 'docs/evidence/first-deployment-2026-09-26/browser-smoke.json' }));
  if (report.status !== 'passed') process.exitCode = 1;
});
