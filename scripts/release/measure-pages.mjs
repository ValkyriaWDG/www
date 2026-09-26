// Real Chromium/CDP measurements of a standalone build with disposable synthetic content.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessPageBudgets, maximumLayoutShiftSession } from './page-budgets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = path.join(root, 'apps/web');
const require = createRequire(path.join(app, 'package.json'));
const { chromium } = require('@playwright/test');
const policy = JSON.parse(readFileSync(new URL('./page-budgets.json', import.meta.url), 'utf8'));
const adminUrl = new URL(process.env.DATABASE_URL || '');
assert(['postgres:', 'postgresql:'].includes(adminUrl.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(adminUrl.hostname), 'Only explicit loopback disposable PostgreSQL is allowed');
assert(/^[a-z0-9_]+_test$/.test(adminUrl.pathname.slice(1)), 'DATABASE_URL must name a dedicated _test database');
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = adminUrl.pathname.replace(/_test$/, '_e2e');
const port = Number(process.env.BUDGET_PORT || 3134);
assert(Number.isInteger(port) && port >= 1024 && port <= 60000);
const origin = `http://127.0.0.1:${port}`;
const output = path.join(root, '.local/release-hardening/pages');
mkdirSync(output, { recursive: true });
const report = {
  schemaVersion: 1, status: 'running', startedAt: new Date().toISOString(),
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
  environment: { platform: process.platform, node: process.version, build: 'Next.js standalone production', data: 'Dedicated loopback PostgreSQL synthetic fixtures; never production', background: 'CSS fallback; delivered game binaries are excluded from CI. No video is fetched.', profile: policy.profile },
  policy, samples: [], captures: [], errors: [],
  limits: ['Lab cold-navigation measurements, not field Core Web Vitals or INP.', 'Optional delivered background poster/video is not bundled; its real playback is a separate media gate.', 'LCP median of three runs; every transfer/CLS sample must meet limits; observer window is bounded.'],
};
const save = () => writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const server = spawn(process.execPath, ['e2e/support/start-server.mjs'], {
  cwd: app, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', HOSTNAME: '127.0.0.1', PORT: String(port), APP_URL: origin, BETTER_AUTH_URL: origin,
    BETTER_AUTH_SECRET: 'performance-fixture-only-not-production-0000000',
    DATABASE_URL: databaseUrl.toString(), E2E_ADMIN_DATABASE_URL: adminUrl.toString(), E2E_DISCORD_MOCK_PORT: String(port + 1000),
    EDITORIAL_MEDIA_ROOT: path.join(output, 'editorial-media'),
    DISCORD_CLIENT_ID: '', DISCORD_CLIENT_SECRET: '', DISCORD_BOT_TOKEN: '', DISCORD_GUILD_ID: '', LOCAL_ADMIN_LOGIN_ENABLED: 'false',
    BACKGROUND_POSTER_URL: '', BACKGROUND_VIDEO_MP4_URL: '', BACKGROUND_VIDEO_WEBM_URL: '',
  },
});
let serverExited = false;
server.on('exit', () => { serverExited = true; });
// Keep diagnostics local-only and redact the supplied connection strings.
let logs = '';
for (const stream of [server.stdout, server.stderr]) stream.on('data', data => { logs = (logs + data.toString().replaceAll(adminUrl.toString(), '[disposable-db]').replaceAll(databaseUrl.toString(), '[disposable-db]')).slice(-100000); });
let browser;
try {
  save();
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (serverExited) throw new Error('Disposable fixture server exited before readiness; inspect local server.log');
    try { const response = await fetch(`${origin}/api/health/ready`, { signal: AbortSignal.timeout(2000) }); ready = response.ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(ready, 'Disposable fixture server did not become ready');
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  report.environment.browser = browser.version();
  for (const route of policy.routes) for (let run = 1; run <= policy.runs; run++) {
    const context = await browser.newContext({ viewport: policy.profile.viewport, deviceScaleFactor: policy.profile.deviceScaleFactor, isMobile: true, hasTouch: true, reducedMotion: policy.profile.reducedMotion, serviceWorkers: 'block', locale: 'cs-CZ' });
    const page = await context.newPage();
    const resources = new Map();
    let pageErrors = 0;
    page.on('pageerror', () => pageErrors++);
    await context.addInitScript(() => {
      window.__pageBudget = { lcpMs: null, lcpElement: null, shifts: [] };
      new PerformanceObserver(list => { for (const entry of list.getEntries()) {
        window.__pageBudget.lcpMs = entry.startTime;
        window.__pageBudget.lcpElement = { tag: entry.element?.tagName || null, id: entry.element?.id || null, emblem: entry.element?.hasAttribute('data-emblem') || false, imagePath: entry.url ? new URL(entry.url, location.href).pathname : null };
      } }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__pageBudget.shifts.push({
        startTime: entry.startTime, value: entry.value, hadRecentInput: entry.hadRecentInput,
        sources: (entry.sources || []).map(source => ({
          tag: source.node?.nodeName || null,
          id: source.node?.id || null,
          className: typeof source.node?.className === 'string' ? source.node.className : null,
          previous: source.previousRect?.toJSON(), current: source.currentRect?.toJSON(),
        })),
      }); }).observe({ type: 'layout-shift', buffered: true });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: policy.profile.latencyMs, downloadThroughput: policy.profile.downloadBytesPerSecond, uploadThroughput: policy.profile.uploadBytesPerSecond, connectionType: 'cellular4g' });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: policy.profile.cpuSlowdown });
    cdp.on('Network.requestWillBeSent', event => resources.set(event.requestId, { url: event.request.url, type: event.type, bytes: 0, completed: false, failed: false }));
    cdp.on('Network.responseReceived', event => { const row = resources.get(event.requestId); if (row) Object.assign(row, { type: event.type, status: event.response.status, cached: event.response.fromDiskCache || event.response.fromServiceWorker }); });
    cdp.on('Network.loadingFinished', event => { const row = resources.get(event.requestId); if (row) Object.assign(row, { bytes: event.encodedDataLength, completed: true }); });
    cdp.on('Network.loadingFailed', event => { const row = resources.get(event.requestId); if (row) Object.assign(row, { failed: !event.canceled, cancelled: event.canceled }); });
    const started = Date.now();
    try {
      const response = await page.goto(origin + route, { waitUntil: 'load', timeout: 60000 });
      await page.locator('h1').first().waitFor({ state: 'visible', timeout: 15000 });
      assert.equal(await page.locator('html').getAttribute('lang'), 'cs');
      if (route.startsWith('/cs/news/')) assert.match(await page.locator('h1').first().innerText(), /Ukázka/);
      await page.waitForTimeout(Math.max(2000, policy.profile.observationMs - (Date.now() - started)));
      const vitals = await page.evaluate(() => window.__pageBudget);
      const network = [...resources.values()].filter(row => row.url.startsWith('http'));
      assert(network.every(row => new URL(row.url).origin === origin), 'Unexpected external dependency');
      assert(!network.some(row => row.cached), 'Cold run unexpectedly used a cache');
      const transfer = type => network.filter(row => row.type === type).reduce((sum, row) => sum + row.bytes, 0);
      const sample = { route, run, status: response.status(), javascriptBytes: transfer('Script'), cssBytes: transfer('Stylesheet'), fontBytes: transfer('Font'), totalBytes: network.reduce((sum, row) => sum + row.bytes, 0), lcpMs: vitals.lcpMs, lcpElement: vitals.lcpElement, cls: maximumLayoutShiftSession(vitals.shifts), videoRequests: network.filter(row => /\.(?:webm|mp4)(?:\?|$)/i.test(row.url)).length, pageErrors, failedResources: network.filter(row => row.failed || (!row.completed && !row.cancelled) || row.status >= 400).length, observationMs: Date.now() - started };
      report.samples.push({ ...sample, layoutShifts: vitals.shifts });
      console.log(JSON.stringify(sample));
      if (run === 1) {
        const file = `page-${policy.routes.indexOf(route) + 1}.png`;
        const bytes = await page.screenshot({ path: path.join(output, file), fullPage: true, timeout: 20000 });
        report.captures.push({ file, route, sha256: createHash('sha256').update(bytes).digest('hex'), caption: 'Synthetic local/CI article fixtures, production build, throttled mobile Chromium; not the production website.' });
      }
      save();
    } finally { await context.close(); }
  }
  const result = assessPageBudgets(report.samples, policy);
  report.assessment = result;
  report.errors.push(...result.errors);
  report.status = report.errors.length ? 'failed' : 'passed';
} catch (error) {
  report.status = 'failed';
  report.errors.push(error instanceof assert.AssertionError ? error.message : `Measurement failed (${error?.name || 'Error'}); see local diagnostics`);
  console.error(error instanceof Error ? error.message : 'Measurement failed');
} finally {
  if (browser) await browser.close();
  if (!serverExited) {
    if (process.platform === 'win32') { try { execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} }
    else { try { process.kill(-server.pid, 'SIGTERM'); } catch {} }
  }
  writeFileSync(path.join(output, 'server.log'), logs);
  report.finishedAt = new Date().toISOString();
  save();
}
if (report.status !== 'passed') process.exitCode = 1;
