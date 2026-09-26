import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { zonedLocalToInstant } from '../src/modules/matches/time';
import { auditCount, e2eDb, expectMatchState, fillNewMatch, matchByOpponent, matchBySlug, pragueDate, uniqueSuffix } from './admin-community-support';
import { E2E_BASE_URL, signInAs } from './support/auth';

/**
 * Match administration journey (docs/product/editorial-and-matches.md acceptance): a match
 * manager creates a draft Wardogs fixture in Europe/Prague, publishes it, postpones it,
 * moves it into the past and records a verified result; recaps are published per locale.
 *
 * Public list/detail pages are delivered by the public-pages slice. Where such a route is
 * not present in this build, those assertions are skipped with an explicit annotation and
 * the published state is verified through the sitemap and the database instead.
 */

async function publicRoute(request: APIRequestContext, path: string): Promise<boolean> {
  const response = await request.get(path);
  return response.status() !== 404;
}

function note(description: string) {
  test.info().annotations.push({ type: 'public-page-check-skipped', description });
}

async function sitemapHas(request: APIRequestContext, path: string): Promise<boolean> {
  const xml = await (await request.get('/sitemap.xml')).text();
  return xml.includes(`${E2E_BASE_URL}${path}<`) || xml.includes(`${E2E_BASE_URL}${path}"`);
}

async function mainText(page: Page): Promise<string> {
  return (await page.locator('main').first().innerText()).replace(/\s+/g, ' ');
}

test.describe.configure({ mode: 'serial' });

test('match manager creates, publishes, postpones, reschedules and records a verified result', async ({ browser, request }) => {
  test.setTimeout(180_000);
  const suffix = uniqueSuffix();
  const opponent = `Syntetičtí Vlci ${suffix}`;
  const competition = `Syntetická liga ${suffix}`;
  const managerContext = await browser.newContext();
  await signInAs(managerContext, { roles: ['match_manager'], name: 'Syntetický správce zápasů' });
  const page = await managerContext.newPage();

  // ---- Create a draft fixture with an explicit Europe/Prague start ----
  await page.goto('/cs/admin/matches');
  await expect(page.getByRole('heading', { level: 1, name: 'Zápasy' })).toBeVisible();
  await page.getByRole('link', { name: 'Nový zápas' }).click();
  await expect(page).toHaveURL(/\/cs\/admin\/matches\/new$/);
  const startDate = pragueDate(40);
  await fillNewMatch(page, { opponent, shortCode: 'SVL', date: startDate, time: '19:00', zone: 'Europe/Prague', competition });
  const expectedStart = zonedLocalToInstant(`${startDate}T19:00`, 'Europe/Prague');
  await expect(page.locator('[data-resolved-start]')).toContainText('19:00');
  await expect(page.locator('[data-resolved-start]')).toContainText('UTC');
  await page.locator('[data-action="save"]').click();
  await expect(page).toHaveURL(/\/cs\/admin\/matches\/[0-9a-f-]{36}\?created=1$/);
  await expect(page.getByText('Koncept zápasu vytvořen. Zatím není veřejný.')).toBeVisible();
  await expectMatchState(page, { status: 'scheduled', publication: 'draft' });
  const created = (await matchByOpponent(opponent))!;
  expect(created).toMatchObject({ status: 'scheduled', publication: 'draft' });
  const stored = (await matchBySlug(created.slug))!;
  expect(stored.starts_at.toISOString()).toBe(expectedStart.toISOString());
  const matchPath = `/cs/matches/${created.slug}`;
  expect(await sitemapHas(request, matchPath)).toBe(false);

  // ---- Edit a fact; capture the real server action request for the replay below ----
  await page.getByRole('textbox', { name: /^Formát/ }).fill('5v5');
  const actionRequest = page.waitForRequest((candidate) => candidate.method() === 'POST' && Boolean(candidate.headers()['next-action']));
  await page.locator('[data-action="save"]').click();
  const captured = await actionRequest;
  await expect(page.getByText('Změny uloženy.')).toBeVisible();

  // ---- Publish → public upcoming list ----
  await page.locator('[data-action="publish"]').click();
  await expectMatchState(page, { publication: 'published' });
  await expect(page.locator('[data-status-panel] [data-public-link]')).toHaveAttribute('href', matchPath);
  expect((await matchByOpponent(opponent))!.publication).toBe('published');
  expect(await sitemapHas(request, matchPath)).toBe(true);
  if (await publicRoute(request, '/cs/matches')) {
    const visitor = await browser.newPage();
    await visitor.goto('/cs/matches');
    await expect(visitor.getByText(opponent).first()).toBeVisible();
    await visitor.close();
  } else note('/cs/matches is not part of this build; publication verified via sitemap and database.');

  // ---- Postpone to a new date; the original start is kept and shown ----
  await page.locator('[data-action="postpone"]').click();
  const postponeDialog = page.getByRole('alertdialog', { name: 'Odložit zápas?' });
  await expect(postponeDialog).toBeVisible();
  await postponeDialog.getByLabel(/^Nové datum/).fill(pragueDate(45));
  await postponeDialog.getByLabel(/^Nový čas/).fill('20:00');
  await postponeDialog.locator('[data-confirm="confirm"]').click();
  await expect(postponeDialog).toBeHidden();
  await expectMatchState(page, { status: 'postponed' });
  const postponed = (await matchBySlug(created.slug))!;
  expect(postponed.original_starts_at?.toISOString()).toBe(expectedStart.toISOString());
  await expect(page.locator('[data-original-start]')).toContainText('19:00');
  await page.goto(`/cs/admin/matches?q=${encodeURIComponent(suffix)}`);
  await expect(page.locator(`[data-match-row="${created.slug}"]`)).toBeVisible();
  await expect(page.locator('tbody')).toContainText('Původně');
  await page.locator(`[data-match-row="${created.slug}"]`).click();

  // ---- Reschedule into the past, then record a verified result with a round ----
  await expect(page.locator('[data-group="schedule"]')).toBeVisible();
  await page.getByLabel(/^Datum začátku/).fill(pragueDate(-2));
  await page.getByLabel(/^Čas začátku/).fill('18:00');
  await page.locator('[data-action="reschedule"]').click();
  await expectMatchState(page, { status: 'scheduled' });
  await page.getByLabel(/^Skóre Valkyrie/).fill('3');
  await page.getByLabel(/^Skóre soupeře/).fill('1');
  await page.getByLabel('Ověřený').check();
  await page.getByLabel(/^Zdroj výsledku/).fill('Syntetický zdroj výsledku');
  await page.locator('[data-round-add]').click();
  await page.locator('[data-round-index="0"]').getByLabel(/^Mapa/).fill('Syntetická mapa');
  await page.locator('[data-round-index="0"]').getByLabel(/^Valkyria/).fill('1');
  await page.locator('[data-round-index="0"]').getByLabel(/^Soupeř/).fill('0');
  await page.locator('[data-action="record-result"]').click();
  await expectMatchState(page, { status: 'completed' });
  await expect(page.locator('[data-recorded-result]')).toContainText('3 : 1 · Výhra · Ověřený');
  const result = await e2eDb().query('select score_valkyria, score_opponent, outcome, verification from match_result where match_id = $1', [created.id]);
  expect(result.rows[0]).toEqual({ score_valkyria: 3, score_opponent: 1, outcome: 'win', verification: 'verified' });
  if (await publicRoute(request, matchPath)) {
    const visitor = await browser.newPage();
    await visitor.goto(matchPath);
    expect(await mainText(visitor)).toMatch(/3\s*[:–-]\s*1/);
    await visitor.close();
  } else note(`${matchPath} is not part of this build; the result was verified in the admin and database.`);

  // ---- Recaps: publish Czech only; English stays absent ----
  const recap = `Syntetická česká reportáž ${suffix}`;
  const csRecap = page.locator('[data-prose-locale="cs"]');
  await csRecap.getByRole('textbox').click();
  await page.keyboard.type(recap);
  await csRecap.locator('[data-prose-action="save"]').click();
  await expect(csRecap.getByText('Český koncept uložen.', { exact: false })).toBeVisible();
  await csRecap.locator('[data-prose-action="publish"]').click();
  await expect(csRecap).toHaveAttribute('data-prose-status', 'published');
  await expect(page.locator('[data-prose-locale="en"]')).toHaveAttribute('data-prose-status', 'none');
  const prose = await e2eDb().query<{ locale: string; published: boolean }>(
    'select locale, published_revision_id is not null as published from prose_translation where match_id = $1 order by locale',
    [created.id],
  );
  expect(prose.rows).toEqual([{ locale: 'cs', published: true }]);
  if (await publicRoute(request, matchPath)) {
    const visitor = await browser.newPage();
    await visitor.goto(matchPath);
    await expect(visitor.getByText(recap)).toBeVisible();
    await visitor.goto(`/en/matches/${created.slug}`);
    await expect(visitor.getByText(recap)).toHaveCount(0);
    expect(await mainText(visitor)).not.toContain(recap);
    await visitor.close();
  } else note('Public match detail is not part of this build; per-locale recap publication verified in the admin and database.');

  // ---- An editor is denied: page AND a direct replay of the captured server action ----
  const editorContext = await browser.newContext();
  const editor = await signInAs(editorContext, { roles: ['editor'], name: `Syntetický editor ${suffix}` });
  const editorPage = await editorContext.newPage();
  await editorPage.goto('/cs/admin/matches');
  await expect(editorPage.getByTestId('access-denied')).toBeVisible();
  await expect(editorPage.locator('[data-admin-matches]')).toHaveCount(0);
  await editorPage.goto(`/cs/admin/matches/${created.id}`);
  await expect(editorPage.getByTestId('access-denied')).toBeVisible();
  await expect(editorPage.getByText(opponent)).toHaveCount(0);
  const headers = captured.headers();
  const tampered = (captured.postData() ?? '').replace('"5v5"', '"HACKED-BY-EDITOR"');
  expect(tampered).toContain('HACKED-BY-EDITOR');
  const replay = await editorContext.request.post(captured.url(), {
    headers: {
      'next-action': headers['next-action']!,
      'next-router-state-tree': headers['next-router-state-tree'] ?? '',
      'content-type': headers['content-type'] ?? 'text/plain;charset=UTF-8',
      accept: 'text/x-component',
      origin: E2E_BASE_URL,
    },
    data: tampered,
  });
  expect(replay.status()).toBe(200);
  expect(await replay.text()).toContain('"code":"forbidden"');
  const format = await e2eDb().query<{ format: string | null }>('select format from match where id = $1', [created.id]);
  expect(format.rows[0]!.format).toBe('5v5');
  expect(await auditCount({ action: 'match.update', outcome: 'denied', entityId: created.id, actorLabel: editor.name })).toBe(1);
  await editorContext.close();

  // ---- Administrator reviews the redacted audit trail of these changes ----
  const adminContext = await browser.newContext();
  await signInAs(adminContext, { roles: ['administrator'], name: 'Syntetický administrátor' });
  const adminPage = await adminContext.newPage();
  for (const [action, expectations] of [
    ['match.publish', { slug: created.slug }],
    ['match.result.record', { 'next.scoreValkyria': '3', 'next.scoreOpponent': '1', 'next.verification': 'verified' }],
  ] as const) {
    await adminPage.goto(`/en/admin/audit?action=${action}`);
    const row = adminPage.locator('tbody tr').filter({ hasText: created.id });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Syntetický správce zápasů');
    await row.getByRole('link').click();
    const summary = adminPage.locator('[data-audit-summary]');
    await expect(summary).toBeVisible();
    for (const [key, value] of Object.entries(expectations)) {
      await expect(summary.locator('div').filter({ has: adminPage.locator('dt', { hasText: new RegExp(`^${key.replace('.', '\\.')}$`) }) }).locator('dd')).toHaveText(value);
    }
    expect(await summary.innerText()).not.toMatch(/[{}]/);
  }
  await adminContext.close();
  await managerContext.close();
});

test('an unknown result stays “—” and never becomes 0:0', async ({ browser, request }) => {
  const context = await browser.newContext();
  await signInAs(context, { roles: ['match_manager'] });
  const page = await context.newPage();
  await page.goto('/cs/admin/matches?q=Echo');
  const row = page.locator('tbody tr').filter({ has: page.locator('[data-match-row="ukazka-wardogs-neznamy-vysledek"]') });
  await expect(row).toContainText('Neznámý');
  expect(await row.innerText()).not.toMatch(/0\s*:\s*0/);
  await context.close();
  const path = '/cs/matches/ukazka-wardogs-neznamy-vysledek';
  if (await publicRoute(request, path)) {
    const visitor = await browser.newPage();
    await visitor.goto(path);
    const text = await mainText(visitor);
    expect(text).toContain('—');
    expect(text).not.toMatch(/\b0\s*:\s*0\b/);
    await visitor.close();
  } else note(`${path} is not part of this build; the admin list shows “—” for the unknown result.`);
});

test('a stale save shows a conflict, keeps the entered values and never reverts the other change', async ({ browser }) => {
  const suffix = uniqueSuffix();
  const context = await browser.newContext();
  await signInAs(context, { roles: ['match_manager'] });
  const draft = (await matchBySlug('ukazka-wardogs-koncept'))!;
  const first = await context.newPage();
  const second = await context.newPage();
  await first.goto(`/en/admin/matches/${draft.id}`);
  await second.goto(`/en/admin/matches/${draft.id}`);
  const season = (page: Page) => page.getByRole('textbox', { name: /^Season/ });
  const competition = (page: Page) => page.getByRole('textbox', { name: /^Competition name/ });

  await season(first).fill(`Season A ${suffix}`);
  await first.locator('[data-action="save"]').click();
  await expect(first.getByText('Changes saved.')).toBeVisible();

  await competition(second).fill(`Cup B ${suffix}`);
  await second.locator('[data-action="save"]').click();
  await expect(second.getByText('Changed by someone else')).toBeVisible();
  await expect(competition(second)).toHaveValue(`Cup B ${suffix}`);
  const afterConflict = await e2eDb().query<{ season: string | null; competition_name: string | null }>('select season, competition_name from match where id = $1', [draft.id]);
  expect(afterConflict.rows[0]).toMatchObject({ season: `Season A ${suffix}` });
  expect(afterConflict.rows[0]!.competition_name).not.toBe(`Cup B ${suffix}`);

  await second.getByRole('button', { name: 'Load latest version (keep my values)' }).click();
  await expect(season(second)).toHaveValue(`Season A ${suffix}`);
  await expect(competition(second)).toHaveValue(`Cup B ${suffix}`);
  await second.locator('[data-action="save"]').click();
  await expect(second.getByText('Changes saved.')).toBeVisible();
  const merged = await e2eDb().query('select season, competition_name from match where id = $1', [draft.id]);
  expect(merged.rows[0]).toEqual({ season: `Season A ${suffix}`, competition_name: `Cup B ${suffix}` });
  await context.close();
});

test('client and server validation: DST gap, required fields and localized messages', async ({ browser }) => {
  const context = await browser.newContext();
  await signInAs(context, { roles: ['match_manager'] });
  const page = await context.newPage();
  await page.goto('/en/admin/matches/new');
  await page.getByLabel(/^Start date/).fill('2027-03-28');
  await page.getByLabel(/^Start time/).fill('02:30');
  await expect(page.locator('[data-resolved-start]')).toContainText('This time does not exist in the chosen time zone');
  await page.locator('[data-action="save"]').click();
  await expect(page.getByRole('alert').filter({ hasText: 'Please check the highlighted fields.' })).toBeVisible();
  await expect(page.getByLabel(/^Opponent name/)).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel(/^Start date/)).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel(/^Opponent name/).fill('Synthetic Validation Opponent');
  await page.getByLabel(/^Start time/).fill('19:00');
  await page.getByLabel(/^Event page URL/).fill('http://insecure.example/event');
  await page.locator('[data-action="save"]').click();
  await expect(page.getByText('Enter a valid address starting with https://.')).toBeVisible();
  // A server-only rule (unique public address) is surfaced as a localized field message.
  await page.getByLabel(/^Event page URL/).fill('');
  await page.getByLabel(/^Public address/).fill('ukazka-wardogs-koncept');
  await page.locator('[data-action="save"]').click();
  await expect(page.getByText('This address is already used by another record.').first()).toBeVisible();
  await expect(page).toHaveURL(/\/en\/admin\/matches\/new$/);
  expect(await matchByOpponent('Synthetic Validation Opponent')).toBeNull();
  await context.close();
});
