import { expect, test } from '@playwright/test';

/**
 * A JavaScript-disabled context keeps the real server-rendered fallback observable:
 * withholding external scripts alone does not stop Next's inline streamed reveal.
 * A separate normal context exercises the query-aware links and real navigation.
 */

test.describe('query-safe switch hydration (issue #49)', () => {
  test('game choice cannot discard a results filter while its destination is loading', async ({ browser, page, baseURL }, testInfo) => {
    const fallbackContext = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 1280, height: 720 } });
    try {
      const fallbackPage = await fallbackContext.newPage();
      await fallbackPage.goto('/cs/wardogs/matches?view=results');
      const group = fallbackPage.locator('[data-game-switch]').first();
      const choice = group.locator('[data-game-option="hll"]');
      await expect(choice).toBeVisible();
      await testInfo.attach('game-switch-without-javascript', { body: await fallbackPage.screenshot(), contentType: 'image/png' });
      await expect(choice).toHaveAttribute('aria-disabled', 'true');
      await expect(choice).not.toHaveAttribute('href');
      await expect(group.locator('a[href]')).toHaveCount(0);
      expect(await choice.evaluate((element) => (element as HTMLElement).tabIndex)).toBe(-1);
      await expect(group).toHaveAttribute('aria-busy', 'true');
      await expect(group.locator('[aria-current="true"]')).toHaveAttribute('data-game-option', 'wardogs');
    } finally {
      await fallbackContext.close();
    }

    await page.goto('/cs/wardogs/matches?view=results');
    const group = page.locator('[data-game-switch]').first();
    const choice = group.locator('[data-game-option="hll"]');
    await expect(choice).toHaveAttribute('href', '/cs/hll/matches?view=results');
    await expect(group).not.toHaveAttribute('aria-busy', 'true');
    await expect(choice).not.toHaveAttribute('aria-disabled', 'true');
    await testInfo.attach('game-switch-query-ready', { body: await page.screenshot(), contentType: 'image/png' });
    await choice.click();
    await expect(page).toHaveURL(/\/cs\/hll\/matches\?view=results$/);
    await expect(group.locator('[aria-current="true"]')).toHaveAttribute('data-game-option', 'hll');
    await expect(page.locator('[data-view="results"] a[aria-current="page"]')).toHaveAttribute('href', '/cs/hll/matches?view=results');
    await testInfo.attach('game-switch-results-retained', { body: await page.screenshot(), contentType: 'image/png' });
  });

  test('language choice cannot discard a results filter while its destination is loading', async ({ browser, page, baseURL }, testInfo) => {
    const fallbackContext = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 1280, height: 720 } });
    try {
      const fallbackPage = await fallbackContext.newPage();
      await fallbackPage.goto('/en/hll/matches?view=results');
      const choice = fallbackPage.locator('[data-locale="cs"]').first();
      const group = choice.locator('..');
      await expect(choice).toBeVisible();
      await testInfo.attach('language-switch-without-javascript', { body: await fallbackPage.screenshot(), contentType: 'image/png' });
      await expect(choice).toHaveAttribute('aria-disabled', 'true');
      await expect(choice).not.toHaveAttribute('href');
      await expect(group.locator('a[href]')).toHaveCount(0);
      expect(await choice.evaluate((element) => (element as HTMLElement).tabIndex)).toBe(-1);
      await expect(group).toHaveAttribute('aria-busy', 'true');
      await expect(group.locator('[aria-current="true"]')).toHaveAttribute('data-locale', 'en');
    } finally {
      await fallbackContext.close();
    }

    await page.goto('/en/hll/matches?view=results');
    const choice = page.locator('[data-locale="cs"]').first();
    const group = choice.locator('..');
    await expect(choice).toHaveAttribute('href', '/api/locale-switch?to=cs&from=%2Fen%2Fhll%2Fmatches%3Fview%3Dresults');
    await expect(group).not.toHaveAttribute('aria-busy', 'true');
    await expect(choice).not.toHaveAttribute('aria-disabled', 'true');
    await testInfo.attach('language-switch-query-ready', { body: await page.screenshot(), contentType: 'image/png' });
    await choice.click();
    await expect(page).toHaveURL(/\/cs\/hll\/matches\?view=results$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
    await expect(page.locator('[data-view="results"] a[aria-current="page"]')).toHaveAttribute('href', '/cs/hll/matches?view=results');
    await testInfo.attach('language-switch-results-retained', { body: await page.screenshot(), contentType: 'image/png' });
  });
});
