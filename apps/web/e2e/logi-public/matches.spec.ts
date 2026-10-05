import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { FIXTURE_SLUGS } from '../../src/fixtures/data';
import { expectNoHorizontalOverflow } from '../support/shell-helpers';

/** Only playwright.logi.config.ts supplies these deliberately invented projections. */
const archiveSlug = FIXTURE_SLUGS.matches.hllHistorical;
const outDir = path.resolve('.local/evidence/unified-match-browser');
const row = (page: Page, number: number) => page.locator('[data-match-table] tbody tr').filter(number === 0 ? { has: page.locator(`a[href*="/matches/${archiveSlug}"]`) } : { hasText: `[SYNTHETIC] Match history ${String(number).padStart(2, '0')}` });
const copy = {
  cs: { end: 'Čas konce', imported: 'Importovaný předběžný výsledek', confirmed: 'Potvrzený výsledek', unknown: 'Není k dispozici', archive: 'Detail zápasu', provisional: 'Předběžný výsledek', importedOn: 'Výsledek importován:' },
  en: { end: 'End time', imported: 'Imported provisional result', confirmed: 'Confirmed result', unknown: 'Not available', archive: 'Match details', provisional: 'Provisional result', importedOn: 'Result imported:' },
} as const;

async function capture(page: Page, name: string, caption: string) {
  if (process.env.CAPTURE_EVIDENCE !== '1') return;
  mkdirSync(outDir, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  // Full-page evidence also includes maps below the lazy-loading viewport.
  await page.locator('img').evaluateAll((nodes) => Promise.all(nodes.map(async (node) => {
    const image = node as HTMLImageElement;
    image.loading = 'eager';
    await image.decode();
  })));
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
      const browser = page.locator('[data-mode="list"]');
      await expect(browser.locator('tbody tr')).toHaveCount(10);
      await expect(page.getByRole('search')).toHaveCount(1);
      await expect(page.locator('[data-match-table]')).toHaveCount(1);
      await expect(browser.locator('tbody th')).toContainText(['Synthetic HLL Opponent Foxtrot', 'Local Interleaved Opponent', ...Array.from({ length: 8 }, (_, index) => `[SYNTHETIC] Match history ${String(index + 1).padStart(2, '0')}`)]);
      await expect(page.getByRole('heading', { name: /Zápasy z Logi|Matches from Logi|Archiv webu|Website archive/ })).toHaveCount(0);
      const reviewed = row(page, 0);
      const imported = row(page, 1);
      for (const text of ['Axis: 0', 'Allies: 5', copy[locale].confirmed]) await expect(reviewed).toContainText(text);
      await expect(reviewed).not.toContainText(copy[locale].imported);
      await expect(imported).toContainText('Axis: 0');
      await expect(imported).toContainText('Allies: 5');
      await expect(imported).toContainText(copy[locale].provisional);
      await expect(reviewed.locator('td').first()).toContainText(copy[locale].end);
      await expect(reviewed.locator('[data-column="status"]')).toHaveText(copy[locale].unknown);
      await expect(reviewed).toContainText('[SYNTHETIC] Team A · SYA / [SYNTHETIC] Team B · SYB');
      const archive = reviewed.locator('[data-column="match"] a');
      await expect(reviewed).toContainText('Valkyria vs. Synthetic HLL Opponent Foxtrot');
      await expect(reviewed).toContainText('Synthetic Historical Cup (sample)');
      await expect(archive).toHaveAttribute('href', `/${locale}/hll/matches/${archiveSlug}`);
      await expect(page.locator(`[data-match-table] a[href*="/matches/${archiveSlug}"]`)).toHaveCount(1);
      if (width >= 1280) {
        const preview = page.locator('[aria-labelledby="match-preview-title"]');
        await expect(preview).toContainText('Axis: 0');
        await expect(preview).toContainText('Allies: 5');
        await expect(preview).not.toContainText('3 : 2');
        await expect(preview.getByRole('link')).toHaveAttribute('href', `/${locale}/hll/matches/${archiveSlug}`);
      }
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
      expect((await new AxeBuilder({ page }).include('[data-mode="list"]').analyze()).violations).toEqual([]);
      await capture(page, `history-${locale}-${width}`, 'One synthetic match browser: an original website fixture interleaves chronologically with connected results, using one search, count and pagination. The first row and preview show reviewed 0:5 and open the original detail.');

      // The only primary row link opens the preserved original detail.
      await archive.click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/hll/matches/${archiveSlug}$`));
      await expect(page.locator('[data-logi-matches]')).toHaveCount(0);
      const current = page.locator('[data-match-primary-result]');
      await expect(current).toHaveCount(1);
      await expect(current).toContainText(copy[locale].confirmed);
      await expect(current).toContainText('Axis: 0');
      await expect(current).toContainText('Allies: 5');
      const original = page.locator(`[data-match-detail="${archiveSlug}"]`);
      await expect(original).toContainText('Synthetic HLL Opponent Foxtrot');
      await expect(original).toContainText('Synthetic Historical Cup (sample)');
      await expect(current).not.toContainText('3 : 2');
      await expect(original.locator('[data-match-time="end"]')).toHaveAttribute('datetime', await reviewed.locator('time').getAttribute('datetime') ?? '');
      await expect(original).toContainText(copy[locale].end);
      await expect(original.locator('[data-match-start]')).toHaveCount(0);
      await expect(original.locator('[data-match-status]')).toHaveText(copy[locale].unknown);
      await expect(original.locator('[data-match-teams]')).toContainText('[SYNTHETIC] Team A · SYA');
      await expect(original.locator('[data-match-teams]')).toContainText('[SYNTHETIC] Team B · SYB');
      await expect(page.locator('[data-match-rounds]')).toContainText('Hürtgen Forest');
      await expectNoHorizontalOverflow(page);
      await capture(page, `detail-${locale}-${width}`, 'One synthetic linked match detail: the main result is reviewed Axis 0 / Allies 5, its unknown status and supplied end time stay explicit, and original map rounds remain attached. No separate source result table or conflicting original primary score.');
      expect(browserErrors).toEqual([]);
    });
  }
}

test('one page boundary and one search cover both origins', async ({ page }) => {
  await page.goto('/en/hll/matches?view=results');
  const browser = page.locator('[data-mode="list"]');
  const next = browser.locator('a[rel="next"]');
  await expect(next).toHaveAttribute('href', '/en/hll/matches?view=results&page=2');
  await next.click();
  await expect(page).toHaveURL(/view=results&page=2$/);
  await expect(browser.locator('tbody tr')).toHaveCount(3);
  for (const index of [9, 10, 11]) await expect(row(page, index)).toHaveCount(1);
  for (const term of ['SYA', 'Foxtrot', 'Local Interleaved']) {
    await browser.getByRole('searchbox').fill(term);
    await browser.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(browser.locator('tbody tr')).toHaveCount(1);
    await expect(browser.locator('tbody tr')).toContainText(term === 'SYA' ? 'Foxtrot' : term);
    expect(new URL(page.url()).searchParams.has('page')).toBe(false);
    expect(new URL(page.url()).searchParams.has('logiPage')).toBe(false);
  }
  await page.goto('/en/hll/matches?view=results&q=synthetic');
  await expect(browser.locator('tbody tr')).toHaveCount(10);
  await expect(browser.locator('tbody tr').nth(1)).toContainText('Local Interleaved');
  const times = await browser.locator('tbody time').evaluateAll((nodes) => nodes.map((node) => Date.parse(node.getAttribute('datetime')!)));
  expect(times).toEqual([...times].sort((a, b) => b - a));
  await page.goto('/en/hll/matches?view=results&page=7');
  await expect(browser.locator('tbody tr')).toHaveCount(0);
  await expect(browser.getByRole('link', { name: 'Go to the first page' })).toBeVisible();
});

test('imported detail preserves provenance and three-team upcoming has no fabricated score', async ({ page }) => {
  await page.goto('/en/hll/matches/logi/synthetic-history-01');
  await expect(page.locator('[data-logi-matches]')).toContainText(copy.en.imported);
  await expect(page.locator('[data-logi-matches]')).toContainText(copy.en.importedOn);
  await page.goto('/en/wardogs/matches');
  const connected = page.locator('[data-match-table] tbody tr').filter({ has: page.locator(`a[href*="/matches/${FIXTURE_SLUGS.matches.upcoming}"]`) });
  await expect(connected).toHaveCount(1);
  for (const team of ['[SYNTHETIC] Team A · SYA', '[SYNTHETIC] Team B · SYB', '[SYNTHETIC] Team C · SYC']) await expect(connected).toContainText(team);
  await expect(connected.locator('[data-column="result"]')).toHaveCount(0);
  await expect(connected).not.toContainText(/0\s*:\s*0/);
  await expectNoHorizontalOverflow(page);
  await capture(page, 'wardogs-three-teams-en-1280', 'Synthetic upcoming Wardogs match shows three captured teams and their supplied sides; the unknown result remains unavailable.');
});

test('the single linked Wardogs mobile detail retains all three captured teams without public people', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/wardogs/matches/logi/synthetic-next-wardogs');
  await expect(page).toHaveURL(new RegExp(`/en/wardogs/matches/${FIXTURE_SLUGS.matches.upcoming}$`));
  const teams = page.locator('[data-match-teams]');
  await expect(teams.locator('li')).toHaveCount(3);
  for (const team of ['[SYNTHETIC] Team A · SYA', '[SYNTHETIC] Team B · SYB', '[SYNTHETIC] Team C · SYC', 'Lonestar', 'Manticore', 'Valkyra']) await expect(teams).toContainText(team);
  await expect(page.locator('[data-match-primary-result] [data-connected-result]')).toHaveText('—');
  await expect(page.locator('[data-logi-matches]')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await capture(page, 'detail-wardogs-en-390', 'Synthetic linked Wardogs mobile detail retains three captured teams, short codes and supplied sides in one match overview. No public people data is configured and the unknown result is not filled from the original archive.');
});

test('an explicitly reviewed identical alias is hidden and its old detail redirects to the canonical event', async ({ page, request }) => {
  await page.goto('/en/hll/matches?view=results');
  await expect(row(page, 1)).toHaveCount(1);
  await expect(page.locator('[data-match-table] a[href*="synthetic-history-alias"]')).toHaveCount(0);
  const response = await request.get('/en/hll/matches/logi/synthetic-history-alias', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe('/en/hll/matches/logi/synthetic-history-01');
  await page.goto('/en/hll/matches/logi/synthetic-history-alias');
  await expect(page).toHaveURL(/\/en\/hll\/matches\/logi\/synthetic-history-01$/);
  await expect(page.locator('[data-logi-matches]')).toContainText(copy.en.imported);
});

test('a linked provider detail redirects to the single published canonical match', async ({ request }) => {
  const response = await request.get('/en/hll/matches/logi/synthetic-history-00', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe(`/en/hll/matches/${archiveSlug}`);
});

test('both homes select the actual next published Logi match', async ({ page }) => {
  for (const locale of ['cs', 'en'] as const) {
    await page.goto(`/${locale}/hll`);
    await expect(page.locator('[data-hll-strip-item="match"]')).toHaveAttribute('href', `/${locale}/hll/matches/logi/synthetic-next-hell_let_loose`);
    await page.goto(`/${locale}/wardogs`);
    await expect(page.locator('[data-next-match]')).toHaveAttribute('href', `/${locale}/wardogs/matches/logi/synthetic-next-wardogs`);
  }
});
