import { expect, test } from '@playwright/test';
import { expectMatchState, fillNewMatch, matchByOpponent, pragueDate, uniqueSuffix } from './admin-community-support';
import { syntheticScoreboard } from '../src/modules/matches/statistics-fixtures';
import { signInAs } from './support/auth';

/**
 * Hell Let Loose match administration: the shared match editor offers the official HLL
 * maps, modes and Allies/Axis sides, enforces 0–5 sector scores, and the published result
 * appears in the HLL section with the localized side.
 */
test('match manager records an HLL match with map, mode, side and sector score', async ({ browser }) => {
  test.setTimeout(120_000);
  const suffix = uniqueSuffix();
  const opponent = `Syntetický HLL soupeř ${suffix}`;
  const context = await browser.newContext();
  await signInAs(context, { roles: ['match_manager'], name: 'Syntetický správce zápasů' });
  const page = await context.newPage();

  await page.goto('/cs/admin/matches/new');
  await page.getByRole('combobox', { name: /^Hra/ }).selectOption('hell-let-loose');
  await fillNewMatch(page, { opponent, shortCode: 'SHS', date: pragueDate(-1), time: '20:00', zone: 'Europe/Prague', competition: `Syntetický HLL pohár ${suffix}` });
  await page.locator('[data-action="save"]').click();
  await expect(page).toHaveURL(/\/cs\/admin\/matches\/[0-9a-f-]{36}\?created=1$/);
  const created = (await matchByOpponent(opponent))!;
  expect(created.game).toBe('hell-let-loose');

  // HLL round inputs: map suggestions, mode and side choices, sector hint.
  await page.locator('[data-round-add]').click();
  await expect(page.locator('[data-hll-rounds]')).toContainText('Skóre je počet držených sektorů (0–5)');
  const round = page.locator('[data-round-index="0"]');
  await expect(round.getByLabel(/^Mapa/)).toHaveAttribute('list', 'hll-map-suggestions');
  await expect(page.locator('#hll-map-suggestions option[value="Carentan"]')).toHaveCount(1);
  await round.getByLabel(/^Mapa/).fill('Carentan');
  await round.getByLabel(/^Režim/).selectOption('Warfare');
  await expect(round.getByLabel(/^Strana/).locator('option')).toHaveText(['Nezadáno', 'Spojenci', 'Osa']);
  await round.getByLabel(/^Strana/).selectOption('axis');

  // A sector score above 5 is rejected before anything is saved.
  await page.getByLabel(/^Skóre Valkyrie/).fill('4');
  await page.getByLabel(/^Skóre soupeře/).fill('1');
  await page.getByLabel(/^Zdroj výsledku/).fill('Syntetický zdroj');
  await round.getByLabel(/^Valkyria/).fill('6');
  await round.getByLabel(/^Soupeř/).fill('1');
  await page.locator('[data-action="record-result"]').click();
  await expect(round.getByText('V HLL je skóre kola počet držených sektorů: 0 až 5.')).toBeVisible();
  await expectMatchState(page, { status: 'scheduled' });

  await round.getByLabel(/^Valkyria/).fill('4');
  await page.locator('[data-action="record-result"]').click();
  await expectMatchState(page, { status: 'completed' });
  await page.locator('[data-action="publish"]').click();
  await expectMatchState(page, { publication: 'published' });
  const publicPath = `/cs/hll/matches/${created.slug}`;
  await expect(page.locator('[data-status-panel] [data-public-link]')).toHaveAttribute('href', publicPath);

  const visitor = await browser.newPage();
  await visitor.goto(publicPath);
  const rounds = visitor.locator('main table').filter({ hasText: 'Carentan' });
  await expect(rounds).toContainText('Warfare');
  await expect(rounds).toContainText('Osa');
  await expect(rounds).toContainText('4 : 1');
  await visitor.goto(`/en/hll/matches/${created.slug}`);
  await expect(visitor.locator('main table').filter({ hasText: 'Carentan' })).toContainText('Axis');
  await expect(visitor.locator('[data-match-statistics]')).toHaveCount(0);

  // Import the game statistics from an uploaded CRCON scoreboard (no CRCON server is configured here).
  const panel = page.locator('[data-statistics-panel]');
  await expect(panel).toHaveAttribute('data-statistics-state', 'none');
  await expect(panel.getByText('Žádný server CRCON zatím není nastaven', { exact: false })).toBeVisible();
  await panel.getByLabel(/^Soubor s tabulkou hry/).setInputFiles({
    name: 'synthetic-scoreboard.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(syntheticScoreboard({ result: { allied: 1, axis: 4 } }))),
  });
  await panel.getByLabel(/^Strana Valkyrie/).selectOption('axis');
  await panel.locator('[data-statistics-action="import"]').click();
  await expect(panel.getByText('Statistiky importovány.')).toBeVisible();
  await expect(panel).toHaveAttribute('data-statistics-state', 'imported');
  await expect(panel.locator('[data-statistics-player-count]')).toContainText('12 · řádky hráčů nejsou veřejné');
  await expect(panel.locator('[data-statistics-teams] thead')).toContainText('Valkyria (Osa)');

  await visitor.goto(publicPath);
  const statistics = visitor.locator('[data-match-statistics]');
  await expect(statistics.locator('[data-statistics-provenance]')).toContainText('nahraný export tabulky hry');
  await expect(statistics.locator('[data-statistics-summary]')).toContainText('Valkyria (Osa)');
  await statistics.getByRole('tab', { name: 'Hráči' }).click();
  await expect(statistics.locator('[data-statistics-players="private"]')).toContainText('nejsou zveřejněny');
  await expect(statistics.getByText('[SYN] Allies Player 01')).toHaveCount(0);
  await statistics.getByRole('tab', { name: 'Zbraně' }).click();
  await expect(statistics.locator('[data-statistics-weapons]')).toContainText('KARABINER 98K');

  // Publishing player rows is an explicit editor decision.
  await panel.getByLabel(/^Zveřejnit statistiky jednotlivých hráčů/).first().check();
  await panel.locator('[data-statistics-action="settings"]').click();
  await expect(panel.getByText('Nastavení statistik uloženo.')).toBeVisible();
  await visitor.goto(publicPath);
  await visitor.locator('[data-match-statistics]').getByRole('tab', { name: 'Hráči' }).click();
  await expect(visitor.locator('[data-statistics-players] tbody tr')).toHaveCount(12);
  await visitor.close();
  await context.close();
});

test('the published HLL fixture shows team summary, players and weapons', async ({ page }) => {
  await page.goto('/cs/hll/matches/ukazka-hll-historicky');
  const statistics = page.locator('[data-match-statistics]');
  await expect(statistics.getByRole('heading', { name: 'Statistiky zápasu' })).toBeVisible();
  await expect(statistics.locator('[data-statistics-summary]')).toContainText('Zabití podle typu zbraně');
  await statistics.getByRole('tab', { name: 'Hráči' }).click();
  await expect(statistics.getByRole('rowheader', { name: '[SYN] Allies Player 01' })).toBeVisible();
  await statistics.getByRole('tab', { name: 'Zbraně' }).press('ArrowRight');
  await expect(statistics.getByRole('tab', { name: 'Souhrn' })).toBeFocused();
});
