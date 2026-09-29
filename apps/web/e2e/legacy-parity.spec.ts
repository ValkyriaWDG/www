import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { FIXTURE_SLUGS } from '../src/fixtures/data';
import { expectNoHorizontalOverflow } from './support/shell-helpers';

const slug = FIXTURE_SLUGS.matches.hllHistorical;
const captures: { file: string; caption: string; route: string; locale: string; viewport: string }[] = [];
const outDir = path.resolve(import.meta.dirname, '../../../.local/evidence/legacy-parity');

async function capture(page: Page, locale: 'cs' | 'en', width: number, kind: 'list' | 'detail') {
  if (!process.env.CAPTURE_EVIDENCE) return;
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
  await page.waitForFunction(() => [...document.images].filter((image) => image.getClientRects().length > 0).every((image) => image.complete));
  const file = `legacy-${kind}-${locale}-${width}.png`;
  await page.screenshot({ path: path.join(outDir, file), fullPage: true, animations: 'disabled', caret: 'hide' });
  captures.push({
    file, locale, route: new URL(page.url()).pathname + new URL(page.url()).search, viewport: `${width}x${width === 1920 ? 1080 : 844}`,
    caption: kind === 'list' ? 'Synthetic HLL result with original coalition name, Czech and US vector flags and localized accessible country labels.' : 'Synthetic HLL historical facts: countries, sides, capture points, duration, recorded points and preserved conflicting source time/first-capture fields. Published start remains unchanged.',
  });
}

test.afterAll(() => {
  if (captures.length) writeFileSync(path.join(outDir, 'captures.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), synthetic: true, captures }, null, 2)}\n`);
});

for (const locale of ['cs', 'en'] as const) {
  for (const width of [1920, 390]) {
    test(`legacy HLL match facts and flags: ${locale} / ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1920 ? 1080 : 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`/${locale}/hll/matches?view=results`);
      const row = page.locator('[data-match-table] tbody tr').filter({ has: page.locator(`a[href*="/matches/${slug}"]`) });
      await expect(row.locator('[data-match-country="US"] [role="img"]')).toHaveAccessibleName(locale === 'cs' ? 'Spojené státy' : 'United States');
      await expect(row.locator('[data-match-country="CZ"] svg')).toBeVisible();
      await expect(row).toContainText('VLK + Synthetic Ally');
      await capture(page, locale, width, 'list');
      await row.getByRole('link').click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/hll/matches/${slug}$`));
      const facts = page.locator('[data-match-legacy]');
      await expect(facts).toBeVisible();
      await expect(facts.getByRole('heading', { name: locale === 'cs' ? 'Historické údaje o zápasu' : 'Historical match details' })).toBeVisible();
      await expect(facts.locator('[data-legacy-fact="capturePoint"]')).toContainText('Synthetic Capture Point');
      await expect(facts.locator('[data-legacy-fact="legacyPoint"]')).toContainText('Synthetic Point');
      await expect(facts.locator('[data-legacy-fact="duration"]')).toContainText(locale === 'cs' ? '90 minut' : '90 minutes');
      await expect(facts.locator('[data-legacy-fact="points"]')).toContainText('3 · 2');
      await expect(facts.locator('[data-legacy-fact="sourceDate"]')).toContainText('12/05/2024 19:00');
      await expect(facts.locator('[data-legacy-fact="separateTime"]')).toContainText('20:00');
      await expect(facts.locator('[data-legacy-time-conflict]')).toBeVisible();
      await expect(facts.locator('[data-legacy-capture-conflict]')).toBeVisible();
      await expect(facts.locator('[data-legacy-fact="firstCapture"]')).toContainText(locale === 'cs' ? 'Spojenci' : 'Allies');
      await expect(facts.locator('[data-legacy-fact="legacyFirstCaptured"]')).toContainText(locale === 'cs' ? 'Osa' : 'Axis');
      const recording = facts.locator('[data-legacy-source-links]');
      await expect(recording.getByRole('link', { name: /Synthetic HLL recording/ })).toHaveAttribute('href', 'https://example.org/synthetic-fixture/hll-recording');
      await expect(recording).toContainText('Synthetic match recording for migration parity tests.');
      await expect(recording).toContainText('Synthetic recording author');
      await expect(recording).toContainText('12/05/2024');
      await expect(recording).toContainText('youtube');
      await expect(recording.locator('iframe')).toHaveCount(0);
      // The preserved conflicting source strings must not replace the published instant.
      await expect(page.locator('[data-match-start]')).toHaveAttribute('dateTime', '2024-05-12T18:00:00.000Z');
      await expectNoHorizontalOverflow(page);
      const violations = await new AxeBuilder({ page }).include('[data-match-legacy]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(violations.violations).toEqual([]);
      await page.reload();
      await expect(facts.locator('[data-legacy-time-conflict]')).toBeVisible();
      await capture(page, locale, width, 'detail');
    });
  }
}

test('normal Wardogs match has no invented historical metadata', async ({ page }) => {
  await page.goto(`/en/wardogs/matches/${FIXTURE_SLUGS.matches.completedVerified}`);
  await expect(page.locator('[data-match-legacy]')).toHaveCount(0);
});
