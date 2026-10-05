import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { FIXTURE_SLUGS } from '../../src/fixtures/data';
import { expectNoHorizontalOverflow } from '../support/shell-helpers';

/** Only playwright.logi.config.ts supplies these deliberately invented projections. */
const archiveSlug = FIXTURE_SLUGS.matches.hllHistorical;
const outDir = path.resolve('.local/evidence/logi-public-data');
const row = (page: Page, number: number) => page.locator('[data-logi-matches] tbody tr').filter({ hasText: `[SYNTHETIC] Logi history ${String(number).padStart(2, '0')}` });
const copy = {
  cs: { end: 'Čas konce', imported: 'Importovaný předběžný výsledek', confirmed: 'Potvrzený výsledek', unknown: 'Není k dispozici', archive: 'Archivní detail zápasu', importedOn: 'Výsledek importován:' },
  en: { end: 'End time', imported: 'Imported provisional result', confirmed: 'Confirmed result', unknown: 'Not available', archive: 'Archived match details', importedOn: 'Result imported:' },
} as const;

async function capture(page: Page, name: string, caption: string) {
  if (process.env.CAPTURE_EVIDENCE !== '1') return;
  mkdirSync(outDir, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true, animations: 'disabled', caret: 'hide' });
  writeFileSync(path.join(outDir, `${name}.json`), `${JSON.stringify({ caption, kind: 'synthetic-local-browser-screenshot', route: new URL(page.url()).pathname + new URL(page.url()).search, viewport: page.viewportSize(), capturedAt: new Date().toISOString() }, null, 2)}\n`);
}

test.use({ reducedMotion: 'reduce' });

for (const locale of ['cs', 'en'] as const) {
  for (const width of [1440, 390]) {
    test(`${locale} at ${width}: actual history, reviewed precedence, teams and original archive`, async ({ page }) => {
      const browserErrors: string[] = [];
      page.on('pageerror', (error) => browserErrors.push(error.message));
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`/${locale}/hll/matches?view=results`);
      const browser = page.locator('[data-logi-browser]');
      await expect(browser.locator('tbody tr')).toHaveCount(10);
      await expect(browser.locator('tbody th')).toContainText(Array.from({ length: 10 }, (_, index) => `[SYNTHETIC] Logi history ${String(index).padStart(2, '0')}`));
      const reviewed = row(page, 0);
      const imported = row(page, 1);
      for (const text of ['Axis: 0', 'Allies: 5', copy[locale].confirmed]) await expect(reviewed).toContainText(text);
      await expect(reviewed).not.toContainText(copy[locale].imported);
      await expect(imported).toContainText('Axis: 0');
      await expect(imported).toContainText('Allies: 5');
      await expect(imported).toContainText(copy[locale].imported);
      await expect(reviewed.locator('td').first()).toContainText(copy[locale].end);
      await expect(reviewed.locator('td').nth(2)).toHaveText(copy[locale].unknown);
      await expect(reviewed.locator('ul li')).toHaveText(['[SYNTHETIC] Team A · SYAAxis', '[SYNTHETIC] Team B · SYBAllies']);
      const archive = reviewed.getByRole('link', { name: copy[locale].archive });
      await expect(reviewed).toContainText('Valkyria vs. Synthetic HLL Opponent Foxtrot');
      await expect(reviewed).toContainText('Synthetic Historical Cup (sample)');
      await expect(archive).toHaveAttribute('href', `/${locale}/hll/matches/${archiveSlug}`);
      await expect(page.locator(`[data-match-table] a[href*="/matches/${archiveSlug}"]`)).toHaveCount(0);
      for (const excluded of ['never-render-logo', 'synthetic-public-match-source', '910000000000000001', 'synthetic-public-hll-key']) {
        expect(await page.content()).not.toContain(excluded);
      }
      await expectNoHorizontalOverflow(page);
      if (width === 390) {
        const bounds = await reviewed.locator('[data-column="result"]').boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      }
      expect((await new AxeBuilder({ page }).include('[data-logi-browser]').analyze()).violations).toEqual([]);
      await capture(page, `history-${locale}-${width}`, 'Synthetic Logi history: imported provisional scores, supplied end times, captured team names, and an explicitly linked original archive. The first row uses the reviewed 0:5 result instead of the conflicting imported 5:0.');

      // A real second link in the row must work independently of the stretched primary link.
      await archive.click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/hll/matches/${archiveSlug}$`));
      const current = page.locator('[data-logi-matches]');
      await expect(current).toContainText(copy[locale].confirmed);
      await expect(current).toContainText('Axis: 0');
      await expect(current).toContainText('Allies: 5');
      const original = page.locator(`[data-match-detail="${archiveSlug}"]`);
      await expect(original).toContainText('Synthetic HLL Opponent Foxtrot');
      await expect(original).toContainText('Synthetic Historical Cup (sample)');
      await expect(original.locator('[data-result="score"]')).toContainText('3 : 2');
      await expect(page.locator('[data-match-rounds]')).toContainText('Hürtgen Forest');
      await expectNoHorizontalOverflow(page);
      await capture(page, `archive-${locale}-${width}`, 'Synthetic linked archive detail: the fresh reviewed Logi result appears above the unchanged original 3:2 website result and its map rounds.');
      expect(browserErrors).toEqual([]);
    });
  }
}

test('connected history uses its own page and preserves the archive page', async ({ page }) => {
  await page.goto('/en/hll/matches?view=results&page=7');
  const browser = page.locator('[data-logi-browser]');
  await expect(browser.locator('tbody tr')).toHaveCount(10);
  await expect(row(page, 0)).toHaveCount(1);
  const next = browser.locator('a[rel="next"]');
  await expect(next).toHaveAttribute('href', '/en/hll/matches?view=results&page=7&logiPage=2');
  await next.click();
  await expect(page).toHaveURL(/page=7&logiPage=2$/);
  await expect(browser.locator('tbody tr')).toHaveCount(2);
  await expect(row(page, 10)).toHaveCount(1);
  await expect(row(page, 11)).toHaveCount(1);
  await browser.getByRole('searchbox', { name: 'Match or team' }).fill('SYA');
  await browser.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(browser.locator('tbody tr')).toHaveCount(1);
  await expect(row(page, 0)).toHaveCount(1);
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  expect(new URL(page.url()).searchParams.has('logiPage')).toBe(false);
  await browser.getByRole('searchbox', { name: 'Match or team' }).fill('Foxtrot');
  await browser.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(browser.locator('tbody tr')).toHaveCount(1);
  await expect(row(page, 0)).toHaveCount(1);
});

test('imported detail preserves provenance and three-team upcoming has no fabricated score', async ({ page }) => {
  await page.goto('/en/hll/matches/logi/synthetic-history-01');
  await expect(page.locator('[data-logi-matches]')).toContainText(copy.en.imported);
  await expect(page.locator('[data-logi-matches]')).toContainText(copy.en.importedOn);
  await page.goto('/en/wardogs/matches');
  const connected = page.locator('[data-logi-matches]');
  await expect(connected.locator('tbody tr')).toHaveCount(1);
  await expect(connected.locator('ul li')).toHaveText(['[SYNTHETIC] Team A · SYALonestar', '[SYNTHETIC] Team B · SYBManticore', '[SYNTHETIC] Team C · SYCValkyra']);
  await expect(connected.locator('tbody td').last()).toHaveText(copy.en.unknown);
  await expect(connected).not.toContainText(/0\s*:\s*0/);
  await expectNoHorizontalOverflow(page);
  await capture(page, 'wardogs-three-teams-en-1280', 'Synthetic upcoming Wardogs match shows three captured teams and their supplied sides; the unknown result remains unavailable.');
});

test('an explicitly reviewed identical alias is hidden and its old detail redirects to the canonical event', async ({ page, request }) => {
  await page.goto('/en/hll/matches?view=results');
  await expect(row(page, 1)).toHaveCount(1);
  await expect(page.locator('[data-logi-matches] a[href*="synthetic-history-alias"]')).toHaveCount(0);
  const response = await request.get('/en/hll/matches/logi/synthetic-history-alias', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe('/en/hll/matches/logi/synthetic-history-01');
  await page.goto('/en/hll/matches/logi/synthetic-history-alias');
  await expect(page).toHaveURL(/\/en\/hll\/matches\/logi\/synthetic-history-01$/);
  await expect(page.locator('[data-logi-matches]')).toContainText(copy.en.imported);
});

test('both homes select the actual next published Logi match', async ({ page }) => {
  for (const locale of ['cs', 'en'] as const) {
    await page.goto(`/${locale}/hll`);
    await expect(page.locator('[data-hll-strip-item="match"]')).toHaveAttribute('href', `/${locale}/hll/matches/logi/synthetic-next-hell_let_loose`);
    await page.goto(`/${locale}/wardogs`);
    await expect(page.locator('[data-next-match]')).toHaveAttribute('href', `/${locale}/wardogs/matches/logi/synthetic-next-wardogs`);
  }
});
