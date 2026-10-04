import { expect, type Locator, type Page } from '@playwright/test';

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

/**
 * Bounding box with the layout float noise removed: Chromium reports a 24 px control at a
 * fractional offset as 23.99993896…, so the values are snapped to 1/100 px before size checks.
 */
export async function measuredBox(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${locator} has no bounding box`);
  const snap = (value: number) => Math.round(value * 100) / 100;
  return { x: snap(box.x), y: snap(box.y), width: snap(box.width), height: snap(box.height) };
}

/** Asserts that the document does not scroll horizontally. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`).toBeLessThanOrEqual(clientWidth);
}

/** Waits for browser policy and media to settle; SSR's pending/paused pair is transient. */
export async function settledBackgroundState(page: Page): Promise<string | null> {
  const media = page.locator('[data-background-state]');
  let state: string | null = null;
  await expect.poll(async () => {
    const snapshot = await media.evaluate((element) => ({
      reason: element.getAttribute('data-background-reason'),
      state: element.getAttribute('data-background-state'),
    }));
    state = snapshot.state;
    return snapshot.reason !== null && snapshot.reason !== 'pending' && state !== null && state !== 'loading';
  }).toBe(true);
  return state;
}
