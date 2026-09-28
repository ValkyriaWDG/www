import { expect, test } from '@playwright/test';

type ShiftWindow = Window & { newsShifts: number[] };
type ShiftEntry = PerformanceEntry & { value: number; hadRecentInput: boolean };

for (const locale of ['cs', 'en']) {
  test(`mobile ${locale} filters keep their rows when condensed fonts arrive`, async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let releaseFonts!: () => void;
    const fontGate = new Promise<void>((resolve) => { releaseFonts = resolve; });
    await context.route('**/*.woff2', async (route) => { await fontGate; await route.continue(); });
    // Reproduce hosts without Arial Narrow/Roboto Condensed. Arial is metrically
    // compatible with the generic sans fallback used by the Linux CI browser.
    await context.route('**/*.css', async (route) => {
      const response = await route.fetch();
      const body = (await response.text())
        .replace(/--font-display:[^;]+;/g, "--font-display:'Barlow Condensed',Arial,sans-serif;")
        .replace(/--font-body:[^;]+;/g, '--font-body:Barlow,Arial,sans-serif;');
      await route.fulfill({ response, body });
    });
    await page.addInitScript(() => {
      const target = window as unknown as ShiftWindow;
      target.newsShifts = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as ShiftEntry[]) {
          if (!entry.hadRecentInput) target.newsShifts.push(entry.value);
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    try {
      await page.goto(`/${locale}/news`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-news-card]').first()).toBeVisible();
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(await page.evaluate(() => document.fonts.check('600 14px "Barlow Condensed"'))).toBe(false);
      const groups = page.locator('[role="group"]:has([data-filter])');
      const before = await groups.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
      releaseFonts();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const after = await groups.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
      expect(after).toHaveLength(before.length);
      for (let index = 0; index < before.length; index++) expect(Math.abs(after[index]! - before[index]!)).toBeLessThan(1);
      const shifts = await page.evaluate(() => (window as unknown as ShiftWindow).newsShifts);
      expect(shifts.reduce((total, shift) => total + shift, 0)).toBeLessThanOrEqual(0.1);
      const clipped = await page.locator('[data-filter]').evaluateAll((nodes) => nodes.some((node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1));
      expect(clipped).toBe(false);
      await test.info().attach('font-swap-measurements', { body: JSON.stringify({ before, after, shifts }), contentType: 'application/json' });
    } finally {
      releaseFonts();
    }
  });
}
