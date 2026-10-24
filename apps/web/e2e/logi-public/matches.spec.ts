import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { FIXTURE_SLUGS } from '../../src/fixtures/data';
import { expectNoHorizontalOverflow } from '../support/shell-helpers';
import { signInAs } from '../support/auth';

/** Only playwright.logi.config.ts supplies these deliberately invented projections. */
const archiveSlug = FIXTURE_SLUGS.matches.hllHistorical;
const outDir = path.resolve('.local/evidence/unified-logi-web');
const row = (page: Page, number: number) => page.locator('[data-unified-matches] tbody tr').filter({ hasText: `[SYNTHETIC] Logi history ${String(number).padStart(2, '0')}` });
const copy = {
  cs: { end: 'Čas konce', provisional: 'Předběžný výsledek', confirmed: 'Potvrzený výsledek', played: 'Odehráno', axis: 'Osa', allies: 'Spojenci' },
  en: { end: 'End time', provisional: 'Provisional result', confirmed: 'Confirmed result', played: 'Played', axis: 'Axis', allies: 'Allies' },
} as const;

async function expectSharedPresentation(page: Page) {
  await expect(page.locator('[data-logi-matches], [data-logi-browser]')).toHaveCount(0);
  for (const obsolete of ['Matches from Logi', 'Zápasy z Logi', 'Website archive', 'Archiv webu', 'Imported provisional result', 'Importovaný předběžný výsledek', 'Archived match details', 'Archivní detail zápasu']) {
    await expect(page.getByText(obsolete, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByText(/Result imported:|Výsledek importován:/)).toHaveCount(0);
}

async function expectConsentedHistoricalLineup(page: Page, locale: 'cs' | 'en') {
  const lineup = page.locator('[aria-labelledby="match-logi-people"]');
  await expect(page.locator('#match-logi-people')).toBeVisible();
  await expect(lineup).toBeVisible();
  await expect(lineup.locator('ul > li')).toHaveCount(1);
  await expect(lineup.getByRole('link', { name: 'Syntetická hráčka Bravo', exact: true })).toHaveAttribute('href', `/${locale}/members/${FIXTURE_SLUGS.members.publishedCsOnlyBio}`);
  await expect(lineup).toContainText('[SYNTHETIC] Alpha');
  await expect(lineup).not.toContainText(/acknowledged|attending/);
  await expect(lineup.locator('[data-logi-player-stats]')).toHaveCount(0);
  for (const privateField of ['PRIVATE_OPERATIONAL_NAME', 'PRIVATE_OPERATIONAL_GROUP', 'private-member-', 'private-identity-', 'private-roster-history-hll', '910000000000000002']) expect(await page.content()).not.toContain(privateField);
}

async function capture(page: Page, name: string, caption: string) {
  if (process.env.CAPTURE_EVIDENCE !== '1') return;
  mkdirSync(outDir, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true, animations: 'disabled', caret: 'hide' });
  writeFileSync(path.join(outDir, `${name}.json`), `${JSON.stringify({ caption, kind: 'synthetic-local-browser-screenshot', route: new URL(page.url()).pathname + new URL(page.url()).search, viewport: page.viewportSize(), capturedAt: new Date().toISOString() }, null, 2)}\n`);
}

test.use({ reducedMotion: 'reduce' });

for (const locale of ['cs', 'en'] as const) {
  for (const width of [1280, 390]) {
    test(`${locale} at ${width}: native captured team names remain readable beside the versus column`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`/${locale}/hll/matches/logi/synthetic-next-hell_let_loose`);
      await page.evaluate(() => document.fonts.ready);
      const detail = page.locator('[data-operational-match-detail][data-detail-mode="detail"]');
      const identity = detail.locator('[data-expanded]');
      // The accessible teams prefix precedes the first team; it must not affect placement.
      await expect(identity.locator(':scope > span > .visually-hidden')).toHaveCount(1);
      const first = identity.getByTitle('[SYNTHETIC] International Combined Arms Expeditionary Brigade Alpha', { exact: true });
      const second = identity.getByTitle('[SYNTHETIC] Team B', { exact: true });
      await expect(first).toBeVisible();
      await expect(second).toBeVisible();
      const [firstBox, secondBox, identityBox] = await Promise.all([first.boundingBox(), second.boundingBox(), identity.boundingBox()]);
      expect(firstBox).not.toBeNull(); expect(secondBox).not.toBeNull(); expect(identityBox).not.toBeNull();
      // Both team rows occupy the wide content track, with a separate track reserved for VS.
      expect(firstBox!.width).toBeGreaterThan(160);
      expect(secondBox!.width).toBeGreaterThan(160);
      expect(Math.abs(firstBox!.x - secondBox!.x)).toBeLessThan(1);
      expect(Math.abs(firstBox!.width - secondBox!.width)).toBeLessThan(1);
      for (const box of [firstBox!, secondBox!]) {
        expect(box.x).toBeGreaterThan(identityBox!.x + 24);
        expect(box.x + box.width).toBeLessThanOrEqual(identityBox!.x + identityBox!.width + 1);
      }
      const name = first.locator('strong');
      const readability = await name.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const lineTops = new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top)));
        return { width: element.getBoundingClientRect().width, lines: lineTops.size, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth };
      });
      // The actual text must wrap into readable lines instead of a 24px, one-letter column.
      expect(readability.width).toBeGreaterThan(100);
      expect(readability.lines).toBeGreaterThan(0);
      expect(readability.lines).toBeLessThanOrEqual(6);
      expect(readability.scrollWidth).toBeLessThanOrEqual(readability.clientWidth + 1);
      const versus = second.locator('..').locator(':scope > [aria-hidden="true"]').filter({ hasText: /^VS$/ });
      await expect(versus).toBeVisible();
      const versusBox = await versus.boundingBox();
      expect(versusBox).not.toBeNull();
      expect(versusBox!.x + versusBox!.width).toBeLessThanOrEqual(secondBox!.x);
      await expectSharedPresentation(page);
      await expectNoHorizontalOverflow(page);
      await capture(page, `native-team-readability-${locale}-${width}`, 'Synthetic native HLL detail: the long first captured team and the second team share the wide content track; VS remains in its own narrow track.');
    });
  }
}

for (const locale of ['cs', 'en'] as const) {
  for (const width of [1440, 390]) {
    test(`${locale} at ${width}: actual history, reviewed precedence, teams and original archive`, async ({ page, request }) => {
      const browserErrors: string[] = [];
      page.on('pageerror', (error) => browserErrors.push(error.message));
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`/${locale}/hll/matches?view=results`);
      const browser = page.locator('[data-unified-matches]');
      await expect(browser.getByRole('searchbox')).toHaveCount(1);
      await expect(page.locator('[data-match-table]')).toHaveCount(1);
      await expectSharedPresentation(page);
      await expect(browser.locator('tbody tr')).toHaveCount(10);
      await expect(browser.locator('tbody th')).toContainText(Array.from({ length: 10 }, (_, index) => `[SYNTHETIC] Logi history ${String(index).padStart(2, '0')}`));
      const reviewed = row(page, 0);
      const imported = row(page, 1);
      for (const text of ['Axis: 0', 'Allies: 5', copy[locale].confirmed]) await expect(reviewed).toContainText(text);
      await expect(reviewed).not.toContainText(copy[locale].provisional);
      await expect(imported).toContainText('Axis: 0');
      await expect(imported).toContainText('Allies: 5');
      await expect(imported).toContainText(copy[locale].provisional);
      for (const score of [reviewed, imported]) {
        const result = score.locator('[data-column="result"]');
        await expect(result.getByText(copy[locale].axis, { exact: true })).toBeVisible();
        await expect(result.getByText(copy[locale].allies, { exact: true })).toBeVisible();
        await expect(result.locator('strong')).toHaveText(['0', '5']);
      }
      await expect(reviewed.locator('td').first()).toContainText(copy[locale].end);
      const currentTime = await reviewed.locator('[data-column="start"] time').getAttribute('datetime');
      expect(currentTime).not.toBeNull();
      // A reviewed archive identity must not reintroduce its old placeholder kickoff.
      await expect(browser.locator(`[data-match-detail="${archiveSlug}"] [data-match-start] time`)).toHaveAttribute('datetime', currentTime!);
      await expect(reviewed.locator('[data-column="status"]')).toHaveText(copy[locale].played);
      await expect(reviewed.locator('th strong')).toHaveText(['VLK', 'SHF']);
      await expect(reviewed.locator('th')).toContainText('Valkyria');
      await expect(reviewed.locator('th')).toContainText('Synthetic HLL Opponent Foxtrot');
      await expect(reviewed.locator('th')).not.toContainText('[SYNTHETIC] Team A');
      await expect(reviewed.locator('th')).not.toContainText('[SYNTHETIC] Team B');
      const archive = reviewed.locator('th a');
      await expect(reviewed).toContainText('Synthetic Historical Cup (sample)');
      await expect(archive).toHaveAttribute('href', `/${locale}/hll/matches/${archiveSlug}`);
      await expect(reviewed.locator('a')).toHaveCount(1);
      for (const excluded of ['never-render-logo', 'synthetic-public-match-source', '910000000000000001', 'synthetic-public-hll-key']) {
        expect(await page.content()).not.toContain(excluded);
      }
      await expectNoHorizontalOverflow(page);
      if (width === 390) {
        const bounds = await reviewed.locator('[data-column="result"]').boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      }
      expect((await new AxeBuilder({ page }).include('[data-unified-matches]').analyze()).violations).toEqual([]);
      await capture(page, `history-${locale}-${width}`, 'One synthetic match list with labelled scoreboards and honest result states. The reviewed first row shows Valkyria and its opponent, links directly to the canonical detail, and uses the reviewed 0:5 result.');

      // The ordinary row link opens the canonical historical detail directly.
      await archive.click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/hll/matches/${archiveSlug}$`));
      const current = page.locator(`[data-match-detail="${archiveSlug}"]`);
      await expect(current.locator('[data-match-start] time')).toHaveAttribute('datetime', currentTime!);
      await expect(current.locator('[data-match-start]')).toContainText(copy[locale].end);
      await expect(current).toContainText(copy[locale].confirmed);
      await expect(current).toContainText('Axis: 0');
      await expect(current).toContainText('Allies: 5');
      const original = page.locator(`[data-match-detail="${archiveSlug}"]`);
      await expect(original).toContainText('Synthetic HLL Opponent Foxtrot');
      await expect(original).toContainText('Synthetic Historical Cup (sample)');
      await expect(original.locator('[data-result="score"]')).toHaveCount(0);
      await expect(page.locator('[data-match-rounds]')).toContainText('Hürtgen Forest');
      await expectConsentedHistoricalLineup(page, locale);
      await expectSharedPresentation(page);
      await expectNoHorizontalOverflow(page);
      await capture(page, `archive-${locale}-${width}`, 'Synthetic linked match detail: one current reviewed result beside the retained historical recap and map rounds.');
      const legacy = `/${locale}/hll/matches/logi/synthetic-history-00`;
      const redirect = await request.get(legacy, { maxRedirects: 0 });
      expect(redirect.status()).toBe(307);
      expect(redirect.headers().location).toBe(`/${locale}/hll/matches/${archiveSlug}`);
      await page.goto(legacy);
      await expect(page).toHaveURL(new RegExp(`/${locale}/hll/matches/${archiveSlug}$`));
      await expect(page.locator(`[data-match-detail="${archiveSlug}"]`)).toContainText(copy[locale].confirmed);
      await expectConsentedHistoricalLineup(page, locale);
      await expectSharedPresentation(page);
      expect(browserErrors).toEqual([]);
    });
  }
}

test('one search and page includes current and historical matches', async ({ page }) => {
  await page.goto('/en/hll/matches?view=results');
  const browser = page.locator('[data-unified-matches]');
  await expect(browser.locator('tbody tr')).toHaveCount(10);
  await expect(row(page, 0)).toHaveCount(1);
  const next = browser.locator('a[rel="next"]');
  await expect(next).toHaveAttribute('href', '/en/hll/matches?view=results&page=2');
  await next.click();
  await expect(page).toHaveURL(/view=results&page=2$/);
  await expect(row(page, 10)).toHaveCount(1);
  await expect(row(page, 11)).toHaveCount(1);
  await browser.getByRole('searchbox').fill('SYA');
  await browser.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(browser.locator('tbody tr')).toHaveCount(1);
  await expect(row(page, 0)).toHaveCount(1);
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  expect(new URL(page.url()).searchParams.has('logiPage')).toBe(false);
  await browser.getByRole('searchbox').fill('Foxtrot');
  await browser.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(browser.locator('tbody tr')).toHaveCount(1);
  await expect(row(page, 0)).toHaveCount(1);
});

for (const locale of ['cs', 'en'] as const) {
test(`${locale}: shared standalone detail and three-team upcoming have no fabricated score`, async ({ page }) => {
  await page.goto(`/${locale}/hll/matches/logi/synthetic-history-01`);
  await expect(page.locator('[data-unified-matches]')).toHaveAttribute('data-mode', 'detail');
  const detail = page.locator('[data-operational-match-detail][data-detail-mode="detail"]');
  await expect(detail).toContainText(copy[locale].provisional);
  await expect(detail).toContainText('Axis: 0; Allies: 5');
  await expect(detail.locator('[data-result-state] strong')).toHaveText(['0', '5']);
  await expect(detail.locator('time')).toHaveCount(1);
  await expect(detail).toContainText(copy[locale].end);
  await expectSharedPresentation(page);
  await page.goto(`/${locale}/wardogs/matches`);
  const connected = page.locator('[data-unified-matches]');
  const next = connected.locator('tbody tr').filter({ hasText: '[SYNTHETIC] Next wardogs match' });
  await expect(next).toHaveCount(1);
  for (const label of ['[SYNTHETIC] Team A', 'SYA', 'Lonestar', '[SYNTHETIC] Team B', 'SYB', 'Manticore', '[SYNTHETIC] Team C', 'SYC', 'Valkyra']) await expect(next).toContainText(label);
  await expect(next.locator('th strong')).toHaveText(['SYA', 'SYB', 'SYC']);
  await expect(connected.locator('[data-column="result"]')).toHaveCount(0);
  await expect(next).not.toContainText(/0\s*:\s*0/);
  await expectSharedPresentation(page);
  await expectNoHorizontalOverflow(page);
  await capture(page, `wardogs-three-teams-${locale}-1280`, 'Synthetic upcoming Wardogs match shows three captured teams and their supplied sides; the unknown result remains unavailable.');
});
}

test('an explicitly reviewed identical alias is hidden and its old detail redirects to the canonical event', async ({ page, request }) => {
  await page.goto('/en/hll/matches?view=results');
  await expect(row(page, 1)).toHaveCount(1);
  await expect(page.locator('[data-unified-matches] a[href*="synthetic-history-alias"]')).toHaveCount(0);
  const response = await request.get('/en/hll/matches/logi/synthetic-history-alias', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe('/en/hll/matches/logi/synthetic-history-01');
  await page.goto('/en/hll/matches/logi/synthetic-history-alias');
  await expect(page).toHaveURL(/\/en\/hll\/matches\/logi\/synthetic-history-01$/);
  await expect(page.locator('[data-operational-match-detail][data-detail-mode="detail"]')).toContainText(copy.en.provisional);
  await expectSharedPresentation(page);
});

test('both homes select the actual next published Logi match', async ({ page }) => {
  for (const locale of ['cs', 'en'] as const) {
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`/${locale}`);
      for (const game of ['hll', 'wardogs']) {
        const next = page.locator(`[data-hub-next-match="${game}"]`);
        const card = page.locator(`[data-hub-game="${game}"]`);
        await expect(next.locator('a')).toHaveAttribute('href', `/${locale}/${game}/matches/logi/synthetic-next-${game === 'hll' ? 'hell_let_loose' : 'wardogs'}`);
        const [a, b] = await Promise.all([card.boundingBox(), next.boundingBox()]);
        expect(a).not.toBeNull(); expect(b).not.toBeNull();
        expect(Math.abs(a!.x - b!.x)).toBeLessThan(1);
        expect(Math.abs(a!.width - b!.width)).toBeLessThan(1);
        expect(b!.y).toBeGreaterThanOrEqual(a!.y + a!.height - 1);
      }
      await expectNoHorizontalOverflow(page);
      await capture(page, `hub-${locale}-${width}`, 'The shared community hub keeps full-width game entries with their actual next published match in a compact strip below each game.');
    }
    await page.goto(`/${locale}/hll`);
    await expect(page.locator('[data-hll-strip-item="match"]')).toHaveAttribute('href', `/${locale}/hll/matches/logi/synthetic-next-hell_let_loose`);
    await page.goto(`/${locale}/wardogs`);
    await expect(page.locator('[data-next-match]')).toHaveAttribute('href', `/${locale}/wardogs/matches/logi/synthetic-next-wardogs`);
  }
});

for (const locale of ['cs', 'en'] as const) {
  for (const width of [1440, 390]) {
    test(`${locale} ${width}: Logi operations and secondary archive administration`, async ({ context, page }) => {
      await signInAs(context, { roles: ['administrator'], name: 'Synthetic administrator' });
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`/${locale}/admin`);
      const operations = page.getByTestId('admin-logi-operations');
      await expect(operations.locator('a[href="https://logi.example.test"]')).toHaveCount(1);
      for (const key of ['matches', 'members', 'tournaments']) await expect(page.getByTestId('admin-nav').locator(`[data-admin-nav="${key}"]`)).toHaveCount(0);
      const archives = page.getByTestId('admin-archive-nav');
      await expect(archives.locator('[data-admin-nav="matches"]')).toBeHidden();
      await archives.locator('summary').focus();
      await page.keyboard.press('Enter');
      await expect(archives.locator('[data-admin-nav="matches"]')).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect((await new AxeBuilder({ page }).include('[data-admin-shell]').analyze()).violations).toEqual([]);
      await capture(page, `admin-${locale}-${width}`, 'Synthetic authorized administration: editorial/configuration tools stay primary, HLL/Wardogs operations use the validated Logi entry, and keyboard-accessible historical editors remain available.');
    });
    test(`${locale} ${width}: approved lineups join the ordinary member directory for both games`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`/${locale}/members?q=Bravo`);
      const roster = page.locator('[data-member-roster]');
      await expect(roster.locator('tbody tr')).toHaveCount(1);
      for (const game of ['hll', 'wardogs']) await expect(roster.locator(`a[href="/${locale}/${game}/matches/logi/synthetic-next-${game === 'hll' ? 'hell_let_loose' : 'wardogs'}"]`)).toBeVisible();
      await expect(roster).toContainText('Syntetická hráčka Bravo');
      for (const privateField of ['PRIVATE_OPERATIONAL_NAME', 'PRIVATE_OPERATIONAL_GROUP', 'private-member-', 'private-identity-', '910000000000000002']) expect(await page.content()).not.toContain(privateField);
      // Translation dictionary keys are public UI strings, not individual attendance data.
      await expect(roster).not.toContainText(/acknowledged|attending/);
      await expectNoHorizontalOverflow(page);
      expect((await new AxeBuilder({ page }).include('[data-member-roster]').analyze()).violations).toEqual([]);
      await capture(page, `members-${locale}-${width}`, 'One consented synthetic profile lists approved HLL and Wardogs lineups inside the ordinary member directory; private operational names and attendance are absent.');
      await roster.locator(`a[href="/${locale}/hll/matches/logi/synthetic-next-hell_let_loose"]`).click();
      await expect(page.locator('[data-operational-match-detail][data-detail-mode="detail"]')).toContainText('[SYNTHETIC] Next hell_let_loose match');
      await expectSharedPresentation(page);
      await expect(page.locator('#match-logi-people')).toBeVisible();
      await expect(page.locator('[aria-labelledby="match-logi-people"]')).toContainText('Syntetická hráčka Bravo');
      await expectNoHorizontalOverflow(page);
    });
  }
}

for (const locale of ['cs', 'en'] as const) {
test(`${locale}: the shared results list filters all matches with the same game controls`, async ({ page }) => {
  await page.goto(`/${locale}/matches?view=results`);
  const browser = page.locator('[data-unified-matches]');
  await expect(browser.getByRole('searchbox')).toHaveCount(1);
  await expect(page.locator('[data-match-table]')).toHaveCount(1);
  await expect(browser.locator('tbody tr')).toHaveCount(10);
  await expectSharedPresentation(page);
  await browser.locator(`a[href="/${locale}/matches?view=results&game=wardogs"]`).click();
  await expect(browser.locator('tbody tr')).toHaveCount(3);
  await expect(browser).not.toContainText('[SYNTHETIC] Logi history');
  await expectSharedPresentation(page);
  await browser.locator(`a[href="/${locale}/matches?view=results&game=hell-let-loose"]`).click();
  await expect(browser.locator('tbody tr')).toHaveCount(10);
  await expect(row(page, 0)).toHaveCount(1);
  await expectSharedPresentation(page);
  await page.goto(`/${locale}/wardogs/matches?view=results`);
  await expect(page.locator('[data-unified-matches]')).toHaveCount(1);
  await expect(page.locator('[data-match-table]')).toHaveCount(1);
  await expectSharedPresentation(page);
});
}

for (const locale of ['cs', 'en'] as const) {
  test(`${locale}: shared and HLL upcoming use the same match presentation`, async ({ page }) => {
    for (const route of [`/${locale}/matches`, `/${locale}/hll/matches`]) {
      await page.goto(route);
      const browser = page.locator('[data-unified-matches]');
      await expect(browser).toHaveCount(1);
      await expect(browser.getByRole('searchbox')).toHaveCount(1);
      await expect(page.locator('[data-match-table]')).toHaveCount(1);
      await expectSharedPresentation(page);
    }
  });
}
