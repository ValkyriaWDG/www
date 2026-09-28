import { expect, test } from '@playwright/test';
import { FIXTURE_SLUGS } from '../src/fixtures/data';
import { expectNoHorizontalOverflow } from './support/shell-helpers';

type ShiftWindow = Window & { articleShifts: number[] };
type ShiftEntry = PerformanceEntry & { value: number; hadRecentInput: boolean };

// CI reproduced the issue at 390px; Windows font metrics place the same wrap
// boundary at 391px. Keep both, plus the English article at the CI width.
for (const { locale, width } of [{ locale: 'cs', width: 390 }, { locale: 'cs', width: 391 }, { locale: 'en', width: 390 }] as const) {
  test(`mobile ${locale} ${width}px article metadata keeps its rows as fonts arrive separately`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let releaseDisplay!: () => void;
    let releaseBody!: () => void;
    let releaseLatin!: () => void;
    const displayGate = new Promise<void>((resolve) => { releaseDisplay = resolve; });
    const bodyGate = new Promise<void>((resolve) => { releaseBody = resolve; });
    const latinGate = new Promise<void>((resolve) => { releaseLatin = resolve; });
    await context.route('**/*.woff2', async (route) => {
      const url = route.request().url();
      if (/barlow-condensed-[^/]+-600-normal\./.test(url)) await displayGate;
      if (/barlow-latin-400-normal\./.test(url)) await latinGate;
      else if (/barlow-(?!condensed)[^/]+-400-normal\./.test(url)) await bodyGate;
      await route.continue();
    });
    await context.route('**/*.css', async (route) => {
      const response = await route.fetch();
      // Match the Linux sans fallback on hosts with Arial Narrow installed.
      const body = (await response.text())
        .replace(/--font-display:[^;]+;/g, "--font-display:'Barlow Condensed',Arial,sans-serif;")
        .replace(/--font-body:[^;]+;/g, '--font-body:Barlow,Arial,sans-serif;');
      await route.fulfill({ response, body });
    });
    await page.addInitScript(() => {
      const target = window as unknown as ShiftWindow;
      target.articleShifts = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as ShiftEntry[]) {
          if (!entry.hadRecentInput) target.articleShifts.push(entry.value);
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    const settle = () => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const measure = () => page.locator('[data-article] dl').evaluate((node) => ({
      height: node.getBoundingClientRect().height,
      rows: Array.from(node.children, (child) => ({ text: child.textContent, top: child.getBoundingClientRect().top, width: child.getBoundingClientRect().width })),
      coverTop: document.querySelector('[data-article-cover]')!.getBoundingClientRect().top,
    }));
    try {
      const slug = locale === 'cs' ? FIXTURE_SLUGS.news.featureCs : FIXTURE_SLUGS.news.featureEn;
      await page.goto(`/${locale}/news/${slug}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-article-cover]')).toBeVisible();
      await page.evaluate(() => document.fonts.load('700 28px "Barlow Condensed"'));
      // Fixtures publish relative to the run date. Freeze this synthetic display
      // text before measuring, without changing production markup or styles.
      await page.locator('[data-article-published] time').evaluate((node, text) => { node.textContent = text; }, locale === 'cs' ? '27. září 2026' : '27 September 2026');
      await settle();
      expect(await page.evaluate(() => document.fonts.check('600 13px "Barlow Condensed"', 'PUBLISHED'))).toBe(false);
      expect(await page.evaluate(() => document.fonts.check('400 16px Barlow', 'Synthetic'))).toBe(false);
      await page.evaluate(() => { (window as unknown as ShiftWindow).articleShifts = []; });
      const before = await measure();
      releaseDisplay();
      await page.evaluate(() => document.fonts.load('600 13px "Barlow Condensed"', 'ZVEŘEJNĚNO AUTOR PUBLISHED AUTHOR'));
      await settle();
      expect(await page.evaluate(() => document.fonts.check('600 13px "Barlow Condensed"', 'ZVEŘEJNĚNO AUTOR PUBLISHED AUTHOR'))).toBe(true);
      expect(await page.evaluate(() => document.fonts.check('400 16px Barlow', 'Synthetic'))).toBe(false);
      const displayOnly = await measure();
      releaseLatin();
      await page.evaluate(() => document.fonts.load('400 16px Barlow', 'Synthetic author 27 September 2026'));
      await settle();
      expect(await page.evaluate(() => document.fonts.check('400 16px Barlow', 'Synthetic'))).toBe(true);
      if (locale === 'cs') expect(await page.evaluate(() => document.fonts.check('400 16px Barlow', 'ř'))).toBe(false);
      const bodyLatin = await measure();
      if (locale === 'cs' && width === 391) {
        // Playwright screenshots wait for every font, but this stage deliberately
        // holds latin-ext. Capture Chromium's current pixels without releasing it.
        const cdp = await context.newCDPSession(page);
        const capture = await cdp.send('Page.captureScreenshot', { format: 'png' });
        await cdp.detach();
        await test.info().attach('article-partial-fonts', { body: Buffer.from(capture.data, 'base64'), contentType: 'image/png' });
      }
      releaseBody();
      await page.evaluate(() => document.fonts.ready);
      await settle();
      expect(await page.evaluate((text) => document.fonts.check('400 16px Barlow', text), locale === 'cs' ? 'Září Synthetic' : 'Synthetic')).toBe(true);
      const after = await measure();
      const shifts = await page.evaluate(() => (window as unknown as ShiftWindow).articleShifts);
      const measurements = { locale, width, browser: page.context().browser()!.version(), before, displayOnly, bodyLatin, after, shifts, fontSwapShiftSum: shifts.reduce((total, shift) => total + shift, 0) };
      await test.info().attach('article-font-swap-measurements', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
      if (locale === 'cs' && width === 391) await test.info().attach('article-loaded-fonts', { body: await page.screenshot(), contentType: 'image/png' });
      if (locale === 'en') await test.info().attach('article-en-mobile-loaded-fonts', { body: await page.screenshot(), contentType: 'image/png' });
      for (const state of [displayOnly, bodyLatin, after]) expect(Math.abs(state.height - before.height)).toBeLessThan(1);
      for (const state of [displayOnly, bodyLatin, after]) expect(Math.abs(state.coverTop - before.coverTop)).toBeLessThan(1);
      expect(measurements.fontSwapShiftSum).toBeLessThanOrEqual(0.1);
      await expectNoHorizontalOverflow(page);
    } finally {
      releaseDisplay();
      releaseLatin();
      releaseBody();
    }
  });
}

for (const locale of ['cs', 'en'] as const) {
  test(`${locale} article metadata stays readable with a long author on narrow and desktop screens`, async ({ page }) => {
    const slug = locale === 'cs' ? FIXTURE_SLUGS.news.featureCs : FIXTURE_SLUGS.news.featureEn;
    await page.goto(`/${locale}/news/${slug}`);
    await page.evaluate(() => document.fonts.ready);
    const metadata = page.locator('[data-article] dl');
    const author = metadata.locator('dd[lang]');
    await author.evaluate((node) => { node.textContent = 'Synthetic author with a deliberately long display name for layout verification'; });
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(author).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect(await metadata.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      expect(await author.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
      if (width === 1280) await test.info().attach(`article-${locale}-desktop-long-author`, { body: await page.screenshot(), contentType: 'image/png' });
    }
  });
}
