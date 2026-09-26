import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { signInAs } from './support/auth';
import type { BotView } from '../src/modules/bot-management/contracts';

function observation(): BotView {
  const at = new Date().toISOString();
  const current = { revision: '12', settings: { defaultLocale: 'cs' as const, serverLabels: { primary: 'Valkyria Wardogs', training: 'Trénink / Training' } } };
  return { enabled: true, canConfigure: true, receivedAt: at, error: null, settings: { schemaVersion: 1, desired: current, effective: current, applyState: 'applied' }, status: { schemaVersion: 1, observedAt: at, runtime: { build: { version: '1.0.0', revision: '4f3db011ec0aa96eaaa96bfb7b71cd4bffd804ac' }, startedAt: at, observedAt: at, discord: 'connected', database: 'available', lease: 'held', state: 'healthy' }, configuration: { desiredRevision: '12', effectiveRevision: '12', applyState: 'applied' }, roleSync: { enabled: true, state: 'unknown', pending: 2, failed: 0, oldestPendingAt: at, lastDeliveredAt: null } } };
}
const evidence = path.resolve('../../docs/evidence/bot-admin-2026-09-26');
async function capture(page: Page, file: string, caption: string) {
  if (process.env.CAPTURE_BOT_EVIDENCE !== '1') return;
  if (process.env.CAPTURE_BOT_EVIDENCE_FILE && process.env.CAPTURE_BOT_EVIDENCE_FILE !== file) return;
  await page.evaluate(() => document.fonts.ready);
  const width = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
  await mkdir(evidence, { recursive: true });
  const png = await page.screenshot({ path: path.join(evidence, file), fullPage: true, animations: 'disabled' });
  const metadataPath = path.join(evidence, 'screenshots.json');
  let previous: { captures: unknown[] } = { captures: [] };
  try { previous = JSON.parse(await readFile(metadataPath, 'utf8')); } catch { /* Fresh run. */ }
  previous.captures = previous.captures.filter((item) => (item as { file: string }).file !== file);
  await writeFile(metadataPath, JSON.stringify({ schemaVersion: 1, evidenceKind: 'offline-browser-simulated-bot-responses', sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()), browser: page.context().browser()?.version(), limitations: ['Real website page and seeded synthetic Better Auth session; bot responses intercepted for deterministic UI state.', 'Joint actual bot HTTP/PostgreSQL interoperability is proved separately. No live Discord or production calls.'], captures: [...previous.captures, { file, caption, sha256: createHash('sha256').update(png).digest('hex'), bytes: png.length, viewport: page.viewportSize(), route: new URL(page.url()).pathname, width, capturedAt: new Date().toISOString() }] }, null, 2) + '\n');
}

for (const locale of ['cs', 'en'] as const) {
  for (const mobile of [false, true]) {
    test(`${locale} ${mobile ? 'narrow' : 'desktop'} bot overview, keyboard and safe controls`, async ({ page, context }) => {
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1050 });
      await signInAs(context, { roles: ['administrator'], name: 'Synthetic bot administrator' });
      await page.route('**/api/admin/bot', (route) => route.fulfill({ json: { ok: true, view: observation() } }));
      await page.goto(`/${locale}/admin/bot`);
      await expect(page.locator('[data-bot-runtime]')).toHaveText(locale === 'cs' ? 'V pořádku' : 'Healthy');
      await expect(page.locator('input[name="bot-label-primary"]')).toHaveValue('Valkyria Wardogs');
      const reason = page.locator('textarea[name="bot-reason"]');
      await reason.focus(); await page.keyboard.type(locale === 'cs' ? 'Ověření klávesnice' : 'Keyboard check');
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: locale === 'cs' ? 'Uložit nastavení' : 'Save presentation', exact: true })).toBeFocused();
      await expect(page.locator('main')).not.toContainText('private-provider');
      await capture(page, `${locale}-${mobile ? 'narrow' : 'desktop'}-healthy.png`, `${locale.toUpperCase()} ${mobile ? '390px narrow' : 'desktop'} bot administration with real website rendering and explicitly simulated healthy runtime; role delivery remains Unknown despite an operational process. Keyboard reaches save.`);
    });
  }
}

test('real disabled backend and direct unauthorized access', async ({ page, context }) => {
  await signInAs(context, { roles: ['administrator'] });
  await page.goto('/cs/admin/bot');
  await expect(page.locator('[data-bot-disabled]')).toBeVisible();
  await capture(page, 'cs-disabled.png', 'Czech real website backend with management disabled by default; no management connection or settings controls. Synthetic website session only.');
  await context.clearCookies(); await signInAs(context, { roles: ['editor'] });
  await page.goto('/en/admin/bot');
  await expect(page.locator('[data-admin-bot]')).toHaveCount(0);
  expect((await page.request.get('/api/admin/bot')).status()).toBe(403);
});

test('retains edits on conflict and requires explicit revision review before resubmission', async ({ page, context }) => {
  await signInAs(context, { roles: ['administrator'] });
  let patches = 0, newer = false;
  await page.route('**/api/admin/bot', (route) => {
    if (route.request().method() === 'PATCH') { patches++; newer = true; return route.fulfill({ status: 409, json: { ok: false, code: 'conflict' } }); }
    const view = observation(); if (newer) view.settings!.desired = { ...view.settings!.desired, revision: '13' };
    return route.fulfill({ json: { ok: true, view } });
  });
  await page.goto('/cs/admin/bot');
  await page.locator('input[name="bot-label-primary"]').fill('Moje neuložené změny');
  await page.locator('textarea[name="bot-reason"]').fill('Souběžná úprava');
  await page.getByRole('button', { name: 'Uložit nastavení', exact: true }).click();
  await expect(page.locator('[data-bot-error="conflict"]')).toBeVisible();
  await expect(page.locator('[data-bot-runtime]')).toHaveText('V pořádku');
  await expect(page.locator('input[name="bot-label-primary"]')).toHaveValue('Moje neuložené změny');
  await expect(page.getByRole('button', { name: 'Uložit nastavení', exact: true })).toBeDisabled();
  await capture(page, 'cs-conflict.png', 'Czech simulated revision conflict: unsaved label and reason retained, save blocked until fresh read and explicit revision review. No silent overwrite.');
  await page.getByRole('button', { name: 'Obnovit pozorování' }).click();
  await page.getByRole('button', { name: 'Ponechat mé úpravy a použít aktuální revizi' }).click();
  await expect(page.getByRole('button', { name: 'Uložit nastavení', exact: true })).toBeEnabled(); expect(patches).toBe(1);
});

test('saving and unknown outcome remain distinct without retry', async ({ page, context }) => {
  await signInAs(context, { roles: ['administrator'] }); let patches = 0; let release: () => void = () => {};
  const gate = new Promise<void>((done) => { release = done; });
  await page.route('**/api/admin/bot', async (route) => { if (route.request().method() === 'PATCH') { patches++; await gate; return route.fulfill({ status: 503, json: { ok: false, code: 'unknown_outcome' } }); } return route.fulfill({ json: { ok: true, view: observation() } }); });
  await page.goto('/en/admin/bot');
  await page.locator('input[name="bot-label-primary"]').fill('Retained pending label');
  await page.locator('textarea[name="bot-reason"]').fill('Synthetic timeout scenario');
  await page.getByRole('button', { name: 'Save presentation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  await capture(page, 'en-saving.png', 'English actual form while a simulated request is pending; inputs and save are locked to prevent duplicate submission.');
  release(); await expect(page.locator('[data-bot-error="unknown_outcome"]')).toBeVisible();
  await expect(page.locator('[data-bot-runtime]')).toHaveText('Healthy');
  await expect(page.locator('input[name="bot-label-primary"]')).toHaveValue('Retained pending label');
  await capture(page, 'en-unknown-outcome.png', 'English simulated lost mutation response: outcome explicitly unknown, edits retained, read-before-retry required.');
  expect(patches).toBe(1);
});

test('stale, unavailable and apply error states are truthful', async ({ page, context }) => {
  await signInAs(context, { roles: ['administrator'] }); let mode = 'stale';
  await page.route('**/api/admin/bot', (route) => {
    if (mode === 'unavailable') return route.fulfill({ status: 503, json: { ok: false, code: 'unavailable' } });
    const view = observation();
    if (mode === 'stale') { view.status!.runtime.observedAt = new Date(Date.now() - 61_000).toISOString(); view.status!.runtime.state = 'stale'; }
    if (mode === 'apply-error') { view.settings!.applyState = 'error'; view.settings!.desired = { ...view.settings!.desired, revision: '13' }; }
    return route.fulfill({ json: { ok: true, view } });
  });
  await page.goto('/en/admin/bot'); await expect(page.locator('[data-bot-runtime]')).toHaveText('Stale');
  await capture(page, 'en-stale.png', 'English simulated stale observation; stale runtime is distinguished from current service health and cannot authorize a save.');
  mode = 'unavailable'; await page.getByRole('button', { name: 'Refresh observations' }).click(); await expect(page.locator('[data-bot-error="unavailable"]')).toBeVisible();
  await expect(page.locator('[data-bot-role-sync]')).toHaveText('Unavailable');
  await capture(page, 'en-unavailable.png', 'English simulated loss of connectivity: previous values remain historical with an unavailable warning. No optimistic success.');
  mode = 'apply-error'; await page.getByRole('button', { name: 'Refresh observations' }).click(); await expect(page.getByText('Application error', { exact: true })).toBeVisible();
  await capture(page, 'en-apply-error.png', 'English simulated persisted desired revision 13 while effective revision remains 12; application failure is separate from transport success.');
});

test('polling stops while hidden and resumes once visible', async ({ page, context }) => {
  await signInAs(context, { roles: ['administrator'] }); let reads = 0;
  await page.route('**/api/admin/bot', (route) => { reads++; return route.fulfill({ json: { ok: true, view: observation() } }); });
  await page.clock.install(); await page.goto('/en/admin/bot'); await expect(page.locator('[data-bot-runtime]')).toBeVisible();
  const initial = reads;
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.fastForward(61_000); expect(reads).toBe(initial);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => reads).toBe(initial + 1);
});
