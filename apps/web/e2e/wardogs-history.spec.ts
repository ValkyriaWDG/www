import { expect, type Page, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expectNoHorizontalOverflow, measuredBox } from './support/shell-helpers';

/*
 * Retained Warcon server game history (Wardogs) against the labelled synthetic reader
 * source (`LOGI_READERS_SOURCE=synthetic-fixture`, e2e/support/server-env.ts): the
 * `/[locale]/wardogs/history` page with its filters, summary, faction win shares, player
 * rankings and paginated game list in cs/en at 1440 and 390 px, the compact summary on the
 * server detail, the Wardogs menu entry and the absence of the section on HLL pages and
 * the Wardogs home. The synthetic dataset has 23 games over 60 days (ended 1, 3.5, 6, …
 * days ago): the default 30-day period holds 12 of them, 7 days hold 3, 90 days and the
 * whole history hold all 23. No Logi request, key or real server data is involved.
 */

const SERVER = 'synthetic-wardogs';
const LABELS = {
  cs: {
    title: 'Historie her serveru', nav: 'HISTORIE', summary: 'Souhrn', factions: 'Podíl vítězství frakcí', players: 'Žebříček hráčů', games: 'Historie her', filters: 'Filtry',
    outcomes30: '10 rozhodnuto · 2 remíz · 0 bez výsledku', outcomesAll: '19 rozhodnuto · 2 remíz · 1 bez výsledku · 1 neznámých', feedAll: '22 z 23 her s úplnými statistikami', feed30: '11 z 12 her s úplnými statistikami',
    other: 'Remízy 2 · Bez výsledku 1 · Neznámé 1', count30: 'Zobrazeno 1–12 z 12 her', countAll: 'Zobrazeno 1–20 z 23 her', countPage2: 'Zobrazeno 21–23 z 23 her', countRidge: 'Zobrazeno 1–7 z 7 her',
    belowFloor: 'Dalších 6 hráčů je pod minimem 500 min.', players11: 'Hráči (11)', empty: 'Pro zvolené filtry nejsou žádné hry.', reset: 'Zrušit filtry', winnerAlpha: 'Vítěz: Alpha', noFeed: 'bez bojového feedu', draw: 'Remíza',
    summaryTitle: 'Historie her', summaryGames: '12 her za posledních 30 dní', link: 'Celá historie serveru', ended: /^Konec [a-zě]{2} \d{1,2}\. \d{1,2}\. \d{2}:\d{2} SE(L)?Č$/,
  },
  en: {
    title: 'Server game history', nav: 'HISTORY', summary: 'Summary', factions: 'Faction win shares', players: 'Player rankings', games: 'Game history', filters: 'Filters',
    outcomes30: '10 decided · 2 draws · 0 without a result', outcomesAll: '19 decided · 2 draws · 1 without a result · 1 unknown', feedAll: '22 of 23 games with complete statistics', feed30: '11 of 12 games with complete statistics',
    other: 'Draws 2 · No result 1 · Unknown 1', count30: 'Showing 1–12 of 12 games', countAll: 'Showing 1–20 of 23 games', countPage2: 'Showing 21–23 of 23 games', countRidge: 'Showing 1–7 of 7 games',
    belowFloor: '6 more players are below the 500 min minimum.', players11: 'Players (11)', empty: 'No games match the selected filters.', reset: 'Reset filters', winnerAlpha: 'Winner: Alpha', noFeed: 'no combat feed', draw: 'Draw',
    summaryTitle: 'Game history', summaryGames: '12 games in the last 30 days', link: 'Full server history', ended: /^Ended [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2} CES?T$/,
  },
} as const;
/** Platform IDs, the retained-history source ID, the guild ID, the provider server name, external match IDs and digests never reach the page. */
const FORBIDDEN_TEXT = /synthetic-steam-|synthetic-xbox-|synthetic-unknown-|0123456789abcdef|100000000000000001|Warcon Test Server|synthetic-match-|sourceDigest|platformId|synthetic-history-cursor/;

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function expectAxeClean(page: Page) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

/** Cells of the (visually hidden) faction table: faction, wins / decided, share, appearances. */
async function expectFactionRows(page: Page, scope: Page | ReturnType<Page['locator']>, expected: [string, string, RegExp, string][]) {
  const rows = scope.locator('[data-history-faction-table] tbody tr');
  await expect(rows).toHaveCount(expected.length);
  for (const [index, [faction, wins, share, appearances]] of expected.entries()) {
    await expect(rows.nth(index).locator('th, td')).toHaveText([faction, wins, share, appearances]);
  }
}

const rankingRows = (page: Page) => page.locator('[data-history-ranking] tbody tr');
const rankingNames = (page: Page) => page.locator('[data-history-ranking] tbody th');

for (const locale of ['cs', 'en'] as const) {
  const L = LABELS[locale];
  for (const width of [1440, 390]) {
    const height = width === 390 ? 844 : 1050;

    test(`history page: default 30-day overview with filters, summary, factions, rankings and games: ${locale}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors = collectBrowserErrors(page);
      expect((await page.goto(`/${locale}/wardogs/history`))?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1, name: L.title })).toBeVisible();
      await expect(page.locator('[data-history-state]')).toHaveAttribute('data-history-state', 'fresh');
      await expect(page.locator('[data-history-state]')).toHaveAttribute('data-history-server', SERVER);
      await expect(page.locator('[data-synthetic-data="history"]')).toBeVisible();
      await expect(page.locator('[data-synthetic-data="history"]')).toHaveCSS('border-top-style', 'dashed');
      await expect(page.locator('[data-history-note]')).toBeVisible();
      // Menu entry is current.
      const nav = page.locator('[data-nav="desktop"]');
      await expect(nav.locator('[data-nav-item="history"]')).toHaveAttribute('href', `/${locale}/wardogs/history`);
      await expect(nav.locator('[data-nav-item="history"]')).toHaveAttribute('aria-current', 'page');
      // Filters: GET form with native controls and the default values.
      const form = page.locator('form[data-history-filters]');
      await expect(form).toHaveAttribute('action', `/${locale}/wardogs/history`);
      await expect(form.locator('select[name="server"]')).toHaveValue(SERVER);
      await expect(form.locator('select[name="server"] option')).toHaveText(['[SYNTHETIC] Valkyria Wardogs Test Server']);
      await expect(form.locator('select[name="period"]')).toHaveValue('30d');
      await expect(form.locator('select[name="map"] option')).toHaveCount(4);
      await expect(form.locator('input[name="min"]')).toHaveValue('60');
      for (const control of ['select[name="server"]', 'select[name="period"]', 'select[name="map"]', 'input[name="min"]', '[data-history-submit]']) {
        expect((await form.locator(control).boundingBox())!.height, `${control} is a 44 px control`).toBeGreaterThanOrEqual(44);
      }
      // Headings in order: one h1, then the h2 sections.
      await expect(page.getByRole('heading', { level: 2 })).toHaveText([L.filters, L.summary, L.factions, L.players, L.games]);
      // Summary of the 30-day period.
      await expect(page.locator('[data-history-games-total]')).toHaveText('12');
      await expect(page.locator('[data-history-outcomes]')).toHaveText(L.outcomes30);
      await expect(page.locator('[data-history-feed]')).toHaveText(L.feed30);
      await expect(page.locator('[data-history-range]')).not.toBeEmpty();
      // Faction win shares: bars in the published colours and a table equivalent with the same values.
      await expectFactionRows(page, page, [['Bravo', '4 / 10', /^40\s?%$/, '12'], ['Alpha', '3 / 10', /^30\s?%$/, '12'], ['Charlie', '3 / 10', /^30\s?%$/, '12']]);
      await expect(page.locator('[data-history-faction="Bravo"] [data-history-faction-fill]')).toHaveCSS('background-color', 'rgb(0, 255, 0)');
      await expect(page.locator('[data-history-faction="Alpha"] [data-history-faction-fill]')).toHaveCSS('background-color', 'rgb(255, 0, 0)');
      expect((await page.locator('[data-history-faction="Bravo"] [data-history-faction-fill]').boundingBox())!.width).toBeGreaterThan((await page.locator('[data-history-faction="Alpha"] [data-history-faction-fill]').boundingBox())!.width);
      // Rankings: every synthetic player meets the 60-minute floor in this period; feed-only group collapses on phones.
      await expect(rankingRows(page)).toHaveCount(24);
      await expect(page.locator('[data-history-below-floor]')).toHaveCount(0);
      await expect(page.locator('[data-history-ranking] th[aria-sort="descending"] [data-history-sort="kills"]')).toBeVisible();
      expect(await page.locator('[data-history-ranking] thead th:has([data-history-sort="headshots"]), [data-history-ranking] thead th:last-child').last().isVisible()).toBe(width !== 390);
      // Games of the period, newest first, with scores, outcome and the expandable detail.
      await expect(page.locator('[data-history-games-count]')).toHaveText(L.count30);
      await expect(page.locator('[data-history-game]')).toHaveCount(12);
      const first = page.locator('[data-history-game="synthetic-game-01"]');
      await expect(first).toContainText('Synthetic Training Ground · Synthetic Objective · Synthetic Dawn');
      await expect(first).toContainText(L.winnerAlpha);
      await expect(first.locator('[data-history-scores] li')).toHaveText([/Alpha\s*100/, /Bravo\s*35/, /Charlie\s*35/]);
      expect(await first.locator('time').innerText()).toMatch(L.ended);
      await expect(page.locator('[data-history-game="synthetic-game-07"]')).toContainText(L.noFeed);
      await expect(page.locator('[data-history-game="synthetic-game-05"]')).toContainText(L.draw);
      // Nothing identifying leaves the reader.
      expect(await page.content()).not.toMatch(FORBIDDEN_TEXT);
      await expectNoHorizontalOverflow(page);
      await expectAxeClean(page);
      expect(errors).toEqual([]);
    });

    test(`history page: whole history with the K/D sort, the floor, the toggle and the paginated game list: ${locale}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors = collectBrowserErrors(page);
      expect((await page.goto(`/${locale}/wardogs/history?server=${SERVER}&period=all&sort=kd`))?.status()).toBe(200);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/${locale}/wardogs/history$`));
      await expect(page.locator('[data-history-games-total]')).toHaveText('23');
      await expect(page.locator('[data-history-outcomes]')).toHaveText(L.outcomesAll);
      await expect(page.locator('[data-history-feed]')).toHaveText(L.feedAll);
      await expectFactionRows(page, page, [['Bravo', '8 / 19', /^42\s?%$/, '23'], ['Alpha', '6 / 19', /^32\s?%$/, '23'], ['Charlie', '5 / 19', /^26\s?%$/, '23']]);
      await expect(page.locator('[data-history-other-outcomes]')).toHaveText(L.other);
      // K/D descending: the highest ratio first, the zero-deaths player (unknown K/D) last with "—".
      await expect(page.locator('[data-history-ranking] th[aria-sort="descending"] [data-history-sort="kd"]')).toBeVisible();
      await expect(rankingRows(page)).toHaveCount(24);
      await expect(rankingNames(page).first()).toContainText('[SYNTHETIC] Player 01');
      await expect(rankingNames(page).last()).toContainText('[SYNTHETIC] Player 24');
      await expect(rankingRows(page).last().locator('[data-history-kd]')).toHaveText(/^—/);
      await expect(rankingRows(page).first().locator('[data-history-kd]')).toHaveText(/^1[.,]54$/);
      // The renamed player carries the latest name; the earlier name is not a ranking row.
      const names = await rankingNames(page).allInnerTexts();
      expect(names.some((name) => name.includes('[SYNTHETIC] Player 03 (renamed)'))).toBe(true);
      expect(names.some((name) => /Player 03\s*$/.test(name.replace(/\s*(Steam|Xbox|Platforma neznámá|Platform unknown)\s*$/, '')))).toBe(false);
      // Negative cash is signed; a total that does not cover every game carries its coverage marker.
      const player04 = page.locator('[data-history-ranking] tbody tr', { hasText: '[SYNTHETIC] Player 04' });
      await expect(player04.locator('[data-history-cash]')).toHaveText(/^-2[\s,]724$/);
      const player08 = page.locator('[data-history-ranking] tbody tr', { hasText: '[SYNTHETIC] Player 08' });
      await expect(player08.locator('[data-history-coverage="cashDelta"]')).toHaveText(/11/);
      // Ascending keeps the unknown K/D last.
      await page.locator('[data-history-sort="kd"]').click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/wardogs/history\\?server=${SERVER}&period=all&sort=kd&dir=asc$`));
      await expect(page.locator('[data-history-ranking] th[aria-sort="ascending"] [data-history-sort="kd"]')).toBeVisible();
      await expect(rankingNames(page).first()).toContainText('[SYNTHETIC] Player 23');
      await expect(rankingNames(page).last()).toContainText('[SYNTHETIC] Player 24');
      // Game list: 20 on the first page, 3 on the second.
      await expect(page.locator('[data-history-games-count]')).toHaveText(L.countAll);
      await expect(page.locator('[data-history-game]')).toHaveCount(20);
      await page.getByRole('link', { name: locale === 'cs' ? 'Další' : 'Next' }).click();
      await expect(page).toHaveURL(/page=2$/);
      await expect(page.locator('[data-history-games-count]')).toHaveText(L.countPage2);
      await expect(page.locator('[data-history-game]')).toHaveCount(3);
      await expect(page.locator('[data-history-game="synthetic-game-23"]')).toBeVisible();
      // The playtime floor excludes players below it with a visible count; players=all is accepted (no toggle under 50 rows).
      await page.goto(`/${locale}/wardogs/history?server=${SERVER}&period=all&min=500&players=all`);
      await expect(rankingRows(page)).toHaveCount(18);
      await expect(page.locator('[data-history-below-floor]')).toHaveText(L.belowFloor);
      await expect(page.locator('[data-history-show-all], [data-history-show-top]')).toHaveCount(0);
      await expect(page.locator('form[data-history-filters] input[name="min"]')).toHaveValue('500');
      await expect(page.locator('form[data-history-filters] input[name="players"]')).toHaveValue('all');
      await page.goto(`/${locale}/wardogs/history?server=${SERVER}&period=all&min=0`);
      await expect(rankingRows(page)).toHaveCount(24);
      expect(await page.content()).not.toMatch(FORBIDDEN_TEXT);
      await expectNoHorizontalOverflow(page);
      await expectAxeClean(page);
      expect(errors).toEqual([]);
    });

    test(`history page: expandable game detail, map filter, 7-day period and the empty state: ${locale}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors = collectBrowserErrors(page);
      await page.goto(`/${locale}/wardogs/history?server=${SERVER}&period=all`);
      const first = page.locator('[data-history-game="synthetic-game-01"]');
      const details = first.locator('details[data-history-game-detail="players"]');
      await expect(details).not.toHaveAttribute('open', '');
      const summary = details.locator('summary');
      await expect(summary).toHaveText(L.players11);
      expect((await measuredBox(summary)).height).toBeGreaterThanOrEqual(44);
      await summary.focus();
      await expect(summary).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(details).toHaveAttribute('open', '');
      await expect(details.locator('[data-history-game-faction]')).toHaveCount(3);
      await expect(details.locator('[data-history-game-player]')).toHaveCount(11);
      await expect(details.locator('[data-history-game-faction="Alpha"] tbody tr').first()).toContainText(locale === 'cs' ? 'Výhra' : 'Win');
      // The game without a feed shows its feed-only metrics as unknown, not zero.
      const noFeed = page.locator('[data-history-game="synthetic-game-07"] details');
      await noFeed.locator('summary').click();
      await expect(noFeed.locator('[data-history-game-player]').first().locator('td').nth(6)).toHaveText(/^—/);
      await expect(noFeed.locator('[data-history-game-player]').first().locator('td').nth(2)).not.toHaveText(/^—/);
      await expectNoHorizontalOverflow(page);
      await expectAxeClean(page);
      // Map filter narrows the games and the summary.
      await page.goto(`/${locale}/wardogs/history?server=${SERVER}&period=all&map=Synthetic+Ridge`);
      await expect(page.locator('form[data-history-filters] select[name="map"]')).toHaveValue('Synthetic Ridge');
      await expect(page.locator('[data-history-games-total]')).toHaveText('7');
      await expect(page.locator('[data-history-games-count]')).toHaveText(L.countRidge);
      await expect(page.locator('[data-history-game]')).toHaveCount(7);
      for (const game of await page.locator('[data-history-game]').all()) await expect(game).toContainText('Synthetic Ridge');
      // The 7-day period holds the three newest games (ended 1, 3.5 and 6 days ago).
      await page.goto(`/${locale}/wardogs/history?server=${SERVER}&period=7d`);
      await expect(page.locator('form[data-history-filters] select[name="period"]')).toHaveValue('7d');
      await expect(page.locator('[data-history-games-total]')).toHaveText('3');
      await expect(page.locator('[data-history-game]')).toHaveCount(3);
      // No game matches a map absent from the period: the empty state with its reset link, no empty sections.
      await page.goto(`/${locale}/wardogs/history?server=${SERVER}&period=7d&map=Synthetic+Nowhere`);
      await expect(page.locator('[data-history-empty]')).toBeVisible();
      await expect(page.locator('[data-history-empty]')).toContainText(L.empty);
      await expect(page.locator('[data-history-reset]')).toHaveAttribute('href', `/${locale}/wardogs/history?server=${SERVER}&period=all`);
      await expect(page.locator('[data-history-summary], [data-history-factions], [data-history-ranking], [data-history-game-list]')).toHaveCount(0);
      await page.locator('[data-history-reset]').click();
      await expect(page.locator('[data-history-games-total]')).toHaveText('23');
      await expectNoHorizontalOverflow(page);
      await expectAxeClean(page);
      expect(errors).toEqual([]);
    });

    test(`server detail shows the compact game history below the Warcon panel: ${locale}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors = collectBrowserErrors(page);
      expect((await page.goto(`/${locale}/wardogs/servers?server=${SERVER}`))?.status()).toBe(200);
      await expect(page.locator('[data-server-refresh]')).toHaveAttribute('aria-busy', 'false');
      const summary = page.locator(`[data-history-summary="${SERVER}"]`);
      await expect(summary).toBeVisible();
      await expect(summary).toHaveAttribute('data-history-state', 'fresh');
      await expect(summary.getByRole('heading', { level: 3, name: L.summaryTitle })).toBeVisible();
      await expect(summary.locator('[data-synthetic-data="history"]')).toBeVisible();
      await expect(summary.locator('[data-history-summary-games]')).toHaveText(L.summaryGames);
      await expectFactionRows(page, summary, [['Bravo', '4 / 10', /^40\s?%$/, '12'], ['Alpha', '3 / 10', /^30\s?%$/, '12'], ['Charlie', '3 / 10', /^30\s?%$/, '12']]);
      await expect(summary.locator('[data-history-summary-game]')).toHaveCount(3);
      await expect(summary.locator('[data-history-summary-game]').first()).toContainText(L.winnerAlpha);
      const link = summary.locator('[data-history-summary-link]');
      await expect(link).toHaveAttribute('href', `/${locale}/wardogs/history?server=${SERVER}`);
      expect((await measuredBox(link)).height).toBeGreaterThanOrEqual(44);
      // Below the Warcon panel.
      const warcon = (await page.locator(`[data-warcon-panel="${SERVER}"]`).boundingBox())!;
      expect((await summary.boundingBox())!.y).toBeGreaterThanOrEqual(warcon.y + warcon.height - 1);
      // The Warcon live panel above legitimately shows the live server name; the history summary itself projects no provider identity.
      expect(await summary.innerHTML()).not.toMatch(FORBIDDEN_TEXT);
      expect(await page.content()).not.toMatch(/synthetic-steam-|synthetic-xbox-|synthetic-unknown-|0123456789abcdef|100000000000000001|synthetic-match-|sourceDigest/);
      await expectNoHorizontalOverflow(page);
      expect((await new AxeBuilder({ page }).include(`[data-history-summary="${SERVER}"]`).analyze()).violations).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test('the Wardogs menu lists the history section; HLL pages and the Wardogs home carry none', async ({ page }) => {
  await page.goto('/cs/wardogs');
  const nav = page.getByRole('navigation', { name: 'Hlavní navigace' });
  await expect(nav.getByRole('link', { name: 'HISTORIE', exact: true })).toHaveAttribute('href', '/cs/wardogs/history');
  await expect(page.locator('[data-history-summary], [data-history-state]')).toHaveCount(0);
  await page.goto('/en/wardogs');
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'HISTORY', exact: true })).toHaveAttribute('href', '/en/wardogs/history');
  expect((await page.goto('/cs/hll/history'))?.status()).toBe(404);
  expect((await page.goto('/en/hll/history?server=synthetic-wardogs'))?.status()).toBe(404);
  await page.goto('/cs/hll');
  await expect(page.locator('[data-hll-menu-item="history"]')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(/Historie her/);
  await page.goto('/cs/hll/servers?server=synthetic-alpha');
  await expect(page.locator('[data-history-summary]')).toHaveCount(0);
  await page.goto('/cs');
  await expect(page.getByRole('navigation', { name: 'Hlavní navigace' }).getByRole('link', { name: 'HISTORIE', exact: true })).toHaveCount(0);
});

test('unknown servers, periods, sorts and pages fall back to the defaults', async ({ page }) => {
  await page.goto('/cs/wardogs/history?server=removed-server&period=14d&sort=name&dir=up&page=99&min=abc');
  await expect(page.locator('[data-history-state]')).toHaveAttribute('data-history-server', SERVER);
  await expect(page.locator('form[data-history-filters] select[name="period"]')).toHaveValue('30d');
  await expect(page.locator('form[data-history-filters] input[name="min"]')).toHaveValue('60');
  await expect(page.locator('[data-history-ranking] th[aria-sort="descending"] [data-history-sort="kills"]')).toBeVisible();
  // Page 99 of 12 games is an empty page with a way back, not an error.
  await expect(page.locator('[data-history-games-empty="page"]')).toBeVisible();
  await page.locator('[data-history-games-empty="page"] a').click();
  await expect(page).toHaveURL(/\/cs\/wardogs\/history\?server=synthetic-wardogs$/);
  await expect(page.locator('[data-history-game]')).toHaveCount(12);
});
