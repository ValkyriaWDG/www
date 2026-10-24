import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { FIXTURE_SLUGS } from '../../src/fixtures/data';
import { expectNoHorizontalOverflow } from '../support/shell-helpers';
import { signInAs } from '../support/auth';

/** Only playwright.logi.config.ts supplies these deliberately invented projections. */
const archiveSlug = FIXTURE_SLUGS.matches.hllHistorical;
const outDir = path.resolve('.local/evidence/unified-logi-web');
const row = (page: Page, number: number) => page.locator('[data-unified-matches] tbody tr').filter({ hasText: `[SYNTHETIC] Logi history ${String(number).padStart(2, '0')}` });
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
      const browser = page.locator('[data-unified-matches]');
      await expect(browser.getByRole('searchbox')).toHaveCount(1);
      await expect(page.locator('[data-match-table]')).toHaveCount(1);
      await expect(page.locator('[data-logi-browser]')).toHaveCount(0);
      await expect(page.getByText(locale === 'cs' ? 'Zápasy z Logi' : 'Matches from Logi', { exact: true })).toHaveCount(0);
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
      await expect(reviewed.locator('[data-column="status"]')).toHaveText(copy[locale].unknown);
      await expect(reviewed).toContainText('[SYNTHETIC] Team A · SYA');
      await expect(reviewed).toContainText('[SYNTHETIC] Team B · SYB');
      const archive = reviewed.getByRole('link', { name: copy[locale].archive });
      await expect(reviewed).toContainText('Valkyria vs. Synthetic HLL Opponent Foxtrot');
      await expect(reviewed).toContainText('Synthetic Historical Cup (sample)');
      await expect(archive).toHaveAttribute('href', `/${locale}/hll/matches/${archiveSlug}`);
      await expect(page.locator(`[data-match-table] tbody th a[href*="/matches/${archiveSlug}"]`)).toHaveCount(0);
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
      expect((await new AxeBuilder({ page }).include('[data-unified-matches]').analyze()).violations).toEqual([]);
      await capture(page, `history-${locale}-${width}`, 'Synthetic Logi history: imported provisional scores, supplied end times, captured team names, and an explicitly linked original archive. The first row uses the reviewed 0:5 result instead of the conflicting imported 5:0.');

      // A real second link in the row must work independently of the stretched primary link.
      await archive.click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/hll/matches/${archiveSlug}$`));
      const current = page.locator(`[data-match-detail="${archiveSlug}"]`);
      await expect(current).toContainText(copy[locale].confirmed);
      await expect(current).toContainText('Axis: 0');
      await expect(current).toContainText('Allies: 5');
      const original = page.locator(`[data-match-detail="${archiveSlug}"]`);
      await expect(original).toContainText('Synthetic HLL Opponent Foxtrot');
      await expect(original).toContainText('Synthetic Historical Cup (sample)');
      await expect(original.locator('[data-result="score"]')).toHaveCount(0);
      await expect(page.locator('[data-match-rounds]')).toContainText('Hürtgen Forest');
      await expectNoHorizontalOverflow(page);
      await capture(page, `archive-${locale}-${width}`, 'Synthetic linked match detail: one current reviewed result beside the retained historical recap and map rounds.');
      expect(browserErrors).toEqual([]);
    });
  }
}

test('one search and page includes current and historical matches', async ({ page }) => {
  await page.goto('/en/hll/matches?view=results');
  const browser = page.locator('[data-unified-matches]');
  await expect(browser.locator('tbody tr')).toHaveCount(10);
  await expect(row(page, 0)).toHaveCount(1);
  const next = browser.locator('a[rel="next"]');
  await expect(next).toHaveAttribute('href', '/en/hll/matches?view=results&page=2');
  await next.click();
  await expect(page).toHaveURL(/view=results&page=2$/);
  await expect(row(page, 10)).toHaveCount(1);
  await expect(row(page, 11)).toHaveCount(1);
  await browser.getByRole('searchbox').fill('SYA');
  await browser.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(browser.locator('tbody tr')).toHaveCount(1);
  await expect(row(page, 0)).toHaveCount(1);
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  expect(new URL(page.url()).searchParams.has('logiPage')).toBe(false);
  await browser.getByRole('searchbox').fill('Foxtrot');
  await browser.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(browser.locator('tbody tr')).toHaveCount(1);
  await expect(row(page, 0)).toHaveCount(1);
});

test('imported detail preserves provenance and three-team upcoming has no fabricated score', async ({ page }) => {
  await page.goto('/en/hll/matches/logi/synthetic-history-01');
  await expect(page.locator('[data-logi-matches]')).toContainText(copy.en.imported);
  await expect(page.locator('[data-logi-matches]')).toContainText(copy.en.importedOn);
  await page.goto('/en/wardogs/matches');
  const connected = page.locator('[data-unified-matches]');
  const next = connected.locator('tbody tr').filter({ hasText: '[SYNTHETIC] Next wardogs match' });
  await expect(next).toHaveCount(1);
  for (const label of ['[SYNTHETIC] Team A · SYA', 'Lonestar', '[SYNTHETIC] Team B · SYB', 'Manticore', '[SYNTHETIC] Team C · SYC', 'Valkyra']) await expect(next).toContainText(label);
  await expect(connected.locator('[data-column="result"]')).toHaveCount(0);
  await expect(next).not.toContainText(/0\s*:\s*0/);
  await expectNoHorizontalOverflow(page);
  await capture(page, 'wardogs-three-teams-en-1280', 'Synthetic upcoming Wardogs match shows three captured teams and their supplied sides; the unknown result remains unavailable.');
});

test('an explicitly reviewed identical alias is hidden and its old detail redirects to the canonical event', async ({ page, request }) => {
  await page.goto('/en/hll/matches?view=results');
  await expect(row(page, 1)).toHaveCount(1);
  await expect(page.locator('[data-unified-matches] a[href*="synthetic-history-alias"]')).toHaveCount(0);
  const response = await request.get('/en/hll/matches/logi/synthetic-history-alias', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe('/en/hll/matches/logi/synthetic-history-01');
  await page.goto('/en/hll/matches/logi/synthetic-history-alias');
  await expect(page).toHaveURL(/\/en\/hll\/matches\/logi\/synthetic-history-01$/);
  await expect(page.locator('[data-logi-matches]')).toContainText(copy.en.imported);
});

test('both homes select the actual next published Logi match', async ({ page }) => {
  for (const locale of ['cs', 'en'] as const) {
    await page.goto(`/${locale}`);
    for (const game of ['hll', 'wardogs']) await expect(page.locator(`[data-hub-next-match="${game}"] a`)).toHaveAttribute('href', `/${locale}/${game}/matches/logi/synthetic-next-${game === 'hll' ? 'hell_let_loose' : 'wardogs'}`);
    await capture(page, `hub-${locale}-1280`, 'The shared community hub advertises the actual next published match for each game using the same selection as the HLL/Wardogs homes.');
    await page.goto(`/${locale}/hll`);
    await expect(page.locator('[data-hll-strip-item="match"]')).toHaveAttribute('href', `/${locale}/hll/matches/logi/synthetic-next-hell_let_loose`);
    await page.goto(`/${locale}/wardogs`);
    await expect(page.locator('[data-next-match]')).toHaveAttribute('href', `/${locale}/wardogs/matches/logi/synthetic-next-wardogs`);
  }
});

for (const locale of ['cs', 'en'] as const) {
  for (const width of [1440, 390]) {
    test(`${locale} ${width}: Logi operations and secondary archive administration`, async ({ context, page }) => {
      await signInAs(context, { roles: ['administrator'], name: 'Synthetic administrator' });
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`/${locale}/admin`);
      const operations = page.getByTestId('admin-logi-operations');
      await expect(operations.locator('a[href="https://logi.example.test"]')).toHaveCount(1);
      for (const key of ['matches', 'members', 'tournaments']) await expect(page.getByTestId('admin-nav').locator(`[data-admin-nav="${key}"]`)).toHaveCount(0);
      const archives = page.getByTestId('admin-archive-nav');
      await expect(archives.locator('[data-admin-nav="matches"]')).toBeHidden();
      await archives.locator('summary').focus();
      await page.keyboard.press('Enter');
      await expect(archives.locator('[data-admin-nav="matches"]')).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect((await new AxeBuilder({ page }).include('[data-admin-shell]').analyze()).violations).toEqual([]);
      await capture(page, `admin-${locale}-${width}`, 'Synthetic authorized administration: editorial/configuration tools stay primary, HLL/Wardogs operations use the validated Logi entry, and keyboard-accessible historical editors remain available.');
    });
    test(`${locale} ${width}: approved lineups join the ordinary member directory for both games`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`/${locale}/members?q=Bravo`);
      const roster = page.locator('[data-member-roster]');
      await expect(roster.locator('tbody tr')).toHaveCount(1);
      for (const game of ['hll', 'wardogs']) await expect(roster.locator(`a[href="/${locale}/${game}/matches/logi/synthetic-next-${game === 'hll' ? 'hell_let_loose' : 'wardogs'}"]`)).toBeVisible();
      await expect(roster).toContainText('Syntetická hráčka Bravo');
      for (const privateField of ['PRIVATE_OPERATIONAL_NAME', 'PRIVATE_OPERATIONAL_GROUP', 'private-member-', 'private-identity-', '910000000000000002']) expect(await page.content()).not.toContain(privateField);
      // Translation dictionary keys are public UI strings, not individual attendance data.
      await expect(roster).not.toContainText(/acknowledged|attending/);
      await expectNoHorizontalOverflow(page);
      expect((await new AxeBuilder({ page }).include('[data-member-roster]').analyze()).violations).toEqual([]);
      await capture(page, `members-${locale}-${width}`, 'One consented synthetic profile lists approved HLL and Wardogs lineups inside the ordinary member directory; private operational names and attendance are absent.');
      await roster.locator(`a[href="/${locale}/hll/matches/logi/synthetic-next-hell_let_loose"]`).click();
      await expect(page.locator('[data-logi-matches]')).toContainText('[SYNTHETIC] Next hell_let_loose match');
      await expect(page.locator('#match-logi-people')).toBeVisible();
      await expect(page.locator('[aria-labelledby="match-logi-people"]')).toContainText('Syntetická hráčka Bravo');
      await expectNoHorizontalOverflow(page);
    });
  }
}

test('the shared results list filters both sources with the same game controls', async ({ page }) => {
  await page.goto('/en/matches?view=results');
  const browser = page.locator('[data-unified-matches]');
  await expect(browser.getByRole('searchbox')).toHaveCount(1);
  await expect(page.locator('[data-match-table]')).toHaveCount(1);
  await expect(browser.locator('tbody tr')).toHaveCount(10);
  await browser.locator('a[href="/en/matches?view=results&game=wardogs"]').click();
  await expect(browser.locator('tbody tr')).toHaveCount(3);
  await expect(browser).not.toContainText('[SYNTHETIC] Logi history');
  await browser.locator('a[href="/en/matches?view=results&game=hell-let-loose"]').click();
  await expect(browser.locator('tbody tr')).toHaveCount(10);
  await expect(row(page, 0)).toHaveCount(1);
});
