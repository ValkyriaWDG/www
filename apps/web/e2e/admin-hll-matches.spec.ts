import { expect, test } from '@playwright/test';
import { expectMatchState, fillNewMatch, matchByOpponent, pragueDate, uniqueSuffix } from './admin-community-support';
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
  await visitor.close();
  await context.close();
});
