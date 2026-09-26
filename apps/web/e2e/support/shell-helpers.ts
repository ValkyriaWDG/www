import { expect, type Page } from '@playwright/test';

/** Path of the intentionally missing background video configured for the e2e server. */
export const MISSING_VIDEO_PATH = '/e2e-missing/background-loop.mp4';

/** Presses Tab until `predicate` holds for the focused element (bounded). */
export async function tabUntil(page: Page, predicate: string, limit = 40): Promise<void> {
  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((selector) => document.activeElement?.matches(selector) ?? false, predicate)) return;
  }
  throw new Error(`Focus never reached ${predicate} within ${limit} Tab presses`);
}

/** Asserts that the document does not scroll horizontally. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`).toBeLessThanOrEqual(clientWidth);
}

/** Waits until the background media left its transient loading state. */
export async function settledBackgroundState(page: Page): Promise<string | null> {
  const media = page.locator('[data-background-state]');
  await expect(media).not.toHaveAttribute('data-background-state', 'loading');
  return media.getAttribute('data-background-state');
}
