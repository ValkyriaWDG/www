import { expect, test } from '@playwright/test';
import { FIXTURE_SLUGS } from '../src/fixtures/data';
import { expectNoHorizontalOverflow } from './support/shell-helpers';

/**
 * Layout regressions found in the public UI audit (synthetic fixtures): wide content must
 * get room instead of being squeezed or pushing the page sideways.
 */

test.describe('public layout', () => {
  test('server names keep the row width on phones and tablets', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/cs/hll/servers');
    const alpha = page.getByRole('row').filter({ hasText: 'Test Server Alpha' });
    await expect(alpha).toContainText('Sainte-Mère-Église');
    // Phones get compact row summaries: thumbnail and name on their own line, then the figures.
    await expect(alpha.locator('img[data-map-thumb]')).toBeVisible();
    const name = alpha.locator('[data-server-name]');
    expect((await name.boundingBox())!.width).toBeGreaterThan(180);
    // "[SYNTHETIC]" is never broken inside the word.
    expect(await name.evaluate((element) => Math.round(element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight)))).toBeLessThanOrEqual(3);
    await expectNoHorizontalOverflow(page);

    // Tablets: the list uses the full width; the detail opens as its own view.
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/cs/hll/servers');
    await expect(page.locator('img[data-map-thumb]')).toBeVisible();
    expect((await page.locator('[data-server-table]').boundingBox())!.width).toBeGreaterThan(900);
    await expect(page.locator('[data-server-detail="none"]')).toBeHidden();
  });

  test('HLL match statistics span the full width below the list and the detail pane', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/cs/hll/matches/${FIXTURE_SLUGS.matches.hllHistorical}`);
    const pane = (await page.locator('[data-match-detail]').boundingBox())!;
    const list = (await page.locator('[data-match-table]').boundingBox())!;
    const extras = page.locator('[data-match-extras]');
    const box = (await extras.boundingBox())!;
    expect(box.x).toBeLessThanOrEqual(list.x + 1);
    expect(box.width).toBeGreaterThan(1200);
    expect(box.y).toBeGreaterThanOrEqual(pane.y + pane.height - 1);
    await expect(extras.locator('[data-match-rounds] table tbody tr')).toHaveCount(3);
    const statistics = extras.locator('[data-match-statistics]');
    await statistics.getByRole('tab', { name: 'Hráči' }).click();
    // All player columns fit without scrolling the table sideways.
    const scroller = statistics.locator('[data-statistics-players]');
    await expect(scroller.locator('tbody tr')).toHaveCount(12);
    expect(await scroller.evaluate((element) => {
      const region = element.querySelector('[role="region"]') ?? element;
      return region.scrollWidth - region.clientWidth;
    })).toBeLessThanOrEqual(1);
    await expectNoHorizontalOverflow(page);
  });

  test('tournament descriptions with tables stay inside a phone screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/cs/hll/tournaments/${FIXTURE_SLUGS.tournaments.current}`);
    await expect(page.locator('[data-tournament-detail] table')).toBeAttached();
    await expectNoHorizontalOverflow(page);
    const panel = (await page.locator('[data-tournament-detail] section').last().boundingBox())!;
    expect(panel.x + panel.width).toBeLessThanOrEqual(390);
    // A three-column standings table fits without scrolling sideways.
    const region = page.locator('[data-tournament-detail] [role="region"]').first();
    expect(await region.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  });

  test('the match banner shows whole team names on phones', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/cs/hll/matches/${FIXTURE_SLUGS.matches.hllHistorical}`);
    const banner = page.locator('[data-match-detail] [data-match-banner]');
    await expect(banner).toContainText('VLK + Synthetic Ally');
    await expect(banner).toContainText('Synthetic HLL Opponent Foxtrot');
    expect(await banner.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return [...element.querySelectorAll('span')].every((name) => {
        const rect = name.getBoundingClientRect();
        return rect.top >= box.top - 0.5 && rect.bottom <= box.bottom + 0.5;
      });
    })).toBe(true);
  });

  test('match facts, archive pages and prose read as current page content', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/cs/hll/matches/${FIXTURE_SLUGS.matches.hllHistorical}`);
    // Historical facts need the full width below the list and overview, not the one-third pane.
    await expect(page.locator('[data-match-detail] [data-match-legacy]')).toHaveCount(0);
    const legacy = page.locator('[data-match-extras] [data-match-legacy]');
    expect((await legacy.boundingBox())!.width).toBeGreaterThan(1200);
    await expect(legacy.locator('[data-legacy-source-links]')).toContainText('YouTube');
    // Without a logo the banner mark shows the short code, so the name is the opponent's name.
    await expect(page.locator('[data-match-banner]')).toContainText('Synthetic HLL Opponent Foxtrot');

    await page.goto('/cs/clan');
    // Ragged-right Czech prose is not split by automatic hyphenation.
    expect(await page.locator('[data-core-page] [class*="root"]').first().evaluate((element) => getComputedStyle(element).hyphens)).toBe('manual');
  });

  test('Discord links carry the Discord mark and shared destinations and tournaments their glyphs', async ({ page }) => {
    const discordMark = 'svg[data-icon="discord"][aria-hidden="true"]';
    await page.goto('/cs');
    for (const key of ['news', 'matches', 'members', 'clan', 'community']) {
      await expect(page.locator(`[data-hub-shared="${key}"] svg[aria-hidden="true"]`)).toHaveCount(1);
    }
    await expect(page.locator(`[data-hub-shared="discord"] ${discordMark}`)).toHaveCount(1);
    await expect(page.locator(`[data-utility="discord"] ${discordMark}`)).toHaveCount(1);
    await page.goto('/cs/hll');
    await expect(page.locator(`[data-hll-discord] ${discordMark}`)).toHaveCount(1);
    await page.goto('/cs/community');
    await expect(page.locator(`[data-choice="discord"] ${discordMark}`)).toHaveCount(1);
    await expect(page.locator('[data-choice="discord"]')).toHaveAccessibleName(/Discord.*\(externí odkaz\)/);
    await page.goto('/cs/clan');
    await expect(page.locator(`[data-discord-panel] [data-cta="discord"] ${discordMark}`)).toHaveCount(1);
    await page.goto('/en/login');
    await expect(page.getByTestId('login-discord').locator(discordMark)).toHaveCount(1);
    await expect(page.getByTestId('login-discord')).toHaveAccessibleName('CONTINUE WITH DISCORD');
    await page.goto('/cs/hll/tournaments');
    await expect(page.locator('[data-tournament-card] svg[data-icon="trophy"]')).toHaveCount(2);
  });
});
