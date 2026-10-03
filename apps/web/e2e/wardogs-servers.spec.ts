import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function capture(page: Page, file: string) {
  if (process.env.CAPTURE_EVIDENCE !== '1') return;
  const directory = path.resolve('../../.local/evidence/wardogs-servers');
  mkdirSync(directory, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(directory, file), animations: 'disabled', fullPage: true });
}

for (const locale of ['cs', 'en'] as const) {
  for (const width of [1440, 390]) {
    test(`Wardogs home and server browser: ${locale}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1050 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect((await page.goto(`/${locale}/wardogs`))?.status()).toBe(200);
      const banner = page.locator('[data-home-servers]');
      await expect(banner).toHaveAttribute('aria-busy', 'false');
      if (width === 390) await page.locator('[data-mobile-menu-trigger]').click();
      const navigation = page.getByRole('navigation', { name: locale === 'cs' ? 'Hlavní navigace' : 'Main navigation' }).filter({ visible: true });
      await expect(navigation.getByRole('link', { name: locale === 'cs' ? 'SERVERY' : 'SERVERS', exact: true })).toHaveAttribute('href', `/${locale}/wardogs/servers`);
      if (width === 390) await page.keyboard.press('Escape');
      await expect(banner).toContainText('0 / 98');
      await expect(banner.locator('[data-team-scores] dt')).toHaveText(['Alpha', 'Bravo', 'Charlie']);
      await expect(banner.locator('[data-team-scores] dd')).toHaveText(['0', '12', '7']);
      await expect(banner).not.toContainText('Sainte-Mère-Église');
      await expect(banner.locator('[data-synthetic-data]')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect((await new AxeBuilder({ page }).include('[data-home-servers]').analyze()).violations).toEqual([]);
      await capture(page, `home-${locale}-${width}.png`);
      await banner.locator('a[href*="?server="]').click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/wardogs/servers\\?server=synthetic-wardogs$`));
      await expect(page.locator('[data-server-refresh]')).toHaveAttribute('aria-busy', 'false');
      if (width === 390) await page.locator('[data-mobile-menu-trigger]').click();
      await expect(navigation.getByRole('link', { name: locale === 'cs' ? 'SERVERY' : 'SERVERS', exact: true })).toHaveAttribute('aria-current', 'page');
      if (width === 390) await page.keyboard.press('Escape');
      await expect(page.locator('[data-team-scores] dd')).toHaveText(['0', '12', '7']);
      // The score group spans the detail grid; short team names must not break into letters.
      expect(await page.locator('[data-team-scores] dt').evaluateAll((labels) => labels.every((label) => label.clientHeight <= Number.parseFloat(getComputedStyle(label).lineHeight) * 1.1))).toBe(true);
      await expect(page.locator('[data-server-score], [data-live-players]')).toHaveCount(0);
      await expect(page.locator('main')).not.toContainText(/Allies|Axis|Spojenci|držené sektory/);
      await expect(page.locator('[data-server-stats]')).toHaveAttribute('href', 'https://stats.synthetic-wardogs.invalid/');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([]);
      await capture(page, `detail-${locale}-${width}.png`);
      if (width === 390) {
        await page.locator('[data-server-back]').click();
        await expect(page.locator('[data-server-table]')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await capture(page, `list-${locale}-${width}.png`);
      }
    });
  }
}

test('Wardogs desktop menu fits without overlapping the game/language/account controls', async ({ page }) => {
  for (const locale of ['cs', 'en']) {
    await page.goto(`/${locale}/wardogs`);
    await expect(page.locator('[data-home-servers]')).toHaveAttribute('aria-busy', 'false');
    await page.evaluate(() => document.fonts.ready);
    for (const width of [768, 1024, 1152, 1280, 1366, 1440, 1536, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const fits = await page.locator('[data-nav="desktop"]').evaluate((nav) => [...nav.querySelectorAll('a')].every((link) => link.getBoundingClientRect().right <= nav.getBoundingClientRect().right + 1));
      expect(fits, `${locale}: ${width}px menu must stay within its column`).toBe(true);
    }
  }
});

test('Wardogs read API is scoped and rejects arbitrary source selectors', async ({ request }) => {
  const response = await request.get('/api/servers/wardogs');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  const data = await response.json();
  expect(data.overview.servers).toHaveLength(1);
  expect(data.overview.servers[0].ref.game).toBe('wardogs');
  expect(data.overview.servers[0].teamScores).toHaveLength(3);
  expect(data.livePlayers).toBeNull();
  expect((await request.get('/api/servers/wardogs?source=https://private.example')).status()).toBe(400);
  expect((await request.get('/api/servers/unknown')).status()).toBe(404);
});

test('Wardogs home can pause refresh and still removes ageing scores', async ({ page }) => {
  let polls = 0;
  await page.route('**/api/servers/wardogs', async (route) => { polls++; await route.abort(); });
  await page.clock.install();
  await page.goto('/en/wardogs');
  const banner = page.locator('[data-home-servers]');
  await expect(banner).toHaveAttribute('aria-busy', 'false');
  await banner.getByRole('checkbox').uncheck();
  await page.clock.fastForward(125_000);
  expect(polls).toBe(0);
  await expect(banner.locator('[data-team-scores]')).toHaveCount(0);
  await expect(banner).toContainText('Stale');
});

test('Wardogs banner removes stale scores after a failed poll and recovers on the next success', async ({ page, request }) => {
  const original = await (await request.get('/api/servers/wardogs')).json();
  let polls = 0;
  await page.route('**/api/servers/wardogs', async (route) => {
    polls++;
    if (polls === 1) return route.fulfill({ status: 503, body: '{}' });
    const next = structuredClone(original);
    next.overview.servers[0].observedAt = new Date(await page.evaluate(() => Date.now())).toISOString();
    next.overview.servers[0].players = 21;
    return route.fulfill({ status: 200, json: next });
  });
  await page.clock.install();
  await page.goto('/en/wardogs');
  const banner = page.locator('[data-home-servers]');
  await expect(banner).toHaveAttribute('aria-busy', 'false');
  await expect(banner.locator('[data-team-scores]')).toBeVisible();
  await page.clock.fastForward(31_000);
  await expect.poll(() => polls).toBe(1);
  await expect(banner.locator('[data-team-scores]')).toHaveCount(0);
  await expect(banner).toContainText('0 / 98');
  await expect(banner.getByRole('status')).toContainText('failed');
  await capture(page, 'home-en-stale.png');
  await page.clock.fastForward(31_000);
  await expect.poll(() => polls).toBe(2);
  await expect(banner).toContainText('21 / 98');
  await expect(banner.locator('[data-team-scores]')).toBeVisible();
});

test('Wardogs banner shows an honest unavailable state without fictional servers', async ({ page }) => {
  await page.route('**/api/servers/wardogs', (route) => route.fulfill({ status: 200, json: { overview: { state: 'not_configured' }, livePlayers: null } }));
  await page.clock.install();
  await page.goto('/cs/wardogs');
  const banner = page.locator('[data-home-servers]');
  await expect(banner).toHaveAttribute('aria-busy', 'false');
  await page.clock.fastForward(31_000);
  await expect(banner).toHaveAttribute('data-server-state', 'not_configured');
  await expect(banner).toContainText('Stav serverů zatím není k dispozici.');
  await expect(banner.locator('[data-team-scores], li')).toHaveCount(0);
  await capture(page, 'home-cs-unconfigured.png');
});
