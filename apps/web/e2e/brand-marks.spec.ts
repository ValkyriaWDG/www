import { expect, test } from '@playwright/test';

/**
 * Brand correction (docs/assets/brand-correction-2026-09-29.md): the hub game cards use
 * the official Hell Let Loose and Wardogs marks instead of a styled text stand-in, while
 * the localized game name stays the link's text. Interface glyphs from the icon pack are
 * decorative: control names are unchanged.
 */

for (const locale of ['cs', 'en'] as const) {
  test(`hub game cards show both official marks (${locale})`, async ({ page }) => {
    await page.goto(`/${locale}`);
    for (const [game, src, name] of [
      ['hll', '/brand/hell-let-loose-fullmark-white.svg', 'Hell Let Loose'],
      ['wardogs', '/presskit/wardogs-fullmark-white.svg', 'Wardogs'],
    ] as const) {
      const card = page.locator(`[data-hub-game="${game}"]`);
      const mark = card.locator(`img[data-game-mark="${game}"]`);
      await expect(mark).toHaveAttribute('src', src);
      await expect(mark).toHaveAttribute('alt', '');
      await expect.poll(() => mark.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      // Aspect ratio of the official artwork is kept.
      const box = (await mark.boundingBox())!;
      expect(Math.abs(box.width / box.height - (game === 'hll' ? 424 / 78 : 2467 / 489))).toBeLessThan(0.05);
      await expect(card.getByText(name, { exact: true })).toBeVisible();
      await expect(card).toHaveAccessibleName(new RegExp(`^${name}`));
    }
  });
}

test('server controls keep their names with decorative icons', async ({ page }) => {
  await page.goto('/cs/hll/servers?server=synthetic-alpha');
  const refresh = page.getByRole('button', { name: 'Obnovit', exact: true });
  await expect(refresh.locator('svg[data-icon="refresh"]')).toHaveAttribute('aria-hidden', 'true');
  const copy = page.getByRole('button', { name: 'Kopírovat adresu' });
  await expect(copy.locator('svg[data-icon="copy"]')).toHaveAttribute('aria-hidden', 'true');
  // Rows without map artwork show the server glyph in the neutral box.
  await expect(page.getByRole('row').filter({ hasText: 'Test Server Charlie' }).locator('svg[data-icon="server"]')).toHaveCount(1);
  await expect(page.getByRole('row').filter({ hasText: 'Test Server Alpha' }).locator('svg[data-icon="server"]')).toHaveCount(0);
});
