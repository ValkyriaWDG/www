import { expect, test } from '@playwright/test';

test.describe('HLL server player snapshots', () => {
  test('switches servers by URL, preserves source freshness and reflows on mobile', async ({ page }) => {
    await page.goto('/cs/hll/servers?server=synthetic-alpha');
    await expect(page.locator('[data-live-players="fresh"]')).toContainText('[SYN] Alpha Player');
    await expect(page.locator('[data-live-players]')).toContainText('Statistiky hráčů kola');
    await expect(page.locator('[data-live-players]')).toContainText('64 připojených hráčů');
    await page.locator('[data-server-table] tbody tr').nth(1).getByRole('link').click();
    await expect(page).toHaveURL(/server=synthetic-bravo$/);
    await expect(page.locator('[data-live-players="stale"]')).toContainText('[SYN] Bravo Player');
    await expect(page.locator('[data-live-players]')).not.toContainText('[SYN] Alpha Player');
    await page.goto('/en/hll/servers?server=synthetic-charlie');
    await expect(page.locator('[data-live-players-unavailable]')).toContainText('unavailable');
    await expect(page.locator('[data-live-players] table')).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en/hll/servers?server=synthetic-alpha');
    await expect(page.getByRole('heading', { name: 'Round player statistics' })).toBeVisible();
    await expect(page.locator('[data-server-back]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });

  test('automatically updates a selected snapshot, distinguishes failure from empty, and can pause', async ({ page, request }) => {
    const original = await (await request.get('/api/servers/hll?server=synthetic-alpha')).json();
    let polls = 0;
    await page.route('**/api/servers/hll?server=synthetic-alpha', async (route) => {
      polls++;
      if (polls === 2) return route.fulfill({ status: 503, body: '{}' });
      const fresh = structuredClone(original);
      fresh.livePlayers.observedAt = new Date().toISOString();
      fresh.livePlayers.players = polls >= 3 ? [] : [{ name: '[SYN] Updated Participant', side: 'axis', kills: 27, deaths: 2, combat: 500, offense: 100, defense: null, support: 20 }];
      return route.fulfill({ status: 200, json: fresh });
    });
    await page.clock.install();
    await page.goto('/en/hll/servers?server=synthetic-alpha');
    await expect(page.locator('[data-live-players]')).toContainText('[SYN] Alpha Player');
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeDisabled();
    await page.clock.fastForward(31_000);
    await expect.poll(() => polls).toBe(1);
    await expect(page.locator('[data-live-players]')).toContainText('[SYN] Updated Participant');
    await expect(page).toHaveURL(/server=synthetic-alpha$/);
    await page.clock.fastForward(31_000);
    await expect.poll(() => polls).toBe(2);
    await expect(page.locator('[data-server-refresh] [role="status"]')).toContainText('Refresh failed');
    await expect(page.locator('[data-live-players="stale"]')).toContainText('[SYN] Updated Participant');
    await page.clock.fastForward(31_000);
    await expect(page.locator('[data-live-players-empty]')).toBeVisible();
    await expect(page.locator('[data-live-players-unavailable]')).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Update automatically every 30 seconds' }).uncheck();
    const paused = polls;
    await page.clock.fastForward(61_000);
    expect(polls).toBe(paused);
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect.poll(() => polls).toBe(paused + 1);
    await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeDisabled();
  });

  test('does not poll from a hidden tab and never exposes private source fields', async ({ page, request }) => {
    const response = await request.get('/api/servers/hll?server=synthetic-alpha');
    expect(response.status()).toBe(200);
    expect(await response.text()).not.toMatch(/statsApiKey|baseUrl|steaminfo|player_id|encounters/);
    expect((await request.get('/api/servers/hll?url=https://untrusted.invalid')).status()).toBe(400);
    let polls = 0;
    await page.route('**/api/servers/hll?server=synthetic-alpha', async (route) => { polls++; await route.fulfill({ status: 503, body: '{}' }); });
    await page.clock.install();
    await page.goto('/en/hll/servers?server=synthetic-alpha');
    await expect(page.locator('[data-live-players]')).toBeVisible();
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.clock.fastForward(61_000);
    expect(polls).toBe(0);
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(() => polls).toBe(1);
  });
});
