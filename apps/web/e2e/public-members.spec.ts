import { expect, type Page, test } from '@playwright/test';
import { FIXTURE_SLUGS } from '../src/fixtures/data';
import { expectNoHorizontalOverflow } from './support/shell-helpers';

const S = FIXTURE_SLUGS.members;
const LONG_NAME = 'Syntetický hráč Echo s neobyčejně dlouhým jménem Žluťoučký kůň úpěl ďábelské ódy';
const EMOJI_NAME = 'Syntetický hráč Foxtrot 🦊🎮';
const rowOf = (page: Page, slug: string) => page.locator('[data-member-roster] tbody tr').filter({ has: page.locator(`a[href*="/members/${slug}"]`) });

test.describe('public members', () => {
  test('roster lists only published, consented profiles with names exactly as stored', async ({ page }) => {
    await page.goto('/cs/members');
    await expect(page.getByRole('heading', { level: 1, name: 'Členové' })).toBeVisible();
    const roster = page.locator('[data-member-roster]');
    await expect(roster.locator('tbody tr')).toHaveCount(4);
    await expect(page.getByRole('status').filter({ hasText: '4 profily' })).toBeVisible();
    for (const slug of [S.publishedBilingual, S.publishedCsOnlyBio, S.longName, S.emoji]) await expect(rowOf(page, slug)).toHaveCount(1);
    for (const slug of [S.draft, S.hidden]) await expect(page.locator(`a[href*="/members/${slug}"]`)).toHaveCount(0);
    await expect(rowOf(page, S.emoji).locator('[data-member-name]')).toHaveText(EMOJI_NAME);
    await expect(rowOf(page, S.publishedCsOnlyBio)).toContainText('Důstojník');
    await expect(rowOf(page, S.publishedCsOnlyBio)).toContainText('Veterán');
    // Missing avatar: initials in a reserved square, never a broken image.
    const initials = rowOf(page, S.publishedCsOnlyBio).locator('[data-avatar="initials"]');
    await expect(initials).toHaveText('SH');
    const box = await initials.boundingBox();
    expect(Math.round(box!.width)).toBe(40);
    expect(Math.round(box!.height)).toBe(40);
    await expect(rowOf(page, S.publishedBilingual).locator('[data-avatar="image"] img')).toHaveAttribute('src', /\/api\/media\/[0-9a-f-]+\/thumb$/);
  });

  test('long names wrap to at most two lines in the list and appear in full on the profile', async ({ page }) => {
    for (const width of [1920, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/cs/members');
      const name = rowOf(page, S.longName).locator('[data-member-name]');
      await expect(name).toHaveText(LONG_NAME);
      const metrics = await name.evaluate((element) => {
        const style = getComputedStyle(element);
        return { height: element.getBoundingClientRect().height, lineHeight: parseFloat(style.lineHeight) };
      });
      expect(metrics.height).toBeLessThanOrEqual(metrics.lineHeight * 2 + 1);
      await expectNoHorizontalOverflow(page);
    }
    await rowOf(page, S.longName).getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/cs/members/${S.longName}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(LONG_NAME);
    await expectNoHorizontalOverflow(page);
    await page.goto(`/en/members/${S.emoji}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(EMOJI_NAME);
  });

  test('filters are shareable URLs and the profile back link keeps them', async ({ page }) => {
    await page.goto('/cs/members');
    await page.locator('[data-filter="role:officer"]').click();
    await expect(page).toHaveURL(/\/cs\/members\?role=officer$/);
    await expect(page.locator('[data-member-roster] tbody tr')).toHaveCount(1);
    await expect(page.locator('[data-filter="role:officer"]')).toHaveAttribute('aria-current', 'true');

    await page.goto('/cs/members?game=hell-let-loose');
    await expect(page.locator('[data-member-roster] tbody tr')).toHaveCount(2);
    await rowOf(page, S.publishedCsOnlyBio).getByRole('link').click();
    await expect(page).toHaveURL(new RegExp(`/cs/members/${S.publishedCsOnlyBio}\\?game=hell-let-loose$`));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/cs/members/${S.publishedCsOnlyBio}$`));
    const back = page.locator('[data-back-link]');
    await expect(back).toHaveAttribute('href', '/cs/members?game=hell-let-loose');
    await back.click();
    await expect(page.locator('[data-filter="game:hell-let-loose"]')).toHaveAttribute('aria-current', 'true');

    await page.goto('/cs/members?q=foxtrot');
    await expect(page.locator('[data-member-roster] tbody tr')).toHaveCount(1);
    await page.goto('/cs/members?q=neexistujici-clen');
    await expect(page.getByRole('heading', { name: 'Těmto filtrům neodpovídají žádné výsledky.' })).toBeVisible();
    await expect(page.locator('[data-clear-filters]')).toHaveAttribute('href', '/cs/members');
  });

  test('biography: published in Czech, explicit absence with a Czech link in English', async ({ page }) => {
    await page.goto(`/cs/members/${S.publishedCsOnlyBio}`);
    await expect(page.locator('[data-prose="published"]')).toContainText('[Ukázka]');
    await expect(page.locator('[data-member-profile]')).toContainText('Důstojník');

    await page.goto(`/en/members/${S.publishedCsOnlyBio}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Syntetická hráčka Bravo');
    const missing = page.locator('[data-prose="missing"]');
    await expect(missing).toContainText('The biography is not available in English');
    const link = missing.locator('[data-prose-source="cs"]');
    await expect(link).toHaveText('Read the Czech biography');
    await expect(link).toHaveAttribute('href', `/cs/members/${S.publishedCsOnlyBio}`);
    await expect(link).toHaveAttribute('hreflang', 'cs');
    await expect(page.locator('[data-prose="published"]')).toHaveCount(0);
    await expect(page.locator('[data-member-profile]')).toContainText('Officer');

    await page.goto(`/cs/members/${S.longName}`);
    await expect(page.locator('[data-prose="none"]')).toHaveText('Tento člen zatím nezveřejnil žádný medailonek.');
  });

  test('draft, hidden and unknown profiles are the same 404', async ({ page }) => {
    const bodies: string[] = [];
    for (const slug of [S.draft, S.hidden, 'neexistujici-clen']) {
      const response = await page.goto(`/cs/members/${slug}`);
      expect(response?.status(), slug).toBe(404);
      await expect(page.getByRole('heading', { level: 1, name: 'Stránka nenalezena' })).toBeVisible();
      bodies.push(await page.locator('main').innerText());
    }
    expect(new Set(bodies).size).toBe(1);
    await expect(page.getByText('Syntetický hráč Delta')).toHaveCount(0);
  });
});
