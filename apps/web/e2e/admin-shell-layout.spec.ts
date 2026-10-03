import { expect, test } from '@playwright/test';
import { signInAs } from './support/auth';
import { expectNoHorizontalOverflow } from './support/shell-helpers';

/**
 * Administration chrome at desktop and phone widths: the module list must not push the
 * account links onto a ragged second row, and the media library must fit a phone.
 */
test('the module navigation takes its own row below very wide desktops', async ({ context, page }) => {
  await signInAs(context, { roles: ['administrator'] });
  const rows = async () => {
    const brand = (await page.locator('[data-admin-shell] header a').first().boundingBox())!;
    const modules = (await page.getByTestId('admin-nav').boundingBox())!;
    const account = (await page.getByTestId('admin-nav').locator('xpath=following-sibling::div//nav').boundingBox())!;
    return { brand, modules, account };
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/cs/admin/matches');
  let box = await rows();
  // Brand and account links share the first row; the modules start below them.
  expect(Math.abs(box.account.y - box.brand.y)).toBeLessThan(2);
  expect(box.modules.y).toBeGreaterThanOrEqual(box.brand.y + box.brand.height - 1);
  expect(box.modules.width).toBeGreaterThan(1200);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/en/admin/matches');
  box = await rows();
  expect(Math.abs(box.modules.y - box.brand.y)).toBeLessThan(2);
  expect(Math.abs(box.account.y - box.brand.y)).toBeLessThan(2);
});

test('the media library fits a phone with two cards per row', async ({ context, page }) => {
  await signInAs(context, { roles: ['administrator'] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cs/admin/media');
  await expect(page.getByTestId('media-grid')).toBeVisible();
  const cards = await page.getByTestId('media-card').evaluateAll((elements) => elements.slice(0, 2).map((element) => element.getBoundingClientRect().toJSON()));
  expect(cards).toHaveLength(2);
  expect(Math.abs(cards[0].y - cards[1].y)).toBeLessThan(1);
  expect(cards[1].x + cards[1].width).toBeLessThanOrEqual(390);
  await expectNoHorizontalOverflow(page);
});
