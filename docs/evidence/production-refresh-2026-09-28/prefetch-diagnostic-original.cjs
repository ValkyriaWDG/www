'use strict';
const { createRequire } = require('node:module');
const path = require('node:path');
const { writeFileSync } = require('node:fs');
const r = createRequire(path.join(process.cwd(), 'apps/web/package.json'));
const { chromium } = r('@playwright/test');
const origin = 'https://valkyriawdg.cz';
const browserExe = path.resolve(__dirname, '../browsers/chrome-for-testing/154.0.8037.57/chrome-win64/chrome.exe').replace('/evidence/../browsers/', '/browsers/');
const exe = process.argv[2];
const report = { startedAt: new Date().toISOString(), requests: [], failures: [], httpErrors: [], pageErrors: [], boundaries: [] };
const safePath = raw => { const u = new URL(raw); return u.origin === origin ? u.pathname : '[external-origin]'; };
const safeError = raw => /^(?:net::)?ERR_[A-Z0-9_]+$/.test(raw ?? '') ? raw : '[other-error]';
let closing = false;
(async () => {
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  report.browserVersion = browser.version();
  context.on('request', req => {
    const h = req.headers();
    if (new URL(req.url()).origin !== origin || !['GET', 'HEAD'].includes(req.method())) report.boundaries.push({ path: safePath(req.url()), method: req.method() });
    if (req.resourceType() === 'fetch') report.requests.push({ path: safePath(req.url()), rsc: h.rsc === '1', prefetch: h['next-router-prefetch'] === '1', segmentPrefetch: Boolean(h['next-router-segment-prefetch']) });
  });
  context.on('requestfailed', req => {
    const h = req.headers();
    report.failures.push({ path: safePath(req.url()), type: req.resourceType(), error: safeError(req.failure()?.errorText), rsc: h.rsc === '1', prefetch: h['next-router-prefetch'] === '1', segmentPrefetch: Boolean(h['next-router-segment-prefetch']), duringClose: closing });
  });
  context.on('response', res => { if (res.status() >= 400) report.httpErrors.push({ path: safePath(res.url()), status: res.status() }); });
  await context.routeWebSocket('**/*', socket => socket.close({ code: 1008 }));
  await context.route('**/*', route => new URL(route.request().url()).origin === origin && ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort('blockedbyclient'));
  try {
    const page = await context.newPage();
    page.on('pageerror', err => report.pageErrors.push({ name: err.name }));
    await page.goto(origin + '/cs', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(6000);
    report.beforeNavigationFailureCount = report.failures.length;
    await page.locator('a[data-locale="en"]').click();
    await page.waitForURL(origin + '/en', { timeout: 15000 });
    await page.waitForTimeout(6000);
    report.beforeDisposalFailureCount = report.failures.length;
  } finally {
    closing = true;
    await context.close();
    await browser.close();
    report.completedAt = new Date().toISOString();
    writeFileSync(path.join(__dirname, 'production-refresh-request-diagnostic.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  }
})().catch(err => { console.error(err.name); process.exitCode = 1; });
