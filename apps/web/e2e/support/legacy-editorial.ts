import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { fixtureEditorialDetails } from '../../src/fixtures/legacy';
import { expectNoHorizontalOverflow } from './shell-helpers';

export async function expectEditorialArchive(page: Page, key: 'clan' | 'faq' | 'manual-setup') {
  const kind = key === 'manual-setup' ? 'manual' : 'page';
  const details = fixtureEditorialDetails(kind, key);
  const archive = page.locator(`[data-archive-editorial="${kind}"]`);
  await expect(archive).toBeVisible();
  await expect(archive).toHaveAccessibleName('Z původního webu');
  await expect(archive).toContainText(details.sourceAuthorLabel);
  await expect(archive.locator('b')).toHaveCount(0);
  await expect(archive.locator('time')).toHaveAttribute('datetime', details.sourceModifiedOn!);
  await expect(archive.getByRole('link', { name: 'Původní záznam', exact: true })).toHaveAttribute('href', details.sourceUrl);
  expect(await page.content()).not.toContain('SYNTHETIC-NOT-PUBLIC');
  await expectNoHorizontalOverflow(page);
  const result = await new AxeBuilder({ page }).include('[data-archive-editorial]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
}

export async function captureEditorialArchive(page: Page, key: 'clan' | 'faq' | 'manual-setup', width: number) {
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
    caption: `${key}: synthetic historical attribution rendered beside the current published Czech content. Original author text remains escaped; source date/link remain visible. ${key === 'manual-setup' ? 'The existing manual provenance is preserved.' : key === 'faq' ? 'The editor published only Czech; English remains unpublished.' : 'The existing clan content remains unchanged.'}`,
  }, null, 2)}\n`);
}
