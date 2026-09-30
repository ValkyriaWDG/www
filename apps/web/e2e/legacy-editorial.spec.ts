import { expect, test } from '@playwright/test';
import { FIXTURE_MANUAL_SLUGS } from '../src/fixtures/data';
import { captureEditorialPage, expectNoArchiveAttribution } from './support/legacy-editorial';
import { expectNoHorizontalOverflow } from './support/shell-helpers';

for (const width of [1920, 390]) {
  for (const key of ['clan', 'manual-setup'] as const) {
    test(`pages with archive metadata do not mention the former website: ${key} / ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1920 ? 1080 : 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const route = (locale: 'cs' | 'en') => key === 'clan'
        ? `/${locale}/hll/clan`
        : `/${locale}/hll/field-manual/${locale === 'cs' ? FIXTURE_MANUAL_SLUGS.setupCs : FIXTURE_MANUAL_SLUGS.setupEn}`;
      await page.goto(route('cs'));
      await expectNoArchiveAttribution(page, key);
      if (key === 'manual-setup') {
        await expect(page.locator('[data-article-body]')).toContainText('Nejde o skutečný návod klanu Valkyria.');
        await expect(page.locator('[data-manual-provenance]')).toContainText('Syntetický autor A, Syntetický autor B');
        await expect(page.locator('[data-manual-provenance] time[datetime="2021-03-14"]')).toBeVisible();
        await expect(page.locator('[data-manual-provenance] a')).toHaveAttribute('href', 'https://example.org/synthetic-fixture/field-manual');
      } else {
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Klan Valkyria');
        await expect(page.getByRole('heading', { name: 'Kdo jsme', exact: true })).toBeVisible();
      }
      await captureEditorialPage(page, key, width);
      await page.goto(route('en'));
      await expect(page.locator('[data-archive-editorial]')).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText('Synthetic historical author');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(key === 'clan' ? 'The Valkyria clan' : '[Sample] First game setup');
      await expectNoHorizontalOverflow(page);
    });
  }
}

test('draft FAQ and ordinary public content do not expose historical metadata', async ({ page }) => {
  for (const locale of ['cs', 'en']) {
    await page.goto(`/${locale}/hll/faq`);
    await expect(page.locator('[data-core-page="faq"]')).toHaveAttribute('data-published', 'false');
    await expect(page.locator('[data-archive-editorial]')).toHaveCount(0);
    expect(await page.content()).not.toContain('Synthetic historical author');
    await page.goto(`/${locale}/privacy`);
    await expect(page.locator('[data-core-page="privacy"]')).toHaveAttribute('data-published', 'true');
    await expect(page.locator('[data-archive-editorial]')).toHaveCount(0);
  }
  await page.goto(`/cs/hll/field-manual/${FIXTURE_MANUAL_SLUGS.squadLeaderCs}`);
  await expect(page.locator('[data-manual-slug]')).toBeVisible();
  await expect(page.locator('[data-archive-editorial]')).toHaveCount(0);
});
