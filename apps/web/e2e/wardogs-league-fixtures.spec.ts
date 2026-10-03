import { expect, type Page, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { FIXTURE_SLUGS } from '../src/fixtures/data';

/*
 * Tracked Wardogs League fixtures (issue #87 follow-up) against the labelled synthetic
 * reader source (`LOGI_READERS_SOURCE=synthetic-fixture`, e2e/support/server-env.ts): the
 * section after the Upcoming list of the Wardogs matches page with three synthetic
 * fixtures, in cs/en at 1440 and 390 px, and its absence on the results view, with a
 * filter, on the HLL matches page and on the Wardogs home. No Logi request, key or real
 * League fixture is involved.
 */

const LABELS = {
  cs: { title: 'Sledovaná utkání ve Wardogs League', stale: 'Neaktuální', current: 'Aktuální', paused: 'Pozastaveno', unscheduled: 'Termín zatím nestanoven', detail: 'Detail zápasu', source: 'Otevřít ve Wardogs League', result: 'Výsledek' },
  en: { title: 'Tracked Wardogs League fixtures', stale: 'Stale', current: 'Current', paused: 'Paused', unscheduled: 'Kickoff not set yet', detail: 'Match detail', source: 'Open on Wardogs League', result: 'Result' },
} as const;
/** Producer-only facts of the synthetic fixtures (event binding, error text, moderator, member rows, warnings) never reach the page. */
const FORBIDDEN_TEXT = /synthetic-logi-event|timeout|Awaiting|results_not_supported|Ready check not run|Synthetic Faction|100000000000000001|revision/;
const IDS = { alpha: 'synthetic-fixture-alpha', bravo: 'synthetic-fixture-bravo', charlie: 'synthetic-fixture-charlie' } as const;

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

for (const locale of ['cs', 'en'] as const) {
  for (const width of [1440, 390]) {
    test(`Wardogs matches page lists the tracked League fixtures without a result: ${locale}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1050 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors = collectBrowserErrors(page);
      expect((await page.goto(`/${locale}/wardogs/matches`))?.status()).toBe(200);
      const section = page.locator('[data-league-fixtures]');
      await expect(section).toBeVisible();
      await expect(section).toHaveAttribute('data-league-fixtures-state', 'fresh');
      await expect(section.getByRole('heading', { level: 2, name: LABELS[locale].title })).toBeVisible();
      await expect(section.locator('[data-synthetic-data="league-fixtures"]')).toBeVisible();
      await expect(section.locator('[data-synthetic-data="league-fixtures"]')).toHaveCSS('border-top-style', 'dashed');
      // Kickoff order: alpha (7 days), bravo (10 days), then the unscheduled paused fixture.
      const items = section.locator('[data-league-fixture]');
      await expect(items).toHaveCount(3);
      expect(await items.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-league-fixture')))).toEqual([IDS.alpha, IDS.bravo, IDS.charlie]);
      for (const id of [IDS.alpha, IDS.bravo, IDS.charlie]) {
        const item = section.locator(`[data-league-fixture="${id}"]`);
        await expect(item.locator('[data-league-teams] li')).toHaveText([/SYA\s*Synthetic Alpha/, /SYB\s*Synthetic Bravo/, /SYC\s*Synthetic Charlie/]);
        await expect(item).toContainText('Synthetic Training Ground · Synthetic Zone · Synthetic Dusk');
        await expect(item.getByRole('link', { name: new RegExp(LABELS[locale].source) })).toHaveAttribute('href', `https://wardogsleague.net/matches/${id}`);
      }
      const alpha = section.locator(`[data-league-fixture="${IDS.alpha}"]`);
      await expect(alpha).toHaveAttribute('data-league-state', 'fresh');
      await expect(alpha).toContainText(`[SYNTHETIC] SYA · SYB · SYC (${IDS.alpha})`);
      await expect(alpha).toContainText(LABELS[locale].current);
      await expect(alpha).toContainText(locale === 'cs' ? 'Utkání č. 42' : 'Fixture #42');
      await expect(alpha).toContainText(locale === 'cs' ? 'Přátelský' : 'Friendly');
      // The seeded upcoming Wardogs match carries the alpha League link: the fixture links to its match page.
      await expect(alpha.locator('[data-league-link="detail"]')).toHaveAttribute('href', `/${locale}/wardogs/matches/${FIXTURE_SLUGS.matches.upcoming}`);
      await expect(alpha.locator('[data-league-link="detail"]')).toHaveText(LABELS[locale].detail);
      await expect(section.locator(`[data-league-fixture="${IDS.bravo}"]`)).toHaveAttribute('data-league-state', 'fresh');
      await expect(section.locator(`[data-league-fixture="${IDS.bravo}"] [data-league-link="detail"]`)).toHaveCount(0);
      const charlie = section.locator(`[data-league-fixture="${IDS.charlie}"]`);
      await expect(charlie).toHaveAttribute('data-league-state', 'stale');
      await expect(charlie).toHaveAttribute('data-league-tracking', 'paused');
      await expect(charlie).toContainText(LABELS[locale].stale);
      await expect(charlie).toContainText(LABELS[locale].paused);
      await expect(charlie).toContainText(LABELS[locale].unscheduled);
      // Its native event is not a published Logi event: no roster link; every fixture keeps the League link.
      await expect(section.locator('[data-league-link="logi"]')).toHaveCount(0);
      await expect(section.locator('[data-league-links] a')).toHaveCount(4);
      await expect(section.locator('[data-league-fixtures-truncated]')).toHaveCount(0);
      // The section carries no result and no producer-only fact.
      await expect(section.locator('[data-league-fixture-list]')).not.toContainText(LABELS[locale].result);
      expect(await section.innerText()).not.toMatch(FORBIDDEN_TEXT);
      expect(await page.content()).not.toMatch(/synthetic-logi-event|results_not_supported|Synthetic Faction/);
      // The section follows the match browser (after the list, never above the toolbar).
      const browser = (await page.locator('[data-match-table="upcoming"]').boundingBox())!;
      const box = (await section.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(browser.y + browser.height - 1);
      if (width === 390) {
        // One column and 44 px link rows on phones.
        const cards = await section.locator('[data-league-fixture]').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().x));
        expect(new Set(cards.map((x) => Math.round(x))).size).toBe(1);
        for (const box of await section.locator('[data-league-links] a').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect((await new AxeBuilder({ page }).include('[data-league-fixtures]').analyze()).violations).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  test(`the tracked fixtures stay off the results view, filtered lists, the HLL matches page and the Wardogs home: ${locale}`, async ({ page }) => {
    for (const path of [`/${locale}/wardogs/matches?view=results`, `/${locale}/wardogs/matches?q=synthetic`, `/${locale}/wardogs/matches?page=2`, `/${locale}/hll/matches`, `/${locale}/wardogs`, `/${locale}/matches`]) {
      expect((await page.goto(path))?.status(), path).toBe(200);
      await expect(page.locator('[data-league-fixtures]'), path).toHaveCount(0);
      await expect(page.locator('main'), path).not.toContainText(LABELS[locale].title);
    }
  });
}
