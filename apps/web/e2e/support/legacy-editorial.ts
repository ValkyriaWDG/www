import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import { fixtureEditorialDetails } from '../../src/fixtures/legacy';
import { expectNoHorizontalOverflow } from './shell-helpers';

/**
 * Pages with published archive metadata render only their current content: no "from the
 * original website" block, archive author, source date or link to the former website.
 */
export async function expectNoArchiveAttribution(page: Page, key: 'clan' | 'faq' | 'manual-setup') {
  const details = fixtureEditorialDetails(key === 'manual-setup' ? 'manual' : 'page', key);
  await expect(page.locator('[data-archive-editorial]')).toHaveCount(0);
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/Z původního webu|Původní záznam/);
  expect(text).not.toContain(details.sourceAuthorLabel);
  await expect(page.locator(`main a[href="${details.sourceUrl}"]`)).toHaveCount(0);
  expect(await page.content()).not.toContain('SYNTHETIC-NOT-PUBLIC');
  await expectNoHorizontalOverflow(page);
}

export async function captureEditorialPage(page: Page, key: 'clan' | 'faq' | 'manual-setup', width: number) {
  if (!process.env.CAPTURE_EVIDENCE) return;
  const outDir = path.resolve(import.meta.dirname, '../../../../.local/evidence/legacy-editorial-renderers');
  mkdirSync(outDir, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => [...document.images].filter((image) => image.getClientRects().length > 0).every((image) => image.complete && image.naturalWidth > 0));
  const file = `legacy-editorial-${key}-cs-${width}.png`;
  await page.screenshot({ path: path.join(outDir, file), fullPage: true, animations: 'disabled', caret: 'hide' });
  writeFileSync(path.join(outDir, file.replace('.png', '.json')), `${JSON.stringify({
    capturedAt: new Date().toISOString(), synthetic: true, file, locale: 'cs',
    route: new URL(page.url()).pathname, viewport: page.viewportSize(),
    caption: `${key}: current published Czech content without any reference to the former website. ${key === 'manual-setup' ? 'Third-party guide credits remain.' : key === 'faq' ? 'The editor published only Czech; English remains unpublished.' : 'The existing clan content remains unchanged.'}`,
  }, null, 2)}\n`);
}
