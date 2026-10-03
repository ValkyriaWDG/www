import { expect, test } from '@playwright/test';
import { signInAs } from './support/auth';
import { expectNoHorizontalOverflow } from './support/shell-helpers';

/**
 * Administration chrome at desktop and phone widths: the module list must not push the
 * account links onto a ragged second row, and the media library must fit a phone.
 */
test('the module navigation takes its own row at every desktop width', async ({ context, page }) => {
  await signInAs(context, { roles: ['administrator'] });
  const rows = async () => {
    const brand = (await page.locator('[data-admin-shell] header a').first().boundingBox())!;
    const modules = (await page.getByTestId('admin-nav').boundingBox())!;
    const account = (await page.getByTestId('admin-nav').locator('xpath=following-sibling::div//nav').boundingBox())!;
    return { brand, modules, account };
  };
  for (const [width, height, path] of [[1440, 900, '/cs/admin/matches'], [1920, 1080, '/en/admin/matches']] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(path);
    const box = await rows();
    // Brand and account links share the first row; the modules start below them.
    expect(Math.abs(box.account.y - box.brand.y)).toBeLessThan(2);
    expect(box.modules.y).toBeGreaterThanOrEqual(box.brand.y + box.brand.height - 1);
    expect(box.modules.width).toBeGreaterThan(width - 200);
  }
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
