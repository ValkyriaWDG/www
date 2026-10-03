import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import pg from 'pg';
import { type E2ERole, signInAs } from './support/auth';
import { e2eDatabaseUrl } from './support/database-url';

/**
 * Captioned screenshots of the categories/tags administration (issue #86) for PR/issue
 * evidence. Opt-in:
 *   CAPTURE_EVIDENCE=1 pnpm test:e2e e2e/visual-admin-taxonomy.spec.ts
 * Output: <repo>/.local/evidence/admin-taxonomy/ (gitignored) + captures.json. Identities
 * are synthetic sessions against the local Discord mock; only seeded categories are shown
 * and nothing is modified.
 */
test.skip(!process.env.CAPTURE_EVIDENCE, 'Set CAPTURE_EVIDENCE=1 to capture taxonomy admin screenshots.');
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.local/evidence/admin-taxonomy');
const captures: { file: string; caption: string; viewport: string; uiLocale: string; role: E2ERole; path: string }[] = [];

async function manualCategoryId(key: string): Promise<string> {
  const client = new pg.Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    const result = await client.query<{ id: string }>(`select id from manual_category where game = 'hell-let-loose' and key = $1`, [key]);
    if (!result.rows[0]) throw new Error(`No manual category ${key}`);
    return result.rows[0].id;
  } finally {
    await client.end();
  }
}

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

async function shot(page: Page, file: string, caption: string, meta: { uiLocale: 'cs' | 'en'; role: E2ERole }, fullPage = false) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(outDir, file), animations: 'disabled', caret: 'hide', fullPage });
  const viewport = page.viewportSize();
  captures.push({ file, caption, viewport: `${viewport?.width}x${viewport?.height}`, uiLocale: meta.uiLocale, role: meta.role, path: new URL(page.url()).pathname + new URL(page.url()).search });
}

test.beforeAll(() => mkdirSync(outDir, { recursive: true }));
test.afterAll(() => {
  writeFileSync(path.join(outDir, 'captures.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), captures }, null, 2)}\n`);
});

test('platform-wide editor: taxonomy list and manual category form (cs desktop)', async ({ browser }) => {
  const { context, page } = await newContext(browser, 1440, 900, 'cs', 'editor');
  await page.goto('/cs/admin/taxonomy');
  await expect(page.getByTestId('taxonomy-section-manual-hll')).toBeVisible();
  await expect(page.getByTestId('taxonomy-section-news-tag')).toBeVisible();
  await shot(page, 'taxonomy-list-editor-cs-1440x900.png',
    'Platform-wide editor, /cs/admin/taxonomy at 1440×900: the Hell Let Loose Field Manual categories (order, key, Czech/English names, assigned-article counts, state, Upravit links) followed by the shared news categories and tags sections, each with its publication note and a create button.',
    { uiLocale: 'cs', role: 'editor' }, true);

  await page.goto(`/cs/admin/taxonomy/manual/hll/${await manualCategoryId('vehicles')}`);
  await expect(page.getByTestId('taxonomy-form')).toBeVisible();
  await shot(page, 'taxonomy-edit-manual-vehicles-cs-1440x900.png',
    'Platform-wide editor, /cs/admin/taxonomy/manual/hll/<id> (seeded category "Vozidla a tanky") at 1440×900: read-only key, Czech/English names and descriptions, order, the "Kdy se změna projeví" note stating that manual category changes apply to the public manual immediately, and the archive/delete section with the assigned-article count.',
    { uiLocale: 'cs', role: 'editor' }, true);
  await context.close();
});

test('HLL-only editor: manual category form on a phone (en)', async ({ browser }) => {
  const { context, page } = await newContext(browser, 390, 844, 'en', 'hll_editor');
  await page.goto(`/en/admin/taxonomy/manual/hll/${await manualCategoryId('roles')}`);
  await expect(page.getByTestId('taxonomy-form')).toBeVisible();
  await shot(page, 'taxonomy-edit-manual-roles-en-390x844.png',
    'HLL-only editor, /en/admin/taxonomy/manual/hll/<id> (seeded category "Roles") on a 390×844 phone: single-column form with the key locked, bilingual names/descriptions, order, publication note and the archive/delete section stacked below without horizontal scrolling.',
    { uiLocale: 'en', role: 'hll_editor' }, true);
  await page.goto('/en/admin/taxonomy');
  await expect(page.getByTestId('taxonomy-section-manual-hll')).toBeVisible();
  await shot(page, 'taxonomy-list-hll-editor-en-390x844.png',
    'HLL-only editor, /en/admin/taxonomy on a 390×844 phone: manual category rows stacked with their column names; the news categories/tags sections are replaced by the explanation that shared news taxonomy needs platform-wide authority.',
    { uiLocale: 'en', role: 'hll_editor' }, true);
  await context.close();
});

test('referenced category: delete disabled with the consequence (cs)', async ({ browser }) => {
  const { context, page } = await newContext(browser, 1440, 900, 'cs', 'editor');
  await page.goto(`/cs/admin/taxonomy/manual/hll/${await manualCategoryId('getting-started')}`);
  await expect(page.getByTestId('taxonomy-delete')).toBeDisabled();
  await page.getByTestId('taxonomy-danger').scrollIntoViewIfNeeded();
  await shot(page, 'taxonomy-delete-referenced-cs-1440x900.png',
    'Platform-wide editor, /cs/admin/taxonomy/manual/hll/<id> (seeded "Začínáme", referenced by sample articles) at 1440×900: the "Archivace a odstranění" section states how many articles use the category, the ODSTRANIT button is disabled with that reason and only archiving is offered.',
    { uiLocale: 'cs', role: 'editor' }, true);
  await page.getByTestId('taxonomy-archive').click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await shot(page, 'taxonomy-archive-consequence-cs-1440x900.png',
    'Same page: the archive confirmation names the category and states the consequence — the assigned articles keep it and stay public, only new assignments stop. Cancelled after the capture; nothing is written.',
    { uiLocale: 'cs', role: 'editor' });
  await page.getByRole('alertdialog').locator('[data-confirm="cancel"]').click();
  await context.close();
});

test('denied scope: Wardogs-only editor opens an HLL category URL directly (en)', async ({ browser }) => {
  const { context, page } = await newContext(browser, 1440, 900, 'en', 'wdg_editor');
  await page.goto(`/en/admin/taxonomy/manual/hll/${await manualCategoryId('roles')}`);
  await expect(page.getByTestId('access-denied')).toHaveAttribute('data-reason', 'forbidden');
  await shot(page, 'taxonomy-denied-wdg-editor-en-1440x900.png',
    'Wardogs-only editor opening /en/admin/taxonomy/manual/hll/<id> directly at 1440×900: the server denies the HLL Field Manual category ("forbidden", audited with reason game_scope); no form or category data is rendered.',
    { uiLocale: 'en', role: 'wdg_editor' });
  await context.close();
});
