import { expect, type Page, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { FIXTURE_SLUGS } from '../src/fixtures/data';

/** One common public browser backed by labelled synthetic data; no external requests. */
const LABELS = {
  cs: { current: 'Aktuální', source: 'Otevřít ve Wardogs League' },
  en: { current: 'Current', source: 'Open on Wardogs League' },
} as const;
const IDS = { alpha: 'synthetic-fixture-alpha', bravo: 'synthetic-fixture-bravo', charlie: 'synthetic-fixture-charlie' } as const;
/** Producer-only tracking, attendance, tenant and parser facts never reach public HTML. */
const FORBIDDEN_TEXT = /synthetic-logi-event|results_not_supported|Ready check not run|Synthetic Faction|100000000000000001|(?:\\?"revision\\?"\s*:)/;

async function expectNoPrivateDiagnostics(page: Page) {
  // Assert only the matched token so a failure never prints the full HTML/Flight payload.
  const forbiddenToken = (await page.content()).match(FORBIDDEN_TEXT)?.[0] ?? null;
  expect(forbiddenToken, 'Private source token in public HTML').toBeNull();
  // These words also occur in ordinary dictionary keys/labels (e.g. Awaiting result).
  // Only the exact raw source diagnostic/moderator text is forbidden as page content.
  for (const raw of ['timeout', 'Awaiting', 'revision']) await expect(page.getByText(raw, { exact: true })).toHaveCount(0);
}

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  return errors;
}

for (const locale of ['cs', 'en'] as const) {
  for (const width of [1440, 390]) {
    test(`one Wardogs browser searches and opens a complete League detail: ${locale}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1050 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors = collectBrowserErrors(page);
      expect((await page.goto(`/${locale}/wardogs/matches`))?.status()).toBe(200);
      const browser = page.locator('[data-unified-matches]');
      const table = browser.locator('[data-match-table="upcoming"]');
      await expect(browser).toHaveCount(1);
      await expect(browser.getByRole('search')).toHaveCount(1);
      await expect(table).toHaveCount(1);
      await expect(page.locator('[data-league-fixtures]')).toHaveCount(0);
      await expect(browser.locator('[data-synthetic-data="league-fixtures"]')).toBeVisible();
      // Alpha's published archive match represents it exactly once; only bravo is a League row.
      await expect(table.locator(`a[href="/${locale}/wardogs/matches/${FIXTURE_SLUGS.matches.upcoming}"]`)).toHaveCount(1);
      await expect(table.locator('a[href*="/matches/league/"]')).toHaveCount(1);
      await expect(table.locator(`a[href$="/matches/league/${IDS.alpha}"]`)).toHaveCount(0);
      await expect(table.locator(`a[href$="/matches/league/${IDS.charlie}"]`)).toHaveCount(0);
      const bravo = table.locator(`a[href="/${locale}/wardogs/matches/league/${IDS.bravo}"]`);
      await expect(bravo).toContainText('[SYNTHETIC]');
      for (const code of ['SYA', 'SYB', 'SYC']) await expect(bravo).toContainText(code);
      await expect(bravo.locator('xpath=ancestor::tr')).toContainText('Synthetic Training Ground');
      await expectNoPrivateDiagnostics(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect((await new AxeBuilder({ page }).include('[data-unified-matches]').analyze()).violations).toEqual([]);

      await browser.locator('input[name="q"]').fill(IDS.bravo);
      await browser.locator('input[name="q"]').press('Enter');
      await expect(page).toHaveURL(new RegExp(`q=${IDS.bravo}`));
      await expect(page.locator('[data-match-table] tbody tr')).toHaveCount(1);
      await page.locator(`[data-match-table] a[href="/${locale}/wardogs/matches/league/${IDS.bravo}"]`).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/wardogs/matches/league/${IDS.bravo}$`));
      const detail = page.locator('[data-league-match-detail][data-detail-mode="detail"]');
      await expect(detail).toBeVisible();
      await expect(detail).toHaveAttribute('data-league-state', 'fresh');
      await expect(detail).toContainText(LABELS[locale].current);
      for (const name of ['Synthetic Alpha', 'Synthetic Bravo', 'Synthetic Charlie']) await expect(detail).toContainText(name);
      await expect(detail).toContainText('Synthetic Training Ground · Synthetic Zone · Synthetic Dusk');
      await expect(detail.locator('time')).toHaveCount(2); // Supplied kickoff and actual source observation.
      await expect(detail.getByRole('link', { name: new RegExp(LABELS[locale].source) })).toHaveAttribute('href', `https://wardogsleague.net/matches/${IDS.bravo}`);
      await expect(detail).not.toContainText(locale === 'cs' ? 'Výsledek' : 'Result');
      await expectNoPrivateDiagnostics(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect((await new AxeBuilder({ page }).include('[data-league-match-detail]').analyze()).violations).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  test(`League rows share hub filtering, paging and game isolation: ${locale}`, async ({ page }) => {
    for (const path of [`/${locale}/matches?q=${IDS.bravo}`, `/${locale}/matches?game=wardogs&q=${IDS.bravo}`]) {
      expect((await page.goto(path))?.status()).toBe(200);
      await expect(page.locator('[data-unified-matches]')).toHaveCount(1);
      await expect(page.locator('[data-match-table] tbody tr')).toHaveCount(1);
      await expect(page.locator(`[data-match-table] a[href$="/wardogs/matches/league/${IDS.bravo}"]`)).toHaveCount(1);
      await expect(page.locator('[data-league-fixtures]')).toHaveCount(0);
    }
    for (const path of [`/${locale}/wardogs/matches?view=results&q=${IDS.bravo}`, `/${locale}/wardogs/matches?q=no-such-fixture`, `/${locale}/wardogs/matches?page=2`, `/${locale}/hll/matches`, `/${locale}/matches?game=hell-let-loose&q=${IDS.bravo}`, `/${locale}/wardogs`]) {
      expect((await page.goto(path))?.status(), path).toBe(200);
      await expect(page.locator('[data-match-table] a[href*="/matches/league/"]'), path).toHaveCount(0);
      await expect(page.locator('[data-league-fixtures]'), path).toHaveCount(0);
    }
  });

  test(`League detail resolves the published archive and refuses paused or unpublished fixture paths: ${locale}`, async ({ page }) => {
    await page.goto(`/${locale}/wardogs/matches/league/${IDS.alpha}`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/wardogs/matches/${FIXTURE_SLUGS.matches.upcoming}$`));
    await expect(page.locator('[data-league-match-detail][data-detail-mode="detail"]')).toHaveCount(0);
    // Charlie has no supplied kickoff and an unpublished event binding. It must not
    // acquire a made-up date or a public detail through its League identifier.
    for (const path of [`/${locale}/wardogs/matches/league/${IDS.charlie}`, `/${locale}/wardogs/matches/league/not-a-public-fixture`, `/${locale}/hll/matches/league/${IDS.bravo}`]) {
      expect((await page.goto(path))?.status(), path).toBe(404);
      await expect(page.locator('[data-league-match-detail]'), path).toHaveCount(0);
      await expectNoPrivateDiagnostics(page);
    }
  });
}
