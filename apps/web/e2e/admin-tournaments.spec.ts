import { expect, test } from '@playwright/test';
import { e2eDb, fillNewMatch, matchByOpponent, pragueDate, uniqueSuffix } from './admin-community-support';
import { signInAs } from './support/auth';
import { expectNoHorizontalOverflow } from './support/shell-helpers';

/**
 * Tournaments (legacy `/turnaje`): a match manager creates an HLL tournament in the
 * administration, publishes its Czech description only, links a match from the match
 * editor and publishes both. The HLL section lists the tournament and its detail shows
 * the description, links and the linked match; English shows the explicit absence.
 */
test('match manager creates, describes and publishes an HLL tournament with a linked match', async ({ browser }) => {
  test.setTimeout(150_000);
  const suffix = uniqueSuffix();
  const name = `Syntetická liga ${suffix}`;
  const context = await browser.newContext();
  await signInAs(context, { roles: ['match_manager'], name: 'Syntetický správce zápasů' });
  const page = await context.newPage();

  // The module is offered in the administration menu.
  await page.goto('/cs/admin');
  await expect(page.getByTestId('admin-module-tournaments')).toContainText('Turnaje');

  // ---- Create a draft ----
  await page.goto('/cs/admin/tournaments/new');
  await page.getByRole('combobox', { name: /^Hra/ }).selectOption('hell-let-loose');
  await page.getByLabel(/^Název/).fill(name);
  await page.getByLabel(/^Sezóna/).fill('Podzim 2026');
  await page.getByLabel(/^Začátek/).fill(pragueDate(-10));
  await page.getByLabel(/^Konec/).fill(pragueDate(-20));
  await page.locator('[data-action="add-link"]').click();
  await page.getByLabel(/^Popisek odkazu/).fill('Pravidla');
  await page.getByLabel(/^Adresa odkazu/).fill('http://example.org/rules');
  await page.locator('[data-action="save"]').click();
  // Client validation: end before start and a non-HTTPS link.
  await expect(page.getByText('Konec nemůže být před začátkem.')).toBeVisible();
  await expect(page.getByText('Zadejte úplnou adresu https://.')).toBeVisible();
  await page.getByLabel(/^Konec/).fill(pragueDate(30));
  await page.getByLabel(/^Adresa odkazu/).fill('https://example.org/synthetic-rules');
  await page.locator('[data-action="save"]').click();
  await expect(page).toHaveURL(/\/cs\/admin\/tournaments\/[0-9a-f-]{36}\?created=1$/);
  await expect(page.locator('[data-tournament-publication="draft"]')).toBeVisible();
  const stored = await e2eDb().query<{ id: string; slug: string; game: string }>('select id, slug, game from tournament where name = $1', [name]);
  const tournament = stored.rows[0]!;
  expect(tournament.game).toBe('hell-let-loose');

  // ---- Czech description with a standings note; English stays absent ----
  const description = `Syntetická pravidla a tabulka ${suffix}`;
  const cs = page.locator('[data-prose-locale="cs"]');
  await cs.getByRole('textbox').click();
  await page.keyboard.type(description);
  await cs.locator('[data-prose-action="save"]').click();
  await expect(cs.getByText('Český koncept uložen.', { exact: false })).toBeVisible();
  await cs.locator('[data-prose-action="publish"]').click();
  await expect(cs).toHaveAttribute('data-prose-status', 'published');
  await expect(page.locator('[data-prose-locale="en"]')).toHaveAttribute('data-prose-status', 'none');

  // A draft tournament and its description are not public.
  const visitor = await browser.newPage();
  const publicPath = `/cs/hll/tournaments/${tournament.slug}`;
  expect((await visitor.goto(publicPath))?.status()).toBe(404);

  await page.locator('[data-action="publish"]').click();
  await expect(page.locator('[data-tournament-publication="published"]')).toBeVisible();
  await expect(page.locator('[data-public-link]').first()).toHaveAttribute('href', publicPath);

  // ---- Link a new HLL match from the match editor ----
  const opponent = `Syntetický turnajový soupeř ${suffix}`;
  await page.goto('/cs/admin/matches/new');
  await page.getByRole('combobox', { name: /^Hra/ }).selectOption('hell-let-loose');
  await fillNewMatch(page, { opponent, date: pragueDate(3), time: '20:00', zone: 'Europe/Prague' });
  await page.getByRole('combobox', { name: /^Turnaj/ }).selectOption({ label: `${name} · Podzim 2026` });
  // Switching to Wardogs unlinks an HLL tournament.
  await page.getByRole('combobox', { name: /^Hra/ }).selectOption('wardogs');
  await expect(page.getByRole('combobox', { name: /^Turnaj/ })).toHaveValue('');
  await page.getByRole('combobox', { name: /^Hra/ }).selectOption('hell-let-loose');
  await page.getByRole('combobox', { name: /^Turnaj/ }).selectOption({ label: `${name} · Podzim 2026` });
  await page.locator('[data-action="save"]').click();
  await expect(page).toHaveURL(/\/cs\/admin\/matches\/[0-9a-f-]{36}\?created=1$/);
  await page.locator('[data-action="publish"]').click();
  await expect(page.locator('[data-match-publication="published"]')).toBeVisible();
  const linked = (await matchByOpponent(opponent))!;

  // ---- Public list and detail ----
  await visitor.goto('/cs/hll/tournaments');
  await expect(visitor.getByRole('heading', { level: 1, name: 'Turnaje' })).toBeVisible();
  const card = visitor.locator(`[data-tournament-card="${tournament.slug}"]`);
  await expect(card).toHaveAttribute('data-phase', 'ongoing');
  await expect(card).toContainText('1 zápas');
  await card.getByRole('link', { name }).click();
  await expect(visitor).toHaveURL(new RegExp(`${publicPath}$`));
  await expect(visitor.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(visitor.locator('[data-tournament-phase="ongoing"]')).toHaveText('Probíhá');
  await expect(visitor.getByText(description)).toBeVisible();
  await expect(visitor.locator('[data-tournament-links]').getByRole('link', { name: /Pravidla/ })).toHaveAttribute('href', 'https://example.org/synthetic-rules');
  await expect(visitor.locator('[data-tournament-matches]')).toContainText(opponent);

  // The match detail links back to its published tournament.
  await visitor.goto(`/cs/hll/matches/${linked.slug}`);
  await expect(visitor.locator(`[data-match-tournament="${tournament.slug}"]`)).toHaveAttribute('href', publicPath);

  // English: facts and matches, with an explicit absence of the English description.
  await visitor.goto(`/en/hll/tournaments/${tournament.slug}`);
  await expect(visitor.locator('[data-prose="missing"]')).toContainText('No English description yet');
  await expect(visitor.getByText(description)).toHaveCount(0);
  await expect(visitor.locator('[data-tournament-matches]')).toContainText(opponent);
  await visitor.close();
  await context.close();
});

test('tournaments are an HLL menu destination and the seeded tournaments are listed by phase', async ({ page }) => {
  await page.goto('/cs/hll/tournaments');
  await expect(page.locator('[data-hll-section-bar]').getByRole('link', { name: 'Turnaje' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-tournament-group="current"] [data-tournament-card="ukazka-hll-liga-podzim-2026"]')).toBeVisible();
  await expect(page.locator('[data-tournament-group="finished"] [data-tournament-card="ukazka-hll-pohar-jaro-2026"]')).toBeVisible();
  // Drafts are never listed or served.
  await expect(page.locator('[data-tournament-card="ukazka-hll-turnaj-koncept"]')).toHaveCount(0);
  expect((await page.goto('/cs/hll/tournaments/ukazka-hll-turnaj-koncept'))?.status()).toBe(404);
  // Wardogs has no tournaments section.
  expect((await page.goto('/cs/wardogs/tournaments'))?.status()).toBe(404);
});

test('a stored description that ends with a table opens without unsaved changes', async ({ browser }) => {
  // The editor appends a trailing paragraph after a final table while loading; that
  // normalization is not an edit and must not block publication actions.
  const context = await browser.newContext();
  await signInAs(context, { roles: ['match_manager'], name: 'Syntetický správce zápasů' });
  const page = await context.newPage();
  const id = (await e2eDb().query<{ id: string }>("select id from tournament where slug = 'ukazka-hll-liga-podzim-2026'")).rows[0]!.id;
  await page.goto(`/cs/admin/tournaments/${id}`);
  await expect(page.locator('[data-prose-locale="cs"]').getByRole('textbox')).toContainText('Syntetický popis soutěže');
  await expect(page.locator('[data-prose-tab="cs"]')).not.toContainText('neuloženo');
  await expect(page.locator('[data-prose-tab="en"]')).not.toContainText('neuloženo');
  await expect(page.locator('[data-action="unpublish"]')).toBeEnabled();
  await context.close();
});

test('the tournament detail reflows on a phone without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/hll/tournaments/ukazka-hll-liga-podzim-2026');
  await expect(page.locator('[data-prose="missing"]')).toBeVisible();
  const opponent = page.locator('[data-tournament-matches] [data-opponent]').first();
  await expect(opponent).toBeVisible();
  // The linked match uses the compact mobile row: the opponent name stays on one or two lines.
  const box = (await opponent.boundingBox())!;
  expect(box.width).toBeGreaterThan(120);
  expect(box.height).toBeLessThan(60);
  await expectNoHorizontalOverflow(page);
});
