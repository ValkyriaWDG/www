import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { type E2ERole, signInAs } from './support/auth';

/**
 * Captioned screenshots of the integrations administration (issue #22) for PR/issue
 * evidence. Opt-in:
 *   CAPTURE_EVIDENCE=1 pnpm test:e2e e2e/visual-admin-integrations.spec.ts
 * Output: <repo>/.local/evidence/admin-integrations/ (gitignored) plus captures.json.
 * Identities are synthetic sessions against the local Discord mock; the server
 * presentation override is typed but never saved, so nothing is persisted.
 */
test.skip(!process.env.CAPTURE_EVIDENCE, 'Set CAPTURE_EVIDENCE=1 to capture integrations administration screenshots.');
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.local/evidence/admin-integrations');
const captures: { file: string; caption: string; viewport: string; uiLocale: string; role: E2ERole; path: string }[] = [];

async function newContext(browser: Browser, width: number, height: number, locale: 'cs' | 'en', role: E2ERole): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: locale === 'cs' ? 'cs-CZ' : 'en-GB',
    timezoneId: 'Europe/Prague',
    reducedMotion: 'reduce',
    isMobile: width < 768,
    hasTouch: width < 768,
  });
  await signInAs(context, { roles: [role], name: locale === 'cs' ? 'Syntetický administrátor' : 'Synthetic administrator' });
  return { context, page: await context.newPage() };
}

async function shot(page: Page, file: string, caption: string, meta: { uiLocale: 'cs' | 'en'; role: E2ERole; fullPage?: boolean; element?: string }) {
  await page.evaluate(() => document.fonts.ready);
  // Horizontal overflow would be a layout defect at any viewport.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  if (meta.element) await page.locator(meta.element).screenshot({ path: path.join(outDir, file), animations: 'disabled', caret: 'hide' });
  else await page.screenshot({ path: path.join(outDir, file), fullPage: meta.fullPage ?? false, animations: 'disabled', caret: 'hide' });
  const viewport = page.viewportSize();
  captures.push({ file, caption, viewport: `${viewport?.width}x${viewport?.height}`, uiLocale: meta.uiLocale, role: meta.role, path: new URL(page.url()).pathname });
}

test.beforeAll(() => mkdirSync(outDir, { recursive: true }));
test.afterAll(() => {
  writeFileSync(path.join(outDir, 'captures.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), captures }, null, 2)}\n`);
});

test('integrations overview (cs desktop, full page)', async ({ browser }) => {
  const { context, page } = await newContext(browser, 1440, 900, 'cs', 'administrator');
  await page.goto('/cs/admin/integrations');
  await expect(page.getByRole('heading', { level: 1, name: 'Integrace a servery' })).toBeVisible();
  await expect(page.locator('[data-integrations-logi]').getByText('Žádný zdroj Logi není nastaven.')).toBeVisible();
  await shot(page, 'integrations-cs-1440x900-full.png',
    'Administrator, /cs/admin/integrations at 1440×900 (full page): website collector health with the scope notice, both games on labelled synthetic fixtures with their current public state, no Logi source configured (nothing shown as healthy), webhooks/commands disabled and the six-entry e2e Discord role mapping. No key, host or URL from the configuration is rendered.',
    { uiLocale: 'cs', role: 'administrator', fullPage: true });
  await context.close();
});

test('integrations overview (en phone)', async ({ browser }) => {
  const { context, page } = await newContext(browser, 390, 844, 'en', 'administrator');
  await page.goto('/en/admin/integrations');
  await expect(page.getByRole('heading', { level: 1, name: 'Integrations and servers' })).toBeVisible();
  await shot(page, 'integrations-en-390x844.png',
    'Administrator, /en/admin/integrations on a 390×844 phone: the English page wraps server rows, badges and the Logi/Discord fact lists without horizontal overflow.',
    { uiLocale: 'en', role: 'administrator' });
  await page.locator('[data-integrations-logi]').scrollIntoViewIfNeeded();
  await shot(page, 'integrations-en-390x844-logi.png',
    'Administrator, /en/admin/integrations on a 390×844 phone, scrolled to the Logi section: SSO disabled/not configured, Discord membership source, webhooks and commands disabled, and the honest "No Logi source is configured" empty state.',
    { uiLocale: 'en', role: 'administrator' });
  await context.close();
});

test('server presentation form with an unsaved override (cs desktop)', async ({ browser }) => {
  const { context, page } = await newContext(browser, 1440, 900, 'cs', 'administrator');
  await page.goto('/cs/admin/integrations');
  const wardogsRow = page.locator('[data-server-row="wardogs/synthetic-wardogs"]');
  await wardogsRow.getByLabel(/^Název na webu/).fill('Valkyria Wardogs – hlavní server');
  await wardogsRow.getByLabel(/^Pořadí/).fill('1');
  const charlieRow = page.locator('[data-server-row="hll/synthetic-charlie"]');
  await charlieRow.getByLabel('Zobrazit na webu').uncheck();
  await expect(page.getByRole('status').filter({ hasText: 'neuloženo' })).toBeVisible();
  await shot(page, 'integrations-cs-1440x900-presentation-dirty.png',
    'Administrator, /cs/admin/integrations at 1440×900: the server presentation form with an unsaved display name and order for the synthetic Wardogs server and the synthetic HLL "Charlie" server unchecked (amber hidden marker); the sticky bar reports "2 servery změněny – neuloženo". Nothing was saved for this capture.',
    { uiLocale: 'cs', role: 'administrator', element: '[data-integrations-servers]' });
  await context.close();
});
