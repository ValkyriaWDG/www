import { expect, test } from '@playwright/test';
import { matchBySlug } from './admin-community-support';
import { signInAs } from './support/auth';

for (const locale of ['cs', 'en'] as const) {
  test(`mobile ${locale} match editor contains the rich-text toolbar without widening the page`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    try {
      await signInAs(context, { roles: ['match_manager'], name: 'Synthetic mobile editor' });
      const fixture = await matchBySlug('ukazka-hll-historicky');
      expect(fixture).not.toBeNull();
      const page = await context.newPage();
      await page.goto(`/${locale}/admin/matches/${fixture!.id}`);
      const presentation = page.locator('[data-group="presentation"]');
      const toolbar = presentation.getByRole('toolbar').first();
      await expect(toolbar).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);

      // Controls remain available through the toolbar's own horizontal scroll area.
      const geometry = await toolbar.evaluate((element) => ({
        width: element.clientWidth,
        scrollWidth: element.scrollWidth,
        right: element.getBoundingClientRect().right,
      }));
      expect(geometry.right).toBeLessThanOrEqual(391);
      expect(geometry.scrollWidth).toBeGreaterThan(geometry.width);
      await toolbar.getByRole('button').last().focus();
      await expect(toolbar.getByRole('button').last()).toBeFocused();
      expect(await toolbar.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);

      await presentation.getByRole('tab').last().click();
      await expect(presentation.getByRole('tabpanel').filter({ visible: true }).getByRole('toolbar')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
    } finally {
      await context.close();
    }
  });
}
