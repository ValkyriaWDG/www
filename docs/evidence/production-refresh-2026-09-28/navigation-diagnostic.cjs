'use strict';

// Bounded anonymous diagnosis; does not alter the browser acceptance classifier.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const { chromium } = createRequire(path.join(root, 'apps/web/package.json'))('@playwright/test');
const origin = 'https://valkyriawdg.cz';
const output = path.join(__dirname, 'navigation-diagnostic.json');
assert(process.argv[2] && existsSync(process.argv[2]), 'Supply the explicit isolated Chrome executable.');
assert(!existsSync(output), 'Preserve earlier diagnostic output.');
const started = Date.now();
const report = { startedAt: new Date(started).toISOString(), harnessSha256: createHash('sha256').update(readFileSync(__filename)).digest('hex'),
  browserExecutableSha256: createHash('sha256').update(readFileSync(process.argv[2])).digest('hex'),
  identityReference: 'deployment-record.json', events: [], pageErrors: [], unexpectedOrigins: [], writeAttempts: [], webSocketAttempts: [] };
const ids = new WeakMap(); let nextId = 1; let phase = 'setup'; let closing = false;
const safePath = raw => { const u = new URL(raw); return u.origin === origin ? u.pathname : '[external-origin]'; };
const event = (type, fields = {}) => report.events.push({ atMs: Date.now() - started, phase, type, ...fields });
let browser;
(async () => {
  browser = await chromium.launch({ executablePath: process.argv[2], headless: true, timeout: 20000 });
  report.browserVersion = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  context.setDefaultTimeout(15000); context.setDefaultNavigationTimeout(25000);
  context.on('request', req => {
    if (new URL(req.url()).origin !== origin) report.unexpectedOrigins.push({ path: safePath(req.url()), method: req.method() });
    if (!['GET', 'HEAD'].includes(req.method())) report.writeAttempts.push({ path: safePath(req.url()), method: req.method() });
    if (req.resourceType() !== 'fetch') return;
    const h = req.headers(); const id = nextId++; ids.set(req, id);
    event('fetch-start', { id, path: safePath(req.url()), rsc: h.rsc === '1', prefetch: h['next-router-prefetch'] === '1', segmentPrefetch: Boolean(h['next-router-segment-prefetch']) });
  });
  context.on('response', res => {
    if (new URL(res.url()).origin !== origin) report.unexpectedOrigins.push({ path: safePath(res.url()), status: res.status() });
    if (ids.has(res.request())) event('fetch-response', { id: ids.get(res.request()), status: res.status(), contentType: res.headers()['content-type'] ?? null });
  });
  context.on('requestfinished', req => { if (ids.has(req)) event('fetch-finished', { id: ids.get(req) }); });
  context.on('requestfailed', req => {
    if (!ids.has(req)) return;
    const raw = req.failure()?.errorText;
    event('fetch-failed', { id: ids.get(req), errorCode: /^(?:net::)?ERR_[A-Z0-9_]+$/.test(raw ?? '') ? raw : '[other-error]', duringContextClose: closing });
  });
  await context.routeWebSocket('**/*', async socket => { report.webSocketAttempts.push({ path: safePath(socket.url()) }); await socket.close({ code: 1008 }); });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin && ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort('blockedbyclient'));
  try {
    const page = await context.newPage();
    page.on('pageerror', err => report.pageErrors.push({ type: err.name }));
    phase = 'initial-en-home';
    await page.goto(origin + '/en', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    for (const locale of ['en', 'cs']) {
      if (locale === 'cs') {
        phase = 'switch-to-cs'; event('action-language');
        await page.locator('a[data-locale="cs"]').click(); await page.waitForURL(origin + '/cs');
        await page.waitForTimeout(2000);
      }
      await page.evaluate(token => { window.__navigationDiagnosticToken = token; }, locale);
      phase = `${locale}-news-navigation`; event('action-menu-news');
      await page.locator('[data-nav="desktop"] [data-nav-item="news"]').click();
      await page.waitForURL(`${origin}/${locale}/news`);
      await page.getByRole('heading', { name: locale === 'cs' ? 'Novinky' : 'News', exact: true }).waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => window.__navigationDiagnosticToken), locale);
      event('render-news', { route: safePath(page.url()), sameDocument: true });
      phase = `${locale}-news-settled`; await page.waitForTimeout(6000); event('six-seconds-after-news-render');
      phase = `${locale}-home-navigation`; event('action-menu-home');
      await page.locator('[data-nav="desktop"] [data-nav-item="home"]').click();
      await page.waitForURL(`${origin}/${locale}`);
      await page.locator('[data-nav="desktop"] [data-nav-item="home"][aria-current="page"]').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => window.__navigationDiagnosticToken), locale);
      event('render-home', { route: safePath(page.url()), sameDocument: true });
      phase = `${locale}-home-settled`; await page.waitForTimeout(6000); event('six-seconds-after-home-render');
    }
    report.scenarioCompleted = true;
  } finally { closing = true; phase = 'context-disposal'; event('action-dispose'); await context.close(); }
})().catch(error => { report.errorType = error.name; process.exitCode = 1; }).finally(async () => {
  await browser?.close(); report.completedAt = new Date().toISOString();
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ scenarioCompleted: report.scenarioCompleted ?? false, events: report.events.length, errorType: report.errorType ?? null }));
});
