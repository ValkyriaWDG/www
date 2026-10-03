import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { FIXTURE_SLUGS } from '../src/fixtures/data';
import { expectNoHorizontalOverflow, tabUntil } from './support/shell-helpers';

const M = FIXTURE_SLUGS.matches;
/** A 0:0 score (with or without spaces) that is not part of a time such as 20:00. */
const ZERO_ZERO = /(^|\D)0\s?:\s?0(\D|$)/;
const rowOf = (page: Page, slug: string) => page.locator('[data-match-table] tbody tr').filter({ has: page.locator(`a[href*="/matches/${slug}"]`) });
/** The number in a tab label such as `Výsledky (4)`. Other suites may publish extra matches concurrently. */
const labelCount = async (page: Page, name: RegExp) => {
  const text = await page.getByRole('navigation', { name: 'Seznamy zápasů' }).getByRole('link', { name }).textContent();
  return Number(/\((\d+)\)/.exec(text ?? '')?.[1] ?? Number.NaN);
};

test.describe('public matches: lists', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('upcoming and results are separate lists', async ({ page }) => {
    await page.goto('/cs/matches');
    await expect(page.getByRole('heading', { level: 1, name: 'Zápasy' })).toBeVisible();
    const tabs = page.getByRole('navigation', { name: 'Seznamy zápasů' });
    await expect(tabs.getByRole('link', { name: /^Nadcházející \(\d+\)$/ })).toHaveAttribute('aria-current', 'page');
    const upcomingCount = await labelCount(page, /^Nadcházející \(\d+\)$/);
    expect(upcomingCount).toBeGreaterThanOrEqual(2);
    await expect(page.locator('[data-match-table="upcoming"] tbody tr')).toHaveCount(upcomingCount);
    await expect(rowOf(page, M.upcoming)).toHaveCount(1);
    await expect(rowOf(page, M.postponed)).toHaveCount(1);
    for (const slug of [M.completedVerified, M.completedUnknown, M.cancelled, M.hllHistorical, M.draft]) {
      await expect(page.locator(`a[href*="/matches/${slug}"]`)).toHaveCount(0);
    }
    // Upcoming fixtures never show a result, let alone 0:0.
    await expect(page.locator('[data-match-table]')).not.toContainText(/\d\s:\s\d/);

    await tabs.getByRole('link', { name: /^Výsledky \(\d+\)$/ }).click();
    await expect(page).toHaveURL(/\/cs\/matches\?view=results$/);
    const resultCount = await labelCount(page, /^Výsledky \(\d+\)$/);
    expect(resultCount).toBeGreaterThanOrEqual(4);
    await expect(page.locator('[data-match-table="results"] tbody tr')).toHaveCount(resultCount);
    for (const slug of [M.completedVerified, M.completedUnknown, M.cancelled, M.hllHistorical]) await expect(rowOf(page, slug)).toHaveCount(1);
    await expect(page.locator(`a[href*="/matches/${M.upcoming}"]`)).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/cs\/matches$/);
    await expect(page.locator('[data-match-table="upcoming"]')).toBeVisible();
  });

  test('results show verified scores, a dash for unknown results and explicit cancelled/postponed states', async ({ page }) => {
    await page.goto('/cs/matches?view=results');
    const verified = rowOf(page, M.completedVerified);
    await expect(verified.locator('[data-result="score"]')).toContainText('2 : 1');
    await expect(verified.locator('[data-result="score"]')).toContainText('Výhra');

    const unknown = rowOf(page, M.completedUnknown);
    const unknownResult = unknown.locator('[data-result="unpublished"]');
    await expect(unknownResult).toContainText('—');
    await expect(unknownResult).toContainText('Výsledek zatím nebyl zveřejněn');
    await expect(unknown).not.toContainText(ZERO_ZERO);

    const cancelled = rowOf(page, M.cancelled);
    await expect(cancelled.locator('[data-match-status="cancelled"]')).toHaveText('Zrušeno');
    await expect(cancelled.locator('[data-result="cancelled"]')).toContainText('—');
    await expect(page.locator('[data-match-table]')).not.toContainText(ZERO_ZERO);

    await page.goto('/cs/matches');
    const postponed = rowOf(page, M.postponed);
    await expect(postponed.locator('[data-match-status="postponed"]')).toHaveText('Odloženo');
    await expect(postponed.locator('[data-original-start]')).toHaveText(/^Původně\s\d{1,2}\.\s\d{1,2}\.\s\d{4}$/);
    await expect(postponed.locator('time')).toContainText(/\d{2}:\d{2}\sSE(L)?Č/);
  });

  test('game filter and search are reflected in the URL; filter-empty differs from no data', async ({ page }) => {
    await page.goto('/cs/matches?view=results');
    await page.locator('[data-filter="game:hell-let-loose"]').click();
    await expect(page).toHaveURL(/\/cs\/matches\?view=results&game=hell-let-loose$/);
    await expect(rowOf(page, M.hllHistorical)).toContainText('3 : 2');
    const hllCount = await labelCount(page, /^Výsledky \(\d+\)$/);
    await expect(page.locator('[data-match-table] tbody tr')).toHaveCount(hllCount);
    for (const slug of [M.completedVerified, M.completedUnknown, M.cancelled]) await expect(rowOf(page, slug)).toHaveCount(0);

    await page.getByRole('searchbox', { name: 'Hledat soupeře a soutěže' }).fill('neexistujici souper');
    await page.getByRole('button', { name: 'Hledat' }).click();
    await expect(page).toHaveURL(/q=neexistujici\+souper/);
    await expect(page).toHaveURL(/game=hell-let-loose/);
    await expect(page.getByRole('heading', { name: 'Těmto filtrům neodpovídají žádné výsledky.' })).toBeVisible();
    await expect(page.locator('[data-clear-filters]')).toHaveAttribute('href', '/cs/matches?view=results');

    await page.goto('/cs/matches?view=results&q=delta');
    await expect(rowOf(page, M.completedVerified)).toHaveCount(1);
    for (const row of await page.locator('[data-match-table] tbody tr').all()) await expect(row).toContainText(/delta/i);

    // Wardogs fixtures exist, so an empty HLL upcoming list is a filter result, not "no fixtures".
    await page.goto('/cs/matches?game=hell-let-loose');
    await expect(page.getByRole('heading', { name: 'Těmto filtrům neodpovídají žádné výsledky.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Zatím nejsou naplánované žádné zápasy.' })).toHaveCount(0);
  });

  test('match lists and details do not send visitors to the former HLL match archive', async ({ page }) => {
    for (const path of ['/en/matches?view=results', '/cs/hll/matches?view=results', `/cs/hll/matches/${FIXTURE_SLUGS.matches.hllHistorical}`]) {
      await page.goto(path);
      await expect(page.locator('[data-match-table]')).toBeVisible();
      await expect(page.locator('[data-hll-archive], a[href^="https://valkyriahll.cz"]')).toHaveCount(0);
    }
  });

  test('list rows show a visible keyboard focus ring', async ({ page }) => {
    await page.goto('/cs/matches?view=results');
    await tabUntil(page, '[data-match-table] tbody a', 80);
    const focused = page.locator('[data-match-table] tbody a:focus');
    await expect(focused).toHaveCount(1);
    const ring = await focused.evaluate((link) => {
      const style = getComputedStyle(link, '::after');
      return { style: style.outlineStyle, width: style.outlineWidth, position: style.position };
    });
    expect(ring).toEqual({ style: 'solid', width: '2px', position: 'absolute' });
    const href = await focused.getAttribute('href');
    // The shared list links each row to its canonical game section.
    expect(href).toMatch(/^\/cs\/(wardogs|hll)\/matches\/[a-z0-9-]+$/);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });
});

test.describe('public matches: detail', () => {
  test('desktop detail keeps the list with the row selected and a detail pane', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/cs/matches?view=results');
    await rowOf(page, M.completedVerified).getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/cs/wardogs/matches/${M.completedVerified}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Valkyria vs. Synthetic Opponent Delta');
    const selected = page.locator('[data-match-table="results"] tbody tr[data-selected]');
    await expect(selected).toHaveCount(1);
    await expect(selected.getByRole('link')).toHaveAttribute('aria-current', 'page');
    await expect(selected.getByRole('link')).toHaveAttribute('href', `/cs/wardogs/matches/${M.completedVerified}`);
    const outline = await selected.evaluate((row) => getComputedStyle(row).outlineColor);
    expect(outline).toBe('rgb(217, 173, 50)');

    const detail = page.locator(`[data-match-detail="${M.completedVerified}"]`);
    await expect(detail).toBeVisible();
    const paneBox = await detail.boundingBox();
    const listBox = await page.locator('[data-match-table]').boundingBox();
    expect(paneBox!.x).toBeGreaterThan(listBox!.x + listBox!.width - 1);
    await expect(detail.locator('[data-result="score"]')).toContainText('2 : 1');
    await expect(detail).toContainText('Ověřený výsledek');
    await expect(detail.locator('[data-match-recap] [data-prose="published"]')).toContainText('Syntetická reportáž');
    await expect(detail.locator('[data-match-links] a').first()).toHaveAttribute('href', 'https://example.org/synthetic-fixture/event-delta');
    await expect(detail).not.toContainText('internal note');
    // Maps/rounds (and statistics) need more than the one-third pane: full width below list and pane.
    const extras = page.locator(`[data-match-extras="${M.completedVerified}"]`);
    await expect(extras.locator('[data-match-rounds] table tbody tr')).toHaveCount(3);
    const extrasBox = (await extras.boundingBox())!;
    expect(extrasBox.x).toBeLessThanOrEqual(listBox!.x + 1);
    expect(extrasBox.x + extrasBox.width).toBeGreaterThanOrEqual(paneBox!.x + paneBox!.width - 1);
    expect(extrasBox.y).toBeGreaterThanOrEqual(paneBox!.y + paneBox!.height - 1);
    await expect(extras).not.toContainText('internal note');

    // Direct reload keeps the same meaningful page; browser back returns to the list.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Valkyria vs. Synthetic Opponent Delta');
    await expect(page.locator('[data-match-table] tbody tr[data-selected]')).toHaveCount(1);
    await page.goBack();
    await expect(page).toHaveURL(/\/cs\/matches\?view=results$/);
  });

  test('the list route previews the first row beside the list on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/cs/matches');
    const preview = page.locator('[data-detail-mode="preview"]');
    await expect(preview).toBeVisible();
    await expect(preview.locator('[data-match-detail-link]')).toHaveAttribute('href', `/cs/wardogs/matches/${M.upcoming}`);
    await expect(page.locator('[data-match-table] tbody tr[data-selected]')).toHaveCount(0);
  });

  test('narrow screens render the standalone detail with a back link', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/cs/wardogs/matches/${M.completedUnknown}`);
    await expect(page.locator('[data-match-table]')).toBeHidden();
    const detail = page.locator(`[data-match-detail="${M.completedUnknown}"]`);
    await expect(detail).toBeVisible();
    await expect(detail.locator('[data-result="unpublished"]')).toContainText('Výsledek zatím nebyl zveřejněn');
    await expect(detail).not.toContainText(ZERO_ZERO);
    const back = page.locator('[data-back-link]');
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute('href', '/cs/wardogs/matches?view=results');
    await expectNoHorizontalOverflow(page);
    await back.click();
    await expect(page).toHaveURL(/\/cs\/wardogs\/matches\?view=results$/);
    await expect(page.locator('[data-match-table="results"]')).toBeVisible();
    await expect(page.locator('[data-detail-mode="preview"]')).toBeHidden();
  });

  test('phone match tables keep the result in view, pin the first statistics column and pass axe', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/cs/hll/matches/${M.hllHistorical}`);
    const extras = page.locator(`[data-match-extras="${M.hllHistorical}"]`);
    // Maps and rounds: the mode shared by every round is a match fact, so the table fits
    // without scrolling and the result column ends inside the viewport.
    const rounds = extras.locator('[data-scroll-table="rounds"]');
    await expect(rounds.locator('thead')).not.toContainText('Režim');
    await expect(rounds.locator('caption')).toHaveText('Režim všech kol: Warfare');
    await expect(page.locator(`[data-match-detail="${M.hllHistorical}"] [data-match-mode]`)).toHaveText('Warfare');
    expect(await rounds.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const outcome = (await rounds.locator('tbody tr').first().locator('td').last().boundingBox())!;
    expect(outcome.x + outcome.width).toBeLessThanOrEqual(390);
    await expect(rounds).toHaveAttribute('aria-label', 'Mapy a kola – posuvná oblast');
    await expect(page.locator('[data-match-rounds] [aria-labelledby]')).toHaveCount(0);

    // Summary fits the region; the players table scrolls behind a sticky name column with an edge fade.
    const summary = extras.locator('[data-scroll-table="summary"]');
    expect(await summary.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(summary).toHaveAttribute('aria-label', 'Souhrn týmů – posuvná oblast');
    await page.getByRole('tab', { name: 'Hráči' }).click();
    const players = extras.locator('[data-scroll-table="players"]');
    const frame = players.locator('xpath=..');
    await expect(frame).toHaveAttribute('data-scroll-edges', 'end');
    const name = players.locator('tbody th').first();
    const kills = players.locator('tbody tr').first().locator('td').nth(1);
    const before = { name: (await name.boundingBox())!, kills: (await kills.boundingBox())! };
    await players.evaluate((element) => {
      element.scrollLeft = 400;
    });
    await expect(frame).toHaveAttribute('data-scroll-edges', /^(start|both)$/);
    const after = { name: (await name.boundingBox())!, kills: (await kills.boundingBox())! };
    expect(after.kills.x).toBeLessThan(before.kills.x - 100);
    expect(Math.abs(after.name.x - before.name.x)).toBeLessThan(1);
    expect(after.name.x).toBeGreaterThanOrEqual(0);
    expect(after.name.x + after.name.width).toBeLessThanOrEqual(390);
    expect(await name.evaluate((element) => getComputedStyle(element).position)).toBe('sticky');
    await expectNoHorizontalOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    // Wardogs rounds share one synthetic mode: no mode column, score and result on screen.
    await page.goto(`/cs/wardogs/matches/${M.completedVerified}`);
    const wardogsRounds = page.locator(`[data-match-extras="${M.completedVerified}"] [data-scroll-table="rounds"]`);
    await expect(wardogsRounds.locator('thead')).not.toContainText('Režim');
    await expect(page.locator(`[data-match-detail="${M.completedVerified}"] [data-match-mode]`)).toHaveText('Synthetic mode');
    const wardogsOutcome = (await wardogsRounds.locator('tbody tr').first().locator('td').last().boundingBox())!;
    expect(wardogsOutcome.x + wardogsOutcome.width).toBeLessThanOrEqual(390);
    await expect(wardogsRounds.locator('tbody tr').first()).toContainText('1 : 0');
    await expect(wardogsRounds.locator('tbody tr').first()).toContainText('Výhra');
  });

  test('missing English recap is an explicit absence with a link to the Czech recap', async ({ page }) => {
    await page.goto(`/en/wardogs/matches/${M.completedUnknown}`);
    const recap = page.locator('[data-match-recap]');
    await expect(recap.locator('[data-prose="missing"]')).toContainText('The recap is not available in English');
    const link = recap.locator('[data-prose-source="cs"]');
    await expect(link).toHaveAttribute('href', `/cs/wardogs/matches/${M.completedUnknown}`);
    await expect(link).toHaveAttribute('hreflang', 'cs');
    await expect(recap).not.toContainText('Syntetická reportáž');
  });

  test('postponed detail shows the original date; English uses en-GB with an explicit zone', async ({ page }) => {
    await page.goto(`/en/wardogs/matches/${M.postponed}`);
    const detail = page.locator(`[data-match-detail="${M.postponed}"]`);
    await expect(detail.locator('[data-match-status="postponed"]')).toHaveText('Postponed');
    await expect(detail.locator('[data-match-start]')).toHaveText(/^\d{1,2}\s[A-Z][a-z]+\s\d{4}(,|\sat)\s\d{2}:\d{2}\sCES?T$/);
    await expect(detail.locator('[data-original-start]')).toHaveText(/^\d{1,2}\s[A-Z][a-z]+\s\d{4}(,|\sat)\s\d{2}:\d{2}\sCES?T$/);
    await expect(detail).toContainText('Not played yet');
  });

  test('draft and unknown matches are 404 and alternates cover both locales', async ({ page }) => {
    for (const path of [`/cs/matches/${M.draft}`, `/en/matches/${M.draft}`, `/cs/wardogs/matches/${M.draft}`, '/cs/matches/neexistujici-zapas']) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
    }
    await expect(page.getByText('Synthetic Opponent Golf')).toHaveCount(0);
    // A shared-list URL permanently redirects to the canonical game section.
    await page.goto(`/en/matches/${M.upcoming}`);
    await expect(page).toHaveURL(new RegExp(`/en/wardogs/matches/${M.upcoming}$`));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/en/wardogs/matches/${M.upcoming}$`));
    await expect(page.locator('link[rel="alternate"][hreflang="cs"]')).toHaveAttribute('href', new RegExp(`/cs/wardogs/matches/${M.upcoming}$`));
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', new RegExp(`/en/wardogs/matches/${M.upcoming}$`));
    // A match is never shown under the other game's section.
    await page.goto(`/cs/hll/matches/${M.upcoming}`);
    await expect(page).toHaveURL(new RegExp(`/cs/wardogs/matches/${M.upcoming}$`));
  });
});
