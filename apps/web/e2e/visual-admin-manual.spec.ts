import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { uniqueSuffix } from './admin-editorial-helpers';
import { type E2ERole, signInAs } from './support/auth';

/**
 * Captioned screenshots of the Field Manual administration and fixed-scope module access
 * for PR/issue evidence. Opt-in:
 *   CAPTURE_EVIDENCE=1 pnpm test:e2e e2e/visual-admin-manual.spec.ts
 * Output: <repo>/.local/evidence/admin-manual/ (gitignored) + captures.json. Identities are
 * synthetic sessions against the local Discord mock; articles are created in this run.
 */
test.skip(!process.env.CAPTURE_EVIDENCE, 'Set CAPTURE_EVIDENCE=1 to capture Field Manual admin screenshots.');
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.local/evidence/admin-manual');
const captures: { file: string; caption: string; viewport: string; uiLocale: string; role: E2ERole; path: string }[] = [];

async function newContext(browser: Browser, width: number, height: number, locale: 'cs' | 'en', role: E2ERole): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: locale === 'cs' ? 'cs-CZ' : 'en-GB',
    timezoneId: 'Europe/Prague',
    isMobile: width < 768,
    hasTouch: width < 768,
  });
  await signInAs(context, { roles: [role], name: `Synthetic ${role}` });
  return { context, page: await context.newPage() };
}

async function shot(page: Page, file: string, caption: string, meta: { uiLocale: 'cs' | 'en'; role: E2ERole }) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(outDir, file), animations: 'disabled', caret: 'hide' });
  const viewport = page.viewportSize();
  captures.push({ file, caption, viewport: `${viewport?.width}x${viewport?.height}`, uiLocale: meta.uiLocale, role: meta.role, path: new URL(page.url()).pathname + new URL(page.url()).search });
}

async function createManualArticle(page: Page, locale: 'cs' | 'en'): Promise<string> {
  await page.goto(`/${locale}/admin/manual/new`);
  await page.getByTestId('new-post-title').fill(`[E2E] Manual capture ${locale} ${uniqueSuffix()}`);
  await page.getByTestId('new-post-submit').click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/admin/manual/[0-9a-f-]{36}\\?lang=cs$`));
  return page.url();
}

test.beforeAll(() => mkdirSync(outDir, { recursive: true }));
test.afterAll(() => {
  writeFileSync(path.join(outDir, 'captures.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), captures }, null, 2)}\n`);
});

test('HLL-only editor: module list and manual search (cs desktop)', async ({ browser }) => {
  const { context, page } = await newContext(browser, 1440, 900, 'cs', 'hll_editor');
  await page.goto('/cs/admin');
  await expect(page.getByTestId('admin-module-manual')).toBeVisible();
  await expect(page.getByTestId('admin-module-content')).toHaveCount(0);
  await shot(page, 'admin-home-hll-editor-cs-1440x900.png',
    'HLL-only editor, /cs/admin: the Field Manual module (Příručka) is offered; the platform-wide "Stránky a FAQ" module is not listed because the editor has no community-page authority.',
    { uiLocale: 'cs', role: 'hll_editor' });

  await page.goto('/cs/admin/manual');
  await page.locator('[data-filter="state:published"]').click();
  await expect(page.locator('[data-filter="state:published"]')).toHaveAttribute('aria-current', 'true');
  await page.locator('[data-filter="locale:cs"]').click();
  await expect(page.locator('[data-filter="locale:cs"]')).toHaveAttribute('aria-current', 'true');
  await page.getByRole('searchbox').fill('První nastavení');
  await page.getByRole('searchbox').press('Enter');
  await expect(page).toHaveURL((url) => url.pathname === '/cs/admin/manual' && url.searchParams.get('q') === 'První nastavení' && url.searchParams.get('state') === 'published');
  await expect(page.locator('table tbody tr')).toHaveCount(1);
  await shot(page, 'manual-search-cs-1440x900.png',
    'HLL-only editor, /cs/admin/manual?q=První nastavení&state=published&locale=cs: the search stays in the Field Manual workspace with the "Zveřejněno" and "Čeština" filters still selected and one matching sample article.',
    { uiLocale: 'cs', role: 'hll_editor' });
  await context.close();
});

test('manual metadata: unsaved-changes dialog (cs desktop, en phone)', async ({ browser }) => {
  for (const [locale, width, height] of [['cs', 1440, 900], ['en', 390, 844]] as const) {
    const { context, page } = await newContext(browser, width, height, locale, 'hll_editor');
    const editorUrl = await createManualArticle(page, locale);
    await page.locator('#manual-credits').fill(locale === 'cs' ? 'Syntetický zdroj příručky' : 'Synthetic manual source');
    await page.getByTestId('admin-nav').locator('[data-admin-nav="manual"]').click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await shot(page, `manual-meta-unsaved-${locale}-${width}x${height}.png`,
      locale === 'cs'
        ? 'HLL editor, new Field Manual article (/cs/admin/manual/<id>), 1440×900: after typing credits into "Zdroj a řazení" and choosing the Příručka navigation link, the dialog asks to stay, save or discard; nothing is written until the editor decides.'
        : 'HLL editor, new Field Manual article (/en/admin/manual/<id>) on a 390×844 phone: the same unsaved-metadata dialog in English.',
      { uiLocale: locale, role: 'hll_editor' });
    await dialog.locator('[data-unsaved-action="stay"]').click();
    await expect(page).toHaveURL(editorUrl);
    await context.close();
  }
});

test('fixed-scope denials for direct admin URLs (cs/en)', async ({ browser }) => {
  const hll = await newContext(browser, 1440, 900, 'cs', 'hll_editor');
  await hll.page.goto('/cs/admin/content');
  await expect(hll.page.getByTestId('access-denied')).toHaveAttribute('data-reason', 'forbidden');
  await shot(hll.page, 'content-denied-hll-editor-cs-1440x900.png',
    'HLL-only editor opening /cs/admin/content directly: the server denies the platform-wide Pages/FAQ module ("forbidden") and audits the denial with reason game_scope; the sidebar offers no link to it.',
    { uiLocale: 'cs', role: 'hll_editor' });
  await hll.context.close();

  const wdg = await newContext(browser, 1440, 900, 'en', 'wdg_editor');
  await wdg.page.goto('/en/admin/manual');
  await expect(wdg.page.getByTestId('access-denied')).toHaveAttribute('data-reason', 'forbidden');
  await shot(wdg.page, 'manual-denied-wdg-editor-en-1440x900.png',
    'Wardogs-only editor opening /en/admin/manual directly: the HLL Field Manual is denied ("forbidden"); News remains available for the editor\'s own game.',
    { uiLocale: 'en', role: 'wdg_editor' });
  await wdg.context.close();
});
